# Operação do self-host — instalar, atualizar, conferir, salvar e recuperar

> **Item 6.A5 do AAA.** Um runbook só, com o comando real de cada etapa, o que
> ele toca e o que fazer quando falha. O kit vive em `hostgator-setup-kit/` e é
> ele quem executa — este documento não inventa passo: aponta o script, o
> efeito e a evidência que já existe em gate.
>
> **Regra que atravessa tudo:** o schema entra pelo `supabase/baseline.sql`, nunca
> pela cadeia de migrations. `supabase db push` é **caminho proibido** (F-09=B;
> ver `supabase/migrations/README.md`).

## 0. O que roda onde

| Peça | Serviço | Atualiza por |
|---|---|---|
| Aplicação Next | `app` (imagem publicada) | `update.sh` / `scripts/deploy.sh` |
| Worker de agentes | `worker` | idem |
| Agendador | `scheduler` | idem |
| WhatsApp | `waha` e volume `waha-data` | imagem fixa do compose |
| Banco | Supabase self-host (`supabase_db_selfhost`) | `baseline.sql` |
| Proxy | Traefik ou proxy do provedor | `docker-compose.traefik.yml` |

## 1. Instalação nova

```bash
bash hostgator-setup-kit/install.sh
```

O que ele faz, em ordem: confere pré-requisitos → sobe o compose → aplica o
`baseline.sql` **em banco novo com `ON_ERROR_STOP=1`** → promove o dono →
sobe app/worker/scheduler → espera o health de dentro da rede.

**Falha comum:** `type public.vector does not exist`. O projeto Supabase novo
precisa das extensões antes do baseline; o próprio instalador as cria. Se
aparecer em instalação manual, veja `docs/SETUP.md`.

**Prova de que o caminho funciona:** `pnpm test:db` aplica o baseline do zero
num Postgres 15 descartável e roda os invariantes (install **e** update).

## 2. Atualização de uma instalação existente

```bash
bash hostgator-setup-kit/update.sh            # versão mais recente publicada
bash hostgator-setup-kit/update.sh --to v1.40.0
bash hostgator-setup-kit/update.sh --force    # permite voltar no tempo (rollback)
```

Sete etapas: procura versão → **backup antes de tocar no banco** → baixa o
código → re-aplica o baseline (idempotente, sobre dados) → baixa imagem nova e
reinicia → confere o app no ar → confere as automações.

**Recusa esperada:** alvo anterior ao instalado é barrado ANTES do backup;
`--force` é a saída explícita. Se a cópia do repo não é a dona dos contêineres,
o script para (`recusar_projeto_de_outra_arvore`) — rodar de outra árvore
recria o parque com o `.env` errado.

**Prova:** `scripts/test-update-com-dados.sh` semeia, atualiza e compara os
dados antes/depois; `pnpm test:shell` cobre as guardas.

## 3. Deploy de uma imagem (sem update de código)

```bash
NEXUS_IMAGE=ghcr.io/<dono>/nexus:<tag> ./scripts/deploy.sh
```

Etapas: valida ambiente → puxa as três imagens da MESMA tag → valida o compose
→ **aplica o `baseline.sql` e verifica objetos essenciais** (`organizations`,
`messages`, `conversations`, `contacts`, `commercial_orders`,
`financial_receivables`, `llm_calls`) → sobe containers → health de dentro da
rede → grava o pin no `.env`.

**Se falhar no schema**, o deploy para **antes** do `up -d`: imagem nova não
sobe contra banco sem objeto. Log em `baseline-apply.log`. Gate:
`tests/shell/deploy-aplica-schema.test.sh` (10 casos).

**Proxy reverso:** numa VPS com proxy próprio, todo `up -d` leva os DOIS
arquivos de compose:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml --env-file .env up -d app
```

Esquecer o segundo `-f` recria o contêiner **sem labels**: o proxy deixa de
vê-lo e o domínio responde `404` com o contêiner `healthy`. Runbook:
`docs/runbooks/deploy.md`.

## 4. Health e diagnóstico

```bash
bash hostgator-setup-kit/healthcheck.sh     # /api/v1/health de DENTRO da rede
bash hostgator-setup-kit/diagnostico.sh     # containers, recursos e últimos erros
```

O health **não** é público sem TLS: ele é consultado de dentro da rede, com o
mesmo caminho que o app usa. Um `curl` da máquina do operador em
`127.0.0.1:3000` responde `connection refused` em instalação **saudável** (o app
não publica porta no host) e não serve como prova.

O que o health cobre: banco (consulta), storage, canal e worker. Se um
subsistema estiver degradado, a resposta diz qual.

## 5. Backup

```bash
bash hostgator-setup-kit/backup.sh
```

Grava em `backups/`:

| Arquivo | Conteúdo | Guarda |
|---|---|---|
| `db-<ts>.sql.gz` | `pg_dump` pela conexão de **schema** | recusa dump < 4 KiB (arquivo vazio) |
| `waha-<ts>.tgz` | volume `waha-data` (sessões do WhatsApp) | — |

Rotação: mantém os **14 mais recentes** de cada tipo.

**O que NÃO entra:** uploads do storage (avatares, fotos de produto, mídia de
conversa). Isso é lacuna declarada de F-32 (ver `docs/auditoria/25-ensaio-de-restauracao.md`)
e exige decisão de operação (qual caminho é a fonte por tipo de instalação).

## 6. Restauração

```bash
bash hostgator-setup-kit/restore.sh backups/db-<ts>.sql.gz
```

Pede digitar `RESTAURAR`, restaura com `psql_run` (mesmo motivo do dump: dentro
do container do banco) e, **desde 17/11/2026**, confere
`has_table_privilege('authenticated','public.contacts','SELECT')`: se o dump
antigo não trouxe GRANTs, re-aplica o baseline para recriá-los; se ainda faltar,
**falha alto** em vez de deixar subir app quebrado. Depois: reinicie o app.

**Ensaio ponta a ponta** (descartável, não toca a VPS):

```bash
bash scripts/auditoria/ensaio-de-restore.sh
```

Faz install → semeia → backup → **apaga** → restaura → confere linhas, 179/179
RLS, privilégio e isolamento cross-tenant. Evidência em
`docs/auditoria/evidencias/restore/`.

## 7. Emergências

| Sintoma | Comando | Efeito |
|---|---|---|
| esqueci a senha | `bash hostgator-setup-kit/reset-password.sh` | redefine pelo admin, sem e-mail |
| perdi o MFA | `bash hostgator-setup-kit/reset-mfa.sh` | remove fatores TOTP do usuário |
| worker congelado | `docs/runbooks/remediar-worker-congelado.md` | reinício e diagnóstico por fila |
| WhatsApp desconectado | `docs/runbooks/waha-hostgator.md` | reconexão e causa por status |
| e-mail de marca | `bash hostgator-setup-kit/marca-emails.sh` | remetente e templates da marca |

## 8. Atualização do agente da tela

`agent.sh` (cron a cada 5 min) aplica a atualização pedida pela tela sem SSH.
O cron é instalado no sandbox pela suíte; o crontab real da máquina não é
escrito pelos testes (`pnpm test:shell` cobre isso).

## 9. O que este runbook não cobre (e está declarado)

- **storage/uploads** no backup e o restore deles (F-32, decisão de operação);
- **restore → health com app real** (o ensaio mede o banco; o health do app é
  o passo 4, executado depois);
- **rollback de schema** (migration reversível): o baseline é idempotente e
  re-aplicável, mas desfazer uma coluna/tabela não tem ensaio próprio;
- **PITR** (WAL archiving): o backup é lógico.
