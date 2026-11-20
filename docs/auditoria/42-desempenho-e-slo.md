# 42 — Desempenho e SLO (baseline medido)

**Data:** 19/11/2026 · **Produto:** 1.58.0 (1.59.0 em corte) · **Ambiente da
medição:** máquina de desenvolvimento, Supabase **local** (`127.0.0.1:54321`),
`next start` local. **Isto não é produção.** Os números valem como régua e
ordem de grandeza, não como promessa de latência da VPS do cliente.

Método completo e comandos no fim. Tudo que está aqui foi medido; opinião está
marcada como opinião.

> **Atualização 19/11/2026 (doc 43):** o Sentry saiu do first load. O
> before/after mostra que o custo **atribuível ao SDK** é **~89 KB gz**, não os
> 164 KB estimados aqui: o chunk de 151 KB também continha o bootstrap do Next.
> A ordem dos ofensores não muda; o número era um teto. Ver
> [`43-bundle-sentry-fora-do-first-load.md`](43-bundle-sentry-fora-do-first-load.md).


---

## 1. Bundle — JS por rota

Build de produção **uma vez** (`pnpm e2e:build` → `next build`, Turbopack,
Next 16.4.6) contra o Supabase local. Fonte dos números:
`.next/diagnostics/route-bundle-stats.json`; cada chunk foi lido do disco e
comprimido com gzip nível 9. “First load” = todos os chunks de
`firstLoadChunkPaths` (shared + rota), a mesma soma que o build declara em
`firstLoadUncompressedJsBytes`.

| Rota | Raw | **Gzip** | Chunks |
|---|---:|---:|---:|
| `/app/inbox` | 1.960 KB | **592 KB** | 37 |
| `/app/notas` | 1.836 KB | **547 KB** | 33 |
| `/app/pedidos` | 1.735 KB | **524 KB** | 33 |
| `/app/fiscal` | 1.695 KB | **512 KB** | 33 |
| `/app/financeiro` | 1.649 KB | **499 KB** | 34 |
| `/app/sentinel` | 1.636 KB | **495 KB** | 32 |
| `/login` (pública) | 1.020 KB | **318 KB** | 19 |
| `/app` (home, contexto) | 2.142 KB | **645 KB** | 37 |

**Base compartilhada:** interseção dos chunks das 6 rotas principais =
**1.558 KB raw / 472 KB gzip / 30 chunks**. Ou seja: 80–95% do first load de
cada rota é a mesma casca; a rota em si acrescenta pouco.

### Maiores ofensores (gzip)

| Chunk | Gzip | Onde | Origem medida |
|---|---:|---|---|
| `1kph95czp3qmp.js` | **151 KB** | 6/6 rotas | **Sentry** (47 ocorrências de `Replay`, 151 de `sentry`) |
| `0rso4erz780i5.js` | **61 KB** | 6/6 rotas | **Supabase client** (100 ocorrências de `supabase`) |
| `41k6rc4egbjgu.js` | 35 KB | 6/6 rotas | componentes da casca (sem marca de lib) |
| `2bct4pz710ove.js` | **33 KB** | só `/app/inbox` | **date-fns** |
| `311w6il3iuk2p.js` | **31 KB** | 4/6 (pedidos, inbox, fiscal, notas) | **zod** |
| `2uvjaemhm4zbg.js` | 31 KB | só `/app/notas` | componentes da tela de notas |
| `2600_7_dgh2-9.js` | 13 KB | 6/6 rotas | Sentry (complemento) |

**Sentry = ~164 KB gzip em toda rota** (151 + 13), **35% da base compartilhada**
e **28% do first load do inbox**. O `replayIntegration()` é carregado
eagermente em `instrumentation-client.ts`; o próprio `next.config.ts` já
registrava a dívida (“bundle raiz medido em 206 KB gz só de Sentry”). O
comentário fala de 206 KB; a medição de hoje dá ~164 KB gz — a diferença é
método/versão, e ambos apontam o mesmo ofensor.

**Budget já declarado no código:** `next.config.ts` exige **`/app/inbox` <
250 KB gzip**. Medido: **592 KB gzip** → **2,37× o budget**. O budget existe
desde a EPIC-12 e não tem gate de CI que o cobre.

**O que NÃO está no caminho das 6 rotas:** `maplibre-gl` e `leaflet` são
importados dinamicamente (expedição/prospecção), e `recharts` só entra em
home/indicadores/evo de IA. Isso é positivo e explica por que o first load não
é ainda maior.

---

## 2. Latência de API (local)

