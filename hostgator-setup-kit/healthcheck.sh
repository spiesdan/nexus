#!/usr/bin/env bash
# Diagnóstico rápido: estado dos containers + saúde do app (Supabase/Redis/WAHA).
source "$(dirname "$0")/_common.sh"
enter_project

step "Containers"
dc ps

step "Saúde interna do app (/api/v1/health)"
# Roda de dentro da rede do compose (a rota não é exposta publicamente sem TLS).
out="$(dc exec -T app node -e "
fetch('http://127.0.0.1:3000/api/v1/health').then(r=>r.text()).then(t=>{console.log(t);process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})
" 2>/dev/null || echo '')"
if [ -n "$out" ]; then
  printf '%s\n' "$out"
  printf '%s' "$out" | grep -q '"status":"ok"' && c_grn "✓ app saudável" || c_ylw "⚠ algum subsistema degradado (veja o JSON acima)."
else
  c_ylw "⚠ app não respondeu. Logs: docker compose $(dc_files) logs --tail=50 app"
fi

step "Atualização pela tela (agente do host)"
# Achado numa VPS real: o cron do agente é instalado no TOPO do update.sh, de
# propósito (para sobreviver a uma saída antecipada) — e isso cria uma janela em
# que o agente existe e o schema do banco ainda não. Ele então bate 500 a cada 5
# minutos, com o erro indo só para o .update-agent.log e o `>/dev/null` do cron.
# Para o dono, o sintoma é "o botão nunca apareceu": nenhuma pista, nenhum alarme.
# Este bloco é a pista.
if crontab -l 2>/dev/null | grep -q 'hostgator-setup-kit/agent.sh'; then
  c_grn "✓ agente instalado no cron (a cada 5 minutos)"
  log="$PROJECT_DIR/.update-agent.log"
  # Recência pela MTIME do arquivo, não parseando a data de dentro: `date -d` é
  # sintaxe GNU e falha calado no BSD/macOS, devolvendo "sem falhas" para um
  # agente que está falhando agora. `find -mmin` é portátil.
  if [ -s "$log" ] && [ -n "$(find "$log" -mmin -120 2>/dev/null)" ]; then
    c_ylw "⚠ o agente falhou recentemente ao falar com o app:"
    c_ylw "  $(tail -2 "$log" | head -1)"
    c_ylw "  Se o botão de atualizar não aparece na tela, é por isto."
    c_ylw "  Quase sempre resolve rodando: bash hostgator-setup-kit/update.sh"
  else
    c_grn "✓ sem falhas recentes do agente"
  fi
else
  c_ylw "⚠ o agente NÃO está no cron — o botão de atualizar não vai aparecer na tela."
  c_ylw "  Ative rodando: bash hostgator-setup-kit/update.sh"
fi

# ── Âncora de versão: a tag no .env, o HEAD e as branches ─────────────────────
#
# Medido numa VPS real em 2026-10-06: às 22:15 a tag das imagens no .env saiu de
# `1.20.2` para `main` e às 00:48 o container foi recriado — o
# site trocou sozinho, de madrugada, sem ninguém pedir. `main` é tag MÓVEL:
# é reconstruída a cada merge que entra no repositório, então quem aponta pra
# ela instala o topo da main sobre o banco da versão instalada.
#
# Na mesma noite o repositório também ficou com 4 branches locais (uma 239
# commits atrás da remota) e dois remotes apontando para a mesma URL. Bastava
# um `git checkout main` para o código cair para o estado de setembro, e nada
# disso aparecia em lugar nenhum: o healthcheck checava containers e app, nunca
# a âncora de versão.
#
# Aqui é onde isso vira visível. Só aviso, sem mudar código de saída: o
# install.sh chama este script no fim da instalação, quando o .env ainda pode
# estar em `latest` e o HEAD na branch do clone — reprovar ali travaria
# instalação nova por um estado que é o dela, e não um defeito.
step "Âncora de versão (drift)"

git_dir_ok=""
command -v git >/dev/null 2>&1 && [ -d .git ] && git_dir_ok=1

# 1. A imagem pinada é uma tag de versão, ou um canal móvel?
app_ref="$(valor_do_env .env APP_IMAGE 2>/dev/null || true)"
if [ -z "$app_ref" ]; then
  c_ylw "⚠ APP_IMAGE não encontrado no .env — não dá pra saber que versão roda aqui."
