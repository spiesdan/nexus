# Prompt de continuidade — Expedição / Roteirização (Nexus)

> **Para quem lê isto pela primeira vez:** este documento é um handoff operacional. Ele diz
> onde o trabalho está, o que já foi decidido, o que falta, como testar e quais armadilhas
> deste repositório custam caro. Leia até o fim antes de tocar em código. O documento de
> requisito original é `docs/PROMPT-V5-EXPEDICAO-ROTEIRIZACAO.md` (**mantenha-o untracked** —
> ele é insumo, não entrega).

---

## 0. Contrato de trabalho (não negociável)

- **Idioma:** PT-BR em código (comentários), commits, PRs, CHANGELOG e respostas ao usuário.
- **Não invente regra de negócio.** Se não está escrito em `docs/`, pergunte. Marque o que é
  `CONFIRMADO` (provado por código/medição) e o que é `INFERIDO`.
- **Diagnostique antes de implementar.** Este projeto já foi queimado por "parece que funciona".
- **Deploy nunca constrói na VPS.** Fluxo de release: fragmento → dispatch → PR de release →
  merge → tag → publish das imagens → deploy → health.
- **Leia `CLAUDE.md` (doutrina) e `AGENTS.md`** antes de mexer. O DoD está no `CLAUDE.md`.

### Os cinco invariantes que já causaram incidente neste módulo

1. **Migration = 4 arquivos no mesmo commit:** `supabase/migrations/<ts>_<n>_<nome>.sql` +
   apêndice idempotente em `supabase/baseline.sql` + linha em `supabase/migrations/MANIFEST.md`
   + `lib/database.types.ts` (é gerado, mas é editado à mão aqui quando não há CLI) + **teste de
   RLS em `tests/invariants/rls-isolation.test.ts` com seed positivo**.
2. **Função nova em `public`:** `revoke execute ... from public, anon` **e** `grant` só a quem
   precisa. São duas origens de `EXECUTE`; revogar uma deixa a função exposta como RPC.
3. **`lib/supabase/admin.ts` bypassa RLS:** toda query precisa de `.eq("organization_id", ...)`
   vindo de fonte confiável (cookie/JWT/secret), nunca do body.
4. **Romaneio em PDF não muda.** `lib/comercial/romaneio-pdf.tsx` e `GET .../romaneio` são
   intocados, por pedido explícito do dono do produto. O gate
   `tests/unit/romaneio-nao-muda-com-distribuicao.test.ts` existe para isso.
5. **Nada de `console.log`.** Use `lib/logger.ts`. Nada de `throw` cru na borda: `fail()`/`ok()`
   de `lib/api/wrappers.ts`.

---

## 1. Onde o trabalho está

- **Worktree:** `/Users/bill/.local/share/opencode/worktree/d08597/fix/campanha-clientes`
- **Branch:** `feat/f5-vrptw-servico-python`
- **HEAD:** `7862aa8b` — `docs(geo): destino, runbook e mapa de arquitetura alinhados com a 0308`
- **Remoto único:** `nexus` (`spiesdan/nexus`). `git status -sb` diz `ahead 26, behind 5`:
  `nexus/main` andou; **rebased/merge antes do PR**, e o push da branch é `--force-with-lease`.
- **Árvore suja:** só `?? docs/PROMPT-V5-EXPEDICAO-ROTEIRIZACAO.md` (deve continuar assim).

### Commits desta entrega (do mais antigo ao mais novo)

| Commit | O quê |
|---|---|
| `fcaeac6a` … `36e675d2` | solver OR-Tools, OSRM, contrato, endpoint multi-veículo, cliente TS, migration 0306 |
| `342e4c19` | migration 0307 + frota + distribuição + VRPTW (API/domínio) |
| `df89438c` | tela de distribuição, `/app/frota`, mapa por veículo, filtros da fila |
| `dc65d1c8` | stack geográfica configurável (Nominatim/OSRM) + ADR + runbook |
| `4c8b5958` | fragmento da release + handoff do diagnóstico |
| `e5b9a5c0` | **migration 0308** — destino da entrega com snapshot |
| `7862aa8b` | docs alinhados com a 0308 |

### Gates medidos (e o que ainda não foi medido)

