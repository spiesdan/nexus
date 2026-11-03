---
impacto: nada_mudou
secao: corrigido
titulo: CPF do cliente do Mercos passa a aparecer no cadastro e na NF-e
---

Cliente que entrou pelo Mercos com **CPF** ficava sem documento visível no
sistema: a ficha mostrava "Documento: —", a nota dizia que o cadastro não tinha
CPF/CNPJ e o impresso saía sem documento — para um cliente que **tem** CPF.

A causa é onde o CPF fica guardado. O Mercos manda o documento no cadastro e a
coluna `cnpj` guarda só CNPJ; o CPF fica em `source_metadata.mercos.documento`,
que nada lia. Medido nesta instalação em 03/11/2026: **917 contatos com CPF**
(907 deles com a coluna vazia) e 832 pedidos desses clientes.

Agora o documento do cadastro é lido do lugar certo, em um resolvedor só
(`documentoDoCadastro`), usado pela ficha do cliente, pela NF-e (destinatário,
pré-validação e emissão), pelo romaneio e pelo impresso do pedido. A coluna
`cnpj` continua tendo prioridade: correção feita à mão no cadastro vale.

Nada muda para quem tem CNPJ — o caminho é o mesmo de antes.
