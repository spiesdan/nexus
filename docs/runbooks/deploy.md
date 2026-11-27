# Runbook — Deploy em produção (VPS)

O caminho normal de deploy **não constrói nada na VPS**: o CI publica a imagem no
GHCR e a VPS só puxa. Construir localmente é exceção de emergência, e tem custo —
está documentado no fim.

---

## 1. O comando — e por que são DOIS comandos

O deploy não constrói nada na VPS: o CI publica a imagem e a VPS só puxa. Mas
**qual `docker compose` rodar** depende do proxy reverso que a instalação
escolheu, e isso fica gravado no `.env`:

```bash
cd /var/www/crm
grep '^REVERSE_PROXY=' .env        # caddy (padrão) | traefik
```

O `install.sh` decide na instalação (e grava no `.env`): VPS "crua" recebe o
**Caddy do próprio compose**; VPS entregue com um proxy já ocupando 80/443
(Hostinger, Coolify, Dokploy, CapRover…) recebe `REVERSE_PROXY=traefik` e passa a
usar o **proxy da hospedagem**. Os dois caminhos existem, e o script do kit
(`_common.sh` → `dc()`) escolhe sozinho — quem digita à mão precisa saber qual é
o seu.

### 1.1 Caddy do compose (`REVERSE_PROXY=caddy`, o padrão)

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d app
```

O compose sobe o `caddy` nas portas 80/443 com o `Caddyfile` do repositório. Os
erros se distinguem pelo código: `404` é o **app** respondendo "não achei a rota"
(ou um Host que não casa com o `Caddyfile`); `502`/`503` é o Caddy sem alcançar o
`app` — fora da rede `internal` ou caído.

### 1.2 Proxy do host (`REVERSE_PROXY=traefik`)

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml --env-file .env up -d app
```

`docker-compose.traefik.yml` é o ÚNICO lugar que:

- coloca no contêiner `app` as labels de roteamento
  (`traefik.http.routers.nexus.rule=Host(...)`);
- associa o contêiner à rede que o Traefik enxerga (`TRAEFIK_DOCKER_NETWORK`);
- desliga o `caddy` do compose base por profile (senão dois processos brigam
  pela mesma porta).

Rodar só com `-f docker-compose.prod.yml` numa instalação assim recria o
contêiner **sem labels nenhuma**. O Traefik deixa de enxergá-lo e o domínio
passa a responder `404 page not found` — não é erro do Next, é o 404 genérico do
Traefik. A app está no ar, saudável, e inalcançável.

> ⚠️ **Os dois `-f` não são universais.** Numa instalação com o Caddy do compose,
> passar o override aborta o `up` com `network traefik declared as external, but
> could not be found` (medido em 24/10/2026) — e aí o deploy morre no meio, com
> o parque em estado misto. O erro clássico de 2026-08-05 foi o oposto: uma
> instalação **com** Traefik recebeu `up -d` com um `-f` só e o site inteiro
> ficou em 404, healthy no `docker ps`. Cada caminho tem o seu jeito de quebrar.

---

## 2. Verificação pós-deploy (não pule)

`healthy` no `docker ps` **não prova que o site está acessível**: o healthcheck
é um probe TCP interno e passa mesmo com o roteamento quebrado.

**Primeiro, qual proxy esta instalação usa:**

```bash
grep '^REVERSE_PROXY=' .env
docker ps --format '{{.Names}}' | grep -E 'caddy|traefik'   # quem está no ar
```

**Depois, a verificação do caminho certo:**

```bash
# (a) só em REVERSE_PROXY=traefik — as labels existem?
#     O `ps -q` resolve pelo nome do projeto + serviço, não pelo conteúdo do
#     arquivo: com um -f ou com os dois devolve o MESMO contêiner (medido).
#     Quem precisa dos dois é o `up -d`, não esta consulta.
docker inspect "$(docker compose -f docker-compose.prod.yml ps -q app)" \
  --format '{{.Config.Labels}}' | grep -o 'traefik.enable:[^ ]*'
# esperado: traefik.enable:true   (vazio = roteamento quebrado)

# (b) o domínio responde? vale para os dois caminhos
curl -s -o /dev/null -w "%{http_code}\n" https://<DOMAIN>/
# esperado: 307 (redireciona pro login)
```

Se vier `404`, o conserto depende do proxy:

| instalação | o que o 404 significa | comando |
|---|---|---|
| `REVERSE_PROXY=caddy` | `404` = o app não achou a rota; `502/503` = o Caddy não alcança o app | `docker compose -f docker-compose.prod.yml up -d app caddy` |
| `REVERSE_PROXY=traefik` | labels perdidas (up sem o override) | refaça o `up -d` com os **dois** `-f` do §1.2 |

Se o deploy já quebrou e a pergunta é "como volto", vá direto ao
[§5](#5-rollback-por-tag-de-imagem). Para o retrato da instalação (disco, RAM,
backup, A1, versão, borda), `bash hostgator-setup-kit/saude.sh` — leitura apenas,
seguro a qualquer hora. Ver [`operacao-vps.md`](operacao-vps.md).

---

## 3. Fluxo completo (do código à produção)

```
commit → push → PR → merge na main → CI publica imagem → VPS puxa
```

1. **Commit + push** numa branch de feature. Trabalho que fica só no disco da
   VPS não existe: o CI não o vê, some se a VPS for reconstruída, e é invisível
   pra qualquer outra pessoa.
2. **PR e merge na `main`.** `publish-image.yml` dispara em push na `main` (ou
   tag `v*`) e publica **três** imagens — `nexus`, `nexus-worker` e
   `nexus-scheduler` — sempre na mesma versão. O build pesado roda nos
   runners do GitHub, nunca na VPS do usuário.
3. **Deploy na VPS.** Numa instalação real isto é `bash hostgator-setup-kit/update.sh`,
   não um `up -d` na mão: ele puxa a tag publicada, re-aplica o `baseline.sql`,
   faz backup antes e grava as três imagens no `.env`.

> **`latest` não é a última release.** Ele é publicado a partir da branch default, então
> segue o **topo da `main`** — código ainda não lançado. Quem quer a última release usa
> `stable`; quem opera um cliente usa o número da versão. Ver
> [`../doctrine/packaging.md`](../doctrine/packaging.md).

---

## 4. Exceção: imagem construída na VPS

Só quando é preciso validar algo em produção **antes** de a imagem oficial
existir (ex.: CI ainda rodando e um bug bloqueando o usuário).

```bash
APP_IMAGE=nexus-app:local docker compose \
  -f docker-compose.prod.yml -f docker-compose.build.yml --env-file .env build app

# O `-f docker-compose.traefik.yml` NÃO entra numa instalação servida pelo
# `caddy` do próprio compose. Ele declara a rede `traefik` como externa; numa
# VPS que não tem essa rede o `up` aborta com "network traefik declared as
# external, but could not be found" (medido em 24/10/2026). Quem está atrás de
# um Traefik externo passa os dois; quem usa o Caddy do compose passa só estes.
APP_IMAGE=nexus-app:local docker compose \
  -f docker-compose.prod.yml -f docker-compose.build.yml --env-file .env up -d app
```

O `docker-compose.build.yml` também cobre `worker` e `scheduler` — troque
`app` pelo serviço que você precisa construir. Eles têm `build:` no próprio
compose de produção (é o escape que faz a instalação sobreviver a um registry
fora do ar), mas é o override que traz o `pull_policy: never`; sem ele o
`up -d` volta a buscar a imagem publicada.

### Instalação que NÃO alcança o GHCR — use o script

Quando a instalação **não tem credencial do registry** (é o caso da VPS de
`crm.billhigiene.tech`), o caminho não é decorar os comandos acima: é

```bash
scripts/deploy-build-local.sh <sha-da-main>
```

Ele faz checkout do commit, etiqueta as seis imagens no `.env`, constrói com
`COMPOSE_PARALLEL_LIMIT=1`, sobe e **só termina com rc 0 se os seis serviços
fecharem `healthy`**. O que ele carrega e que os comandos à mão não carregam:

- **piso de memória** antes do build — aborta no começo, não no meio;
- **rollback do `.env`** se qualquer passo falhar (as tags são gravadas antes do
  build, então um build quebrado deixaria o `.env` apontando para imagem
  inexistente e o próximo `up -d` falharia);
- **recusa em rodar com alteração não commitada** (`NEXUS_FORCE=1` descarta) —
  `git checkout -f` apaga hotfix de plantão sem perguntar;
- **`docker-compose.traefik.yml` fora do `up`** por padrão; quem tem Traefik
  externo passa `NEXUS_TRAEFIK=1`.