| Gate | Estado |
|---|---|
| `pnpm typecheck` | **verde** depois da 0308 |
| `npx eslint` nos arquivos tocados | **verde** |
| `pnpm test:unit` | **944 arquivos / 10.012 testes verdes + 1 expected fail**, 295 s — rodada **antes** da 0308. Depois dela rodaram verdes apenas os módulos afetados (`destinos` 11, `rota-distribuicao-route` 14, `shipment-orders-route` 7); **falta a rodada completa** |
| `pytest services/rota` | 12 verdes |
| `pnpm test:db` | **verde depois da 0308**: 158 arquivos / 1.480 testes + 1 expected fail, 285 s. Baseline aplicado em modo install **e** update; RLS de `shipment_destinations` com seed positivo passou. Os `ERROR` de `psql` no log são casos negativos esperados (constraints e policies) |
| `pnpm test:shell` | falha **apenas** em `hostgator-setup-kit/test-validators.sh` no caso "nome antigo com apóstrofo", e **só** no bash 3.2 do macOS. Em bash 5 (container) passa — não é regressão. Ver §8 |
| `pnpm test:e2e` | **não rodou**. Falta prova visual da distribuição, da frota e do painel de recuperação |

---

## 2. O que já está pronto (por área, com os arquivos que importam)

### 2.1 VRPTW de verdade (serviço Python isolado)

- `services/rota/` — FastAPI + OR-Tools (`app/solver.py`, `app/contract.py`), matriz OSRM
  (`app/matriz.py`), 12 testes em `services/rota/tests/test_solver.py`.
- Contrato tipado em `lib/expedicao/roteador-vrptw.ts` (Zod); sem ele o app responde 503 — **não
  existe heurística local se passando por OR-Tools**.
- `POST /api/v1/shipments/[id]/rota/otimizar/veiculos` — janelas, capacidade, jornada,
  `chegadas_s`, `restricoes_nao_aplicadas`, `entregas_nao_alocadas`.
- Deploy: `services/rota/Dockerfile`, `docker-compose.prod.yml` (serviço `rota`, sem porta
  publicada), `publish-image.yml`, `IMG_ROTA`/`ROTA_IMAGE` no kit.

### 2.2 Frota e distribuição por veículo

- Migration `0307_distribuicao_por_veiculo`: `shipment_orders.veiculo_id/motorista_id/
  sequencia_veiculo`, `janela_inicio/janela_fim`, `shipments.saida_prevista` e
  `shipment_route_versions` (snapshot imutável, uma `ativa`).
- `/api/v1/fleet` (veículos/motoristas; escrita `manager`, leitura `viewer`) + `/app/frota`.
- `PATCH .../rota/distribuicao`: confirma com **lock otimista** (`versao_base` → 409
  `state_conflict`), reconsulta capacidade/jornada no banco (não confia no body) e recusa o que
  não cabe.
- Tela: painel "Distribuição por veículo", histórico de versões, badge/ETA por parada, uma linha
  de mapa por veículo, filtros por veículo/motorista na fila.
- `shipment_route_versions.veiculos[].paradas_detalhe` guarda destino, coordenada e estado por
  parada (a `paradas: string[]` continua sendo o que o app do motorista lê).

### 2.3 Destino da entrega com snapshot (migration `0308`)

**Este é o conserto do defeito mais grave do prompt (§2).** Até a 0308, endereço e coordenada
vinham do **cadastro do contato**: dois pedidos do mesmo cliente para endereços diferentes
viravam duas paradas na lista e **um pino só**; corrigir um movia o outro, e mudar o cadastro
movia entregas já planejadas.

- `shipment_destinations` — chave `<contact_id|avulso:nome>::<endereço>`, endereço completo,
  lat/lng, `geo_status`, `geo_fonte`, `geo_precisao_m`, `geo_em`.
- `shipment_orders.destination_id` — a parada continua sendo `shipment_orders` (não há entidade
  paralela); o destino é quem carrega endereço e coordenada.
- `lib/rotas/destinos.ts` (domínio puro) + `lib/rotas/destinos-do-banco.ts`
  (`garantirDestinosDosPedidos`, chamado na criação da carga e ao adicionar pedidos).
