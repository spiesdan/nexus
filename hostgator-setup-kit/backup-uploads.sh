#!/usr/bin/env bash
# F-32/D9 — backup e restore das SUPERFÍCIES DE UPLOAD.
#
# O `backup.sh` sempre copiou o banco e as sessões do WhatsApp. Ficavam de fora
# justamente os arquivos que o banco referencia: fotos de produto em disco, a
# mídia do WhatsApp (volume `waha-media`) e os buckets de um Supabase PRÓPRIO
# (volume do `supabase/storage-api`). Perder o volume não corrompe linha
# nenhuma — e é por isso que ninguém percebe até abrir a ficha e ver imagem
# quebrada, sem erro no log.
#
# Uso:
#   bash hostgator-setup-kit/backup-uploads.sh --listar
#   bash hostgator-setup-kit/backup-uploads.sh --backup <dir> [timestamp]
#   bash hostgator-setup-kit/backup-uploads.sh --restore <uploads-*.tgz> [--substituir]
#
# Decisão de operação do restore (e está escrita porque é decisão, não detalhe):
# **o restore recusa destino com conteúdo** a menos que se peça `--substituir`.
# Um backup de ontem aplicado sobre um volume que já recebeu arquivos de hoje
# sobrescreveria mídia NOVA com mídia velha — e o banco, que é a fonte da
# verdade dos caminhos, continuaria apontando para os dois. Na recuperação de
# desastre (volume vazio, disco trocado) o restore funciona sem flag; no dia a
# dia, quem quiser sobrescrever diz que quer.
#
# Nada aqui toca produção: roda no diretório do projeto e escreve/lê apenas o
# diretório/volume que o compose declara.
source "$(dirname "$0")/_common.sh"

MODO=""
ARG1=""
ARG2=""
SUBSTITUIR=0

# `continue` depois de consumir o valor, e NÃO um `shift` no fim do laço: com
# `--restore arquivo --substituir`, o shift de dentro mais o de fora engoliam a
# flag e o restore recusava sobrescrever sem dizer por quê (medido no teste).
while [ $# -gt 0 ]; do
  case "$1" in
    --listar) MODO="listar"; shift ;;
    --backup)
      MODO="backup"; ARG1="${2:-}"; shift 2
      # Timestamp opcional: só consome o terceiro token se ele não for flag.
      if [ $# -gt 0 ] && [ "${1#-}" = "$1" ]; then ARG2="$1"; shift; fi
      ;;
    --restore) MODO="restore"; ARG1="${2:-}"; shift 2 ;;
    --substituir) SUBSTITUIR=1; shift ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "argumento desconhecido: $1" ;;
  esac
done

[ -n "$MODO" ] || die "uso: backup-uploads.sh --listar | --backup <dir> [ts] | --restore <arquivo> [--substituir]"
enter_project

