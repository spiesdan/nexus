---
impacto: nada_mudou
secao: corrigido
titulo: Recuperação operacional pode forçar o período da coleta do Mercos
---

`MERCOS_DE` e `MERCOS_ATE` (DD/MM/AAAA), quando preenchidos juntos, substituem a janela derivada do último pedido importado — é o que permite buscar pedidos antigos sem alterar o fluxo normal. A execução registra `recuperacao_periodo` com as duas datas. Vazio no dia a dia; as variáveis devem ser removidas do `.env` depois do backfill.
