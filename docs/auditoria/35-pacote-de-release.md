# 35 — Pacote da próxima release (NEXUS AAA)

> Preparado pela coordenação do programa AAA em 18/11/2026. **Nada foi publicado:
> sem tag, sem imagem nova por decisão deste documento, sem deploy.** O que existe
> aqui é o pacote que um humano aprova e corta.
>
> Fontes: `docs/doctrine/versionamento.md` (régua do número), `docs/doctrine/packaging.md`
> (como o artefato chega), `docs/runbooks/deploy.md` (como sobe), `supabase/migrations/MANIFEST.md`
> (inventário de schema) e `.changes/` (fragmentos).

## 1. Estado, com os quatro estados separados

| Estado | Valor | Como foi medido |
|---|---|---|
| Código | `nexus/main` @ `9ede1d6b` | `git log --oneline -1 nexus/main` |
| PR de release | **#537** — `release/1.56.0`, CI rodando, **não mergeado** | API de PRs do GitHub |
| Release | última tag `v1.55.0`; **nenhuma tag nova** | `git ls-remote --tags --refs nexus 'refs/tags/v*'` |
| Deploy | **parcial, fora deste programa**: sidecar fiscal já em 1.56.0 (liberar a NF-e 4656); app/worker/scheduler em 1.55.0. **Deploy completo pendente de aprovação do dono** | relato do dono |

Código mergeado não é release; release não é deploy. Este pacote anda os dois
primeiros passos e para antes do terceiro.

## 2. O número: 1.56.0 (derivado, não digitado)

```bash
pnpm release:conferir     # não escreve nada
```

Saída medida em 18/11/2026, com os fragmentos que estavam na `main` no corte:

```text
1.55.0 + minor = 1.56.0  (29 fragmento(s) no corte vigente)
```

O corte está no PR **#537** (`CHANGELOG.md` + os fragmentos consumidos), refeito sobre `5d87ac0d`. O número de fragmentos muda a cada merge; o que vale é o do PR, e ele vem de `pnpm release:conferir`.

**Por que minor**: há capacidade nova de verdade (Sentinel v1, `Idempotency-Key`
fiscal, retransmissão idempotente, nome automático de campanha) e **nenhum
fragmento `exige_acao`**. A frase do operador é *"você não precisa fazer nada;
agora o sistema também faz X"* — a definição de minor em
[`versionamento.md`](../doctrine/versionamento.md) §A régua.

Se algum fragmento novo chegar com `impacto: exige_acao` antes do corte, o
número vira **2.0.0** sozinho — não se "corrige" o número à mão.

## 3. O que o operador lê (fragmentos que compõem a seção)

| Seção | Fragmentos |
|---|---|
| **Adicionado** | Sentinel v1 e v1.1 (plano revisável) · `Idempotency-Key` fiscal · retransmissão idempotente · nome automático de campanha |
| **Corrigido** | tema claro (texto e accent) · NF-e devolução/IE/`<entrega>` · flywheel sem julgamento duplo · índice da janela de mensagens · claims de manifestação/cancelamento · recebíveis da NF-e autorizada · recebível avulso idempotente · Sentinel vínculo secundário · MFA/recuperação com teto · teto de lista declarado (fiscal/equipe/notas/catálogo) · amostra do faturamento · admin não confunde erro com vazio |

Cada linha acima tem arquivo em `.changes/`; o texto é o que vai para a tela de
atualização do dono da VPS (`lib/system/changelog.ts`).

**Lacunas de fragmento declaradas** (não inventadas): as mudanças de
mobile/offline de #514 estão no código, mas a ponte SQLite↔remoto no APK ainda
não existe (P1-04 `[!]`). Fragmento de capacidade nova ali prometeria algo que
não chega ao aparelho; fica para quando a ponte entrar.

## 4. Inventário de migrations 0313–0327

> Recorte medido em `0c239946`. A **fonte** é `supabase/migrations/MANIFEST.md`; esta
tabela existe para o revisor do deploy ver o que muda de schema sem abrir 300
+ arquivos. Migration nova depois deste corte entra na tabela no próximo recorte.

Todas são **apêndice idempotente** no `supabase/baseline.sql` (é o que
`install.sh`/`update.sh`/`deploy.sh` aplicam — nunca a cadeia).