case "$MODO" in
  listar)
    uploads_do_projeto
    ;;

  backup)
    destino="${ARG1:?--backup precisa do diretório de destino}"
    ts="${ARG2:-$(date +%Y%m%d-%H%M%S)}"
    mkdir -p "$destino"
    # ABSOLUTO: `-v backups:/out` não monta o diretório — o Docker lê "backups"
    # como NOME DE VOLUME e cria um volume novo, vazio. O tar "dá certo" dentro
    # dele e o arquivo não aparece no host; medido com docker de verdade. O
    # teste com dublê não pegava porque o dublê tratava todo `-v` como caminho.
    destino="$(cd "$destino" && pwd)"
    falhas=0
    vazio=0
    achou=0

    # Lê a lista num array: o `while` em pipe rodaria num subshell e as
    # contagens abaixo ficariam presas lá dentro.
    mapa=()
    while IFS= read -r linha; do mapa+=("$linha"); done < <(uploads_do_projeto)

    if [ "${#mapa[@]}" -eq 0 ]; then
      c_ylw "⚠ nenhuma superfície de upload encontrada (sem bind de fotos, sem waha-media, sem Storage próprio)."
      c_dim "  Se esta instalação usa Supabase Cloud, o Storage é do provedor: copie os buckets pela API dele."
      exit 0
    fi

    for linha in "${mapa[@]}"; do
      IFS=$'\t' read -r rotulo tipo fonte <<< "$linha"
      achou=1
      arq="$destino/uploads-$rotulo-$ts.tgz"

      if [ "$tipo" = "bind" ]; then
        if [ ! -d "$fonte" ]; then
          c_ylw "⚠ $rotulo: diretório $fonte não existe — nada a copiar"
          continue
        fi
        if tar czf "$arq" -C "$fonte" . 2>/dev/null; then :; else
          c_red "✗ $rotulo: falha ao copiar $fonte"; falhas=$((falhas+1)); rm -f "$arq"; continue
        fi
      else
        # Tar para STDOUT, não para um `-v destino:/out`. Montar o diretório de
        # backups dentro do container exigiria que o usuário do tar escrevesse
        # no host (uid do root no VPS, uid compartilhado no Docker Desktop) —
        # medido: "Permission denied" ao gravar em `/out`. STDIN/STDOUT não tem
        # essa camada: quem escreve o arquivo é o shell, com o dono certo.
        if docker run --rm -v "$fonte:/data:ro" alpine:3.20 \
             tar czf - -C /data . > "$arq" 2>/dev/null; then :; else
          c_red "✗ $rotulo: falha ao copiar o volume $fonte"; falhas=$((falhas+1)); rm -f "$arq"; continue
        fi
      fi

      # Um `.tgz` que existe e não abre é pior que nenhum: `zcat` devolve nada e
      # o restore "termina" sem restaurar. A prova é `tar -tzf` — ele lê o gzip
      # e lista as entradas, que é o que o restore vai fazer.
      #
      # `gzip -t` NÃO entra: o tar do macOS, escrevendo em STDOUT, preenche o
      # stream até blocos de 10 KiB, e o `gzip -t` chama isso de "trailing
      # garbage" (rc 2) — reprovando um arquivo que restaura perfeitamente. O
      # preenchimento é inofensivo; truncamento é o que quebra, e `tar -tzf`
      # reprova truncado (medido).
      if ! tar -tzf "$arq" >/dev/null 2>&1; then
        c_red "✗ $rotulo: o arquivo gerado não abre ($arq)"; falhas=$((falhas+1)); rm -f "$arq"; continue
      fi
      chmod 600 "$arq" 2>/dev/null || true

      bytes="$(wc -c < "$arq" | tr -d ' ')"
      if [ "$bytes" -lt 150 ]; then
        # Tar de diretório vazio é legítimo (instalação nova). O aviso evita
        # que "✓ backup" esconda "não havia nada ali".
        c_ylw "⚠ $rotulo: vazio ($bytes bytes) — nada para copiar"
        vazio=$((vazio+1))
      else
        c_grn "✓ $rotulo: $(du -h "$arq" | awk '{print $1}') → $(basename "$arq")"
      fi
    done

    if [ "$achou" = 0 ]; then exit 0; fi
    if [ "$falhas" -gt 0 ]; then
      c_red "✗ BACKUP DE UPLOADS INCOMPLETO — $falhas superfície(s) falharam. NÃO trate este backup como completo."
      exit 1
    fi
    exit 0
    ;;

  restore)
    arquivo="${ARG1:?--restore precisa do arquivo uploads-*.tgz}"
    [ -f "$arquivo" ] || die "arquivo não encontrado: $arquivo"
    tar -tzf "$arquivo" >/dev/null 2>&1 || die "$arquivo não é um tar legível — restore abortado sem tocar em nada."

    rotulo="$(rotulo_do_arquivo_de_uploads "$arquivo")"
    [ -n "$rotulo" ] || die "nome fora do padrão uploads-<rótulo>-<AAAAMMDD-HHMMSS>.tgz: $(basename "$arquivo")"

    destino_linha=""
    while IFS= read -r linha; do
      IFS=$'\t' read -r r t f <<< "$linha"
      if [ "$r" = "$rotulo" ]; then destino_linha="$linha"; break; fi
    done < <(uploads_do_projeto)

    [ -n "$destino_linha" ] || die "não achei a superfície '$rotulo' nesta instalação. Superfícies conhecidas: $(uploads_do_projeto | cut -f1 | paste -sd, -). O restore não adivinha destino."

    IFS=$'\t' read -r _ tipo fonte <<< "$destino_linha"

    if destino_tem_conteudo "$tipo" "$fonte"; then
      if [ "$SUBSTITUIR" != 1 ]; then
        die "o destino de '$rotulo' ($tipo $fonte) já tem conteúdo.
     Restaurar por cima sobrescreveria mídia NOVA com mídia do dia do backup.
     Se é isso mesmo, repita com --substituir. Nada foi escrito."
      fi
      c_ylw "⚠ substituindo o conteúdo de $fonte (--substituir)"
    fi

    step "Restaurando $rotulo → $tipo $fonte"
    if [ "$tipo" = "bind" ]; then
      mkdir -p "$fonte" || die "não consegui criar $fonte"
      tar xzf "$arquivo" -C "$fonte" || die "falha ao extrair em $fonte"
    else
      # Mesma razão do backup: stdin em vez de montar o diretório do arquivo.
      docker run --rm -i -v "$fonte:/data" alpine:3.20 \
        tar xzf - -C /data < "$arquivo" || die "falha ao extrair no volume $fonte"
    fi
    c_grn "✓ $rotulo restaurado"
    ;;

  *) die "modo desconhecido: $MODO" ;;
esac