- Snapshot nasce na inclusão e **não se reescreve**: mudar o endereço de um pedido já embarcado
  cria **outro** destino e reaponta o pedido; a parada antiga fica onde estava
  (`commercial-orders/[id]/route.ts`, depois do update).
- Geocodificação (`.../rota/geocodificar`) e pino manual (`.../rota/manual`) gravam **no
  destino**. `contacts` só é tocado em carga anterior à 0308 (`destination_id` nulo).
- Backfill das cargas abertas na própria migration; carga encerrada não é tocada.
- Testes: `lib/rotas/destinos.test.ts` (11), `tests/unit/shipment-orders-route.test.ts`
  (passou a exigir a gravação do destino), RLS com seed positivo.

### 2.4 Stack geográfica (decisão do dono do produto: custo de licença zero)

Leaflet + OpenStreetMap + Nominatim + OSRM + PostgreSQL, **autohospedáveis**.

- `docs/adr/0002-stack-geografica-osm.md` — decisão, alternativas (MapLibre, Photon/Pelias,
  Google/Mapbox) e o que ela não resolve.
- `docs/runbooks/geodados.md` — subir/atualizar Nominatim e OSRM, apontar o produto, rollback,
  sintoma → causa.
- `GEOCODER_URL`, `GEOCODER_MIN_INTERVALO_MS` (1100 público / 0 próprio), `GEOCODER_UA`;
  `OSRM_URL` já existia. Tudo em `lib/env.ts`, `.env.example`, `.env.hostgator.example` e no
  `envq` do `install.sh` (que também passou a gravar `ROTA_SOLVER_URL`, que faltava).
- `lib/rotas/geocodificacao.ts` lê endpoint e ritmo do ambiente; 5 testes novos.

---

## 3. O que falta do documento de requisitos

Ordenado por risco operacional, não por ordem do documento.

### 3.1 Address Recovery Engine (§ novo — pedido do dono do produto)

Ver §4 abaixo: é o próximo bloco grande de trabalho. **Diagnóstico já feito**, plano já
apresentado, três decisões aguardando resposta (§4.7).

### 3.2 Gate de rota × destino pendente (§7 e §12)

Hoje `otimizar/route.ts:68` e `otimizar/veiculos/route.ts:148` colocam a parada sem coordenada
em `nao_roteirizaveis` e **geram a rota assim mesmo**. O requisito pede "liberar a geração da rota
somente quando os destinos estiverem resolvidos ou devidamente tratados". Mudar isso é mudança
de comportamento: precisa de override explícito e de decisão do dono do produto.

### 3.3 Central de expedição de três áreas (§6.1/§6.3)

Hoje são três páginas: fila (`/app/expedicao`), montagem (`/app/expedicao/nova`) e planejador
(`/app/expedicao/[id]`). O documento pede **esquerda (pedidos/cargas) + centro (mapa) + direita
(planejamento)** na mesma tela, sem navegação entre páginas. É reescrita de página: 4–6 h.
Sugestão: `/_components/` com três painéis e estado compartilhado, reaproveitando `_client.tsx`
e `_roteirizador.tsx` como estão (não reescrever o que funciona).

### 3.4 Restrições hard/soft do solver (§4.1)

Falta do modelo: **veículo fixo por entrega**, **restrição de acesso**, **dependência
coleta→entrega**, **entrega obrigatória/prioritária**, **horário de funcionamento da empresa**,
**ponto final por veículo** (hoje todos voltam à base). Objetivo atual: distância + `span` de
tempo (`dimensao_tempo.SetGlobalSpanCostCoefficient(5)`); não há preferência de motorista/região
nem custo explícito de ociosidade. Regra: **toda restrição não aplicada tem de ser declarada**
em `restricoes_nao_aplicadas` — silêncio é o defeito.

### 3.5 Mapa (§1.1)

Faltam: agrupamento de marcadores próximos (clustering), **selecionar pedidos pelo mapa**,
filtros por motorista/veículo/carga/situação **no mapa** (a fila já tem), diferenciação visual
entre localização confirmada e aproximada (hoje a cor é por situação da entrega) e tempo entre
paradas no painel. O mapa está isolado em `app/app/expedicao/[id]/_mapa-rota.tsx` justamente
para permitir evolução.

