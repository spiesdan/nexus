---
impacto: capacidade_nova
secao: adicionado
titulo: Assistente sabe o que cada produto é antes de responder
---

Cada produto do catálogo passa por uma ficha lida por máquina: se é produto
único, conjunto (com quais itens) ou peça de reposição, além de medida,
concentração e quantidade por embalagem. Tudo sai do que a loja cadastrou —
nome, categoria, marca — e nada é inventado.

Efeito na conversa: "vassoura" não volta mais com cabo de vassoura avulso nem
com pá com coletor + vassoura, porque esses dois chegam marcados como peça e
como conjunto. O assistente também passa a responder "vende em caixa fechada?"
com o número real da embalagem.

Em installs com produto sem descrição cadastrada, a descrição passa a ser
preenchida a partir da ficha. Quem quiser revisar antes pode rodar
`pnpm tsx scripts/estudar-catalogo.ts --org=<uuid>`: ele imprime o estudo
completo de todos os produtos e o SQL, sem gravar nada.
