# F-09 — prova do caminho único (executada, não só decidida)

> Executado em 18/11/2026 por `bash scripts/auditoria/prova-f09.sh`, em Postgres
> 15.19 descartável (`pgvector/pgvector:pg15`). Evidência bruta:
> [`evidencias/f09/prova-20261118-010208.txt`](evidencias/f09/prova-20261118-010208.txt)
> e o ensaio de restore que ela chama,
> [`evidencias/restore/ensaio-20261118-010320.txt`](evidencias/restore/ensaio-20261118-010320.txt).
> Nenhum banco remoto, VPS ou produção foi tocado.

A decisão F-09-B está registrada em [`20-f09-estrategia.md`](20-f09-estrategia.md):
`supabase/baseline.sql` é o único caminho de schema, e a cadeia de 292 migrations é
histórico morto. Este documento é a **execução** dessa decisão — o que ela promete,
medido num banco descartável.

## 1. O que a prova executa

| # | Prova | Como | Resultado |
|---|---|---|---|
| 1 | Nenhum executável aplica a cadeia | `grep` em `scripts/`, `.github/`, `hostgator-setup-kit/`, `Dockerfile*`, `docker-compose*.yml`, ignorando linha de comentário | **0 invocações** de `db push` / `db reset` / `migration up` |
| 2 | O kit tem caminho alternativo | `install.sh` e `update.sh` citam `baseline.sql` | ambos |
| 3 | Instalação | preâmbulo + `baseline.sql`, `ON_ERROR_STOP=1`, banco vazio | exit 0 · **179 tabelas, 179 com RLS, 300 políticas, 288 funções, 104 triggers** |
| 4 | Atualização sobre dados | semeia 2 orgs + contato/conversa/mensagem/pedido/recebível e **re-aplica** o baseline com `ON_ERROR_STOP=1` | exit 0 · **0 linha perdida** · objetos idênticos |
| 5 | ACL instalação × atualização | snapshot de tabelas + funções + `pg_default_acl` (5.400 linhas), ordenado, `diff` | **vazio** |
| 6 | Privilégios do app | `has_table_privilege` / `has_function_privilege` | `authenticated` lê `contacts` e executa `fn_user_org_ids()`; `anon` **não** executa o helper de policy |
| 7 | Isolamento pós-update | JWT simulado, contagem cross-org | A lê **0** mensagem de B e **1** da própria |
| 8 | `db:reset` reproduz a instalação | `resetar-schema.sh` num banco próprio | mesmos objetos, **ACL idêntico** |
| 9 | `--verificar` sabe falhar | sem `SUPABASE_DB_URL` | exit ≠ 0 (não é verde por acidente) |
| 10 | Restore ponta a ponta | `ensaio-de-restore.sh` (backup → apagar → restaurar → conferir) | **PASSOU** |

## 2. O defeito que a prova achou (e a correção)

A primeira execução terminou com o ACL do `db:reset` **diferente** do instalado. O
diff era de um papel só, em tabelas criadas pelo corpo do dump:

```
T ai_agent_runs 16385 DELETE
T ai_agent_runs 16385 INSERT   ← `anon`, só no reset
…
```

`resetar-schema.sh` estabelecia `alter default privileges … grant all on tables to
anon, authenticated, service_role` **antes** de aplicar o baseline. Com isso, toda
tabela criada herdava o grant de `anon`, e o `GRANT ALL ON TABLE … TO authenticated /
service_role` que o dump emite por tabela — sem `anon`, de propósito — deixava de ser
o que decide o ACL. Resultado: **o dev ficava mais aberto que a instalação** em
`ai_agent_runs` (e nas demais em que o dump nega `anon`).

**Correção**: `resetar-schema.sh` passou a restabelecer apenas o DEFAULT ACL de
**funções** (que é o que o preâmbulo do banco descartável também estabelece, e cuja
ausência fazia as definer do corpo nascerem sem `EXECUTE` para `anon`). Tabelas e
sequências seguem o ACL que o baseline emite, tabela por tabela. Depois da correção,
install × reset tem **diff vazio** nas 5.400 linhas de ACL.

## 3. O que continua divergente do Supabase gerenciado (limite honesto)

Num projeto Supabase de verdade, o bootstrap concede `ALL` em tabelas a `anon`,
`authenticated` e `service_role` **antes** de qualquer SQL nosso. O caminho
descartável (preâmbulo + baseline) não reproduz essa concessão para as tabelas do
corpo do dump — ele reproduz o ACL **explícito** que o dump emite. A diferença
medida: no banco descartável, `anon` tem `SELECT` em 58 das 179 tabelas; num Supabase
real teria em todas.

Isso **não** é vazamento: quem filtra linha é a RLS, e é a RLS que a suíte de
invariantes mede com JWT simulado (`rls-isolation`, `rls-varredura-comportamental`).
Mas é uma diferença de superfície de privilégio, e fica registrada em vez de
silenciada — um `anon` com `GRANT` e RLS correta lê zero linha; um `anon` sem
`GRANT` lê zero linha por outro motivo. O gate mede o **resultado**, não o caminho.

## 4. Estratégia para evoluir o schema (o que o dono da VPS faz)

1. **Schema novo** entra como migration versionada em `supabase/migrations/` **e**
   como apêndice idempotente em `supabase/baseline.sql` (os três: arquivo, apêndice,
   linha no `MANIFEST.md`). A migration é registro histórico; o apêndice é o que
   chega ao cliente.
2. **Atualização** re-aplica o baseline inteiro (`update.sh` → `psql` efêmero). O
   apêndice é idempotente por construção (`if not exists`, `drop … if exists`,
   `$baseline_guard$`), e a prova da seção 4 mostra que dado existente sobrevive.
3. **Nunca** `supabase db push`, `supabase db reset` nem `supabase migration up`.
   Não há caminho suportado que os use; o `db:migrate`/`db:reset` locais aplicam o
   baseline.
4. **Restore** usa `pg_dump --no-owner` **sem** `--no-privileges` (o defeito medido
   em `25-ensaio-de-restauracao.md`) e o `restore.sh` re-aplica o baseline se o
   backup for antigo e não tiver os grants.

## 5. Reproduzir

```bash
bash scripts/auditoria/prova-f09.sh                    # install/update/ACL/reset + restore
PROVA_F09_SEM_RESTORE=1 bash scripts/auditoria/prova-f09.sh   # só o schema (mais rápido)
bash scripts/auditoria/replay-migrations.sh            # o instrumento do achado original
pnpm test:db                                           # baseline install+update + 164 invariantes
```

O script sai com o número de verificações que falharam (`0` = passou) e grava tudo
em `docs/auditoria/evidencias/f09/prova-<timestamp>.txt`.
