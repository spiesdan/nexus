---
impacto: nada_mudou
secao: corrigido
titulo: Matrículas de follow-up deixam de ser cortadas em silêncio
---

A lista de matrículas de follow-up devolvia tudo o que o banco entregasse numa
resposta só. Acima de mil contatos em fluxo, o servidor cortava a página e a
tela não tinha como saber: as matrículas que faltavam simplesmente não
apareciam.

Agora a rota pagina de verdade — 200 por vez, até 500 — e diz o que entregou:
`has_more` e `next_offset` vêm na resposta. A ordem é total (atualização mais
recente e, no empate, o identificador), então nenhuma linha se repete ou se
perde entre páginas.

O painel de uso da plataforma também deixou de baixar a janela de mensagens e
conversas só para contar: a contagem agora é feita no banco.