elif tag="$(tag_da_imagem "$app_ref")" && [ -n "$tag" ]; then
  case "$tag" in
    # Canal móvel, não versão. `main` e `latest` são reconstruídos a cada merge;
    # `stable` segue a última release. Nenhum dos três diz QUE versão está no ar.
    main|latest|stable|HEAD|dev)
      c_red "✗ APP_IMAGE aponta para o canal móvel '$tag' — não é uma versão fixa."
      c_ylw "  Esse é exatamente o estado que troca o site sozinho a cada merge."
      c_ylw "  Conserte com: bash hostgator-setup-kit/update.sh --to <vX.Y.Z> --force" ;;
    # Tag da IMAGEM não leva o 'v' (gravar_imagens grava ":1.20.2"); a tag do
    # GIT leva (git describe devolve "v1.20.2"). Por isso os dois padrões.
    v[0-9]*|[0-9]*)
      c_grn "✓ imagem fixada na tag $tag ($app_ref)" ;;
    *)
      c_ylw "⚠ APP_IMAGE usa a tag '$tag', que não parece uma versão." ;;
  esac
else
  c_ylw "⚠ APP_IMAGE ($app_ref) não tem tag — não dá pra saber qual versão roda."
fi

# 2. As três imagens andam juntas? (update.sh grava as três de uma vez; se só
#    uma divergiu, alguém mexeu no arquivo à mão depois da última atualização.)
if [ -f .env ] && [ -n "${tag:-}" ]; then
  desencontradas=""
  for chave in APP_IMAGE WORKER_IMAGE SCHEDULER_IMAGE; do
    ref="$(valor_do_env .env "$chave" 2>/dev/null || true)"
    [ -n "$ref" ] || continue
    t="$(tag_da_imagem "$ref")"
    [ "$t" = "$tag" ] || desencontradas="$desencontradas $chave=$t"
  done
  if [ -n "$desencontradas" ]; then
    c_ylw "⚠ as três imagens não estão na mesma tag (APP_IMAGE em '$tag'):$desencontradas"
    c_ylw "  O update.sh grava as três juntas — só uma divergindo é sinal de edição à mão."
  fi
fi

# 3. O repositório tem branch local? Qualquer uma é uma mina: `git checkout
#    main` num clone parado pula de volta meses sem aviso, e depois disso o
#    próximo update.sh compara versão contra um estado que ninguém instalou.
if [ -n "$git_dir_ok" ]; then
  branches="$(git for-each-ref --format='%(refname:short)' refs/heads/ 2>/dev/null || true)"
  if [ -n "$branches" ]; then
    c_ylw "⚠ há branch local no repositório do servidor (esperado: nenhuma):"
    for b in $branches; do c_ylw "    $b"; done
    c_ylw "  O estado correto é detached na tag, sem branch — é o que o update.sh deixa."
    c_ylw "  NÃO apague sem conferir: git rev-list --count origin/main..<branch> tem que dar 0."
  else
    c_grn "✓ nenhuma branch local (HEAD solto na tag, como o update.sh deixa)"
  fi

  # 4. Um remote só. Dois remotes para a mesma URL não quebra nada hoje, mas
  #    é o setup em que um `git push` errado vai para um ref que ninguém vigia.
  nrem="$(git remote 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$nrem" -gt 1 ]; then
    c_ylw "⚠ $nrem remotes configurados — o update.sh só usa 'origin':"
    for r in $(git remote 2>/dev/null); do c_ylw "    $r"; done
  elif [ "$nrem" = "1" ]; then
    c_grn "✓ um remote apenas: origin"
  else
    c_ylw "⚠ nenhum remote — o update.sh não consegue consultar o repositório oficial."
  fi

  # 5. HEAD está numa tag de versão? Solto é o normal; em branch é o estado
  #    que sobrou de quem trabalhou dentro do servidor.
  if head_ref="$(git symbolic-ref -q HEAD 2>/dev/null)"; then
    c_ylw "⚠ HEAD está na branch '$(basename "$head_ref")', não numa tag."
    c_ylw "  Quem mexeu aqui provavelmente rodou git checkout/reset dentro do servidor."
  else
    htag="$(git describe --tags --exact-match HEAD 2>/dev/null || true)"
    if [ -n "$htag" ]; then
      c_grn "✓ HEAD solto na tag $htag"
    else
      c_ylw "⚠ HEAD solto em commit que NÃO é tag ($(git rev-parse --short HEAD 2>/dev/null))."
      c_ylw "  O código no disco não corresponde a nenhuma versão publicada."
    fi
  fi
fi
