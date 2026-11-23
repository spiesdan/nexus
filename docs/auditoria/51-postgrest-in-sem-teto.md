# `.in(...)` sem teto de URL — varredura de 20/11/2026

> **Origem:** o risk-watcher falhava a cada 15 min na organização real com
> `decisões gravadas: URI too long` (414). A causa era um `.in("lead_id", …)`
> com a lista de frios inteira (`lib/leads/laya-decisao.ts:376`). Este doc
> registra a família inteira: todo `.in(` em `workers/`, `app/api/v1/cron/` e
> `lib/leads/`, com o teto de cada um.
>
> **Medido em produção (20/11/2026, 6 h):** só o `risk-watcher` falha
> (**16 × URI too long**); `crm-worker` e `crm-scheduler` têm **0 erros**. Ou
> seja, os sítios abaixo **não estão disparando hoje** — são dívida declarada,
> não incêndio. Nada fora dos três módulos corrigidos foi tocado.

## Por que a URL estoura

O filtro `.in()` do PostgREST viaja na **query string**. Um UUID tem 36
caracteres e vira `%2C`-separado; acima de ~8 kB o gateway responde **414 antes
de a consulta chegar ao Postgres**. Medido: 500 UUIDs ≈ 18 kB. Por isso “tem
`.limit(500)`” **não** é proteção de URL — é o mesmo tamanho que quebra.

Para `risk-seed` e `radar-de-risco` a regra mora num helper só —
`lib/db/por-fatias.ts` (`FATIA_DE_IDS = 100`) —, com teste próprio em
`lib/db/por-fatias.test.ts` (lista vazia, lista < 100, 350 ids em 4 fatias,
falha parcial contada e primeiro erro preservado). O `laya-decisao` **já tinha
sido fatiado pela #697** (blocos de 100 em paralelo, `LOTE_DE_IDS`), antes de
este PR existir; aqui ele foi **preservado** e só a mensagem foi corrigida.

## Corrigido (3 módulos, 8 sítios — 2 pela #697, o resto aqui)

| Arquivo:linha | Array | Antes | Depois |
|---|---|---|---|
| `lib/leads/laya-decisao.ts:376` | `frios.map(f => f.leadId)` — acervo inteiro | 1 consulta com N ids | fatiado pela **#697** (blocos de 100, em paralelo); este PR **mantém** e corrige a mensagem para `leitura de decisões falhou: …` |
| `lib/leads/risk-seed.ts:116` | `stageIds` de **todos** os leads abertos | 1 consulta, sem `.limit` | `porFatias`; união em `Map` |
| `lib/leads/risk-seed.ts:140` | `contactIds` idem | 1 consulta | `porFatias`; união em `Set` |
| `lib/leads/radar-de-risco.ts:133` | `agentIds` do scan | `SCAN_CAP = 500` | `porFatias`; mapa idêntico |
| `lib/leads/radar-de-risco.ts:159` | `stageIds` do scan | 500 | `porFatias` |
| `lib/leads/radar-de-risco.ts:197` | `contact_id` (follow-ups) | 500 | `porFatias` |
| `lib/leads/radar-de-risco.ts:208` | `contact_id` (conversas) | 500 | `porFatias` |
| `lib/leads/radar-de-risco.ts:218` | `id` (contatos) | 500 | `porFatias` |

Provas: `tests/unit/risk-em-blocos.test.ts` roda **5 e 350 ids** nos dois
módulos, compara o resultado com o da lista curta e exige 4 consultas por
tabela com fatias `[100,100,100,50]`. `laya-decisao` tem 4 testes próprios
(500 ids → 5 blocos, lista pequena → 1 consulta, dedup, mensagem de leitura).

A mensagem do `laya-decisao` mudou: `decisões gravadas: …` → `leitura de
decisões falhou: …`. Era `select`; o texto antigo mandava procurar uma gravação
que nunca existiu.

## Sem teto de URL — 10 de 10 corrigidos (23/11/2026)