| Versão | Arquivo | Objeto | Idempotente | Exige ação do operador? |
|---|---|---|---|---|
| 0313 | `20261120120000_0313_indice_janela_de_mensagens.sql` | índice da janela de mensagens | `create index if not exists` | não (só tempo de build do índice) |
| 0314 | `20261121120000_0314_saldo_do_recebivel.sql` | trigger de validação do recebível | `create or replace` | não |
| 0315 | `20261121130000_0315_nota_viva_por_pedido.sql` | trigger de nota viva por pedido | `create or replace` | não |
| 0316 | `20261121140000_0316_sentinel_ocorrencias.sql` | tabelas `sentinel_*` + policies | `create table if not exists` | não |
| 0317 | `20261122120000_0317_idempotency_hash_texto.sql` | `idempotency_keys.request_hash` bytea→text | bloco `do` com guarda de tipo | **não**, mas ver §7 |
| 0318 | `20261122130000_0318_campanha_nome_manual.sql` | `prospecting_campaigns.nome_manual` | `add column if not exists` + guarda | não |
| 0319 | `20261122140000_0319_claims_fiscais.sql` | colunas de claim em `fiscal_entradas`/`invoices` | `add column if not exists` | não |
| 0320 | `20261123130000_0320_search_path_dos_definer.sql` | `pg_temp` no `search_path` das definers | dirigido pelo catálogo | não |
| 0321 | `20261123140000_0321_sentinel_recomendacoes.sql` | recomendações do Sentinel | `add column if not exists` | não |
| 0322 | `20261123150000_0322_credencial_de_dispositivo_offline.sql` | `offline_devices` + policies | `create table if not exists` | não |
| 0323 | `20261123160000_0323_telefone_fixo_e164.sql` | `create or replace fn_upsert_wa_contact` | `create or replace` | não |
| 0324 | `20261123170000_0324_sentinel_estoque_sem_movimento.sql` | detector do Sentinel | `create or replace` | não |
| 0325 | `20261123180000_0325_sentinel_correcao_aprovada.sql` | RPC de correção/reversão (Nível 2 restrito) | `create or replace` | não |
| 0326 | `20261123190000_0326_devolucao_nao_concorre_com_a_venda.sql` | trigger de nota viva considera finalidade e cancelada | `create or replace` | **já aplicada em produção** por correção manual |
| 0327 | `20261123200000_0327_definer_com_search_path_vazio.sql` | definers com `search_path` vazio | dirigido pelo catálogo | **já aplicada em produção** por correção manual |

Nenhuma migration destrutiva, nenhum `drop`. O caminho de update é o mesmo do
install: o baseline inteiro, reaplicado.

