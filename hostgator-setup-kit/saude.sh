#!/usr/bin/env bash
# saude.sh — sinais vitais da instalação, para uma rotina diária.
#
# READ-ONLY ABSOLUTO. Não sobe, não reinicia, não puxa imagem, não escreve
# arquivo, não toca no .env. Só lê: `docker ps`/`inspect`, `/proc`, `df`, a
# pasta de backups, os `.pfx` do A1 e o banco (apenas SELECT).
#
# Uso:
#   bash hostgator-setup-kit/saude.sh           # humano: uma linha por sinal
#   bash hostgator-setup-kit/saude.sh --json    # máquina: um JSON de uma linha
#   bash hostgator-setup-kit/saude.sh --quiet   # silêncio quando está tudo ok
#
# Código de saída:
#   0 = todos os sinais dentro do limite
#   1 = pelo menos um alerta
#   2 = não deu para inspecionar (fora de uma instalação, docker sem permissão…)
#
# ── Por que cada limite é esse ───────────────────────────────────────────────
#   disco  > 80%  — acima disso um `docker pull` de imagem nova pode morrer no
#                   meio, e é justamente durante um update que ele acontece.
#   RAM    > 85%  — esta VPS já foi ao OOM construindo imagem com a stack no ar
#                   (medido em 24/10/2026: 11 processos mortos, realtime em 17
#                   restarts). 85% é o ponto em que o próximo build é roleta.
#   swap   > 85%  — swap cheio com RAM alta é o OOM a caminho, não um detalhe.
#   backup > 36h  — o `backup.sh` só roda dentro do `update.sh`. Não existe cron
#                   diário (medido em 27/11/2026). 36h pega "passou um dia sem
#                   atualizar" sem dar alarme falso a cada 24h exatas.
#   A1     < 30d  — renovar certificado é processo do cliente (compra + upload),
#                   não é instantâneo; 30 dias é a janela em que dá para agir.
#   versão  ≠     — a instalação roda uma tag e existe release mais nova.
#                   Só informa: atualizar é decisão do dono, não da rotina.
#
# ── Por que ele é autocontido (não sourceia o _common.sh) ────────────────────
# Igual ao `diagnostico.sh`: tem que rodar tanto pelo caminho
# `ssh vps 'bash -s' < saude.sh` quanto num kit de dois meses atrás, sem
# depender de helper que pode não existir no disco daquela instalação.
set -uo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
MODO="humano"
case "${1:-}" in
  --json)  MODO="json" ;;
  --quiet) MODO="quiet" ;;
  --help|-h)
    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 0 ;;
