---
impacto: nada_mudou
secao: corrigido
titulo: Link e selo em accent voltam a passar no contraste, nos dois temas
---

O accent do produto serve a dois papéis e usava um token só. Como
**preenchimento** (botão primário) ele está certo: `#7e77f0` com texto Carbon dá
4,80:1. Como **tinta** — link "Ver detalhes", aba ativa, selo — o mesmo
`#7e77f0` dá **3,63:1** sobre o cartão e **3,06:1** sobre o fundo suave do selo
no tema claro: abaixo do piso AA de 4,5 para texto normal. No tema escuro
passava, e é por isso que as medições feitas no tema padrão nunca acharam.

Agora existe `--color-accent-ink`: o grau 700 no claro (5,56 / 5,19 / 5,33, e
4,68 sobre o fundo suave) e o 400 no escuro (7,63). Os dois são paradas da
rampa, então a marca do revendedor continua mandando na cor.

O texto do botão destrutivo também deixou de ser branco fixo: branco sobre o
vermelho do tema escuro dava 3,48:1. O token `--destructive-foreground` já
escolhia o lado certo por tema; o componente é que não o usava.

Nada muda de lugar, de fluxo ou de regra — só o tom de quem é lido como texto.