Antes de 2026-10-24 este script vivia só em `/root`, fora do git — o mesmo
problema que ele corrige: conhecimento que some quando a máquina é
reconstruída.

**Isto é dívida, não um caminho paralelo.** A imagem existe só no disco daquela
VPS: não está no registry, não está no git, e qualquer `docker compose up -d`
sem `APP_PULL_POLICY=never` a substitui pela do GHCR — silenciosamente, sem erro
nenhum, revertendo o que você acabou de subir.

Requisitos: >= 4 GB de RAM **ou** swap (medido: ~4min num VPS de 3.8 GB com 4 GB
de swap) — e isto é o requisito **deste caminho de exceção**, não da operação
normal.

A régua de operação é outra, e não mudou. Ela tem três parcelas, e **duas
são medidas e uma é herdada** — a distinção importa porque a herdada é a que
costuma ser citada como se fosse nossa:

| parcela | estado | como conferir |
|---|---|---|
| 7 contêineres | **medido** | `docker compose -f docker-compose.prod.yml config --services \| wc -l` |
| `mem_limit` somando 2560m (app 768 + worker 512 + waha 1280) | **medido** | `grep -n 'mem_limit' docker-compose.prod.yml` |
| ~150 MB por número de WhatsApp | **herdado do upstream WAHA**, nunca medido neste projeto | `docker stats --no-stream` na sua VPS |

O terceiro número vem de `docs/research/reference-synthesis.md` (síntese do curso
WAHA, 2026-05), não de uma medição nossa — e circula em sete documentos que se
citam entre si. Uma medição pontual na produção do projeto (2026-08-14, **uma**
sessão pareada, VPS compartilhada com outras stacks) deu **304,5 MiB no contêiner
`waha` inteiro**, contra o `mem_limit` de 1280 MiB. Um ponto não decompõe baseline
e sessão: para isso seriam necessários dois números pareados, e não é ensaio que
se faça numa instalação viva.

> **Construir com a stack no ar derruba a stack — medido, não temido.** Em
> 24/10/2026, numa VPS de 8 GB com os contêineres do CRM e o Supabase rodando,
> o build das seis imagens levou a máquina ao OOM: **11 processos mortos pelo
> kernel**, entre eles `supabase_realtime` (**17 restarts**) e
> `supabase_analytics`. O sintoma que ninguém vê olhando o `docker ps`: o Inbox
> para de receber evento em tempo real enquanto o build roda.
>
> Duas medidas resolvem, e quem constrói na VPS deve carregar as duas:
> `COMPOSE_PARALLEL_LIMIT=1` (um serviço por vez — em paralelo, dois
> `next build`/`tsc` pedem ~2–3 GB cada) e **swap**: 4 GB de swapfile com
> `vm.swappiness=10` deram a folga que faltava. Sem swap e sem serializar,
> construir com a instalação atendendo gente é decisão consciente — faça
> backup, avise quem opera e prefira janela de manutenção. O caminho normal
> (imagem publicada pelo CI) não tem esse risco: o build não roda aqui.

**Nada disso mexe no tier recomendado.** A régua que sustenta os 4 GB é a soma da
stack em operação, não o WAHA isolado — e a folga existe justamente porque a
parcela por sessão não é conhecida com precisão.

Ao terminar, feche o ciclo — merge na `main` e volte a VPS pra imagem oficial.

## O que o `scripts/deploy.sh` faz com o schema

O deploy aplica o **`supabase/baseline.sql`** antes de subir os contêineres —
o mesmo arquivo (idempotente) que o `install.sh` e o `update.sh` usam, pela
conexão de schema (`SUPABASE_DB_ADMIN_URL`, com `SUPABASE_DB_URL` como piso).
Não é `supabase db push`: a cadeia de migrations não reproduz o schema
(ver `docs/auditoria/12-migrations-e-rls.md`), e aplicá-la marcaria migrations
como aplicadas num banco parcial.

Depois de aplicar, o script **verifica** objetos que o app usa na primeira tela
(`organizations`, `messages`, `conversations`, `contacts`, `commercial_orders`,
`financial_receivables`, `llm_calls`). Se faltar algum, ou se o `psql` responder
um erro que não seja o ruído esperado de re-aplicação (`already exists`…), o
deploy **para antes do `up -d`** — imagem nova não sobe contra banco sem schema.

