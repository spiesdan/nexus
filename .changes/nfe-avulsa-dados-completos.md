---
impacto: nada_mudou
secao: corrigido
titulo: NF-e avulsa leva o CPF do cadastro e todos os dados digitados
---

Ao escolher um cliente cadastrado na venda de balcão, a tela lia só a coluna
cnpj. Clientes com CPF salvo apenas nos metadados do Mercos emitiam sem
documento. O preenchimento passou a usar as mesmas funções do pedido:
documentoDoCadastro e montarDestinatario, com o digitado vencendo o cadastro.

A emissão mandava somente o grupo da venda avulsa e descartava o que estava em
Dados adicionais. O payload agora mescla os extras montados com a venda e passa
pela mesma pré-validação do pedido, mostrando pendências nomeadas antes de
consumir número da SEFAZ.

Nada a fazer na VPS.