**0326/0327 em produção, por correção manual.** O deploy da 1.57.0 bateu nos três
defeitos e o dono aplicou o baseline corrigido com `ON_ERROR_STOP=1` (0 erros),
além do ajuste manual que devolveu o vínculo do pedido 19560. Isso **não** torna o
update perigoso: as duas são `create or replace` dirigidos por catálogo, e
reaplicar o baseline inteiro é idempotente — o `update.sh` (com o #568) agora para
antes de trocar imagens se qualquer DDL não-benigno aparecer.

**Rollback do schema:** 0326/0327 não são revertidas por rollback de imagem. A
1.57.0 roda com elas aplicadas (o trigger apenas recusa menos duplicata e as
definers ficam com `search_path` válido).

**Conferir antes do corte** (com Docker):

```bash
pnpm test:db     # aplica baseline em install E update + invariantes
```

## 5. Checklist de corte (quem corta marca)

Pré-corte — tudo verde **no commit que vai virar tag**:

- [ ] `pnpm gov:verify` (typecheck + lint + lint:channels + lint:role-rank + test:unit)
- [ ] `pnpm test:db` (baseline install **e** update + RLS/invariantes)
- [ ] `pnpm test:shell` (kit: install/update/backup/restore/health)
- [ ] e2e do CI verde na `main`
- [ ] `imagens-ok` verde (as três imagens constroem)
- [ ] `pnpm release:conferir` devolve o número esperado e **nenhum** fragmento inválido

Corte:

- [ ] `pnpm release:cortar` (escreve a seção no `CHANGELOG.md` e apaga os `.changes/` consumidos)
- [ ] revisar a seção: toda mudança de comportamento dos merges tem eco; nada de prosa inventada
- [ ] abrir o PR de release; **o merge é a aprovação do dono**
- [ ] a tag `vX.Y.Z` é criada **pelo CI**, a partir de commit contido na `main` — nunca `git tag` local

Publicação (CI, não máquina):

- [ ] `publish-image.yml` publica `nexus`, `nexus-worker`, `nexus-scheduler` na mesma versão
- [ ] `stable` só se move por tag `v*`; `latest` é o topo da `main` e **não** é release

Deploy (decisão humana separada; ver §6):

- [ ] backup antes (`hostgator-setup-kit/backup.sh`)
- [ ] `bash hostgator-setup-kit/update.sh` na VPS
- [ ] verificação pós-deploy do runbook (labels + HTTP 307 + `/api/v1/health`)

## 6. Plano de deploy — para aprovação humana

> **Status: NÃO EXECUTADO.** Este bloco é o pedido de aprovação; nada aqui foi
> rodado contra VPS, banco remoto ou SEFAZ.

| Campo | Valor |
|---|---|
| Versão-alvo | **`v1.58.0`** (derivada no corte; a tag só existe depois do merge do PR do workflow) |
| Commit-alvo | o merge do PR de release (preencher no corte; não invente sha) |
| Mudança de schema | **0313–0327** (0322 = `offline_devices`; 0316 = `sentinel_*`; 0326/0327 **já em produção**) |
| Exige ação do operador | **não** (`update.sh` aplica o baseline) |
| Janela sugerida | fora do horário de atendimento do WhatsApp da empresa — atualização reinicia a app |
| Rollback (imagem) | voltar as **três** imagens no `.env` (`APP_IMAGE`, `WORKER_IMAGE`, `SCHEDULER_IMAGE` — o `update.sh` grava as três na mesma versão) e `up -d` com **os dois** `-f` |
| Rollback (banco) | **forward-only** para 0317 (tipo de `request_hash`); as demais são aditivas |
| Contenção se o site responder 404 | labels do Traefik: refazer `up -d` com `docker-compose.prod.yml` **e** `docker-compose.traefik.yml` |

Passos, na ordem do [`runbook`](../runbooks/deploy.md):

1. **Antes**: conferir espaço em disco e que o backup anterior existe. O `update.sh` chama `backup.sh` sozinho antes de aplicar schema (`--skip-backup` existe e **não** deve ser usado aqui); para uploads/Storage, rode também `bash hostgator-setup-kit/backup-uploads.sh` (F-32).
2. `bash hostgator-setup-kit/update.sh` — puxa a tag publicada, aplica `supabase/baseline.sql` e falha alto se faltar objeto.
3. **Depois** (as duas verificações do runbook, não só `healthy`):
   - `docker inspect "$(docker compose -f docker-compose.prod.yml ps -q app)" --format '{{.Config.Labels}}' | grep -o 'traefik.enable:[^ ]*'` → `traefik.enable:true`
   - `curl -I https://<dominio>/` → `307`
4. **Tabelas novas existem** (o `health` não olha schema; 0322 nasceu no deploy da 1.57.0 e ficou faltando):
   ```bash
   psql "$SUPABASE_DB_ADMIN_URL" -Atc \
     "select to_regclass('public.offline_devices'), to_regclass('public.sentinel_occurrences'), to_regclass('public.sentinel_occurrence_events'), to_regclass('public.sentinel_runs')"
   # esperado: as quatro colunas preenchidas, nenhuma vazia
   ```
5. **Funções da correção existem e são executáveis só pelo serviço**:
   ```bash
   psql "$SUPABASE_DB_ADMIN_URL" -Atc \
     "select proname from pg_proc where proname in ('fn_sentinel_corrigir_job','fn_sentinel_reverter_job','fn_invoice_order_uma_viva') order by 1"
   ```
6. Abrir **Notas** e **Estoque** com dado real: são as duas mudanças de lista desta
   release (teto declarado) e a devolução é o caso que travou o backfill.

### 6.1 Rollback para 1.57.0

1. No `.env`, voltar as **três** imagens para `1.57.0` (`APP_IMAGE`,
   `WORKER_IMAGE`, `SCHEDULER_IMAGE`) — o `update.sh` grava as três juntas; uma
   esquecida deixa o worker em outra versão.
2. `docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml --env-file .env up -d`.
3. **Não** reverter o schema: 0326/0327 são compatíveis com a 1.57.0 e reverter
   trigger exigiria outra migration. O baseline é aditivo por contrato.
4. Se o problema for schema pela metade, o caminho não é rollback de imagem: é
   `restore.sh` do backup feito no passo 1 — e o motivo fica no relatório.

Critério de abortar: `update.sh` sai ≠ 0, verificação de schema falha, ou qualquer
uma das duas verificações do passo 3 não bate. Nesse caso: não "tentar de novo
mais tarde" sem coletar `docker compose logs app` e o motivo do `psql`.

**Aprovação** (humano). Nada abaixo foi feito; o corte é do workflow, e o dono
ainda não liberou:

```
[ ] Aprovado cortar v1.58.0 (workflow_dispatch do "release")
[ ] Aprovado publicar imagens
[ ] Aprovado deploy na VPS ___ em __/__/____
[ ] `to_regclass` das quatro tabelas conferido depois do deploy
```

## 7. Riscos e o que não entra

| Risco | Estado |
|---|---|
| 0317 muda `request_hash` de `bytea` para `text` | update aplica e converte; **rollback de imagem com o banco novo não foi ensaiado** — tratar como forward-only |
| 0316 cria tabelas do Sentinel | aditivas; app antigo ignora. Nenhuma varredura roda sozinha sem agenda configurada |
| 0313 cria índice | em base grande, o `create index` segura escrita na tabela de mensagens durante o build |
| `#307` (crédito do DANFE) | **não entra**: default `"By nexus"` no PDF viola a regra de marca; a imagem do app também não constrói no CI dele |
| `#518`/`#520`/`#521` (banco/A) | **entraram** em 18/11 (`243ab166`, `6daec49d`, `ee0c8093`) — 0320 e P1-06 incluídos |
| `#517`/`#522`/`#530`/`#536` | mergeados nesta rodada (jornadas, fichas, docs do programa, invariante do flywheel) |
| mobile/offline em aparelho | `[!]`: sem APK/emulador nesta máquina |

## 8. Assinatura de quem preparou

Preparado pela coordenação AAA. Comandos e números acima são reproduzíveis a
partir de `nexus/main`; nenhuma afirmação de deploy ou de produção foi feita.
A execução do corte e do deploy é ato humano.

## 22. Pacote da 1.58.1 (não cortado — aguarda ordem do dono)

| Campo | Valor |
|---|---|
| Base | `nexus/main` no dia do corte (`git log --oneline -1`) |
| Última tag | **`v1.58.0`** (`4c7cd633`) |
| Entram (mergeados) | **#581** pendências 5.4/5.6 · **#583** axe 14 rotas + ordem anunciada · **#584** devolução não é duplicidade no Sentinel · **#585** coletor do Mercos com rota real e fail-loud · **#586** regressão local (smoke 32/32, critical 75/75) + spec no CI · **#587** filtro de cidade via IBGE · **#590** liberar claim preserva histórico · **#591** retenção/LGPD do Sentinel · **#580** quadro do DoD |
| Entram (mergeados depois da 1.58.0) | **#589** matriz das specs fora do CI · **#593** filas/pacote · **#594** modo `--todos` (pendente de rebase) |
| Fragmentos na `main` | 4 (`axe-telas-e-ordem-das-listas`, `mercos-catalogo-rota-e-falha`, `nota-duplicada-ignora-devolucao`, `pendencias-5-4-e-5-6`) |
| Fragmentos que faltarão | um para a cidade (F traz no PR) e um para o #582, se ele entrar |
| Número | **derivado** por `pnpm release:conferir` — não digitar |
| Corte | `workflow_dispatch` do `release` → PR assinado pelo App → merge = tag |

**Nada é aplicado no banco por este pacote.** O pareamento do catálogo continua
bloqueado: depende da decisão dos inativos (§25 da fila) e de um `--dry-run`
aprovado com o número "traz X dos 69".

**Deploy:** a 1.58.1 só deve ser aprovada depois da verificação da 1.58.0
(`to_regclass` das quatro tabelas + funções da correção) — que segue em curso
pelo dono.