Método: `next start -p 3001` com `.env.e2e`, login real como `manager` do seed
E2E via Playwright, **5 warmups + 40 requisições sequenciais por rota**,
p50/p95 por posto mais próximo. Rotas autenticadas com o mesmo cookie de
sessão. Rodada limpa (sem 401) de 19/11/2026 ~14:32 UTC.

| Rota | p50 | p95 | max | Status | Corpo médio |
|---|---:|---:|---:|---|---:|
| `GET /api/v1/commercial-orders` | **146 ms** | **207 ms** | 277 ms | 40× 200 | 96 KB |
| `GET /api/v1/conversations` | **174 ms** | **521 ms** | 1.355 ms | 40× 200 | 35 KB |
| `GET /api/v1/contacts` | **163 ms** | **821 ms** | 1.283 ms | 40× 200 | 46 KB |
| `GET /api/v1/invoices` | **109 ms** | **141 ms** | 187 ms | 40× 200 | 1,9 KB |
| `GET /api/v1/financeiro/dashboard` | **119 ms** | **131 ms** | 169 ms | 40× 200 | 254 B |
| `GET /api/v1/health` | **6,3 ms** | **8,9 ms** | 9,8 ms | 40× **503** | 466 B |

**Leia junto com o tamanho da tabela local:** 97 pedidos, 27 conversas, 118
contatos e **4 notas**. As rotas de notas/financeiro não estão sob carga de
dados; a latência delas mede o custo fixo (auth + rota + consulta), não a
consulta pesada de uma VPS com anos de histórico. As listas grandes
(pedidos/inbox/contatos) devolvem 200 registros por página e são as únicas com
corpo relevante.

**Por que `/api/v1/health` é 503:** Redis e WAHA não estão de pé na máquina
local. O corpo é honesto (`redis: conexao_recusada`, `waha:
conexao_recusada`, `rate_limit: fallback_em_memoria`), a latência é 6 ms e o
503 é de diagnóstico — não é falha de aplicação. O healthcheck do
`docker-compose.prod.yml` é TCP de propósito e **não** reinicia o contêiner por
causa deste 503.

**Cuidado de método:** a máquina é compartilhada com outros agentes/builds.
Rodadas seguintes, sob carga, deram p50 3–10× maior e 401 no fim da sessão
(throttling do GoTrue local, não 5xx). A rodada acima é a limpa; a variação é
declarada, não escondida. **Não usar esses números como SLA.**

---

## 3. SLI/SLO propostos (3, sem SLA de cliente)

Nenhum destes é contrato com cliente. São réguas internas para o dono da VPS
saber se o produto está saudável. Onde a instrumentação ainda não existe, está
dito.

### SLO-1 — Disponibilidade das rotas quentes

- **SLI:** `1 - (respostas 5xx / total)` nas rotas
  `/api/v1/commercial-orders`, `/conversations`, `/contacts`, `/invoices`,
  `/financeiro/dashboard`. `health` fica fora (503 é diagnóstico de
  dependência).
- **Janela:** 7 dias corridos, com leitura de burn rate em 5 min.
- **Alvo:** **≥ 99,5%** (≈ 3h36 de 5xx por mês no conjunto).
- **Estouro:** alerta no Sentry/operador quando 5xx > 1% em 5 min; o painel do
  Sentinel **não** cobre HTTP 5xx hoje (ver item aberto P2).
- **Fonte:** a linha `api.5xx` que `fail()` passou a emitir nesta fatia. Antes
  dela, 5xx devolvido por `fail()` não aparecia em lugar nenhum: o
  `onRequestError` do Sentry só vê exceção, não resposta de erro.

### SLO-2 — Latência das listas

- **SLI:** `p95(duration_ms | 2xx)` por rota, em janelas de 5 min.
- **Alvo:** **p95 ≤ 800 ms** nas cinco rotas da SLO-1 em **≥ 95%** das janelas
  de 5 min, ao longo de 7 dias. Guarda adicional: nenhuma rota pode passar de
  **3× o próprio p50 de 7 dias** em mais de 5% das janelas.
- **Por quê 800 ms:** o pior p50 local medido foi 174 ms; 800 ms é ~4,6× e
  acomoda VPS + rede + volume real. É **proposta inicial**: os primeiros 7 dias
  de produção devem recalibrar o número; 1.58.0 não tem essa série.
- **Estouro:** painel/planilha do operador; traces do Sentry estão em
  `tracesSampleRate: 0` (decisão de custo), então não há span pronto. Sem
  alerta automático hoje.

### SLO-3 — Frescor da varredura do Sentinel

- **SLI:** para cada organização **ativa e não suspensa**, o check
  `now - sentinel_settings.ultima_execucao_em ≤ 2 × intervalo_minutos` é
  verdadeiro. `SLI = checks em conformidade / checks devidos` na janela.