**Não troque Leaflet por MapLibre** sem decisão explícita: os comportamentos já pagos com defeito
real (enquadramento em altura 0, arrasto que desliga "seguindo você", popup com ação de entrega,
modo cabine) estão lá. O ADR explica.

### 3.6 OSRM (§1.3)

Default é o **servidor público de demonstração**. Não há uso da **Nearest API** para validar
"o ponto está perto de via roteável" (§3), que é o que pega coordenada em rio/lote vazio. Também
não há perfil de caminhão (restrição de altura/peso) — é trabalho separado e depende de dado que
o OSM pode não ter.

### 3.7 Testes que faltam (§8)

- **E2E/visual** da distribuição, da frota e (depois) do painel de recuperação. Nenhuma spec cobre.
- Teste 2 (mesmo cliente, mesmo endereço) e teste 6 (sequência manual) existem em unitário; 7
  (geometria × marcadores) e 12 (matriz OSRM real) **não**.
- Teste 3 (endereço alterado) agora tem comportamento novo na 0308: falta teste de rota
  (`commercial-orders/[id]`) cobrindo o reapontamento do destino.

---

## 4. IMPLEMENTAÇÃO — Address Recovery Engine

> Requisito do dono do produto. Prioridade declarada: **integridade do destino**. É melhor pedir
> confirmação humana do que mandar uma entrega para o endereço errado.

### 4.1 Diagnóstico do que já existe (medido)

| Peça | Estado |
|---|---|
| `lib/rotas/geocodificacao.ts` | cadeia de **normalização** (exato → abreviação → sem número → sem UF → CEP/município), provedor único (Nominatim), ritmo configurável |
| `classificarResultado` | usa **só o primeiro candidato** e devolve rótulo (`numero`/`rua`/`bairro`/`cidade`). Não compara, não pontua, não mede distância entre provedores |
| `geo_precisao_m` | coluna existe (0308) e **nunca é escrita** |
| Histórico de correção | **não existe** — a linha do destino é sobrescrita; reverter é impossível |
| Photon | **não existe** no código |
| Gate do roteirizador | **não existe** (rota é gerada com pendências) |

### 4.2 Arquitetura proposta

```
lib/rotas/recuperacao/
  normalizar.ts    — reusa expandirAbreviacoes/semHonorifico/parseLinhaEndereco
  similaridade.ts  — Levenshtein + Jaro-Winkler + tokens (zero dependência nova)
  photon.ts        — segundo provedor (PHOTON_URL; vazio = desligado)
  confianca.ts     — score com pesos + REGRAS DURAS
  motor.ts         — as 5 tentativas, timeout por provedor, retry com backoff, orçamento
```

**As 5 tentativas** (ordem do requisito, sem pular etapa):

1. endereço original (exato);
2. normalizado (espaço, acento, abreviação, CEP);
3. correção de digitação (similaridade em rua e município, 1–2 letras);
4. por componentes (rua, número, bairro, cidade, UF separados; CEP como confirmação);
5. provedor alternativo (Photon), comparando com o que o Nominatim devolveu.

**Nunca assumir o primeiro resultado.** Cada candidato é pontuado e comparado com a entrada.

### 4.3 Confiança — regra dura, não só percentual

Componentes do score: similaridade da rua, município, UF, CEP, bairro, número, distância entre
resultados de provedores diferentes, consistência entre componentes.

**Vetos (independentes do score):**
- UF divergente ⇒ **nunca** automático.
- CEP presente e divergente ⇒ **nunca** automático (CEP correto com cidade errada é o caso
  clássico do requisito — o CEP manda).
- Município divergente sem CEP de confirmação ⇒ **nunca** automático.
- Dois provedores apontando para pontos a mais de X km ⇒ intermediário, no mínimo.

**Três estados:**
- **ALTA** — corrige automático, grava histórico com original preservado.
- **INTERMEDIÁRIA** — mostra sugestões, original e marcadores; operador confirma/rejeita/edita.
- **BAIXA** — não altera nada, marca `pendente_correcao`, permite edição manual.

Limiares em env (`RECUPERACAO_LIMIAR_ALTA`, `RECUPERACAO_LIMIAR_INTERMEDIARIA`), com teste que
reprova limiar absurdo (ex.: alta < intermediária).

