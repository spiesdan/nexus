# README de Operação — DeskcommCRM / Nexus

> **Este arquivo é o manual completo de operação do projeto.** Ele existe para
> qualquer pessoa — em um MacBook, em outro PC, ou outra pessoa inteiramente —
> conseguir clonar, editar, validar, publicar e atualizar a VPS **sem provocar
> divergência de versão**, que foi exatamente o incidente de 05–06/10/2026.
>
> **Como ler:** este arquivo é a _operação_. O `README.md` é o _produto_
> (instalação, stack, telas). O `AGENTS.md` é o _contrato mínimo do agente de
> código_. A doutrina completa e não-negociável está no `CLAUDE.md` — leia-o
> antes de tocar em código. Nada aqui substitui esses três.
>
> Convenção de verdade usada neste documento (a mesma de `CLAUDE.md`):
> **`CONFIRMADO`** = provado por código/medição; **`INFERIDO`** = deduzido;
> **`PENDENTE`** = ainda não resolvido.

---

## Índice

1. [O incidente — o que aconteceu](#1-o-incidente--o-que-aconteceu)
2. [Causa raiz — por que as ferramentas da NF-e sumiram](#2-causa-raiz--por-que-as-ferramentas-da-nfe-sumiram)
3. [Estado atual do sistema (CONFIRMADO)](#3-estado-atual-do-sistema-confirmado)
4. [Mapa operacional — tudo que existe e onde está](#4-mapa-operacional--tudo-que-existe-e-onde-está)
5. [Containers e imagens](#5-containers-e-imagens)
6. [A VPS — acesso, caminhos, o que roda lá](#6-a-vps--acesso-caminhos-o-que-roda-lá)
7. [Como editar o projeto de qualquer máquina](#7-como-editar-o-projeto-de-qualquer-máquina)
8. [O fluxo Git que evita divergência (a regra)](#8-o-fluxo-git-que-evita-divergência-a-regra)
9. [Como validar uma alteração](#9-como-validar-uma-alteração)
10. [Como publicar uma versão (release)](#10-como-publicar-uma-versão-release)
11. [Como atualizar a VPS](#11-como-atualizar-a-vps)
12. [Como conferir que não houve drift de versão](#12-como-conferir-que-não-houve-drift-de-versão)
13. [Diagnóstico da página de NF-e (o caso concreto)](#13-diagnóstico-da-página-de-nfe-o-caso-concreto)
14. [Checklists prontos (copie e cole)](#14-checklists-prontos-copie-e-cole)
15. [Armadilhas conhecidas desta máquina e deste stack](#15-armadilhas-conhecidas-desta-máquina-e-deste-stack)
16. [Segredos, acessos e pendências abertas](#16-segredos-acessos-e-pendências-abertas)
17. [Glossário](#17-glossário)

---

## 1. O incidente — o que aconteceu

### 1.1 Linha do tempo (todos os horários **UTC**, exceto onde marcado)

`CONFIRMADO` — lidos de `git reflog` na VPS, `git for-each-ref` nas tags e logs
dos containers.

| Quando                      | O quê                                                                             |
| --------------------------- | --------------------------------------------------------------------------------- |
| 03/10 20:07                 | VPS passa para `v1.19.0`                                                          |
| **05/10 04:36**             | tag `v1.20.0` publicada                                                           |
| **05/10 10:30** (07:30 BRT) | VPS faz checkout de `v1.20.0`                                                     |
| **05/10 12:32** (09:32 BRT) | tag `v1.20.1` publicada                                                           |
| **05/10 14:09** (11:09 BRT) | tag `v1.20.2` publicada                                                           |
| **05/10 14:20**             | VPS faz checkout de `v1.20.2`                                                     |
| 05/10 21:21                 | **Alguém/algum agente** faz checkout de `feat/EPIC-rel-prospeccao-laya` na VPS    |
| 05/10 22:09                 | `git reset origin/main`                                                           |
| **05/10 22:15**             | **`.env` é editado à mão**: as 3 imagens viram `:main` ← **não foi pedido**       |
| 06/10 00:21                 | checkout de `feat/EPIC-rel-prospeccao-laya` de novo                               |
| 06/10 01:09 e 02:07         | dois `git reset origin/main`                                                      |
| **06/10 00:48**             | containers recriados com a imagem `:main` — **site trocado sozinho de madrugada** |
| 06/10 00:48                 | agente do host reporta `502`                                                      |
| **06/10 04:24**             | **rollback** para `v1.20.2` (não para `v1.20.0`)                                  |
| 06/10 15:23                 | tag `v1.21.0` publicada                                                           |
| 06/10 15:32                 | VPS faz checkout de `v1.21.0`                                                     |
| **06/10 15:39:56**          | imagem `deskcommcrm:1.21.0` (`d97624418fa1`) construída pelo CI                   |
| 06/10 15:40                 | `update.sh` instala `v1.21.0` nas 3 imagens; containers recriados                 |
| 06/10 ~15:40                | `502` transitório durante a janela de atualização (auto-recuperável)              |

### 1.2 Por que isso só foi descoberto depois

`CONFIRMADO` — o `healthcheck.sh` só checava **saúde interna** (containers
rodando, `/api/v1/health` respondendo). Ele não olhava:

- se a tag no `.env` era uma **tag fixa** ou um canal móvel (`main`, `latest`,
  `stable`);
- se as **três imagens** estavam na **mesma** tag;
- se o **repositório** tinha branches locais ou **mais de um remote**;
- se o `HEAD` estava solto numa branch em vez de numa **tag publicada**.

Resultado: o `.env` saiu de `:1.20.2` para `:main` às 22h15 e nada sinalizou;
o site foi trocado sozinho às 00h48; na mesma noite o repo da VPS tinha
**quatro branches locais** (uma 239 commits atrás da remota) e **dois remotes
para a mesma URL** — invisível para o operador.

### 1.3 O que foi feito

`CONFIRMADO`:

- **Guard de âncora de versão** criado em `hostgator-setup-kit/healthcheck.sh`
  — seção **"Âncora de versão (drift)"** com 5 checagens (ver §12).
- Aceito como **PR #30**, merge `b2e93f294`; commits `9a1f4818d` (feat) +
  `a20caf543` (fix: comentário não pode escrever o namespace à mão).
- **Ratchet do namespace** em `tests/unit/namespace-das-imagens.test.ts` —
  impede que alguém volte a escrever `ghcr.io/spiesdan/...` hardcoded fora da
  allowlist de 4 arquivos.
- Fragmento `.changes/healthcheck-ancora-de-versao.md` criado → consumido pelo
  release.
- **Release `1.21.0`** feita pelo caminho oficial (PR #31, 5 checks verdes,
  tag `v1.21.0`, `publish-image` OK).
- **VPS atualizada** para `v1.21.0` via `update.sh`; guard verde na VPS.
- Local `main` sincronizado com `nexus/main` == tag `v1.21.0`.

---

## 2. Causa raiz — por que as ferramentas da NF-e sumiram

Esse foi o sintoma que gerou toda a investigação: _"dia 5 às 9h da manhã tinha,
hoje não tem"_.

### 2.1 O que NÃO era

Descartado por medição, não por suposição:

- **Não era versão.** `app/app/notas/` é **byte a byte idêntico** entre
  `v1.20.0`, `v1.20.1`, `v1.20.2` e `v1.21.0`. A única versão que _não_ tinha
  as ferramentas era **`v1.19.0`** (0 marcadores contra 3).
- **Não era papel do usuário.** As duas contas em `user_organizations` são
  `admin` (rank 5), e `podeEmitir` exige rank ≥ 2 (`agent`).
- **Não era código quebrado.** O build em execução contém as ferramentas
  (medido dentro do container: `Inutiliza Nota`,
  `cartasCorrecao` ×3, `Retransmitir` ×1).
- **Não era erro em runtime.** Nenhum erro de `/app/notas` nos logs do app.
- **Não era a rollback estar errada.** A rollback foi para `v1.20.2`, não para
  `v1.20.0`, mas tanto faz — a página é idêntica nas duas. E depois a VPS foi
  atualizada para `v1.21.0`.

### 2.2 O que ERA

`CONFIRMADO` — `app/app/notas/_components/GradeNotas.tsx`, linha 371 (antes da
correção):

```tsx
{inicial.length === 0 ? (
  <EmptyState headline="Nenhuma nota ainda" ... />
) : (
  <>
    <div className="flex flex-wrap items-center gap-2">   {/* barra de ferramentas */}
      ...Emitir nota, Exportar CSV, Importar histórico do SEFAZ,
         NSU, Modelo, Exporta XMLs, Buscar nota, filtros...
```

**A barra de ferramentas inteira estava dentro do ramo `inicial.length > 0`.**

- A print antiga tinha as **notas de teste do E2E** → `inicial.length > 0` →
  barra visível.
- Hoje `invoices`, `fiscal_events` e `fiscal_entradas` estão **todas com 0
  linhas** (medido no banco, com `postgres` em `bypassrls`, ou seja, é estado
  real e não bloqueio de RLS) → cai no `EmptyState` → **sem barra**.

A print continha dados de fixture do E2E (`tests/e2e/jornada-fiscal.spec.ts:34`
gera `Empresa Jornada Fiscal ${carimbo}`) — e eram exatamente esses dados que
liberavam a barra.

### 2.3 A correção

`app/app/notas/_components/GradeNotas.tsx` — a barra saiu de dentro do
condicional e passou a renderizar **sempre**; o condicional agora decide só o
corpo:

```tsx
<div className="flex flex-wrap items-center gap-2">  {/* SEMPRE */}
  ...botões, NSU, modelo, busca, filtros...
</div>

{progressoXml && (...)}

{inicial.length === 0 ? (
  <EmptyState headline="Nenhuma nota ainda" ... />
) : visiveis.length === 0 ? (
  <EmptyFilterResults primary={{...}} />
) : (
  <> ...tabela... </>
)}
```

**Estado:** `typecheck` limpo, `lint` **0 erros** (355 warnings pré-existentes),
`prettier --write` aplicado. `git status` mostra o arquivo modificado —
**ainda não commitado** (ver §14.4).

---

## 3. Estado atual do sistema (CONFIRMADO)

Medido em 06/10/2026.

| Item                  | Valor                                                                             |
| --------------------- | --------------------------------------------------------------------------------- |
| Tag em produção       | **`v1.21.0`** (`9d71e1a18`)                                                       |
| `nexus/main`          | `9d71e1a18` — **igual à tag**                                                     |
| Imagem do app         | `ghcr.io/spiesdan/deskcommcrm:1.21.0` = `d97624418fa1` (build 06/10 15:39:56 UTC) |
| Imagem do worker      | `ghcr.io/spiesdan/deskcomm-worker:1.21.0`                                         |
| Imagem do scheduler   | `ghcr.io/spiesdan/deskcomm-scheduler:1.21.0`                                      |
| Containers do app     | todos `Up` e `healthy`                                                            |
| Site                  | `200` · `<title>Entrar · Bill Higiene e Limpeza</title>`                          |
| Guard na VPS          | verde em todas as 5 checagens                                                     |
| Remotes do repo local | **apenas `nexus`**                                                                |
| Branches locais       | **nenhuma** (tudo em `main`)                                                      |
| Banco (Supabase)      | project ref **fora do repo (é público) — está no `.env` da VPS**             |
| Tabelas fiscais       | existem (10) e estão **vazias**                                                   |
| Provedor fiscal       | **`stub`** — sem sidecar, sem `FISCAL_SIDECAR_URL/SECRET`                         |

---

## 4. Mapa operacional — tudo que existe e onde está

### 4.1 Repositório

`CONFIRMADO`:

- **Canônico:** `https://github.com/spiesdan/nexus.git` — é o **único remote**,
  repo **público**, `fork: false`.
- **Nome do remote:** na máquina local o remote se chama **`nexus`**; na VPS
  ele se chama **`origin`**. Mesmo repositório, nomes diferentes.
- Os remotes `origin` (upstream histórico) e `fork` (espelho legado) foram
  **removidos** em 2026-09-27.
- `gh` está autenticado como **`spiesdan`**.
- Caminho nesta máquina: `C:\Users\Daniel\Documents\wppcrm2\DeskcommCRM`.

### 4.2 Estrutura que importa para operação

| Path                                                                                              | O quê                                               | Papel no incidente                                 |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| `hostgator-setup-kit/`                                                                            | **o kit inteiro de operação da VPS**                | dono do guard                                      |
| `hostgator-setup-kit/healthcheck.sh`                                                              | diagnóstico da VPS (4 seções)                       | **recebeu a seção "Âncora de versão"**             |
| `hostgator-setup-kit/update.sh`                                                                   | atualiza a VPS (backup + deploy + checagem)         | é o que instalou `v1.21.0`                         |
| `hostgator-setup-kit/install.sh`                                                                  | instalação do zero                                  | chama `healthcheck.sh` na linha 1910               |
| `hostgator-setup-kit/_common.sh`                                                                  | funções compartilhadas do kit                       | `recusar_projeto_de_outra_arvore`, `url_do_schema` |
| `hostgator-setup-kit/backup.sh` / `restore.sh`                                                    | backup e restauração                                | rodados pelo `update.sh`                           |
| `docker-compose.prod.yml`                                                                         | serviços em produção                                | declara as imagens                                 |
| `docker-compose.traefik.yml`                                                                      | labels de roteamento                                | **tem que ir junto no `up -d`**                    |
| `docker-compose.build.yml` / `.oracle.yml` / `.laya.yml` / `.yml`                                 | variações                                           | —                                                  |
| `.env` (**só na VPS**, nunca commitar)                                                            | pins de imagem + secrets                            | **foi editado à mão às 22h15**                     |
| `.env.example`                                                                                    | template — **única fonte de env permitida no repo** | não tem `FISCAL_SIDECAR_*`                         |
| `.changes/*.md`                                                                                   | fragmentos de release                               | consumidos pelo `release.yml`                      |
| `.github/workflows/release.yml`                                                                   | monta a release + taga                              | —                                                  |
| `.github/workflows/publish-image.yml`                                                             | constrói e publica as 3 imagens                     | só roda em tag `v*` ou push na `main`              |
| `.github/workflows/{ci,e2e,perf}.yml`                                                             | os 5 checks obrigatórios                            | —                                                  |
| `tests/unit/namespace-das-imagens.test.ts`                                                        | **ratchet** do namespace                            | novo — impede regressão                            |
| `supabase/baseline.sql`                                                                           | o schema que o self-host aplica                     | migrado na release                                 |
| `supabase/migrations/` + `MANIFEST.md`                                                            | migrations versionadas                              | —                                                  |
| `app/app/notas/page.tsx`                                                                          | rota + abas + permissões                            | analisado, inalterado                              |
| `app/app/notas/_components/GradeNotas.tsx`                                                        | grade + barra de ferramentas                        | **corrigido**                                      |
| `app/app/notas/_components/{EmitirNota,AcoesFiscais,SpedFiscal,ConfigFiscal,EntradasFiscais}.tsx` | as outras telas da NF-e                             | —                                                  |
| `lib/navigation/registry.ts`                                                                      | itens da sidebar (`group: "fiscal"`)                | verificado, inalterado                             |
| `lib/auth/types.ts`                                                                               | `ROLE_RANK` (viewer 1 → admin 5)                    | usado no diagnóstico                               |
| `lib/fiscal/provedor.ts`                                                                          | `ProvedorEscolhido`, `resolverProvedor`             | fica em `stub`                                     |
| `lib/fiscal/entrada.ts`                                                                           | lê `FISCAL_SIDECAR_URL/SECRET`                      | sem env → stub                                     |
| `fiscal/sidecar/`                                                                                 | sidecar sped-nfe (**manual**, fora do compose)      | **nunca executado**                                |
| `CHANGELOG.md`                                                                                    | tela de produto, lida pelo dono da VPS              | editado pelo release                               |
| `AGENTS.md` / `CLAUDE.md` / `README.md`                                                           | contrato, doutrina, produto                         | —                                                  |

### 4.3 Diretórios sensíveis (não edite por descuido)

- `supabase/baseline.sql` — é o que `install.sh`/`update.sh` aplicam. Toda
  mudança de schema precisa aparecer aqui **como apêndice idempotente**.
- `supabase/migrations/*.sql` **já aplicadas** — nunca edite; crie migration nova.
- `.env*` — não abra, não copie valor, não logue. Só `.env.example` é template.
- `lib/database.types.ts`, `pnpm-lock.yaml`, `next-env.d.ts`, `.next/` —
  **gerados, não editar à mão**.

---

## 5. Containers e imagens

### 5.1 Serviços (`docker-compose.prod.yml`)

`CONFIRMADO` — serviços e imagens declaradas:

| Serviço     | Imagem                                                     | Papel                                   |
| ----------- | ---------------------------------------------------------- | --------------------------------------- |
| `app`       | `${APP_IMAGE:-ghcr.io/spiesdan/deskcommcrm:stable}`        | Next.js (UI + API)                      |
| `worker`    | `${WORKER_IMAGE:-ghcr.io/spiesdan/deskcomm-worker:stable}` | workers de `event_log` + crons          |
| `scheduler` | `${SCHEDULER_IMAGE:-.../deskcomm-scheduler:stable}`        | agenda o `fiscal-drain` etc.            |
| `waha`      | `devlikeapro/waha:latest-2026.7.2`                         | WhatsApp (pinned, **nunca republicar**) |
| `redis`     | `redis:7-alpine`                                           | fila/cache                              |
| `srh`       | `hiett/serverless-redis-http@sha256:5b0bb92...`            | HTTP do Redis, **pinned por digest**    |
| `caddy`     | `caddy:2-alpine`                                           | proxy/TLS                               |

Volumes: `waha-data`, `waha-media`, `caddy-data`, `caddy-config`.
Rede: `internal`.

### 5.2 Nomes dos containers na VPS

`crm-app-1` · `crm-worker-1` · `crm-scheduler-1` · `crm-caddy-1` ·
`crm-waha-1` · `crm-redis-1` · `crm-srh-1` · `crm-laya-1`

### 5.3 Regras de packaging (não-negociáveis, de `AGENTS.md`)

- **Nenhum serviço constrói na máquina do cliente.** Todo serviço declara
  `image:`; `build:` só como escape ao lado.
- **Publicação é ato do CI**, nunca da sua máquina (build ARM local não roda na
  VPS amd64).
- Instalação aponta para **número de versão**, nunca para tag móvel.
  `latest` = topo da `main`; quem quer release usa `stable`; **nós usamos tag
  numérica fixa** (`1.21.0`).
- Dependência upstream referenciada com **tag fixa** (WAHA é licenciado).
- **Bump de versão não pode exigir que o operador edite arquivo à mão.**
- Gate: `pnpm test:shell`.

### 5.4 O cuidado com o `up -d`

Todo `up -d` leva os **dois** arquivos:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml \
  --env-file .env up -d app
```

Esquecer o segundo `-f` recria o container **sem labels** → o proxy deixa de
enxergá-lo → **domínio inteiro 404 com container `healthy`**.

---

## 6. A VPS — acesso, caminhos, o que roda lá

`CONFIRMADO`:

| Item               | Valor                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ |
| Host               | **IP fora do repo (é público) — peça ao dono ou veja em `~/.ssh/config`**    |
| Usuário            | `root`                                                                                     |
| Alias SSH          | **`vps`** (já configurado nesta máquina)                                                   |
| Caminho do projeto | `/var/www/crm`                                                                             |
| Nome do remote lá  | `origin` (mesmo repo do `nexus` local)                                                     |
| Arquivo de config  | `/var/www/crm/.env` — **3 imagens pinadas + todos os secrets**                             |
| Agente do host     | reporta erros no log; **só registra falhas**, então log parado = problema antigo, não novo |

### 6.1 Acesso SSH desta máquina

- `ssh vps` funciona — autentica pela chave **`id_ed25519`**.
- **`ssh git@github.com` NÃO funciona** (`Permission denied (publickey)`).
  A mesma chave só serve para a VPS. Por isso **todos os remotes são `https`**.
- Para passar arquivo para a VPS: **`scp arquivo vps:/tmp/...`** (nunca pipe
  interativo de script via `ssh` — quebra).

### 6.2 Comandos de verificação na VPS

```bash
# versão real em execução
ssh vps "cd /var/www/crm && git describe --tags --always && grep -E 'IMAGE' .env"

# containers e saúde
ssh vps "docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'"

# imagem de fato do app (id + quando foi criada)
ssh vps "docker inspect crm-app-1 --format 'image={{.Config.Image}} id={{.Image}} criado={{.Created}}'"

# histórico do que foi feito no repo da VPS (a prova de quem mudou o quê)
ssh vps "cd /var/www/crm && git reflog -25 --date=iso"

# diagnóstico completo (usa o guard novo)
ssh vps "cd /var/www/crm && bash hostgator-setup-kit/healthcheck.sh"
```

---

## 7. Como editar o projeto de qualquer máquina

### 7.1 Pré-requisitos

`CONFIRMADO` em `package.json`:

| Item        | Valor                                                |
| ----------- | ---------------------------------------------------- |
| Node        | **≥ 22** (`.nvmrc` = 22)                             |
| Gerenciador | **pnpm 9.15.9** (`packageManager`)                   |
| Git         | qualquer versão moderna                              |
| Docker      | necessário **apenas** para `test:db` e `test:e2e`    |
| `gh`        | opcional, mas necessário para abrir PR/rodar release |

### 7.2 Primeira vez numa máquina nova (MacBook ou PC)

```bash
# 1. clonar — HTTPS sempre (a chave SSH não serve pro GitHub)
git clone https://github.com/spiesdan/nexus.git
cd nexus

# 2. instalar
corepack enable
pnpm install

# 3. validar que a árvore está saudável ANTES de qualquer edição
git status -sb          # deve dizer: ## main...nexus/main (sem diferença)
git remote -v           # DEVE mostrar APENAS "nexus"

# 4. validar o código
pnpm typecheck
pnpm lint
pnpm test:unit
```

Se `git status -sb` mostrar `ahead`/`behind`, **pare e sincronize** (§8.3).

### 7.3 Comandos de validação

| Comando                                     | O que prova                                | Requisito                       |
| ------------------------------------------- | ------------------------------------------ | ------------------------------- |
| `pnpm typecheck`                            | tipos                                      | —                               |
| `pnpm lint`                                 | 0 erros (warnings pré-existentes são ~355) | —                               |
| `pnpm test:unit`                            | unitários                                  | —                               |
| `pnpm format`                               | prettier em tudo                           | —                               |
| `pnpm format:check`                         | formatação ok                              | —                               |
| `pnpm test:db`                              | invariantes de RLS/banco                   | **Docker**                      |
| `pnpm test:e2e`                             | jornadas Playwright                        | **app rodando + banco semeado** |
| `pnpm test:shell`                           | o kit de operação                          | —                               |
| `pnpm gov:verify`                           | `typecheck + lint + test:unit`             | —                               |
| `pnpm lint:channels`, `pnpm lint:role-rank` | verificações extras                        | —                               |

> **`gov:verify` NÃO cobre `test:db` nem `test:e2e`.** Se a mudança toca schema,
> RLS ou UI, rode os dois você mesmo. Ver `docs/harness-audit.md`.

### 7.4 Os 5 checks obrigatórios

`verify` · `build-and-size` · `invariants` · `e2e` · `imagens-ok`

São a _branch protection_ da `main`. **Nenhum PR merge sem os cinco verdes.**
(`e2e` em PR prova a suíte **smoke**; `push` na main prova **critical**;
`schedule`/manual prova **full**.)

---

## 8. O fluxo Git que evita divergência (a regra)

**A escolha: _trunk-based com branch curta + PR obrigatório + rotina de
sincronia_.** Foi a decisão tomada aqui, porque o incidente não veio de um bug —
veio de **estado do repositório fora de controle** (branch local velha, dois
remotes, reset para `origin/main`, `.env` editado à mão). Nenhuma ferramenta de
merge resolve isso; só disciplina de estado, com comando para conferir.

### 8.1 As 10 regras

1. **`main` é a única fonte de verdade e sempre está publicável.**
2. **Nunca se edita `main` direto.** Toda mudança = branch curta criada **de
   `main` atualizado**.
3. **Antes de qualquer trabalho**, rode a rotina de sincronia (§8.3). Se ela
   acusar diferença, resolva **antes** de escrever código.
4. **Commit cedo, commit pequeno.** Nunca deixe trabalho sem commit por horas.
5. **Nunca use `git commit --amend` num commit que falhou.** Faça um commit
   novo. (`--amend` só num commit **local não empurrado**, quando for de
   propósito.)
6. **Push sempre para `nexus`.** Nunca crie um segundo remote.
7. **Nunca trabalhe com dois remotes apontando para a mesma URL.** Se existir,
   apague a ref errada e refaça no `nexus` — não conserte com push duplo.
8. **Delete a branch depois do merge.** Branch parada no seu disco é a causa
   nº 1 de "essa branch está 239 commits atrás".
9. **Nunca faça `checkout`/`reset` de branch aleatória na VPS.** A VPS só
   recebe tag publicada, via `update.sh`.
10. **Nunca edite `.env` à mão.** Versão só muda via `update.sh` (ou
    `--to <tag>`).

### 8.2 Ciclo de uma alteração

```bash
# 0. sincronizar (SEMPRE)
git fetch nexus
git checkout main
git pull --ff-only nexus main
git status -sb                     # precisa dizer: ## main...nexus/main

# 1. branch curta e descritiva
git checkout -b fix/nome-curto-da-mudanca

# 2. editar + validar
pnpm typecheck && pnpm lint && pnpm test:unit

# 3. commit (mensagem no padrão do repo: tipo(escopo): assunto)
git add -A
git commit -m "fix(notas): barra de ferramentas visivel sem nota"

# 4. conferir o que você vai subir — antes do push, sempre
git status -sb
git diff --stat
git log --oneline -5

# 5. push para o repo canônico
git push nexus fix/nome-curto-da-mudanca

# 6. abrir o PR e esperar os 5 checks
gh pr create --base main --title "fix(notas): barra de ferramentas visivel sem nota" \
  --body "O que muda, por quê, e como foi validado."

# 7. merge SÓ com os 5 checks verdes
gh pr merge --merge

# 8. limpar
git checkout main && git pull --ff-only nexus main
git branch -d fix/nome-curto-da-mudanca
```

### 8.3 Rotina de sincronia (rode antes e depois de cada sessão)

```bash
git fetch nexus
git status -sb            # "main...nexus/main" sem ahead/behind = OK
git remote -v             # EXATAMENTE UM remote, chamado "nexus"
git branch                # idealmente só "main"
git log --oneline -3
```

**Sinais de problema e o que fazer:**

| Sintoma                  | Diagnóstico                   | Ação                                                                        |
| ------------------------ | ----------------------------- | --------------------------------------------------------------------------- |
| `ahead N`                | commits locais não subidos    | `git push nexus main` (se foram revisados) ou `git reset --hard nexus/main` |
| `behind N`               | desatualizado                 | `git pull --ff-only nexus main`                                             |
| dois remotes             | **a causa nº 1 do incidente** | `git remote remove <sobrando>`                                              |
| branch local velha       | risco de checkout errado      | `git branch -d <branch>`                                                    |
| `HEAD` solto numa branch | não está em release           | `git checkout main`                                                         |
| `git pull` pede merge    | histórico divergido           | **não** faça merge; `git reset --hard nexus/main` e refaça a branch         |

> **Regra de ouro:** se `git status` não está limpo e alinhado, **não comece a
> trabalhar**. Toda divergência encontrada aqui vale mais resolvida agora do
> que depois do merge.

### 8.4 Sobre o `git reset`

O incidente envolveu `git reset origin/main` feito por terceiros. `reset` não é
proibido, mas:

- **Nunca** `reset --hard` com trabalho não commitado (`git stash` antes).
- **Nunca** na VPS.
- Prefira `git pull --ff-only` — ele **recusa** em vez de reescrever histórico.

---

## 9. Como validar uma alteração

Ordem obrigatória (a mesma de `AGENTS.md`):

1. `pnpm typecheck` e `pnpm lint` **zerados**.
2. `pnpm test:unit` verde.
3. Tocou schema/RLS/tabela tenant-aware → **`pnpm test:db`** (precisa Docker).
4. Tocou UI ou fluxo de usuário → **`pnpm test:e2e` com evidência visual**.
   **`curl` não conta como prova de UX.**
5. Mudou schema → **migration versionada + apêndice em
   `supabase/baseline.sql` + linha em `supabase/migrations/MANIFEST.md`** — os
   três juntos.
6. Criou função em `public` → `revoke execute ... from public, anon;` e depois
   `grant` só a quem precisa.
7. Tocou `Dockerfile*` / `docker-compose*` / `hostgator-setup-kit/` →
   **`pnpm test:shell`**.
8. Mudou UI → **prova visual** (print do estado novo).

---

## 10. Como publicar uma versão (release)

**NUNCA rode `pnpm release:cortar` localmente.** A liberação é sempre pelo
caminho oficial.

### 10.1 Passo 1 — criar o fragmento

Crie `.changes/<slug-do-que-mudou>.md` com front-matter YAML:

```markdown
---
impacto: capacidade_nova # ou: correcao, quebra, manutencao...
secao: adicionado # adicionado | corrigido | alterado | removido
titulo: O healthcheck confere se a versão está bem fixada
---

Texto em PT-BR explicando o que mudou, por quê e — quando fizer sentido —
o que foi medido e em quando.
```

- Um fragmento **por mudança**. O release os consome e apaga.
- O `CHANGELOG.md` é **gerado** a partir deles — não edite à mão.

### 10.2 Passo 2 — disparar o workflow

```bash
gh workflow run release.yml --ref main
```

Ele calcula o número da próxima versão, monta a seção do `CHANGELOG.md`, apaga
os fragmentos e **abre um PR de release** (ex.: `release/1.21.0`).

### 10.3 Passo 3 — esperar os 5 checks e mergear

```bash
gh pr checks          # verify, build-and-size, invariants, e2e, imagens-ok
gh pr merge --merge   # SÓ quando os cinco estiverem verdes
```

### 10.4 Passo 4 — o que acontece sozinho depois do merge

O push na `main` dispara o `release.yml` (job `push`): ele detecta que foi um
corte de release, **cria e empurra a tag `v*`**, publica a release no GitHub e
confere se **as três imagens existem**. A tag dispara o `publish-image.yml`,
que constrói e publica as 3 imagens.

### 10.5 Passo 5 — conferir

```bash
git ls-remote --tags --refs nexus 'refs/tags/v*' \
  | sed 's#.*refs/tags/v##' | awk '!/-/' | sort -V | tail -1

gh run list --limit 5        # publish-image deve estar "completed/success"
```

---

## 11. Como atualizar a VPS

**Um comando só**, pensado para quem não é técnico:

```bash
ssh vps "cd /var/www/crm && bash hostgator-setup-kit/update.sh"
```

O que ele faz, nesta ordem (`CONFIRMADO` — as `step` reais do script):

| #   | `step`                                        | O que acontece                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —   | _(pré-checks)_                                | recusa projeto de **outra árvore** (`recusar_projeto_de_outra_arvore` em `_common.sh`) — evita que uma segunda cópia recrie o parque com o `.env` dela; foi o que deixou o WhatsApp 3 dias em `401`. Liga também o **agente da tela antes** de qualquer decisão de versão (é o que faz o bootstrap ter fim) |
| 1   | `Procurando atualizações`                     | descobre a tag mais recente publicada                                                                                                                                                                                                                                                                       |
| 2   | `Baixando o código novo`                      | git na VPS                                                                                                                                                                                                                                                                                                  |
| 3   | `Atualizando o banco de dados`                | aplica `baseline.sql` + migrations                                                                                                                                                                                                                                                                          |
| 4   | `Baixando a versão nova do app e reiniciando` | pull das 3 imagens + `up -d`                                                                                                                                                                                                                                                                                |
| 5   | `Conferindo se o app voltou no ar`            | healthcheck                                                                                                                                                                                                                                                                                                 |
| 6   | `Conferindo as automações`                    | scheduler/crons                                                                                                                                                                                                                                                                                             |

Além disso ele faz **backup automático antes** e roda o `healthcheck.sh`
(depois) — a seção **"Âncora de versão"** entra aí.

Flags:

| Flag            | Efeito                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `--force`       | instala a versão pedida **mesmo que seja igual ou anterior** — é o jeito explícito de **voltar no tempo** |
| `--skip-backup` | pula o backup (não recomendado)                                                                           |
| `--to <tag>`    | instala **essa** tag em vez da mais recente publicada                                                     |

Exemplos:

```bash
# atualizar para a última release publicada
ssh vps "cd /var/www/crm && bash hostgator-setup-kit/update.sh"

# ir para uma versão específica
ssh vps "cd /var/www/crm && bash hostgator-setup-kit/update.sh --to 1.21.0"

# voltar no tempo (forçando, pois é para trás)
ssh vps "cd /var/www/crm && bash hostgator-setup-kit/update.sh --force --to 1.20.0"
```

> **Nota de incidente:** uma rollback _só_ devolve comportamento se a versão
> destino tiver **código diferente**. Antes de rodar `--force --to X`, confira
> com `git diff X Y -- <caminho>` se o que você quer de volta realmente mudou
> entre as duas. No caso da NF-e, `v1.20.0 → v1.21.0` era idêntico, então
> nenhuma rollback resolveria — o problema era dado, não versão (§2).

---

## 12. Como conferir que não houve drift de versão

### 12.1 O guard

`hostgator-setup-kit/healthcheck.sh` tem hoje **4 seções**:

1. `Containers`
2. `Saúde interna do app (/api/v1/health)`
3. `Atualização pela tela (agente do host)`
4. **`Âncora de versão (drift)`** ← a nova

A seção 4 faz **5 checagens**:

| #   | Checagem                                                                      | O que pega                                   |
| --- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | tag da imagem no `.env` é fixa (`v[0-9]*` ou `[0-9]*`) e igual ao canal móvel | `.env` virou `:main` / `:latest` / `:stable` |
| 2   | as **três** imagens estão na **mesma** tag                                    | uma imagem atualizada e outra não            |
| 3   | existe **branch local** no repo da VPS                                        | alguém fez `checkout` de branch              |
| 4   | existe **mais de um remote**                                                  | dois remotes para a mesma URL                |
| 5   | `HEAD` está numa **tag publicada**                                            | HEAD solto em branch                         |

Padrão de tag: `v[0-9]*|[0-9]*` — tag de **imagem** não leva `v`, tag de **git**
leva.

O guard é **só aviso**: ele **não muda o código de saída**, de propósito —
`install.sh:1910` o chama e a instalação não pode falhar por causa de um aviso.

### 12.2 Ratchet do namespace

`tests/unit/namespace-das-imagens.test.ts`:

- `NAMESPACE_DESTE_REPO = "ghcr.io/spiesdan"` (a única fonte, não espalhada).
- `PERMITIDO` = **só 4 arquivos** podem citar o namespace completo:
  `hostgator-setup-kit/_common.sh`, `docker-compose.prod.yml`,
  `.env.hostgator.example`, o próprio teste.
- `*.md` fica **fora** da varredura (docs podem citar).
- Fora da allowlist → o teste reprova.

> **Cuidado:** esse teste usa `grep`. **Nesta máquina Windows não há `grep` no
> PATH**, então ele falha localmente com `spawnSync grep ENOENT` — é falha
> **ambiental**, não regressão. Rode-o no CI ou via WSL (§15.1).

### 12.3 Conferência manual rápida

```bash
ssh vps "cd /var/www/crm && bash hostgator-setup-kit/healthcheck.sh"
```

Tem que sair verde em `imagem fixada na tag X.Y.Z`, `nenhuma branch local`,
`um remote apenas` e `HEAD solto na tag v...`.

---

## 13. Diagnóstico da página de NF-e (o caso concreto)

### 13.1 Como a página funciona

`app/app/notas/page.tsx`:

```ts
const ABAS = ["notas", "entradas", "emitir", "acoes", "sped", "config"] as const;
// emitir / acoes  → exigem rank >= agent   (podeEmitir)
// config          → exigem rank >= manager (podeConfigurar)
// sped            → exigem agent || manager
// notas / entradas→ sempre

const podeEmitir = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;
```

`ROLE_RANK` (`lib/auth/types.ts`): `viewer 1 · agent 2 · ai_operator 3 ·
manager 4 · admin 5`.

### 13.2 Sidebar

Item em `lib/navigation/registry.ts:481-489` — `href: "/app/notas"`,
`group: "fiscal"`, `sidebar: true`. **Inalterado** entre as versões.

### 13.3 O bug (corrigido)

Ver §2.2. Resumo: a barra de ferramentas dependia de `inicial.length > 0`, ou
seja, **existir ao menos uma nota fiscal**. Sem notas → sumia tudo.

### 13.4 Estado fiscal real da produção

`CONFIRMADO` medido no banco de produção (project ref no `.env` da VPS):

| Tabela            | Linhas |
| ----------------- | ------ |
| `fiscal_settings` | **0**  |
| `invoices`        | **0**  |
| `fiscal_events`   | **0**  |
| `fiscal_entradas` | **0**  |
| `fiscal_jobs`     | **0**  |

Consequências:

- `resolverProvedor()` (`lib/fiscal/provedor.ts:74`) só sai do **`stub`** se
  `fiscal_settings.provedor === "spednfe"` → hoje a UI mostra _"Sem emissor
  fiscal configurado — suba o sidecar sped-nfe…"_ (**estado esperado**).
- `lib/fiscal/entrada.ts:57-75` lê `FISCAL_SIDECAR_URL`/`FISCAL_SIDECAR_SECRET`
  — **nenhuma das duas existe** no `.env` da VPS.
- `fiscal/sidecar/` **não está em nenhum `docker-compose*.yml`**; o deploy é
  manual (o próprio README do sidecar diz _"Validação pendente na VPS"_). O
  sidecar **nunca foi executado**.
- `.env.example` do projeto **não tem** `FISCAL_SIDECAR_*` (dívida).
- `fiscal-drain` é agendado por `docker/scheduler/entrypoint.sh:68` (não é
  crontab); o scheduler está rodando.
- **Odivix** é só referência externa de paridade (plugin WordPress, comentários
  no código) — **não está instalado** no site.

### 13.5 Rota `/app/notas`

Responde `307 → /login?next=%2Fapp%2Fnotas` sem sessão (rota existe e o guard
de borda funciona).

---

## 14. Checklists prontos (copie e cole)

### 14.1 Antes de começar a trabalhar

```
[ ] git fetch nexus
[ ] git status -sb         → ## main...nexus/main (sem ahead/behind)
[ ] git remote -v          → EXATAMENTE UM remote, "nexus"
[ ] git branch             → só main
[ ] pnpm install           (se trocou de máquina)
[ ] pnpm typecheck && pnpm lint   → 0 erros
```

### 14.2 Antes do push

```
[ ] pnpm typecheck
[ ] pnpm lint
[ ] pnpm test:unit
[ ] git status -sb          (só os arquivos que você quer)
[ ] git diff --stat         (confira que não levou arquivo errado)
[ ] git log --oneline -5    (mensagem no padrão tipo(escopo): assunto)
[ ] nunca: git add .env, *.zip, dados de cliente, screenshot com dado real
```

### 14.3 Antes do merge do PR

```
[ ] verify            verde
[ ] build-and-size    verde
[ ] invariants        verde
[ ] e2e               verde
[ ] imagens-ok        verde
[ ] migration + baseline + MANIFEST   (se tocou schema)
[ ] pnpm test:db                              (se tocou schema/RLS)
[ ] pnpm test:e2e + prova visual              (se tocou UI)
[ ] pnpm test:shell                           (se tocou o kit/docker)
[ ] fragmento em .changes/                    (se muda produto para o dono)
```

### 14.4 **PENDENTE — trabalho local não commitado**

```
[ ] app/app/notas/_components/GradeNotas.tsx   (modificado)
      → barra de ferramentas movida para fora do condicional
      → typecheck OK · lint 0 erros · prettier aplicado
[ ] commitar numa branch curta, abrir PR, 5 checks, merge
[ ] se for considerado mudança de produto → fragmento .changes/
[ ] depois: release via gh workflow run release.yml --ref main
```

### 14.5 Depois de atualizar a VPS

```
[ ] ssh vps "cd /var/www/crm && bash hostgator-setup-kit/healthcheck.sh"
[ ] as 5 checagens da "Âncora de versão" verdes
[ ] git describe na VPS == a tag esperada
[ ] docker ps: 3 imagens na mesma tag, todos healthy
[ ] site responde 200 e título correto
```

---

## 15. Armadilhas conhecidas desta máquina e deste stack

### 15.1 Windows / shell

| Armadilha                                 | Fato                                          | O que fazer                                                         |
| ----------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| `bash` resolve para **WSL bash**          | caminhos são `/mnt/c/...`                     | use `workdir` ou `cd /mnt/c/...`                                    |
| **Não existe `grep` nem `rg` no Windows** | testes com `grep` dão `spawnSync grep ENOENT` | rode no CI, ou via WSL, ou reescreva com cmdlets                    |
| `Get-Content` sem `-Encoding UTF8`        | **corrompe a exibição** de UTF-8              | use `-Encoding UTF8` — mas **não edite arquivos com `Set-Content`** |
| Pipe para `ssh` quebra scripts            | —                                             | **`scp` o arquivo** para a VPS e rode lá                            |
| Escape de PowerShell                      | `\$`, `^{commit}`, aspas                      | prefira scripts arquivos a strings inline                           |
| Exibição `jǽ` em vez de `já`              | artefato do console                           | o **arquivo** está certo; confirme com `typecheck`/`prettier`       |
| Executável com caminho com espaço         | —                                             | use o call operator `& "caminho\com espaço\exe"`                    |

### 15.2 GitHub / auth

- **`ssh git@github.com` falha** (`Permission denied (publickey)`) — a chave
  `id_ed25519` só serve para a VPS. **Remotes sempre `https`.**
- `gh` autenticado como **`spiesdan`**.
- **`git pull` pode pedir merge** → não mescle: `git reset --hard nexus/main`.

### 15.3 Tempo

Os relógios locais (~11h/12h) são **BRT (UTC−3)**; eventos do GitHub, `reflog`
e logs de container são **UTC**. Diferença de 3h já causou confusão — sempre
converte antes de comparar.

### 15.4 Testes

- `pnpm test:unit` tem **~10 falhas pré-existentes** em 4 arquivos (falta de
  Redis/Docker/grep). Elas são **idênticas com e sem** mudança — verifique com
  `git stash` antes de achar que quebrou algo.
- Docker local indisponível nesta máquina → `test:db` e E2E completos ficam
  bloqueados; rode no CI.
- `curl` **não** conta como prova de UX.

### 15.5 Incidente específico — não repetir

```
NUNCA edite .env na VPS à mão para trocar tag.
NUNCA deixe .env apontando para :main / :latest / :stable em produção.
NUNCA faça checkout/reset de branch aleatória na VPS.
NUNCA crie um segundo remote.
NUNCA use git commit --amend em commit que falhou.
NUNCA rode pnpm release:cortar localmente.
NUNCA assuma que rollback resolve — confira git diff antes.
```

---

## 16. Segredos, acessos e pendências abertas

> **Este seção descreve LOCALIZAÇÃO, nunca VALORES.** Nenhum segredo é escrito
> neste arquivo.

### 16.1 Onde vive o quê

| O quê               | Onde                              | Regra                                       |
| ------------------- | --------------------------------- | ------------------------------------------- |
| Secrets de produção | **só** `/var/www/crm/.env` na VPS | nunca commitar, nunca logar, nunca imprimir |
| Template de env     | `.env.example`                    | único permitido no repo                     |
| Chave SSH da VPS    | `~/.ssh/id_ed25519`               | serve **só** para a VPS                     |
| Sessão do `gh`      | `gh auth status`                  | usuário `spiesdan`                          |
| Senha dos zips      | informada ao usuário em conversa  | **fraca — trocar**                          |

### 16.2 PENDENTE — pendências abertas

```
[ ] REVOGAR o token GitHub (prefixo gho_) — ele foi servido em HTTP aberto
    na rede local. Caminho: GitHub → Settings → Developer settings →
    Personal access tokens → Delete.
[ ] APAGAR %LOCALAPPDATA%\Temp\opencode\wppcrm2-para-mac  (~524 MB)
    e o GITHUB_TOKEN.txt dentro dele (no Mac).
[ ] Trocar a senha dos zips de sessões anteriores — está fraca (a senha não
    é repetida aqui: este repo é público).
[ ] .env.example: adicionar FISCAL_SIDECAR_URL / FISCAL_SIDECAR_SECRET.
[ ] Sidecar sped-nfe: nunca executado na VPS. Para emitir NF-e de verdade
    falta: .pfx do certificado + senha do certificado (só o dono tem),
    subir o sidecar e gravar FISCAL_SIDECAR_URL/SECRET.
[ ] Commitar a correção de GradeNotas.tsx (§14.4).
[ ] Ninguém foi identificado como autor da edição do .env às 22h15 de 05/10.
```

### 16.3 Zips gerados nesta máquina (histórico das sessões)

`wppcrm2.zip`, `wppcrm2-ENV.zip`, `wppcrm2-ACCESS.zip` — senha **fraca, não
repetida aqui de propósito**.
Um servidor HTTP local foi levantado e derrubado; o `.git` de uma cópia foi
podo. Tudo isso é **legado** — se ainda existir, apague.

---

## 17. Glossário

| Termo                | Significado                                                                  |
| -------------------- | ---------------------------------------------------------------------------- |
| **`nexus`**          | o único remote (GitHub `spiesdan/nexus`); na VPS se chama `origin`           |
| **fragmento**        | `.changes/*.md` com front-matter; vira linha do `CHANGELOG.md` no release    |
| **drift**            | versão em produção diferente da esperada / estado do repo fora de controle   |
| **âncora de versão** | a seção 4 do `healthcheck.sh` que detecta drift                              |
| **ratchet**          | teste que só piora para quem viola a regra (allowlist encolhe, nunca cresce) |
| **tag fixa**         | `1.21.0` ou `v1.21.0` — nunca `main`/`latest`/`stable` em produção           |
| **canal móvel**      | `main`, `latest`, `stable` — mudam sozinhos; proibidos no `.env`             |
| **`podeEmitir`**     | flag que libera abas/botões da NF-e (`role >= agent` ou platform admin)      |
| **provedor `stub`**  | emissor fiscal simulado — usado quando não há sidecar configurado            |
| **`update.sh`**      | script único que atualiza a VPS (backup + deploy + healthcheck)              |
| **5 checks**         | `verify`, `build-and-size`, `invariants`, `e2e`, `imagens-ok`                |

---

## Documentos relacionados

| Arquivo                                  | Para quê                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `README.md`                              | o produto: instalação, stack, telas (também `README.en.md`, `README.es.md`) |
| `AGENTS.md`                              | contrato mínimo de qualquer agente de código                                |
| `CLAUDE.md`                              | **doutrina completa e não-negociável** — ler antes de mexer                 |
| `ARCHITECTURE.md` / `docs/architecture/` | arquitetura                                                                 |
| `CONTRIBUTING.md`                        | como contribuir                                                             |
| `docs/doctrine/versionamento.md`         | como o número da versão é decidido                                          |
| `docs/doctrine/packaging.md`             | regras de imagem/compose/kit                                                |
| `docs/runbooks/deploy.md`                | runbook de deploy                                                           |
| `docs/harness-audit.md`                  | o que cada gate realmente cobre                                             |
| `hostgator-setup-kit/README.md`          | o kit da VPS                                                                |
| `fiscal/sidecar/README.md`               | sidecar sped-nfe (manual)                                                   |
| `HANDOFF-*.md`                           | históricos de sessão anteriores                                             |

---

_Documento gerado em 06/10/2026 a partir do estado medido do repositório,
da VPS e do banco. Afirmações marcadas `CONFIRMADO` foram provadas por
comando; as marcadas `PENDENTE` ainda não foram resolvidas._
