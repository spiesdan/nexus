---
impacto: nada_mudou
secao: corrigido
titulo: Abrir a campanha e ler a base grande deixam de estourar a URL
---

Com a campanha de 500 empresas finalmente criada, a tela de controle abria em
"Não foi possível abrir a campanha": a rota `/campanhas/[id]/controle` ainda
mandava 400 UUIDs numa consulta só (`LOTE = 400`) e o PostgREST respondia
`414 URI too long`. O mesmo defeito que a 1.35.3 corrigiu na criação continuava
vivo nas leituras da audiência.

Agora todas as leituras de lista de ids do caminho da campanha usam a fatia
canônica de 100 (`lib/db/por-fatias.ts`): controle, painel, disparo, agendador,
funil em lote, aba Empresas (busca e categorias) e mercado. Uma campanha de 500
empresas abre, mostra a fila e o agendador consegue escolher quem recebe.

Um gate novo (`tests/unit/audiencia-em-fatias.test.ts`) reprova o retorno do
lote local de 400 nos arquivos da audiência.
