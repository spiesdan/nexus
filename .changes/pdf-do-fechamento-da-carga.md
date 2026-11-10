---
impacto: capacidade_nova
secao: adicionado
titulo: PDF do fechamento da carga com a conta fechada
---

O documento do fechamento da carga passa a nascer no sistema: o endpoint de geração em PDF recebe a carga e devolve o documento com a conta fechada — resumo financeiro, conta (entradas/saídas/líquido/esperado/diferença), linhas contadas, conferência e cobrança por condição/parada. Na tela de fechamento da carga específica, o botão Fechamento (PDF) abre o documento em nova aba; o romaneio continua em seu endpoint.

Com isto, quem fecha o caixa gera o papel da conta fechada pela mesma fonte que a tela usa — a montagem mora numa só função (`lib/comercial/fechamento`) e o GET, o PUT e o PDF não podem divergir.
