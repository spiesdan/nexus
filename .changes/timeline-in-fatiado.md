---
impacto: nada_mudou
secao: corrigido
titulo: Último .in() sem teto da varredura foi fatiado
---

`lib/leads/timeline-query.ts` buscava todos os agentes da timeline num único
`.in("id", agentIds)` — com centenas de atores diferentes a URL podia estourar
(414) e a timeline perdia os nomes. A leitura agora usa `lib/db/por-fatias.ts`
(blocos de 100), o mesmo helper dos nove sítios de cron corrigidos antes.
Fecha a dívida declarada no doc `51`: **10 de 10** sítios sem teto corrigidos.
