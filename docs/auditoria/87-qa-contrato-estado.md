# 87 — QA local: contrato do plano, estado da publicação e rótulo da UF

## 1. Billing lia o campo errado (P0)

A rota entrega `plano: { configurado, nome, valor_cents, moeda, fonte, intervalo }`; a tela lia `valor_cents`/`moeda` do topo (snapshot da assinatura, nulo sem Stripe). Com o plano semeado pelo baseline, **toda instalação** via "plano não configurado". Agora a leitura é de `dados.plano` com `configurado: false` tratado como não configurado de verdade. Medido: `Nexus · R$ 1.699,00 · mensal`; sem plano, "plano não configurado". Capturas `capturas/qa-billing-{com-plano,sem-plano}-{light,dark}_{1440,390}.png`.

## 2. Publicar deixava estado velho

`publicarRota()` agora chama `recarregar()` depois do `POST /rota/iniciar`: status, `rota_em` e versão entram no estado local sem reload. Medido: antes do clique havia botão "Publicar rota" e nenhum selo; depois, **nenhum botão de publicar** e a faixa "Publicada em 25/11/2026, 07:00:00 · versão 2" — coerente, sem recarregar. Capturas `capturas/qa-rota-publicada-light_{1440,390}.png`.

**Decisão sobre publicar sem ordem salva:** a ordem da tela é salva **no mesmo ato** (`PATCH /rota/ordem` antes do `iniciar`), porque publicar sem salvo entregaria a sequência anterior e deixaria versão 0. Não bloqueamos o operador — o gesto já salva o que ele vê.

## 3. Rótulo redundante na pendência fiscal

`cidade/UF (ou o código IBGE...)` e `UF` apareciam juntos. Agora `UF` só entra na lista quando o município resolveu e a sigla ainda falta — caso distinto de verdade. Teste atualizado nos dois sentidos.

Gates: typecheck, lint, `qa-contrato-estado`, `billing-tenant`, `destinatario-da-nota` (43 verdes). Sem deploy.
