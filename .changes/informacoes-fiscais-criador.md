---
impacto: nada_mudou
secao: corrigido
titulo: Criador de pedidos ganha o campo de informacoes fiscais da NF-e
---

O criador so oferecia "Informacoes adicionais", que vai para a observacao do
pedido. O campo que a emissao usa como infCpl so existia na ficha de detalhes,
entao a ordem de compra do cliente era digitada no lugar errado.

O novo campo "Informacoes fiscais (NF-e)" fica ao lado das observacoes, entra
no mesmo autosave e no payload de criacao, e aparece separado no resumo. Quando
ele fica vazio, a emissao continua usando as informacoes adicionais como antes.

Nada a fazer na VPS.
