# Migrations, schema e RLS — medido em Postgres descartável

> Fase 1 · itens 1.5 (dados) e F-09 (P0). Gerado a partir de execução, não de leitura de arquivo.
> Instrumentos: `scripts/auditoria/replay-migrations.sh`, `scripts/test-update-com-dados.sh`,
> `pnpm test:db`. Evidência bruta em [`evidencias/replay-migrations/`](evidencias/replay-migrations/).

Este documento responde a seis perguntas que a contagem de objetos não responde:

1. [Reprodução com versões, comando e saída completa](#1-reprodução)
2. [Cada migration que falha: causa, e se é quebrada ou pré-requisito ausente](#2-causa-de-cada-falha)
3. [O schema do caminho de migrations × o do `baseline.sql`](#3-diff-dos-dois-caminhos)
4. [Instalação **e** atualização de base existente](#4-instalação-e-atualização)
5. [As políticas junto do RLS e os testes de isolamento](#5-rls-e-isolamento-entre-tenants)
6. [`db:migrate` e `db:reset` deixaram de aplicar a cadeia](#6-dbmigrate)

---

## 1. Reprodução

### Ambiente

Tudo abaixo está em [`evidencias/replay-migrations/ambiente.txt`](evidencias/replay-migrations/ambiente.txt),
gerado pela própria execução.

| Item | Valor medido |
|---|---|
| Commit | `9f8e6faa` (branch `docs/auditoria-aaa`) |
| Docker | `Docker version 29.8.2, build 7fc2dff` |
| Imagem | `pgvector/pgvector:pg15` — `sha256:47af0b65960b14f1…`, `linux/arm64` |
| Cliente psql | `psql (PostgreSQL) 15.19 (Debian 15.19-1.pgdg12+2)` |
| Servidor | `PostgreSQL 15.19 (Debian 15.19-1.pgdg12+2) on aarch64-unknown-linux-gnu` |
| `server_version_num` | `150019` |
| `supabase/baseline.sql` | 29.325 linhas · `sha256:9a0afaec56ffef8f…` |
| Migrations | 292 arquivos |
| Preâmbulo compartilhado | `scripts/sql/preambulo-supabase-descartavel.sql` · `sha256:0cc7ce48a6aa5899…` |

**Por que pg15 e não pg17:** pg15 é o piso real do produto (`security_invoker` em view,
`baseline.sql:1215`), e é o que `scripts/test-db.sh` usa. Medir no piso cobre a instalação
mais pobre que dizemos suportar.

### Comando exato

```bash
bash scripts/auditoria/replay-migrations.sh
```

Duas bases descartáveis, o **mesmo** preâmbulo nas duas:

```bash
# preâmbulo (idêntico nos dois containers)
docker exec -i $C psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f - \
  < scripts/sql/preambulo-supabase-descartavel.sql

# CAMINHO A — cada migration, na própria transação
docker exec -i $C psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction -q -f - < <arquivo>

# CAMINHO B — o baseline, como o install.sh aplica
docker exec -i $C psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f - < supabase/baseline.sql

# inventário dos dois, mesma query
docker exec -i $C psql -U postgres -d postgres -t -A -F $'\t' -f - < scripts/auditoria/inventario-schema.sql
```

`--single-transaction` reproduz o `supabase db push`: migration que falha **não** deixa metade
dos objetos para trás e não contamina o diagnóstico da seguinte.

### O que a execução grava

| Arquivo | O quê |
|---|---|
| `console.log` | a saída completa da execução |
| `ambiente.txt` | versões, digest da imagem, sha256 dos insumos, comandos |
| `migrations-resumo.tsv` | uma linha por migration: ok/falhou, ms, classe, objeto, se o objeto existe no baseline, erro literal |
| `migrations-falhas/*.log` | saída **psql completa** de cada uma das 257 que falharam |
| `inventario-migrations.tsv` / `inventario-baseline.tsv` | objeto por linha (`tipo<TAB>objeto`) |
| `diff-inventario.txt` | o diff dos dois |
| `politicas-baseline.tsv` | política, comando, papéis, `USING`, `WITH CHECK` |
| `rls-baseline.tsv` / `rls-migrations.tsv` | diagnóstico de RLS dos dois lados |
| `resumo.txt` | os números, para citar sem redigitar |

### Correções de instrumento feitas antes de confiar no número

O primeiro relatório desta auditoria dizia **258** falhas e acusava as migrations 0014, 0017 e
0025 de "quebradas". Nenhuma das três estava. O defeito era do instrumento:

| Sintoma medido | Causa real | Correção |
|---|---|---|
| 0014 e 0017: `column "file_size_limit" of relation "buckets" does not exist` | o stub de `storage.buckets` do replay era menor que o do gate `test:db` (faltavam `file_size_limit`, `allowed_mime_types`) | preâmbulo virou **um arquivo só**, consumido pelo gate e pelo instrumento (`scripts/sql/preambulo-supabase-descartavel.sql`) + gate `tests/unit/preambulo-descartavel-unico.test.ts` |
| 0025: `publication "supabase_realtime" does not exist` | a publicação é criada pelo bootstrap do Supabase, não por SQL nosso | mesma correção: o preâmbulo a cria (`do $$ … create publication`) |
| 0066: `function uuid_generate_v4() does not exist` | o role `postgres` do Supabase tem `search_path = "$user", public, extensions` (medido com `show search_path`) | `alter role postgres set search_path …` no preâmbulo |
| 0203: objeto classificado como `-` | o Postgres emite `type public.conversations does not exist` **sem aspas** | extrator passa a casar nome sem aspas |

Essa é a razão de o número final ser **257, não 258**, e de 257 de 257 falhas apontarem para um
objeto que **existe no `baseline.sql`**. Instrumento que mede outro universo produz achado falso
com cara de achado — e o custo é a auditoria inteira.

---

## 2. Causa de cada falha

**Resultado: 35 das 292 migrations aplicam; 257 falham. Nenhuma falha é SQL quebrado.**

| Classe | Falhas | O que significa |
|---|---|---|
| `prerequisito:tabela` | 246 | a migration faz `alter table`/`insert`/`create policy` sobre tabela que a cadeia nunca criou |
| `prerequisito:funcao` | 8 | chama função que a cadeia nunca criou (`fn_is_platform_admin`, `fn_user_org_ids`, `fn_upsert_wa_contact`…) |
| `prerequisito:tipo` | 3 | usa tipo/enum que a cadeia nunca criou |
| `syntax error` / `sql inválido` | **0** | — |
| `already exists` / não idempotente | **0** | — |
| `permission denied` | **0** | — |

**257 de 257** falhas citam um objeto que **existe no `baseline.sql`** (verificado objeto a
objeto, coluna `existe_no_baseline` do `migrations-resumo.tsv`). São **71 objetos distintos**
ausentes — não 257 defeitos: os mesmos 71 objetos derrubam migrations em cadeia.

> **71, não 81 — e o número antigo tinha uma causa mecânica.** O erro do Postgres às vezes
> qualifica o nome (`relation "public.conversations"`) e às vezes não (`relation "conversations"`,
> quando o `search_path` resolve). Contar as strings cruas somava o **mesmo** objeto duas vezes:
> 81 nomes crus para 71 objetos, porque 10 vinham sem schema (`conversations`, `organizations`,
> `messages`, `job_queue`, `commercial_orders`, `agent_inbox_items`, `ai_agent_versions`,
> `business_prospects`, `followup_enrollments`, `user_organizations`) e cada um já aparecia
> qualificado em outra falha. O `replay-migrations.sh` agora imprime os **dois** números, com
> rótulo — a diferença fica visível em vez de virar um número único sem procedência.

Os mais citados:

| Objeto ausente | Migrations que morrem nele |
|---|---|
| `public.organizations` | 43 |
| `public.contacts` | 15 |
| `public.commercial_orders` | 13 |
| `public.conversations` | 12 |
| `public.agent_inbox_items` | 9 |
| `public.user_organizations` | 8 |
| `public.prospecting_campaigns` | 8 |
| `public.crm_leads` | 8 |
| `public.channel_sessions` | 8 |

### A raiz: dez migrations que não contêm SQL

Dez arquivos da base são `SELECT 1;` com um comentário que confessa o resto:

```sql
-- Migration 0001 — platform base (applied 2026-04-28 via Supabase MCP)
-- Stub kept here to make supabase/migrations/ reflect remote
-- supabase_migrations.schema_migrations. To replay on a fresh project, use the
-- SQL embedded in the spec or `supabase db pull` from the source project.
SELECT 1;
```

São os dez arquivos `20260428195354_0001_platform_base` … `20260429021857_0009_expand_messaging_constraints`
e `20260429070000_0013_ai_faq_items` — **não** o `00001_initial_schema.sql`, que só cria extensões.
O schema deles foi aplicado direto no projeto Supabase (via MCP) e nunca foi escrito de volta em SQL. **É uma migration quebrada ou um pré-requisito ausente?** As
duas coisas, nesta ordem: a migration que deveria criar a fundação não contém DDL (quebrada por
omissão, não por sintaxe), e por isso toda migration posterior encontra o pré-requisito ausente.
Não existe um segundo defeito escondido atrás do primeiro — é por isso que a classificação não
tem nenhuma linha em `syntax error`.

As outras **25** migrations que aplicam (35 ok − 10 stubs) são autossuficientes: extensões, buckets de Storage, tabelas
`system_*`, e funções que não dependem das fundações.

> **Consequência prática.** `supabase db push` numa instalação antiga marcaria essas 257
> migrations como aplicadas e deixaria o banco com o schema parcial que o caminho A produz.
> O caminho não é "consertar o comando": é **não usar a cadeia como caminho de instalação**
> enquanto as dez fundações não forem escritas em SQL.

---

## 3. Diff dos dois caminhos

Mesma query nos dois bancos (`scripts/auditoria/inventario-schema.sql`), `diff -u` em
[`diff-inventario.txt`](evidencias/replay-migrations/diff-inventario.txt).

| Tipo de objeto | Caminho A (292 migrations) | Caminho B (`baseline.sql`) | Só no baseline |
|---|---|---|---|
| Tabelas (`public`) | **2** | **179** | 177 |
| Tabelas (todas as schemas) | 5 | 183 | 178 |
| Funções (`public`) | 18 | **92** | 74 |
| Funções (todas as schemas) | 19 | 94 | 75 |
| Triggers | **0** | **104** | 104 |
| Políticas de RLS | **0** | **305** (300 em `public`) | 305 |
| RLS ligado (`public`) | 2 | 179 | 177 |
| Views | 0 | 2 | 2 |
| Sequências | 0 | 2 | 2 |
| Tipos | 5 | 185 | 180 |
| Extensões | 6 | 6 | 0 |

- **Objetos só no caminho A: 0.** A cadeia não cria nada que o baseline não tenha. O problema
  não é divergência de schema; é **schema faltando**.
- **Objetos só no baseline: 1.023.** Lista completa em
  [`so-no-baseline.tsv`](evidencias/replay-migrations/so-no-baseline.tsv) — 177 tabelas de
  `public` + `private.app_secrets`, 74 funções de `public` + `private.fn_oauth_key()`, 305
  políticas, 180 tipos, 104 triggers, 177 marcas de RLS, 2 views, 2 sequências. `cut -f1 | sort |
  uniq -c` sobre o arquivo reproduz a coluna.
- As 2 tabelas que o caminho A cria são `system_*` — as mesmas que o baseline também tem.
- 3 das 183 tabelas do lado B são stubs do preâmbulo (`auth.users`, `storage.buckets`,
  `storage.objects`), não schema do produto: o baseline cria **180** tabelas (179 em `public` +
  `private.app_secrets`).

O diff é de existência de objeto. Coluna, índice e constraint por objeto **não** entram aqui de
propósito: o diff nomeia o objeto divergente e a comparação desce nele na mão. Comparar 180
tabelas coluna a coluna produz um diff que ninguém lê.

---

## 4. Instalação e atualização

Instalação nova não basta — o `update.sh` re-aplica o baseline **sobre dados**. São duas provas
distintas, e as duas foram executadas.

### 4.1 Instalação (banco vazio)

`supabase/baseline.sql` aplicado com `ON_ERROR_STOP=1` num Postgres 15.19 limpo: **exit 0**, sem
nenhum erro (`evidencias/replay-migrations/baseline-aplicacao.log`).

Antes dele, o gate `pnpm test:db` aplica o baseline **duas** vezes no mesmo banco (install e
update) e roda 159 arquivos de invariante. Executado com o preâmbulo final que este replay usa:

```console
$ pnpm test:db
 Test Files  159 passed (159)
      Tests  1492 passed | 1 expected fail | 1 skipped (1494)
==> test:db verde
==> teardown: removendo container nexus-test-db-…
```

### 4.2 Atualização sobre base com dados

```bash
bash scripts/test-update-com-dados.sh
```

O que ele faz, e por que nenhum outro gate faz: aplica o baseline (install), **semeia** dados que
exercem as constraints (2 organizações, 2 usuários, membership, lead, conversa, mensagem, evento),
e **re-aplica** o baseline com `ON_ERROR_STOP=1`. Saída:

```
==> INSTALL: baseline.sql com ON_ERROR_STOP=1
    ✓ install ok
==> SEMEANDO DADOS — é isto que o test:db não faz
    ✓ 10 linhas semeadas (event_types vêm do trigger da 0185)
==> UPDATE: re-aplicando baseline.sql SOBRE OS DADOS, com ON_ERROR_STOP=1
    ✓ update ok — nenhuma constraint quebrou sobre dado existente
==> conferindo que o dado SOBREVIVEU à re-aplicação
    ✓ 10 linhas, iguais antes e depois
```

**Instalação e atualização funcionam. A cadeia de migrations não.** São caminhos diferentes, e é
por isso que a distinção importa: um cliente que instala hoje recebe o schema completo pelo
baseline; um cliente que atualiza re-aplica o mesmo arquivo sobre os dados dele sem quebrar
constraint nem perder linha.

---

## 5. RLS e isolamento entre tenants

"303 políticas" era contagem de texto. Medido num banco com o baseline aplicado:

| Medida | Valor |
|---|---|
| Tabelas em `public` | **179** |
| Tabelas em `public` com RLS **ligado** | **179** (0 sem) |
| Políticas de RLS em `public` | **300** |
| Políticas em todas as schemas (inclui 5 em `storage`) | **305** |
| Tabelas com RLS e **nenhuma** política | **5** (todas de plataforma — ver abaixo) |

### 5.1 O que a tabela acima **não** prova

RLS ligado + política presente não é isolamento. Este repositório já teve um caso em que a
política existia e vazava: `org_guardrail_layers` nasceu com `relrowsecurity = true` e o grant
padrão do Supabase, e um `viewer` conseguia desligar a camada anti-jailbreak pelo PostgREST —
`UPDATE 1 + INSERT 1`. Foi a migration **0143** que consertou, e o `baseline.sql` hoje traz as
políticas corrigidas (`org_guardrail_layers_select` / `org_guardrail_layers_admin_write`, linhas
~11796-11818) e o próprio arquivo registra o caso no comentário da linha ~14328. O ponto que
importa para esta auditoria: **enquanto existiu**, nenhuma checagem de catálogo pegava — RLS
ligado, política presente, tudo verde. Só `set role authenticated` + contagem cross-tenant pega.

### 5.2 O que prova

`pnpm test:db` roda 159 arquivos de invariante contra o baseline aplicado num Postgres efêmero,
cada arquivo num banco próprio (ordem embaralhada, sem colisão de fixture). Os de isolamento:

| Instrumento | O que faz | Cobertura |
|---|---|---|
| `tests/invariants/rls-isolation.test.ts` | semeia 2 organizações + usuário em cada, simula o JWT com `set_config('request.jwt.claims')`, conta linhas cross-tenant com `set role authenticated` — e o **controle positivo** (o usuário lê a própria organização) | **73 tabelas** |
| `PROVA_PROPRIA` (mesma varredura) | tabela fora daquela lista, com prova comportamental em outro arquivo, citado | **23 tabelas** |
| `tests/invariants/rls-completude-varredura.test.ts` | deriva do catálogo **toda** tabela com `organization_id` e reprova a que não esteja em `TABLES` nem numa exceção nomeada | gate |
| `DEBITO_CONHECIDO` (mesma varredura) | tabela tenant-aware **sem prova comportamental**, fotografada no dia em que a varredura nasceu | **73 tabelas** |

**Leitura honesta:** das ~169 tabelas tenant-aware, **96 têm prova comportamental** de isolamento
(73 + 23) e **73 são dívida conhecida** — RLS ligado, política presente, nenhum teste cross-tenant.
O gate impede que a dívida cresça; não a resolve. Contar 305 políticas e chamar de segurança seria
justamente o erro que a pergunta apontou.

### 5.3 O que o diagnóstico achou — e o que era falso positivo

Rodado em `public` (não em `auth`/`storage`, que são do Supabase, nem em `private`, cuja defesa é
GRANT e não RLS):

| Categoria | Casos | Conclusão |
|---|---|---|
| `rls_desligado` | **0** | nenhuma tabela de tenant sem RLS |
| `rls_sem_politica` | 5 | `platform_branding`, `platform_google_oauth`, `system_update_runs`, `system_version`, `watchdog_cursors` — deny-all para `anon`/`authenticated`, acesso só por `service_role`. **Intencional**, mas agora nomeado |
| `politica_using_true` | 2 | `ai_models_read_all` e `ai_pricing_public_read` — catálogos **globais** (sem `organization_id`), leitura pública correta. **Falso positivo** |
| `politica_sem_org` | 4 | os 2 catálogos acima + `calendar_oauth_nonces` (`nenhum_le`) + `user_recovery_codes` (`user_id = auth.uid()`, por usuário e não por organização). **Todos corretos** |
| `politica_para_public` | 297 | papel `public` no `GRANT` é o padrão do Supabase; quem filtra é o predicado. Não é achado sozinho — é o motivo de a prova comportamental existir |
| `comando_sem_politica` | 96 | 36 `DELETE`, 33 `UPDATE`, 22 `INSERT`, 5 `SELECT`. Os 5 `SELECT` são as tabelas de plataforma do item acima. Os demais são escrita server-side (`service_role`), que não passa por política |

### 5.4 Achado de método: a contagem textual de RLS estava errada

`docs/auditoria/04-inventario-dados.md` afirmava **142 tabelas com RLS / 38 sem**. A contagem
casava o comando **literal** `enable row level security` no arquivo. O baseline liga RLS também
por laço, em quatro blocos:

```sql
execute format('alter table public.%I enable row level security', t);
```

Medido no banco: **179 de 179**, zero sem. As 38 tabelas listadas como "sem RLS" têm RLS. O
gerador foi corrigido para rotular a linha como **texto** e para não emitir a lista com o título
que induzia a leitura errada. Um inventário que mede texto tem de dizer que mede texto.

---

## 6. `db:migrate`

Antes:

```json
"db:migrate": "echo 'TODO: wire supabase db push or pg-migrate' && exit 0"
```

Imprimia um TODO e saía com **sucesso**. O `scripts/deploy.sh` chamava com `|| true` em cima —
duas camadas de mentira sobre a mesma etapa inexistente.

Depois:

```json
"db:migrate": "bash scripts/db/aplicar-schema.sh",
"db:verificar": "bash scripts/db/aplicar-schema.sh --verificar",
```

- `db:migrate` aplica o **`baseline.sql`** (o mesmo arquivo do `install.sh`/`update.sh`, idempotente
  sobre dados) com `ON_ERROR_STOP=1` e **verifica** o resultado: 11 tabelas + `fn_user_org_ids` +
  RLS em 5 tabelas de tenant + política em `organizations`. Falta alguma ⇒ **exit 1**.
- `--verificar` não escreve nada (é o modo de conferência, para deploy).
- Falha de conexão **também** é exit 1: `faltando` vazio era ambíguo entre "nada falta" e "o psql
  não conectou" — o mesmo defeito do placeholder, com outra roupa.

Medido, contra o Supabase local desta máquina:

```console
$ SUPABASE_DB_URL=postgresql://***@host.docker.internal:54322/postgres \
    bash scripts/db/aplicar-schema.sh --verificar
==> schema do produto em postgresql://***@host.docker.internal:54322/postgres
    modo: --verificar (nenhuma escrita)
==> verificando o schema que o app exige
    ok: objetos exigidos presentes (179 300)
==> schema pronto

$ SUPABASE_DB_URL=…@host.docker.internal:54999/postgres bash scripts/db/aplicar-schema.sh --verificar
ERRO: não foi possível consultar o banco (conexão, DNS, TLS ou permissão).
       A mensagem do psql está acima. Isto NÃO é 'schema ok'.
# exit 1
```

O `scripts/deploy.sh` deixou de chamar `pnpm db:migrate` (a imagem de runtime não tem `pnpm`,
então o passo falhava sempre e o `|| true` escondia) e agora diz que o schema é do kit.

Gate: `tests/unit/db-migrate-nao-e-placeholder.test.ts` reprova qualquer script de
`package.json` que termine em `&& exit 0`, e exige que `db:migrate` aponte para um script
existente que aplique o baseline e saiba falhar.

### 6.1 `db:reset` — o outro comando que aplicava a cadeia

O `package.json` declarava `"db:reset": "supabase db reset"`. É o comando padrão de um projeto
Supabase e, aqui, aplica exatamente a cadeia reprovada: quem rodava recebia **2 tabelas** em
`public`, zero políticas e a impressão de banco limpo. Agora:

```json
"db:reset": "bash scripts/db/resetar-schema.sh",
```

O script (1) derruba `public` e `private` e as três extensões que vivem em `public` (vector,
citext, pg_trgm — as de `extensions`, uuid-ossp e pgcrypto, ficam), (2) restabelece o DEFAULT ACL
que todo projeto Supabase tem **antes** de qualquer SQL nosso, (3) aplica o `baseline.sql` pelo
**mesmo** `aplicar-schema.sh` do `db:migrate` e (4) verifica o resultado. O passo (2) não é
decoração: o baseline só emite `alter default privileges` na linha ~3960, depois de criar dezenas
de funções — sem ele, o reset produz um banco com grants diferentes do cliente.

Medido em Postgres 15.19 descartável (`pgvector/pgvector:pg15`, preâmbulo do gate aplicado antes):

| Prova | Resultado |
|---|---|
| Install de referência (preâmbulo + baseline, sem reset) | 179 tabelas · 300 políticas · 288 funções · 104 triggers |
| Depois de `pnpm db:reset` | **179 · 300 · 288 · 104** — idêntico |
| Tabela de lixo criada antes do reset | **apagada** (`lixo_do_reset`, `lixo2`) |
| ACL de função, install × reset | **diff vazio** nas 288 funções |
| Duas execuções seguidas | verdes (idempotente a partir do schema cheio) |
| Host não-local sem `--forcar` | **exit 1**, sem tocar no banco |
| `SUPABASE_DB_URL` ausente | exit 1, sem tocar no banco |

O que **não** foi medido: execução contra o Supabase local desta máquina — apagaria dados de dev.
O instrumento é o mesmo preâmbulo que o CI usa, e a paridade de ACL foi comparada contra o install
puro, não contra a nuvem.

Gate: `tests/unit/db-reset-aplica-baseline.test.ts` (não chama `supabase db reset`, aplica o
baseline pelo script único, restabelece o DEFAULT ACL, exige `SUPABASE_DB_URL`, recusa host
não-local sem `--forcar`, e não usa `drop database`).

---

## Achados

| ID | Severidade | Achado | Estado |
|---|---|---|---|
| F-09 | **P0** | a cadeia de 292 migrations não reproduz o schema: 35 aplicam, 257 falham por pré-requisito ausente, 71 objetos distintos (81 nomes crus), 10 migrations são `SELECT 1;` | **aberto** (correção na Fase 10) |
| F-09a | P0 | `db:migrate` saía com sucesso sendo placeholder, e `deploy.sh` mascarava a falha com `\|\| true` | **corrigido** |
| F-09b | P0 | `db:reset` = `supabase db reset` aplicava a cadeia quebrada (2 tabelas, 0 políticas) | **corrigido** (§6.1) |
| F-16 | Média | contagem textual de RLS subestimava a cobertura (142 × 179) e produzia lista de 38 tabelas "sem RLS" que têm RLS | **corrigido** (gerador + este doc) |
| F-17 | Média | 73 tabelas tenant-aware não têm prova comportamental de isolamento (`DEBITO_CONHECIDO`) | **aberto** (gate impede crescimento) |
| F-18 | Baixa | `echo … && exit 0` em qualquer script `package.json` não tinha gate | **corrigido** (teste) |

## Reproduzir

```bash
bash scripts/auditoria/replay-migrations.sh     # schema dos dois caminhos + RLS
bash scripts/test-update-com-dados.sh           # update do baseline sobre dados
pnpm test:db                                    # isolamento cross-tenant + invariantes
SUPABASE_DB_URL=… pnpm db:verificar             # o schema do produto está lá?
```
