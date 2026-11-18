---
impacto: nada_mudou
secao: corrigido
titulo: A borda do campo de formulário deixa de ser invisível (1,21:1 → 3,39:1)
---

A borda que identifica um campo de formulário é a única que a WCAG cobra de
verdade: o item 1.4.11 pede 3:1 para a informação visual que identifica o
controle. Ela media **1,21:1** no tema claro (1,31:1 no escuro) — na prática,
invisível.

Continua **1px**: o "hairline" é a espessura, não a invisibilidade. O que muda é
a cor, e ela virou um token próprio (`--color-border-control`), separado da
divisória entre blocos — que segue discreta, porque divisória não identifica
controle nenhum.

- claro: `#848c98` — 3,39 sobre o cartão, 3,17 sobre o fundo, 3,25 sobre a superfície elevada;
- escuro: `#747a82` — 3,93 / 4,22 / 3,49.

Os estados continuam crescendo: repouso ~3,4, hover com o accent (3,63 / 4,69) e
foco com a tinta do accent (5,56 / 7,63) mais o anel de 2px. Vale para os
primitivos (campo de texto, área de texto, seletor) e para os campos escritos à
mão — agenda, cadastro de horários e busca.