- **Janela:** 24 h, avaliada a cada 15 min (a mesma cadência do cron).
- **Alvo:** **≥ 99%**.
- **Estouro:** painel do Sentinel mostra a org atrasada; hoje **não há alerta
  automático** e `/api/v1/health` não olha para o Sentinel — item aberto P3.
  Isso é o laço que fecha o próprio observador: Sentinel parado não pode ser
  silêncio.

---

## 3.1 O SLO virou tela — e os dois primeiros agora têm série

`/admin/observabilidade` (plataforma, `platform_admin`, leitura apenas) mostra
os três cartões — disponibilidade, latência e frescor do Sentinel — com fórmula,
janela, alvo, valor atual e estado (`ok` / `em risco` / `estourado` / `sem
histórico`).

**Fonte dos números, sem invenção:**

- **Disponibilidade e latência:** vêm de `api_request_samples` (migration 0330),
  uma linha por requisição das cinco rotas quentes. Guarda rota, status,
  duração, código de 5xx, request id e a org do cookie `active_org` quando
  existe — **sem body, sem PII, sem mensagem**. A escrita acontece no `after()`
  da resposta, fora do caminho crítico do 200. Amostragem **100%** hoje
  (`AMOSTRAGEM = 1` em `lib/observabilidade/rotas.ts`).
- O agregado `fn_slo_api_resumo(7, rotas)` devolve total, 5xx e p95 numa ida ao
  banco. **Menos de 100 amostras na janela continua “sem histórico”** — não é
  zero, é ausência de prova.
- **Frescor do Sentinel:** calculado de `organizations` (ativas, não suspensas)
  + `sentinel_settings.ultima_execucao_em` e `intervalo_minutos`.
- **Retenção:** `fn_api_metricas_expurgar(7, lote)` apaga em lotes o que passou
  de 7 dias; o cron diário `data-retention` chama até o lote voltar incompleto.
  Piso de 7 no corpo da função e idempotência cobertos por `test:db`.

**O laço fecha no Sentinel:** a regra `plataforma.slo_estourado` lê a mesma
série (por rota, 0331) e abre uma ocorrência por SLO — `disponibilidade` ou
`latencia` — quando o alvo é perdido com ≥100 amostras na janela. Sem amostra
suficiente não abre e não reafirma: a rodada registra isso no detalhe, não como
ocorrência. Reexecutar atualiza a mesma ocorrência pelo fingerprint estável.

O que ainda depende de série é o **valor de produção**: a tela mede a janela
real de 7 dias a partir do primeiro deploy da 0330; até lá, os cartões dizem
“sem histórico”. O doc 42 §2 (medição local) continua sendo régua de latência,
não série de produção.

### 3.2 Diagnóstico da série (19/11/2026)

A tela mostra, acima dos SLOs, **quantas amostras existem na janela, a mais
antiga, a mais recente e quantas rotas**. Com zero, o texto é explícito: *“a
série está ligada, mas nenhuma requisição autenticada passou pelas rotas
quentes desde o deploy”*. Antes, zero virava o mesmo “sem histórico” de uma
série com 99 amostras — o dono não distinguia **ligado e ocioso** de **ligado e
mudo**.

O instrumento também ganhou um segundo caminho: se `after()` lançar (hipótese
aberta no standalone), a amostra é persistida direto com
`void persistir(...).catch(...)`; se o insert também falhar, sai **uma** linha
por outage — não por requisição — `observabilidade.metrica_falhou` com `definitivo: true`; a trava reabre no primeiro insert bem-sucedido. O primeiro caminho
(`after` ok) continua sem somar latência ao 200.

**Sonda (proposta, não implementada):** um `POST
/api/internal/observabilidade/sonda` com `INTERNAL_CRON_SECRET` chamaria a
mesma `persistir` com `route='__sonda__'` e devolveria o id. A sonda na mesma
tabela **polui** contagem/idade do diagnóstico e a retenção; como as consultas
de SLO já filtram as cinco rotas quentes, ela não mexe em disponibilidade/p95,
mas ainda aparece na série. Alternativa preferida: tabela
`api_request_probes` separada (migration 0332), com a mesma retenção; a sonda
não toca `api_request_samples`. Se for para manter uma tabela só, a sonda
precisa gravar, ler e **apagar** no mesmo request, e o diagnóstico precisa
excluir `route='__sonda__'` — o resíduo de um delete falho não pode virar
histórico.

## 4. Erros e recuperação (o que o produto faz hoje)

### 5xx

- **Medição:** 0/200 respostas 5xx nas cinco rotas (40 cada), na rodada limpa.
  O único 503 foi `health`, por dependência local ausente — fora do SLI.
