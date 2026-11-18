---
impacto: nada_mudou
secao: corrigido
titulo: Sentinel também confere a nota duplicada pelo pedido secundário
---

O detector de nota duplicada passou a considerar todos os pedidos que compõem
uma NF-e (`invoice_orders`), e não só o pedido principal. Um agrupamento em que
duas notas vivas compartilham o mesmo pedido secundário agora vira ocorrência,
em vez de passar despercebido.

Nada muda para quem opera a VPS: nenhuma configuração nova, nenhum comando e
nenhuma migração além da 0316 já publicada.
