# Capturas da NFe de venda avulsa — 7 imagens em 1440×900

Código capturado: **v2.1.1** (HEAD `b967c53b`, merge do #973).
Job descartável `tmp-captura-avulsa` (branch `tmp/captura-avulsa`), Supabase
efêmero, nenhuma nota emitida contra a SEFAZ.

## Estados (7)

1. `vazia` — formulário sem itens.
2. `busca-resultado` — busca de produto com resultado.
3. `item-ncm` — item selecionado com NCM do cadastro.
4. `busca-vazia` — termo sem resultado.
5. `cliente-incompleto` — botão **desabilitado** + `nfe-pendencias` nomeando campos.
6. `falha-envio` — `POST /invoices` interceptado com 500: `nfe-erro` visível e **nenhuma nota criada**; o reenvio (rota liberada, mesma chave) é aceito.
7. (o mesmo cliente completo da 6, sem interceptação, é coberto pela prova do reenvio)

## Decisão do QA (27/11/2026)

> Cadastro incompleto: `nfe-emitir` desabilitado + `nfe-pendencias` nomeando os
> campos, nenhum POST. Falha de envio (abort/500 simulados): `nfe-erro`
> visível, nenhuma nota criada, reenvio com a mesma `Idempotency-Key`.

## Pendente

390×844 e vídeo: parados até o Frontend entregar o fix da lista de resultados
da busca de produto no mobile (o campo existe, a lista não renderiza).
