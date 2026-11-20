# `.in(...)` sem teto de URL — varredura de 20/11/2026

> **Origem:** o risk-watcher falhava a cada 15 min na organização real com
> `decisões gravadas: URI too long` (414). A causa era um `.in("lead_id", …)`
> com a lista de frios inteira (`lib/leads/laya-decisao.ts:347`). Este doc
> registra a família inteira: todo `.in(` em `workers/`, `app/api/v1/cron/` e
> `lib/leads/`, com o teto de cada um.
> **Nada aqui além do item corrigido foi tocado.** Os demais são proposta.

## Por que a URL estoura

O filtro `.in()` do PostgREST viaja na **query string**. Um UUID tem 36
caracteres e vira `%2C`-separado; acima de ~8 kB o gateway responde **414 antes
de a consulta chegar ao Postgres**. Medido: 500 UUIDs ≈ 18 kB. Por isso “tem
`.limit(500)`” **não** é proteção de URL — é o mesmo tamanho que quebra.

## Corrigido neste PR

| Arquivo:linha | Array | Antes | Depois |
|---|---|---|---|
| `lib/leads/laya-decisao.ts:347` | `frios.map(f => f.leadId)` — acervo inteiro | 1 consulta com N ids | blocos de **100** ids (5 consultas para 500), união dos resultados |

A mensagem de erro também mudou: `decisões gravadas: …` → `leitura de decisões
falhou: …`. Era `select`; o texto antigo mandava procurar uma gravação que nunca
existiu.

## Sem teto de URL (proposta — NÃO corrigido)

| Arquivo:linha | Array | Teto atual | Risco |
|---|---|---|---|
| `lib/leads/risk-seed.ts:122` | `stageIds` de **todos** os leads abertos (query sem `.limit`) | nenhum | **alto** — mesma família, mesmo worker de risco |
| `lib/leads/risk-seed.ts:141` | `contactIds` idem | nenhum | **alto** |
| `lib/leads/radar-de-risco.ts:141` | `agentIds` do scan | `SCAN_CAP = 500` | **alto** — 500 UUIDs ≈ 18 kB |
| `lib/leads/radar-de-risco.ts:157` | `stageIds` do scan | 500 | alto |
| `lib/leads/radar-de-risco.ts:184` | `contact_id` (follow-ups) | 500 | alto |
| `lib/leads/radar-de-risco.ts:189` | `contact_id` (conversas) | 500 | alto |
| `lib/leads/radar-de-risco.ts:194` | `id` (contatos) | 500 | alto |
| `app/api/v1/cron/meu-dia-alertas/route.ts:221` | ids de pedidos | `SCAN_LIMIT = 300` | médio — 300 UUIDs ≈ 11 kB |
| `app/api/v1/cron/meu-dia-alertas/route.ts:326` | ids de remessas | 300 | médio |
| `app/api/v1/cron/meu-dia-alertas/route.ts:492` | `idsContato` | 300 | médio |
| `app/api/v1/cron/meu-dia-alertas/route.ts:507` | `idsPedido` | 300 | médio |
| `app/api/v1/cron/meu-dia-alertas/route.ts:571` | `.slice(0, SCAN_LIMIT * 2)` | 600 (origem ≤300) | médio — o slice não protege |
| `app/api/v1/cron/meu-dia-alertas/route.ts:612` | idem | 600 (origem ≤300) | médio |
| `app/api/v1/cron/recover-stuck-messages/route.ts:165` | ids de mensagens por org | `SCAN_LIMIT = 500` | alto |
| `lib/leads/timeline-query.ts:107` | `agentIds` da página | limite do chamador, sem teto próprio | baixo/médio |
| `app/api/v1/cron/recover-stuck-messages/route.ts:319` | avisos duplicados de uma assinatura | sem teto declarado | baixo — lista naturalmente curta |
| `app/api/v1/cron/sync-model-catalog/route.ts:100` | `paraDepreciar` (diff do catálogo) | nenhum | baixo — `model_id` curto, catálogo de centenas |

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

1. `risk-seed.ts:122/141` e `radar-de-risco.ts:141–194` — mesmo worker de risco,
   mesma falha silenciosa; corrigir junto com um helper de blocos reutilizável.
2. `recover-stuck-messages.ts:165` — 500 mensagens em uma URL.
3. `meu-dia-alertas.ts` — 300 ids por consulta; fatiar ou reduzir `SCAN_LIMIT`.

O helper de blocos deve morar em `lib/db/` (ou similar) e ser usado pelos três,
para não nascer uma quarta cópia da mesma regra.
