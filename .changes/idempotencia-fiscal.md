---
impacto: capacidade_nova
secao: adicionado
titulo: Idempotency-Key fiscal — o retry devolve a mesma nota, nunca uma segunda
---

A emissão de NF-e e a inutilização de faixa agora honram `Idempotency-Key` de
verdade: a chave é reivindicada **antes** do efeito, o segundo request com a
mesma chave espera o primeiro e recebe a resposta original com o header
`Idempotency-Replayed: true`. Mesma chave com outro payload é
`409 idempotency_conflict` — reusar chave para outro pedido é erro do cliente,
não cache hit.

Antes, dois cliques/retries simultâneos podiam criar duas notas (cada uma com
job de emissão) ou duas faixas inutilizadas. A trava de nota viva do #484 fecha
o caso do mesmo pedido; esta fecha o retry da mesma requisição, inclusive
quando o payload é idêntico.

A tabela `idempotency_keys.request_hash` passa de `bytea` para `text` (hex):
o helper gravava/comparava hex e o insert como bytea falhava em silêncio, então
a chave não persistia. A conversão preserva as linhas existentes.