### 4.4 Schema — migration `0309` (aditiva)

Sobre `shipment_destinations` (0308). **Não** tocar em `contacts` nem em `commercial_orders`.

`shipment_destinations` ganha:
`endereco_original` (o que o vendedor digitou, imutável), `endereco_normalizado`,
`endereco_recuperado`, `recuperacao_status`
(`nao_tentada|encontrado|recuperado|ambiguo|nao_encontrado|erro`), `confianca numeric(4,3)`,
`metodo` (`original|normalizado|digitos|componentes|photon|manual`), `provedor`,
`recuperado_em timestamptz`.

Tabela nova **`shipment_destination_recoveries`** (append-only): `organization_id`,
`destination_id`, `tentativa` (1–5), `provedor`, `consulta`, `candidato jsonb` (endereço, lat,
lng, score), `confianca`, `motivo`, `criado_em`, `criado_por`. RLS: leitura org, escrita agent+,
**sem delete por papel**.

**Reversão** = volta o destino ao `endereco_original` + `nao_tentada` e **acrescenta** linha no
histórico. Nada é apagado.

### 4.5 API

- `POST /api/v1/shipments/[id]/rota/recuperar` — roda o motor no lote dos destinos da carga.
  Idempotente: destino já `recuperado`/`manual` não é reconsultado.
- `POST /api/v1/shipments/[id]/destinos/[destinationId]/confirmar` — aceita o candidato
  (grava endereço recuperado, coordenada, `provedor`, `confianca`, autor).
- `.../rejeitar` — marca `nao_encontrado`, mantém o original.
- `.../reverter` — desfaz uma correção aceita.
- Auditoria: `shipment.rota.recuperada`, `shipment.rota.recuperacao_confirmada`,
  `shipment.rota.recuperacao_rejeitada`, `shipment.rota.recuperacao_revertida`.
- **Isolamento:** toda query com `.eq("organization_id", orgId)` e guarda `requireRole`.

### 4.6 UI

Painel "Recuperação de endereços" no planejador:
contadores (analisados / encontrados / recuperados / aguardando confirmação / não encontrados),
progresso, lista "original → sugerido" com motivo e score, marcadores no mapa para comparar,
ações **confirmar / rejeitar / editar**. Destinos recuperados têm de estar visíveis como
recuperados — correção silenciosa é tão ruim quanto pino errado.

### 4.7 Testes obrigatórios (§10) — com provedores simulados, sem internet

1. endereço correto na 1ª tentativa; 2. erro de uma letra na cidade; 3. erro no nome da rua;
4. CEP correto + cidade errada; 5. sem número; 6. múltiplas correspondências; 7. não encontrado
em nenhum provedor; 8. Nominatim fora do ar; 9. Photon fora do ar; 10. timeout; 11. reprocessar
destino já corrigido (não reconsulta); 12. original preservado; 13. RLS/permissões; 14. reversão;
15. geração de rota após recuperação.

Forma: fixtures JSON em `lib/rotas/recuperacao/__fixtures__/` + `vi.stubGlobal("fetch", ...)`.
O padrão do repo é dublar `fetch` com `vi.stubEnv`/`vi.stubGlobal` — ver
`lib/rotas/geocodificacao.test.ts`.

### 4.8 Observabilidade

`lib/logger.ts` estruturado por tentativa: provedor, consulta (sem dado pessoal), resultado,
score, motivo de rejeição, duração. **Nunca** logar telefone, CPF, e-mail ou o endereço completo
em nível de produção se não for necessário para depurar. Tempo médio de recuperação é métrica de
painel, não `console.log`.

### 4.9 Decisões que dependem do dono do produto

1. **Gate da rota:** recusar otimização com destino pendente (com override) ou manter o
   comportamento atual (gera e lista não-roteirizáveis)?
2. **Photon:** provedor **opcional** (`PHOTON_URL` vazio = desligado, como `OCR_SERVICE_URL`) ou
   obrigatório?
3. **Corte de release:** 1.52.0 com o que está pronto agora e o motor na 1.53.0, ou segurar tudo?

### 4.10 Estimativa

