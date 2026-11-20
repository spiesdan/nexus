---
impacto: nada_mudou
secao: corrigido
titulo: Radar de risco volta a gravar decisões com acervo grande
---

A leitura das decisões já gravadas mandava a lista inteira de leads frios num
`in()` do PostgREST; acima de ~500 ids a URL estourava (414) e derrubava a
rodada do risk-watcher **inteira** — a cada 15 minutos, em silêncio, porque a
falha acontece dentro do cron. Agora a leitura vai em blocos de 100 ids e a
mensagem de erro diz que foi **leitura** (`leitura de decisões falhou: …`), não
gravação. Nenhum dado existente muda; quem já tem decisão continua de fora.