Os nove sítios de **cron** passaram por `lib/db/por-fatias.ts` (`FATIA_DE_IDS =
100`), prioridade do dono. O décimo (`lib/leads/timeline-query.ts:107`), não-cron,
foi o último e também passou pela mesma helper — não existe mais `.in()` sem
teto nesta varredura.

| Arquivo:linha (antes) | Array | Antes | Depois |
|---|---|---|---|
| `app/api/v1/cron/meu-dia-alertas/route.ts:221` | ids de pedidos → notas | `SCAN_LIMIT = 300` | `porFatias` (4 blocos para 350 ids) |
| `app/api/v1/cron/meu-dia-alertas/route.ts:326` | ids de remessas → itens | 300 | `porFatias` |
| `app/api/v1/cron/meu-dia-alertas/route.ts:492` | `idsContato` → nomes | 300 | `porFatias` |
| `app/api/v1/cron/meu-dia-alertas/route.ts:507` | `idsPedido` → nomes | 300 | `porFatias` |
| `app/api/v1/cron/meu-dia-alertas/route.ts:571` | `lerPedidos` | `slice(0, 600)` | `porFatias` sem slice |
| `app/api/v1/cron/meu-dia-alertas/route.ts:612` | cidades dos contatos | `slice(0, 600)` | `porFatias` sem slice |
| `app/api/v1/cron/recover-stuck-messages/route.ts:165` | UPDATE de mensagens por org | `SCAN_LIMIT = 500` | `porFatias`; **claim `status='sending'` preservado em cada fatia** |
| `app/api/v1/cron/recover-stuck-messages/route.ts:319` | fechar avisos duplicados | sem teto | `porFatias` |
| `app/api/v1/cron/sync-model-catalog/route.ts:100` | deprecia modelos | nenhum | `porFatias` |

A união é a mesma: cada fatia devolve linhas e o helper concatena na ordem; um
erro em qualquer fatia mantém a mensagem original do PostgREST e reprova a
rodada (nunca "sucesso parcial" silencioso).

**Último (não-cron):** `lib/leads/timeline-query.ts:107` — `agentIds` da página
passaram por `porFatias`; prova em `tests/unit/timeline-query-nomes.test.ts` com
**350 agentes** ⇒ `[100,100,100,50]`, todos os nomes preservados na ordem.

Provas dirigidas: `tests/unit/timeline-query-nomes.test.ts` com **350 agentes**;
`tests/unit/recover-stuck-messages.test.ts` com **350 mensagens**
— quatro UPDATES de `[100,100,100,50]`, todos com `eq:status=sending`. O helper
`lib/db/por-fatias.test.ts` ja provava 350 ids na união ordenada.

## Protegidos por teto (não mexer)

| Arquivo:linha | Por quê |
|---|---|
| `workers/ai-response-worker.ts:554` | array literal de 2 |
| `app/api/v1/cron/agenda-google-sync/route.ts:116` | `orgsDoLote` sai de query com `.limit(TETO_DE_CALENDARIOS = 25)` (`:320`) |
| `app/api/v1/cron/agenda-google-refresh/route.ts:99` | array literal |
| `app/api/v1/cron/meu-dia-alertas/route.ts:313, 346, 419, 437` | arrays literais de status |
| `lib/leads/laya-decisao.ts:168` | `lote` ≤ `LAYA_DECISAO_POR_TICK` (32) |
| `lib/leads/laya-decisao.ts:176` | `contatos` derivados do mesmo `lote` ≤ 32 |
| `lib/leads/radar-de-risco.ts:357` | `itens` = `radar.slice(0, limit)`, padrão 50 |

## Ordem proposta (não executada)

1. `recover-stuck-messages.ts:165` — 500 UUIDs em uma URL, mesmo risco do que
   quebrou agora.
2. `meu-dia-alertas.ts` — 6 consultas com 300 ids; fatiar ou reduzir
   `SCAN_LIMIT`, decidindo o que a tela pode perder.
3. `timeline-query.ts:107` e `sync-model-catalog.ts:100` — baixo risco, só
   depois de os dois acima fecharem.