migration+tipos 1–2 h · motor+confiança 4–6 h · API+gate 2–3 h · UI 3–4 h · testes 3–4 h ·
docs/runbook 1 h ⇒ **~2 dias**.

---

## 5. Como testar (com tempos medidos nesta máquina)

```bash
pnpm typecheck                       # ~2 min (NODE_OPTIONS=--max-old-space-size=8192 ajuda)
pnpm lint                            # rápido
pnpm test:unit                       # 944 arquivos / ~10k testes / ~5 min
pnpm test:db                         # PRECISA de Docker; ~5 min (sobe Postgres efêmero,
                                     # aplica baseline em modo install E update, roda invariantes)
pytest services/rota                 # 12 testes, segundos
pnpm test:shell                      # kit de instalação; ver §8 (falso negativo no macOS)
pnpm test:e2e:smoke                  # PRECISA de app rodando + banco semeado
```

**Teste isolado durante o desenvolvimento** (o mais usado):

```bash
npx vitest run lib/rotas/destinos.test.ts tests/unit/rota-distribuicao-route.test.ts
npx eslint <arquivos tocados>
```

**Ordem recomendada depois de cada mudança de schema:**
`typecheck` → testes unitários do módulo → `test:db` → `test:unit` completo → (UI) `test:e2e`.

### Armadilhas que custam tempo

- **`pnpm test:db` não aparece no `gov:verify`.** Verde em `gov:verify` **não** prova schema/RLS.
- **`npx vitest run` sem `--config vitest.db.config.ts` não roda invariantes** — eles são
  excluídos de `test:unit` de propósito.
- **Dublês de Supabase** em `tests/unit/*-route.test.ts` implementam só as cadeias usadas. Ao
  criar tabela nova usada numa rota, o dublê precisa de `upsert`/`from("nova_tabela")`, senão o
  teste passa por acidente ou explode com "não é função" (aconteceu na 0308, ver
  `tests/unit/shipment-orders-route.test.ts`).
- **`useT()` não interpola parâmetros** — use `.replace`. Datas sempre com `useTagDeIdioma()`.
- **`apiClient` tem timeout de 10 s.** Otimização usa `timeoutMs: 90_000`; geocodificação 180 s.
- **OR-Tools:** `AddDimension*` devolve `bool` (use `GetDimensionOrDie`); o índice é do manager
  (`manager.IndexToNode`); demanda por `RegisterUnaryTransitCallback`.
- **`docker compose config` local falha sem `.env`.** Valide YAML com Ruby.
- **Pino no mapa:** `aoClicarMapa` é o callback de arrasto; `chave` da parada é a identidade da
  UI, `destination_id` é a do banco. Não confunda os dois.

---

## 6. Fluxo de release (não improvise)

1. Fragmento em `.changes/<slug>.md` (já existe `.changes/rota-vrptw-servico-python.md`).
2. Disparar o workflow de release (dispatch).
3. **PR de release** gerado pelo bot: revisar (versão, CHANGELOG, fragmento consumido).
4. Merge na `main`.
5. Tag `vX.Y.Z`.
6. Publish das **7 imagens** (`publish-image.yml` — inclui `nexus-rota`).
7. Deploy na VPS **sem build local** (`docker compose ... up -d app rota`, com os **dois**
   arquivos de compose quando houver proxy do cliente — ver `docs/runbooks/deploy.md`).
8. Verificação de health + smoke.

Antes do passo 2: `git remote -v` deve mostrar **só** `nexus`; `git status -sb` deve ter upstream
`nexus/...`; branch rebaseada na `nexus/main`.

---

## 7. Regras de produto já decididas (não reabra sem pedido)

| Decisão | Quem decidiu | Onde está registrado |
|---|---|---|
| Romaneio em PDF **não muda** (veículo/motorista da carga, sem atribuição por parada) | dono do produto | `lib/comercial/romaneio-pdf.tsx` (comentário) + gate |
| Stack geográfica = Leaflet + OSM + Nominatim + OSRM, tudo autohospedável, licença zero | dono do produto | `docs/adr/0002-stack-geografica-osm.md` |
| Destino é o **endereço efetivo do pedido**, com snapshot; cadastro do cliente nunca move entrega planejada | requisito §2 | migration 0308 + `lib/rotas/destinos.ts` |
| Janela de entrega é hora do dia (`time`), não timestamp; sem janela o solver **declara** a restrição não aplicada | implementação | 0307 + `restricoes_nao_aplicadas` |
| Concorrência por `versao_base` + update condicional → 409 `state_conflict` | implementação | `.../rota/distribuicao/route.ts` |
| Escrita de frota exige `manager`; distribuição/otimização `agent`; leitura `viewer` | implementação | `/api/v1/fleet` |

