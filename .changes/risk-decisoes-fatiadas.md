---
impacto: nada_mudou
secao: corrigido
titulo: Radar de risco volta a gravar decisões com acervo grande
---

A leitura das decisões já gravadas mandava a lista inteira de leads frios num
`in()` do PostgREST; acima de ~500 ids a URL estourava (414) e derrubava a
rodada do risk-watcher **inteira** — a cada 15 minutos, em silêncio, porque a
falha acontece dentro do cron. A leitura agora vai em blocos de 100 ids
(`lib/db/por-fatias.ts`, com teste), a mensagem diz que foi **leitura**
(`leitura de decisões falhou: …`) e as duas outras consultas do mesmo caminho
que montavam `in()` sem teto — `risk-seed` (etapas e contatos de todos os leads
abertos) e `radar-de-risco` (dono, etapa e contato) — também passaram pelo
mesmo helper. Nenhum dado existente muda; quem já tem decisão continua de fora.
