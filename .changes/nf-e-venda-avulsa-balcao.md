---
impacto: capacidade_nova
secao: adicionado
titulo: NF-e de venda avulsa (balcão) no fluxo normal da emissão
---

A tela de notas ganhou o modo NF-e de venda avulsa: venda sem pedido, com destinatário (cadastro ou informado), frete e os itens vendidos. O fato entra em `extras_fiscais.avulsa`; a nota nasce sem pedido (`order_id` nulo) e o número sai pela reserva da série — não pela sequência do pedido.

A prévia (`POST /api/v1/invoices/validar`) e a emissão (`emitirNota` + drain + provedor) seguem o mesmo caminho do de pedido: validação fail-closed, destino do destinatário, itens resolvidos por catálogo/código/nome, total com frete. O ajuste de item por `order_item_id` não se aplica (não há pedido), e a nota órfã (`em_emissao` sem job) continua descartando.

Com isto, quem vendia no balcão passa a ter a nota fiscal no fluxo normal da operação — sem bypass nem papelada paralela.