---

## 8. O falso negativo do `pnpm test:shell` no macOS

`hostgator-setup-kit/test-validators.sh` reprova o caso **"nome antigo com apóstrofo"**
(`Sant'Ana` → `Sant"'"Ana`) **somente** no bash 3.2 do macOS, por causa de
`${val//"'\''"/"'"}`, que é um bug conhecido do 3.2. Em bash 5 (container) passa:

```bash
docker run --rm bash:5 bash -c '...'   # reproduz o caso e sai limpo
```

**Não "conserte" reescrevendo o `envq`** — o escape duplo é o que faz o Docker Compose aceitar
apóstrofo. Se for mexer, valide nos dois bashes.

---

## 9. Ordem recomendada de execução

1. **Confirmar os gates** (`test:db` da 0308, `test:unit` completo, `test:e2e:smoke`). Se algo
   falhar, conserta **antes** de acrescentar escopo.
2. **Publicar a 1.52.0** com o que está pronto (VRPTW + frota + distribuição + destino + geo).
3. **Address Recovery Engine** (0309) em branch própria, começando por: migration → `confianca`
   → `motor` com testes simulados → API → UI → E2E.
4. **Gate de rota** junto do motor (é a última milha do §7/§12).
5. **Central de três áreas** e **restrições hard/soft** depois — são outro ciclo.

---

## 10. Definição de pronto (o que eu cobraria de quem continuar)

- [ ] `pnpm typecheck` e `pnpm lint` zerados.
- [ ] `pnpm test:unit` verde (com os testes novos).
- [ ] `pnpm test:db` verde **se tocou schema/RLS**.
- [ ] `pytest services/rota` verde **se tocou o solver**.
- [ ] Migration + baseline + MANIFEST + `database.types.ts` + RLS no **mesmo commit**.
- [ ] Nenhuma correção automática sem histórico e sem regra dura de veto.
- [ ] Endereço original **preservado** e reversível.
- [ ] Romaneio em PDF intocado (gate verde).
- [ ] Prova visual (E2E) se tocou UI.
- [ ] `.changes/` atualizado e compatível com a versão publicada.

---

## 11. Estado final (2026-11-13) — o que foi entregue

O que este handoff pedia está implementado, testado e no PR #420
(`feat/f5-vrptw-servico-python` → `main`). O corte da **1.52.0** é feito pelo
workflow `release` depois do merge; os fragmentos ficam em `.changes/`.

### Entregue nesta rodada

- **Address Recovery Engine** (`lib/rotas/recuperacao/`): 5 tentativas, confiança auditável,
  vetos duros, Photon opcional, original imutável, histórico append-only.
- **Migration 0309** + apêndice no baseline + MANIFEST + `database.types.ts` + seed de RLS.
- **API**: `POST /rota/recuperar`, `GET /rota/recuperacoes`,
  `POST /destinos/[destinationId]/{confirmar,rejeitar,reverter}`.
- **Gate do `otimizar`**: 422 com a lista de pendentes; `ignorar_pendentes` como override
  explícito; destino com pino válido nunca bloqueia (backfill não para carga existente).
- **Painel de recuperação** no planejador (`app/app/expedicao/[id]/_recuperacao.tsx`), com
  original × sugerido, confiança, método, motivo e confirmar/rejeitar/desfazer.
- **Testes**: 17 do motor + 9 das rotas + 4 do gate, com provedores simulados (sem rede).

### Gates medidos nesta máquina

