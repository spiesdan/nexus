---
impacto: nada_mudou
secao: corrigido
titulo: Coleta do catálogo ganha o modo "todos" (inativos) e passa a falhar quando lê menos que o ERP
---

O filtro da grade do Mercos é `status` — `1` ativos (601), `0` todos (847), `2`
só inativos — e agora o coletor aceita `--todos`. Os dois modos rodaram em
produção: 601 em 41 páginas e 847 em 57, com 246 inativos no meio.

O contador do próprio ERP (`/contar_produtos/<rep>/`) virou gate: se a coleta lê
menos que o total informado, ela falha em vez de terminar com sucesso. Era um
defeito real — em 19/11 a mesma coleta parou em 75 de 601 e em 495 de 601, as
duas com `ok: true`.

Importar produto inativo **não desativa** produto ativo no catálogo (143 casos
medidos, nenhum alterado); produto novo que vem inativo nasce inativo.
`--aplicar` segue exigindo decisão do dono — o dry-run não grava nada.
