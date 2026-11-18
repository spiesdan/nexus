---
impacto: nada_mudou
secao: corrigido
titulo: Estoque sem nenhuma movimentação deixa de escapar do Sentinel
---

O detector de divergência de estoque comparava o saldo guardado com a soma das
movimentações, mas só enxergava produto que tivesse pelo menos uma movimentação.
Um produto controlado, criado depois do razão, com saldo 50 e nenhuma entrada ou
saída ficava invisível — justamente o caso mais óbvio de divergência.

Agora o razão vazio entra na comparação: saldo 50 contra 0 aparece como
ocorrência de confiança baixa, com a limitação escrita no próprio achado. A
diferença continua sendo hipótese até a contagem física, porque o razão não tem
saldo de abertura. O ajuste é sempre manual e com movimento; o Sentinel não
altera saldo.
