# `.in(...)` sem teto de URL — varredura de 20/11/2026

> **Origem:** o risk-watcher falhava a cada 15 min na organização real com
> `decisões gravadas: URI too long` (414). A causa era um `.in("lead_id", …)`
> com a lista de frios inteira (`lib/leads/laya-decisao.ts:347`). Este doc
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

A regra mora num helper só — `lib/db/por-fatias.ts` (`FATIA_DE_IDS = 100`) —,
com teste próprio em `lib/db/por-fatias.test.ts` (lista vazia, lista < 100,
350 ids em 4 fatias, falha parcial contada e primeiro erro preservado).

## Corrigido (3 módulos, 8 sítios)

| Arquivo:linha | Array | Antes | Depois |
|---|---|---|---|
| `lib/leads/laya-decisao.ts:347` | `frios.map(f => f.leadId)` — acervo inteiro | 1 consulta com N ids | `porFatias`; dedup antes; falha de bloco **lança** (não decide de novo o que já decidiu) |
| `lib/leads/risk-seed.ts:122` | `stageIds` de **todos** os leads abertos | 1 consulta, sem `.limit` | `porFatias`; união em `Map` |
| `lib/leads/risk-seed.ts:141` | `contactIds` idem | 1 consulta | `porFatias`; união em `Set` |
| `lib/leads/radar-de-risco.ts:141` | `agentIds` do scan | `SCAN_CAP = 500` | `porFatias`; mapa idêntico |
| `lib/leads/radar-de-risco.ts:157` | `stageIds` do scan | 500 | `porFatias` |
| `lib/leads/radar-de-risco.ts:184` | `contact_id` (follow-ups) | 500 | `porFatias` |
| `lib/leads/radar-de-risco.ts:189` | `contact_id` (conversas) | 500 | `porFatias` |
| `lib/leads/radar-de-risco.ts:194` | `id` (contatos) | 500 | `porFatias` |

Provas: `tests/unit/risk-em-blocos.test.ts` roda **5 e 350 ids** nos dois
módulos, compara o resultado com o da lista curta e exige 4 consultas por
tabela com fatias `[100,100,100,50]`. `laya-decisao` tem 4 testes próprios
(500 ids → 5 blocos, lista pequena → 1 consulta, dedup, mensagem de leitura).

A mensagem do `laya-decisao` mudou: `decisões gravadas: …` → `leitura de
decisões falhou: …`. Era `select`; o texto antigo mandava procurar uma gravação
que nunca existiu.

## Sem teto de URL — NÃO corrigido (dívida declarada)

| Arquivo:linha | Array | Teto atual | Risco |
|---|---|---|---|
| `app/api/v1/cron/meu-dia-alertas/route.ts:221` | ids de pedidos | `SCAN_LIMIT = 300` | médio — 300 UUIDs ≈ 11 kB |
| `app/api/v1/cron/meu-dia-alertas/route.ts:326` | ids de remessas | 300 | médio |
| `app/api/v1/cron/meu-dia-alertas/route.ts:492` | `idsContato` | 300 | médio |
| `app/api/v1/cron/meu-dia-alertas/route.ts:507` | `idsPedido` | 300 | médio |
| `app/api/v1/cron/meu-dia-alertas/route.ts:571` | `.slice(0, SCAN_LIMIT * 2)` | 600 (origem ≤300) | médio — o slice não protege |
| `app/api/v1/cron/meu-dia-alertas/route.ts:612` | idem | 600 (origem ≤300) | médio |
| `app/api/v1/cron/recover-stuck-messages/route.ts:165` | ids de mensagens por org | `SCAN_LIMIT = 500` | alto — 500 UUIDs ≈ 18 kB |
| `lib/leads/timeline-query.ts:107` | `agentIds` da página | limite do chamador, sem teto próprio | baixo/médio |
| `app/api/v1/cron/recover-stuck-messages/route.ts:319` | avisos duplicados de uma assinatura | sem teto declarado | baixo — lista naturalmente curta |
| `app/api/v1/cron/sync-model-catalog/route.ts:100` | `paraDepreciar` (diff do catálogo) | nenhum | baixo — `model_id` curto, catálogo de centenas |

Contagem, para não haver ambiguidade: a varredura achou **17 sítios** além do
original; **7 foram corrigidos** (em 3 módulos) e **10 seguem listados** acima.
Quatro módulos concentram o resto: `meu-dia-alertas` (6), `recover-stuck`
(2), `timeline-query` (1), `sync-model-catalog` (1).

## Protegidos por teto (não mexer)

| Arquivo:linha | Por quê |
|---|---|
| `workers/ai-response-worker.ts:554` | array literal de 2 |
| `app/api/v1/cron/agenda-google-sync/route.ts:116` | `orgsDoLote` sai de query com `.limit(TETO_DE_CALENDARIOS = 25)` (`:320`) |
| `app/api/v1/cron/agenda-google-refresh/route.ts:99` | array literal |
| `app/api/v1/cron/meu-dia-alertas/route.ts:313, 346, 419, 437` | arrays literais de status |
| `lib/leads/laya-decisao.ts:168` | `lote` ≤ `LAYA_DECISAO_POR_TICK` (32) |
| `lib/leads/laya-decisao.ts:176` | `contatos` derivados do mesmo `lote` ≤ 32 |
| `lib/leads/radar-de-risco.ts:316` | `itens` = `radar.slice(0, limit)`, padrão 50 |

## Ordem proposta (não executada)

1. `recover-stuck-messages.ts:165` — 500 UUIDs em uma URL, mesmo risco do que
   quebrou agora.
2. `meu-dia-alertas.ts` — 6 consultas com 300 ids; fatiar ou reduzir
   `SCAN_LIMIT`, decidindo o que a tela pode perder.
3. `timeline-query.ts:107` e `sync-model-catalog.ts:100` — baixo risco, só
   depois de os dois acima fecharem.