- **Cliente (`lib/api/client.ts`):** timeout de 10 s; **retry somente em
  429/503**, até 3 tentativas, backoff 200 ms × 2^(n−1). **500/502 não são
  retentados** — repetir um 500 cego pode duplicar efeito.
- **Mutações offline (`lib/offline/outbox.ts`):** fila local com o **mesmo
  UUID**; o servidor devolve o pedido existente no retry (0263), então repetir
  não duplica. Backoff de 30 s a 5 min.
- **Servidor (`lib/event-log/drain.ts`):** até **5 tentativas**, backoff
  exponencial em minutos; depois `status = dead` (dead-letter). Worker que
  morre em `processing` é recuperado após 10 min.
- **Sentinel observa o que sobra:** `operacao.job_fila_travado`,
  `operacao.webhook_falhas` (error/dead nas últimas 24 h),
  `fiscal.job_fiscal_travado`, `fiscal.job_retry_excessivo` e
  `operacao.correcao_sem_reversao`. Ele **não** observa 5xx HTTP; essa é a
  lacuna fechada só no log `api.5xx` e no item P2.
- **Webhook em dead-letter:** é arquivo forense, não fila. Não há replay
  automático; reenviar HTTP é ação externa e não tem reversão honesta (decisão
  registrada no #582).
- **Fiscal:** job com retry e dead-letter; reprocessamento é decisão humana, e
  a correção aprovada só existe para job watchdog com CAS.
- **Health:** 503 quando Supabase/Redis/WAHA caem, com `reason` separando
  configuração de disponibilidade. O probe do contêiner é TCP; health 503 não
  gera restart loop.

---

## 5. Correção de baixo risco nesta fatia

**Feito:** `fail()` com status ≥ 500 agora emite uma linha estruturada
`api.5xx` (`code`, `status`, `requestId`), **sem** `message`/`details` (podem
carregar dado de negócio). Prova em `lib/api/wrappers.test.ts`: 500 loga uma
vez; 422 não loga; a mensagem não vai para o log. Isso não muda bundle nem
latência; é a fonte mínima da SLO-1.

**Não feito (de propósito):** não removi nem lazy-load do Sentry/Replay nesta
fatia. É o maior ofensor (164 KB gz em toda rota), mas desligar Replay é
decisão de observabilidade (perde-se o replay do momento do erro) e lazy-load
muda a janela de captura. Vai como item com dono e aceite, não como surpresa
dentro de uma auditoria.

### Itens abertos

| ID | Item | Dono | Aceite |
|---|---|---|---|
| **P1** (#602) | Sentry/Replay em toda rota: 164 KB gz (35% da base); inbox 2,37× o budget de 250 KB | Plataforma/Observabilidade | `/app/inbox` ≤ **400 KB gz** na primeira etapa (Sentry fora do first load ou Replay lazy/opt-in), com `route-bundle-stats` antes/depois; budget de 250 KB com gate de CI só quando a base permitir |
| **P2** (#603) | 5xx HTTP não entra no Sentry nem no Sentinel; só o log `api.5xx` desta fatia | Plataforma | contador/dashboard de `api.5xx` por rota + alerta de burn rate da SLO-1; decidir se vira regra do Sentinel (`operacao.api_5xx`) |
| **P3** (#604) | Sentinel parado é silêncio: health não checa `ultima_execucao_em` | Sentinel | check `sentinel` em `/api/v1/health` (degraded quando org ativa passa de 2× o intervalo) ou alerta equivalente; SLO-3 mensurável |

Nenhum item acima tem prazo de release inventado; o aceite é o critério de
pronto.

---

## 6. Como reproduzir

```bash
# 1 build de produção, contra o Supabase local
pnpm e2e:build
# → .next/diagnostics/route-bundle-stats.json

# servidor local com o MESMO env do build
set -a; . ./.env.e2e; set +a
pnpm exec next start -p 3001

# latência: 5 warmups + N por rota, login real como manager
pnpm exec tsx scripts/medir-api-local.ts --n 40 --base http://localhost:3001 \
  --out /tmp/perf-api.json
```

O script `scripts/medir-api-local.ts` lê `.e2e-creds.json`
(`scripts/seed-e2e-credentials.ts`), mede p50/p95/max e a distribuição de
status, e grava JSON. Ele **recusa** a medição se a sessão não chegar à API
(401/403), para não produzir número de ficção.

**Limitações declaradas:** medição local, tabelas pequenas (4 notas), máquina
compartilhada, sem concorrência, sem LCP/INP/CLS, sem payload RSC, sem
profundidade de banco. Para transformar qualquer SLO em compromisso, repetir na
VPS com 7 dias de série.
