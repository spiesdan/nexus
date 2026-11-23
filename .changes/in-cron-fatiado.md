---
impacto: nada_mudou
secao: corrigido
titulo: Crons fatiados para não estourar a URL do PostgREST
---

Os nove `.in()` sem teto que ainda rodavam em cron (Meu Dia: notas, itens de
carga, nomes de contatos/pedidos, pedidos e cidades; recover-stuck-messages:
marcação de mensagens e fechamento de avisos; sync-model-catalog: depreciação)
passaram a ir em blocos de 100 via `lib/db/por-fatias.ts`. Um erro em qualquer
bloco reprova a rodada com a mensagem original — sem "sucesso parcial". Fica
fora desta fatia o único sítio restante, `timeline-query`, que não é cron.