Consequência prática para quem opera: o deploy pode ser repetido sem medo (o
baseline é idempotente), e ele falha alto e cedo quando a conexão do `.env` não
é o dono do banco. O gate é `tests/shell/deploy-aplica-schema.test.sh`
(roda no `pnpm test:shell`).

---

## 5. Rollback por tag de imagem

Voltar de versão é **trocar sete tags no `.env` e recriar os contêineres** — nada
de `git checkout` na VPS (o código que roda vem da imagem, não do clone) e nada
de construir de novo.

### 5.1 O que está no ar agora

```bash
cd /var/www/crm
grep -E '^(APP|WORKER|SCHEDULER|FISCAL|MERCOS|OCR|ROTA)_IMAGE=' .env
```

As sete apontam sempre para a **mesma** versão. É essa uniformidade que faz o
rollback ser uma linha de `sed` em vez de sete edições à mão — o `update.sh` já
grava as sete juntas, e é o rollback de `.env` que ele faz quando um passo falha
no meio de uma atualização.

### 5.2 Voltar para uma versão anterior

```bash
# 1) guarde a atual, para poder voltar do rollback
cp .env .env.bak-$(date +%Y%m%d-%H%M%S)

# 2) troque SÓ o número da tag nas sete imagens (ex.: volta de 2.0.17 para 2.0.16)
NOVA=2.0.16
sed -i -E "s#(ghcr\.io/spiesdan/nexus[^:]*:)[0-9]+\.[0-9]+\.[0-9]+#\1${NOVA}#" .env

# 3) confira antes de recriar
grep -E '^(APP|WORKER|SCHEDULER|FISCAL|MERCOS|OCR|ROTA)_IMAGE=' .env

# 4) recrie com os MESMOS -f do deploy — qual é o seu está no §1
#    Caddy do compose (padrão):
docker compose -f docker-compose.prod.yml \
  --env-file .env up -d app worker scheduler fiscal mercos ocr rota
#    Proxy do host (REVERSE_PROXY=traefik):
# docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml \
#   --env-file .env up -d app worker scheduler fiscal mercos ocr rota
```

> O `-f` errado não é neutro: no caminho com Caddy, o override aborta o `up`
> (`network traefik declared as external`); no caminho com Traefik, esquecer o
> override recria o parque **sem labels** e o domínio cai para 404.
>
> O caminho mais curto e o preferido é `bash hostgator-setup-kit/update.sh --to vX.Y.Z --force`:
> ele puxa a tag, faz backup, grava as sete imagens e confere o health — o `--force`
> é o que autoriza descer de versão (sem ele, o script recusa ir para trás).

### 5.3 Provar que voltou

```bash
# a) a versão que responde é a que você pediu
curl -fsS https://<DOMAIN>/api/v1/health
#    → {"status":"healthy","version":"2.0.16",...}

# b) o domínio ainda roteia (404 = labels perdidas)
curl -s -o /dev/null -w "%{http_code}\n" https://<DOMAIN>/
#    → 307

# c) nada unhealthy, nada reiniciando
bash hostgator-setup-kit/saude.sh
```

### 5.4 O limite do rollback: banco

**Rollback de imagem não desfaz migration.** O `update.sh` aplica
`supabase/baseline.sql` (append-only e idempotente) *antes* de subir a versão
nova, e não existe "down". Na prática:

| o que a versão nova fez | rollback de imagem basta? |
|---|---|
| só código (a maioria) | sim |
| coluna/tabela nova, nada removido | sim — a versão antiga ignora o que não conhece |
| coluna removida/renomeada, dado reescrito | **não** — `bash hostgator-setup-kit/restore.sh` com o dump que o `update.sh` fez antes |

Por isso o `update.sh` faz backup antes e aborta se o backup falhar. Rodou com
`--skip-backup`, não há dump *desta* atualização — o restore cai no último backup
que existir. Em produção isso não é hipótese: o `backup.sh` só roda dentro do
`update.sh`, então "o último backup" pode ser de dias antes. Ver
[`operacao-vps.md`](operacao-vps.md).

### 5.5 O que NÃO é rollback

- `docker compose down && up` — derruba o site e sobe a **mesma** versão.
- `APP_IMAGE=...` no shell — o compose lê o `.env`; a variável vale só para aquele
  comando e o próximo `up -d` a desfaz.
- Reverter a `main` no GitHub — não muda a imagem que a VPS já baixou.
- Editar o `compose` à mão — a versão publicada já traz o que ela precisa.