esac

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[1m'; D=$'\033[2m'; Z=$'\033[0m'
else
  R=''; G=''; Y=''; B=''; D=''; Z=''
fi

fala()   { [ "$MODO" = "json" ] && return 0; [ "$MODO" = "quiet" ] && return 0; printf '%s\n' "$*"; }
titulo() { fala ""; fala "${B}$*${Z}"; }
ok()     { fala "  ${G}✓${Z} $*"; }
aviso()  { fala "  ${Y}⚠${Z} $*"; }
erro()   { fala "  ${R}✗${Z} $*"; }

ALERTAS=()
INFO=()
alerta() { ALERTAS+=("$1"); erro "$1"; }
informa() { INFO+=("$1"); aviso "$1"; }

# ── 0. Achar a instalação ────────────────────────────────────────────────────
achar_projeto() {
  local c
  for c in . ./nexus /root/Nexus /root/nexus /opt/nexus /var/www/crm; do
    [ -f "$c/$COMPOSE_FILE" ] && { (cd "$c" && pwd); return 0; }
  done
  c="$(find /root /opt /home /var/www -maxdepth 4 -name "$COMPOSE_FILE" 2>/dev/null | head -1)"
  [ -n "$c" ] && { dirname "$c"; return 0; }
  return 1
}

PROJETO="$(achar_projeto)" || {
  printf '%s✖ Não achei uma instalação do Nexus nesta máquina.%s\n' "$R" "$Z"
  exit 2
}
cd "$PROJETO" || exit 2

command -v docker >/dev/null 2>&1 || { printf '✖ docker não está no PATH\n'; exit 2; }
docker ps >/dev/null 2>&1 || { printf '✖ docker não respondeu (sem permissão?)\n'; exit 2; }

HOJE_EPOCH="$(date +%s)"
mtime_epoch() { stat -c '%Y' "$1" 2>/dev/null || stat -f '%m' "$1" 2>/dev/null || echo 0; }

# ── 1. Contêineres ───────────────────────────────────────────────────────────
titulo "Contêineres"
TOTAL=0; NAO_SAUDAVEL=(); PARADO=()
while IFS='|' read -r nome status; do
  [ -z "$nome" ] && continue
  TOTAL=$((TOTAL + 1))
  case "$status" in
    *unhealthy*) NAO_SAUDAVEL+=("$nome ($status)") ;;
    Restarting*|Exited*|Dead*|Created*) PARADO+=("$nome ($status)") ;;
  esac
done < <(docker ps -a --format '{{.Names}}|{{.Status}}')

if [ "${#NAO_SAUDAVEL[@]}" -eq 0 ] && [ "${#PARADO[@]}" -eq 0 ]; then
  ok "$TOTAL contêineres, nenhum unhealthy nem parado"
else
  for x in "${PARADO[@]:-}"; do [ -n "$x" ] && alerta "contêiner parado: $x"; done
  for x in "${NAO_SAUDAVEL[@]:-}"; do [ -n "$x" ] && alerta "contêiner unhealthy: $x"; done
fi

# Restart acumulado: não é alerta (o contador não zera sozinho), mas é o rastro
# de um crash-loop que já passou. Quem reinicia em silêncio nunca aparece no
# `ps` — aparece aqui.
REINICIADOS=""
for c in $(docker ps -q 2>/dev/null); do
  rc="$(docker inspect -f '{{.RestartCount}}' "$c" 2>/dev/null || echo 0)"
  [ "${rc:-0}" -gt 0 ] 2>/dev/null && REINICIADOS="$REINICIADOS $(docker inspect -f '{{.Name}}' "$c" | sed 's#^/##'):$rc"
done
[ -n "$REINICIADOS" ] && informa "com restart acumulado:$REINICIADOS"

# ── 2. Disco, RAM, swap, carga ───────────────────────────────────────────────
titulo "Recursos do host"
DISCO_PCT="$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}')"
DISCO_LIVRE="$(df -h / | awk 'NR==2{print $4}')"
if [ "${DISCO_PCT:-0}" -ge 80 ]; then
  alerta "disco em ${DISCO_PCT}% (livre ${DISCO_LIVRE})"
else
  ok "disco ${DISCO_PCT}% usado (livre ${DISCO_LIVRE})"
fi

meminfo() { awk -v k="$1" '$1==k":"{print $2}' /proc/meminfo; }
MT="$(meminfo MemTotal)"; MA="$(meminfo MemAvailable)"
RAM_PCT=0
[ -n "${MT:-}" ] && [ "${MT:-0}" -gt 0 ] && RAM_PCT=$(( (MT - MA) * 100 / MT ))
if [ "$RAM_PCT" -ge 85 ]; then
  alerta "RAM em ${RAM_PCT}% (disponível $(awk -v a="${MA:-0}" 'BEGIN{printf "%.1f", a/1048576}') GiB)"
else
  ok "RAM ${RAM_PCT}% usada (disponível $(awk -v a="${MA:-0}" 'BEGIN{printf "%.1f", a/1048576}') GiB)"
fi

ST="$(meminfo SwapTotal)"; SF="$(meminfo SwapFree)"
SWAP_PCT=0
[ -n "${ST:-}" ] && [ "${ST:-0}" -gt 0 ] && SWAP_PCT=$(( (ST - SF) * 100 / ST ))
if [ "${ST:-0}" -eq 0 ]; then
  informa "sem swap — build de imagem com a stack no ar vai ao OOM"
elif [ "$SWAP_PCT" -ge 85 ]; then
  alerta "swap em ${SWAP_PCT}%"
else
  ok "swap ${SWAP_PCT}% usado"
fi

CARGA="$(cut -d' ' -f1-3 /proc/loadavg)"
CPUS="$(nproc --all 2>/dev/null || echo '?')"
ok "carga ${CARGA} em ${CPUS} vCPU · uptime $(cut -d' ' -f1 /proc/uptime | awk '{printf "%d", $1/86400}')d"

# ── 3. Backup ────────────────────────────────────────────────────────────────
titulo "Backup"
BDIR="$PROJETO/backups"
ULTIMO="$(ls -1t "$BDIR"/db-*.sql.gz 2>/dev/null | head -1)"
QTD="$(ls -1 "$BDIR"/db-*.sql.gz 2>/dev/null | wc -l | tr -d ' ')"
BK_IDADE_H=""
if [ -n "$ULTIMO" ]; then
  e="$(mtime_epoch "$ULTIMO")"
  BK_IDADE_H=$(( (HOJE_EPOCH - e) / 3600 ))
  BKE_TAM="$(du -h "$ULTIMO" 2>/dev/null | awk '{print $1}')"
  BK_MTIME="$(date -d "@$e" '+%Y-%m-%d %H:%M' 2>/dev/null || date -r "$e" '+%Y-%m-%d %H:%M' 2>/dev/null)"
  if [ "$BK_IDADE_H" -gt 36 ]; then
    alerta "último dump do banco tem ${BK_IDADE_H}h (${BK_MTIME}Z, ${BKE_TAM}) — há ${QTD} no total"
  else
    ok "dump do banco de ${BK_IDADE_H}h atrás (${BKE_TAM}), ${QTD} guardados"
  fi
else
  alerta "nenhum dump do banco em $BDIR"
  BK_MTIME=""; BKE_TAM=""
fi

BK_AGENDADO="nao"
if crontab -l 2>/dev/null | grep -q 'backup\.sh'; then
  BK_AGENDADO="cron"
elif grep -rqsl 'hostgator-setup-kit/backup\.sh' /etc/systemd/system 2>/dev/null; then
  BK_AGENDADO="systemd"
fi
if [ "$BK_AGENDADO" = "nao" ]; then
  alerta "NÃO há backup agendado — o backup.sh só roda dentro do update.sh. Sem deploy, sem backup (hoje: ${BK_IDADE_H:-?}h desde o último)"
  fala "    ${D}conserto (decisão do dono): crontab -e → 0 3 * * * cd $PROJETO && bash hostgator-setup-kit/backup.sh${Z}"
fi
fala "  ${D}destino: $BDIR · $(du -sh "$BDIR" 2>/dev/null | awk '{print $1}') no total${Z}"

# O cron grava `rc=<código>` no fim de cada execução. Sem ler isso, um backup
# que falha toda noite só aparece quando o dump fica velho — e no dia em que
# alguém precisa restaurar. A idade do dump é a rede de segurança; o rc é o
# aviso imediato.
BK_LOG="$BDIR/backup.log"
if [ -f "$BK_LOG" ]; then
  ultimo_rc="$(grep '^rc=' "$BK_LOG" 2>/dev/null | tail -1)"
  rc_num="${ultimo_rc#rc=}"; rc_num="${rc_num%% *}"
  if [ -n "${rc_num:-}" ] && [ "$rc_num" != "0" ]; then
    alerta "a última execução agendada do backup falhou (rc=$rc_num) — ver $BK_LOG"
  fi
fi

# ── 4. Certificado fiscal (A1) ───────────────────────────────────────────────
titulo "Certificado fiscal (A1)"
DB="$(docker ps --format '{{.Names}}' 2>/dev/null | grep -m1 'supabase_db' || true)"
CERT_DIAS=""; CERT_VAL=""; CERT_CNPJ=""
# Organizações com certificado REAL (cnpj preenchido). Sem esta lista, o `.pfx`
# de 9 bytes que o seed e2e deixa em /srv/fiscal/certs viraria alarme diário de
# produção — e alarme que sempre toca é alarme que ninguém lê.
CERTS_REAIS=""
if [ -n "$DB" ]; then
  CERTS_REAIS="$(docker exec "$DB" psql -U postgres -d postgres -At -c \
    "select c.organization_id from fiscal_certificates c
      where c.revogado_em is null and c.cnpj is not null" 2>/dev/null)"
  linha="$(docker exec "$DB" psql -U postgres -d postgres -At -F '|' -c \
    "select to_char(max(validade) at time zone 'UTC','YYYY-MM-DD'),
            coalesce(max(cnpj),'')
       from fiscal_certificates where revogado_em is null and cnpj is not null" 2>/dev/null | head -1)"
  CERT_VAL="${linha%%|*}"
  CERT_CNPJ="${linha##*|}"
  if [ -n "$CERT_VAL" ]; then
    ve="$(date -d "$CERT_VAL" +%s 2>/dev/null || echo 0)"
    [ "$ve" -gt 0 ] && CERT_DIAS=$(( (ve - HOJE_EPOCH) / 86400 ))
  fi
fi

if [ -z "$CERT_VAL" ]; then
  alerta "nenhum certificado A1 ativo com CNPJ — não dá para emitir NF-e"
elif [ -z "$CERT_DIAS" ]; then
  informa "validade registrada ($CERT_VAL) não pôde ser convertida"
elif [ "$CERT_DIAS" -lt 30 ]; then
  alerta "A1 vence em ${CERT_DIAS} dias ($CERT_VAL, CNPJ ${CERT_CNPJ:-?})"
else
  ok "A1 válido até $CERT_VAL (${CERT_DIAS} dias, CNPJ ${CERT_CNPJ:-?})"
fi

# Um `.pfx` truncado passa por "existe" e falha só na hora de assinar a nota.
# Piso de 1 KiB: o menor A1 real tem alguns KB; upload interrompido deixa bytes.
CERT_QUEBRADO=""; CERT_ORFAO=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  t="$(stat -c '%s' "$f" 2>/dev/null || echo 0)"
  [ "${t:-0}" -lt 1024 ] || continue
  org="$(printf '%s' "${f#/srv/fiscal/certs/}" | cut -d/ -f1)"
  if printf '%s\n' "$CERTS_REAIS" | grep -qx "$org"; then
    CERT_QUEBRADO="$CERT_QUEBRADO ${t}B:${org}"
  else
    CERT_ORFAO="$CERT_ORFAO ${t}B:${org}"
  fi
done < <(find /srv/fiscal/certs -name '*.pfx' -type f 2>/dev/null)
[ -n "$CERT_QUEBRADO" ] && alerta "certificado de cliente ATIVO truncado:$CERT_QUEBRADO"
[ -n "$CERT_ORFAO" ] && informa "pfx truncado de organização sem certificado real (teste/órfão):$CERT_ORFAO"

# ── 5. Versão: o que roda × a última release ─────────────────────────────────
titulo "Versão"
TAG_ENV="$(grep -E '^APP_IMAGE=' .env 2>/dev/null | head -1 | sed 's#.*:##')"
DOMINIO="$(grep -E '^NEXT_PUBLIC_APP_URL=' .env 2>/dev/null | head -1 \
  | sed -E 's#^NEXT_PUBLIC_APP_URL=##; s#^["'"'"']##; s#["'"'"']$##; s#^https?://##; s#/.*$##')"
# Qual proxy publica esta instalação. O `install.sh` grava no `.env`, e as duas
# rotas quebram de jeitos diferentes: sem esta variável, o alerta de 404 mandava
# o operador do Caddy rodar o comando que derruba o `up` dele.
PROXY="$(grep -E '^REVERSE_PROXY=' .env 2>/dev/null | head -1 \
  | sed -E 's#^REVERSE_PROXY=##; s#["'"'"']##g')"
PROXY="${PROXY:-caddy}"
VER_RODANDO=""
[ -n "$DOMINIO" ] && VER_RODANDO="$(curl -fsS --max-time 10 "https://$DOMINIO/api/v1/health" 2>/dev/null \
  | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
ULTIMA="$(curl -fsS --max-time 10 -H 'Accept: application/vnd.github+json' \
  https://api.github.com/repos/spiesdan/nexus/releases/latest 2>/dev/null \
  | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p')"

fala "  ${D}tag no .env: ${TAG_ENV:-?} · respondendo: ${VER_RODANDO:-?} · última release: ${ULTIMA:-? (não consultada)}${Z}"
if [ -n "$TAG_ENV" ] && [ -n "$VER_RODANDO" ] && [ "$TAG_ENV" != "$VER_RODANDO" ]; then
  alerta "o .env aponta $TAG_ENV mas o app responde $VER_RODANDO (contêiner não foi recriado?)"
elif [ -n "$ULTIMA" ] && [ -n "$TAG_ENV" ] && [ "$TAG_ENV" != "$ULTIMA" ]; then
  informa "roda $TAG_ENV, última release é $ULTIMA (atualizar é decisão do dono)"
else
  ok "versão em dia (${TAG_ENV:-?})"
fi

# ── 6. Borda: HTTP e TLS ─────────────────────────────────────────────────────
titulo "Borda"
if [ -z "$DOMINIO" ]; then
  informa "NEXT_PUBLIC_APP_URL ausente no .env — não testei HTTP/TLS"
else
  CODIGO="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMINIO/" 2>/dev/null)"
  case "$CODIGO" in
    2*|3*) ok "https://$DOMINIO/ devolve $CODIGO" ;;
    404)
      if [ "$PROXY" = "traefik" ]; then
        alerta "https://$DOMINIO/ devolve 404 — labels do Traefik perdidas (up sem o override?). Refaça com os DOIS -f, §1.2 do runbook."
      else
        alerta "https://$DOMINIO/ devolve 404 — o app respondeu não achei a rota (ou Host fora do Caddyfile). Alcançar o app é 502/503; aqui ele respondeu. Veja: docker compose -f docker-compose.prod.yml logs --tail=50 app"
      fi ;;
    50*)   alerta "https://$DOMINIO/ devolve $CODIGO — o proxy não alcança o app (fora da rede internal ou caído). Rode: docker compose -f docker-compose.prod.yml up -d app caddy" ;;
    000|"") alerta "https://$DOMINIO/ não respondeu" ;;
    *)     alerta "https://$DOMINIO/ devolve $CODIGO" ;;
  esac

  FIM_TLS="$(echo | openssl s_client -connect "$DOMINIO:443" -servername "$DOMINIO" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | sed 's/^notAfter=//')"
  if [ -n "$FIM_TLS" ]; then
    te="$(date -d "$FIM_TLS" +%s 2>/dev/null || echo 0)"
    if [ "$te" -gt 0 ]; then
      dias=$(( (te - HOJE_EPOCH) / 86400 ))
      if [ "$dias" -lt 10 ]; then
        alerta "TLS de $DOMINIO vence em ${dias} dias ($FIM_TLS)"
      else
        ok "TLS válido por ${dias} dias"
      fi
    else
      informa "TLS: data '$FIM_TLS' não convertida"
    fi
  else
    informa "TLS: não consegui ler o certificado de $DOMINIO:443"
  fi
