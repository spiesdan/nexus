---
impacto: capacidade_nova
secao: adicionado
titulo: Catálogo do Mercos mede e importa também os produtos inativos
---

A coleta do catálogo ganhou `--todos`: além da grade de ativos, ela percorre a
visão de inativos e marca cada linha com `ativo: true|false`. O default continua
só ativos.

O filtro real da grade é `?status=1` (ativos), `?status=2` (inativos) e
`?status=0` (todos) — medido na página, não chutado. `?situacao=inativos` não
filtra nada: devolve a mesma grade de ativos.

O importador não sobrescreve o status de produto existente: linha inativa não
rebaixa produto ativo; linha ativa não promove produto inativo. Produto novo
nasce com o status da coleta. Medido em 19/11/2026: 601 ativos e 246 inativos no
ERP; o dry-run criaria 55 produtos (todos inativos) e bloquearia 134
rebaixamentos de produtos hoje ativos.
