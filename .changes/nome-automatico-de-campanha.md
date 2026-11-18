---
impacto: capacidade_nova
secao: adicionado
titulo: Campanha ganha nome automático pelas cidades — e respeita o nome do operador
---

Ao montar uma campanha por região, o nome passa a ser gerado pelas cidades
selecionadas: uma cidade vira `Campanha {Cidade}`; duas a quatro viram a lista
em ordem alfabética pt-BR; cinco ou mais mostram as três primeiras e `+N`. O
gerador deduplica sem diferenciar caixa, preserva o casing da primeira
ocorrência e corta em limite de palavra com `…` no teto de 80 caracteres.

Quem edita o nome manualmente não perde o texto: a campanha grava
`nome_manual = true` e o app nunca sobrescreve.
O botão **Voltar ao nome automático** limpa a flag e regenera pela seleção
atual. Campanhas que já existiam foram marcadas como manuais na migração — o
nome delas foi escolhido antes de o gerador existir.