fi

# ── Resumo ───────────────────────────────────────────────────────────────────
if [ "$MODO" = "json" ]; then
  join() { local IFS=';'; printf '%s' "$*"; }
  printf '{"ok":%s,"alertas":%d,"contadores":%d,"disco_pct":%s,"ram_pct":%s,"swap_pct":%s,' \
    "$([ "${#ALERTAS[@]}" -eq 0 ] && echo true || echo false)" \
    "${#ALERTAS[@]}" "$TOTAL" "${DISCO_PCT:-0}" "$RAM_PCT" "$SWAP_PCT"
  printf '"backup_horas":%s,"backup_qtd":%s,"backup_agendado":"%s",' \
    "${BK_IDADE_H:-null}" "${QTD:-0}" "$BK_AGENDADO"
  printf '"cert_validade":"%s","cert_dias":%s,"tag_env":"%s","ver_rodando":"%s","ultima_release":"%s",' \
    "${CERT_VAL:-}" "${CERT_DIAS:-null}" "${TAG_ENV:-}" "${VER_RODANDO:-}" "${ULTIMA:-}"
  printf '"http":"%s","alertas_lista":"%s","info_lista":"%s"}\n' \
    "${CODIGO:-}" "$(join "${ALERTAS[@]:-}")" "$(join "${INFO[@]:-}")"
else
  fala ""
  if [ "${#ALERTAS[@]}" -eq 0 ]; then
    fala "${G}${B}RESUMO: tudo dentro do limite${Z} (${TOTAL} contêineres, disco ${DISCO_PCT}%, RAM ${RAM_PCT}%)"
  else
    fala "${R}${B}RESUMO: ${#ALERTAS[@]} alerta(s)${Z} — nada foi alterado por este script"
    for a in "${ALERTAS[@]}"; do fala "  ${R}•${Z} $a"; done
  fi
  fala "${D}Leitura apenas. Consertar é decisão do dono — ver docs/runbooks/operacao-vps.md${Z}"
fi

[ "${#ALERTAS[@]}" -eq 0 ] && exit 0 || exit 1