| Gate | Resultado |
|---|---|
| `pnpm typecheck` | zerado |
| `pnpm lint` | 0 erros (472 warnings pré-existentes) |
| `pnpm test:unit` | 10.084 verdes + 1 expected fail; única falha é o caso de DNS de `channel-adapter-zernio.test.ts` (ambiente resolve `zernio.com` para `198.18.1.0`) |
| `pnpm test:db` | verde — 158 arquivos, 1.486 casos, incluindo RLS da tabela nova |
| `pytest services/rota` | não executado (solver não foi tocado nesta rodada) |
| `pnpm test:shell` | não executado (falso negativo conhecido em bash 3.2 do macOS, §8) |
| E2E / prova visual | **não executado aqui** — exige app + banco semeados; o CI roda `e2e` smoke no PR e critical na main |

### O que continua aberto (fora do escopo deste MD)

- **Prova visual** do painel de recuperação em app rodando (o CI smoke não cobre esta tela).
- **Central de expedição de três áreas** (§6.1/§6.3) e **restrições hard/soft do solver**
  (§4.1) — outro ciclo, como já registrado no §3.
- **Observabilidade de painel** (tempo médio de recuperação por provedor): hoje há log
  estruturado por desfecho (`recuperacao.endereco`, `recuperacao.aguardando_confirmacao`,
  `recuperacao.sem_resultado`), sem agregação em tela.

---

## 12. Release 1.52.0 publicada — e o que a estreia do `rota` ensinou

Medido em 2026-11-13, no registro público e nos runs do GitHub Actions.

### O que saiu

| Item | Estado |
|---|---|
| PR #420 (código) | mergeado em `main` @ `5de4a411` |
| PR #421 (release) | mergeado @ `a291fa71` |
| Tag | `v1.52.0` → `26a7f205` |
| `publish-image.yml` (tag) | verde — as 7 imagens publicadas |
| `imagens-ok` / `promover-stable` | verdes |
| `1.52.0` = `1.52` = `stable` | mesmo digest nas 7 (`nexus-rota` incluso) |

Digests da versão (sonda anônima, 13/11):

```console
nexus                  sha256:174af5e9…
nexus-worker           sha256:7cb5d3e3…
nexus-scheduler        sha256:17ce931b…
nexus-fiscal-sidecar   sha256:7557aa1b…
nexus-mercos           sha256:6a241c47…
nexus-ocr              sha256:097b5ea7…
nexus-rota             sha256:eb47847c…
```

### Incidente 1 — `nexus-rota` nasceu PRIVADO (corrigido)

O primeiro release que publicou o solver criou o pacote no GHCR **privado**, como todo
pacote novo nasce. Sintoma medido, sem credencial:

```console
nexus:1.52.0        200
nexus-rota:1.52.0   401 Unauthorized
```

Como o `rota` está no `docker-compose.prod.yml` com `pull_policy: always` e sem profile, o
`docker compose pull` de **toda VPS** falharia nele — e um `pull` que falha aborta a operação
inteira, matando a atualização depois do `git checkout` e do banco. Foi corrigido na
visibilidade do pacote (Package settings → Public) e confirmado por sonda anônima nas sete.

**O gate tinha um buraco:** `imagens-ok` provava que a imagem **existiu**, não que ela é
**baixável sem conta**. Fechado nesta mesma rodada, no mesmo PR deste registro.

### Incidente 2 — build depende do CDN do Google Fonts (ABERTO)

`app/layout.tsx` e `app/design/lib/fonts.ts` usam `next/font/google`, que baixa as fontes
**durante o build**. Em 3 dos 4 builds do app feitos hoje o Turbopack falhou:

```console
Error: Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'
Error while looking up import map: next/font/google queries have exactly one entry
Import trace: [next]/internal/font/google/inter_356056bc.js → ./app/layout.tsx
```

É resposta inesperada do `fonts.googleapis.com` (limite/página de erro) chegando ao
`NextFontGoogleFontFileReplacer`. Não é código desta entrega — o trace é o layout da marca, e
a 1.52.0 não tocou em fonte. Passou por rerun, mas o build segue **não reprodutível**: quem
depende dele (CI, `build-and-size`, imagem Docker) pode reprovar sem que nada tenha mudado.

Correção de verdade, para um PR próprio: trocar as 11 famílias por `next/font/local` com os
arquivos `.woff2` versionados (some a dependência de rede no build; custo: ~15 binários e
prova visual da tipografia). Não foi feito aqui porque exige prova visual que este ambiente
não tem.
