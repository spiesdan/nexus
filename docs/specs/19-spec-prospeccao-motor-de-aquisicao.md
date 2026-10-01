# Spec 19 — Prospecção: motor de aquisição de novos clientes

> **Status:** FASE 1–8 concluídas · FASE 9 (Inbox de prospecção) em andamento.
> **Prompt do dono:** guardado VERBATIM na seção "Prompt original" abaixo.
> **Checklist de fases:** seção "Fases" — marcar `[x]` conforme avança.

---

## Fases

Antes de cada fase: releia o prompt original inteiro (abaixo). A regra de ouro vale
para todas: perguntar ao código existente antes de escrever código novo.

- [x] **FASE 1** — Auditoria do sistema atual (repo, `/app/prospeccao`, componentes,
      APIs, modelos do banco, integrações; o que já existe e deve ser reaproveitado).
- [x] **FASE 2** — Discovery Engine (abstração `DiscoveryProvider`, orquestração
      normalização → dedupe → match → qualificação → score).
- [x] **FASE 3** — Google Places Provider (atrás da abstração; campos mínimos;
      nunca acoplado à UI).
- [x] **FASE 4** — Cache + deduplicação (`DISCOVERY_CACHE_TTL`,
      `ProspectDeduplicationService` com prioridade de identificadores).
- [x] **FASE 5** — Customer matching (cruza com clientes/leads/prospects/oportunidades
      existentes; classificação comercial do prospect).
- [x] **FASE 6** — Nova UX de Prospecção (tela comercial "Encontrar empresas";
      sem termos técnicos na frente).
- [x] **FASE 7** — Mapa + resultados (cards + mapa + preview de marcador; lista é
      modo secundário).
- [x] **FASE 8** — Fila de prospecção (status comerciais; prioridade; vendedor).
- [ ] **FASE 9** — Inbox (reutilizar o Inbox existente; passar contexto do prospect;
      nunca sistema de mensagens novo).
- [ ] **FASE 10** — Campanhas (funil Encontrados → … → Faturamento; não é lista técnica).
- [ ] **FASE 11** — Radar ("quem podemos vender hoje?" com ações).
- [ ] **FASE 12** — Meu Dia (tarefas de prospecção entram em `/app/meu-dia`).
- [ ] **FASE 13** — Usage + Budget + custos (`PlacesUsageManager`,
      `DailyProspectingLimits`, painel de consumo; preços em config, não hardcoded).
- [ ] **FASE 14** — Testes (dedupe, match, cache/TTL, expansion, usage, budget,
      provider, fallback, fila, inbox, score, filtros, permissões).
- [ ] **FASE 15** — Performance e produção (batch, sem N+1, estados de UI,
      mobile, fallback, observabilidade).

### Critérios de aceite globais (antes de dizer "concluído")

- [ ] `pnpm lint` · `pnpm typecheck` · testes relevantes verdes
- [ ] migrations validadas (migration + `supabase/baseline.sql` + `MANIFEST.md`, se houver schema)
- [ ] `pnpm build` (valida o build)
- [ ] APIs validadas (padrão `ok()`/`fail()`, guards, RLS/`organization_id`)
- [ ] permissões validadas
- [ ] integração com Inbox validada de ponta a ponta
- [ ] nenhum segredo no frontend (chave só no backend/env)
- [ ] limite de custo funciona (budget guard bloqueia em 100%)
- [ ] chamadas repetidas usam cache
- [ ] empresas já cadastradas não são duplicadas
- [ ] interface funciona desktop e mobile
- [ ] fluxos críticos funcionando de ponta a ponta (senão, não declarar concluído)

### Decisões que o próprio prompt já dá (não perguntar de novo)

- Google Places é **fonte de descoberta**, não o cérebro; a UI nunca cita Google,
  provider, API key, radius técnico, SKU, billing, cache ou query.
- Abstração `DiscoveryProvider` para múltiplas fontes futuras (OSM, importação, manual).
- Custo é métrica operacional: preço/franquia fica em configuração, nunca hardcoded.
- Mensagem automática é sugestão apresentada antes do envio (salvo automação
  explicitamente autorizada); IA nunca inventa fato.
- Não duplicar entidades: prospect/cliente/lead/conversa/oportunidade/pedido já
  existem no Nexus — a FASE 1 é que decide o que reaproveitar.
- Prisma não existe aqui (stack: Supabase/Postgres) — "analisar o schema" significa
  `supabase/migrations` + `lib/database.types.ts`.

---

## Resultado da FASE 1 — auditoria (2026-10-01)

### Veredito (CONFIRMADO)

O módulo **não parte do zero**: o funil LOCALIZAÇÃO → … → SCORE já existe, roda
em produção e tem testes de lib. Esta spec é **evolução**, não reescrita — a regra
de ouro (§47) aponta para consertar, renomear e conectar; nunca duplicar.

### O que já existe e deve ser reaproveitado

| Etapa do prompt | Onde vive (CONFIRMADO por leitura/grep) |
|---|---|
| Abstração de fonte | `BusinessDiscoveryProvider` (`lib/prospeccao/tipos.ts:59`) + fábrica única `criarProvider()` (`providers/registro.ts:22`) com 3 entradas e metadados p/ UI |
| Google Places (field masks, geocode, cache de busca) | `providers/google-places.ts` (Places API New, field masks explícitas, sem wildcard) |
| OSM / importação manual | `providers/osm.ts` (osm_overpass, grátis) · ponte de arquivo `motor.ts:449 importarNegociosDeArquivo` (provider `maps_arquivo`) |
| Orquestração (fila, grade, ritmo, teto diário, stuck-recovery) | `motor.ts:136 processarTick`, cron `prospecting-drain` (entrypoint + `dev-crons.ts`) |
| Normalização | `lib/prospeccao/normalizacao.ts` (telefone, nome, domínio, endereço, whatsappPotencial) |
| Deduplicação | `dedup.ts decidirDedup` — 5 níveis com prioridade; ingest em lote de 3 queries (`motor.ts:375-403`), corrida de unique vira "duplicada" |
| Score | `score.ts scoreDeProspect` (telefone/WhatsApp/site/nota/avaliações + bônus de categoria) |
| Cruza com CRM | `prospects/route.ts:7,112` — coluna computada `ja_e_cliente` (contact vinculado **ou** match telefone/email com `contacts`) |
| Cache de busca | `searches/route.ts:161-186` — `search_hash` + TTL `cache_ttl_dias` (30d) + flag `forcar` |
| Histórico de buscas | `searches/route.ts` GET (100) + aba "Pesquisas" com progresso/erros |
| Campanhas de descoberta | `prospecting_campaigns` + wizard + `campaigns/[id]/executar` (fan-out por cidade) |
| Fila manual (parcial) | `status_comercial` + dono/vendedor (`_empresas.tsx:112,126`) + ações em lote |
| Importar p/ CRM | `prospects/import` e `import-arquivo` → contacts + lead |
| Inteligência de mercado (base) | `mercado/route.ts` (agregações reais) + aba "Mercado" |
| Custo por busca | `custo_estimado_cents`/`requisicoes` por busca (`motor.ts:303-308`) |
| Item 19 (venda automática/dia) | spec 18 **entregue v1.17.0**: `lib/venda-automatica/**`, `app/api/v1/automatic-sales/**`, cota diária + janela + follow-up — reuso direto nas fases 19/20 daqui |

Tabelas já existentes (migration 0220+): `business_prospects`, `prospecting_searches`,
`prospect_search_results`, `prospecting_campaigns`, `prospecting_settings`.
Rotas: 9 handlers em `app/api/v1/prospecting/**`. UI: 6 abas em `_client.tsx`,
tabela+mapa+drawer em `_empresas.tsx` (909 linhas), Leaflet em `_mapa.tsx`.

### Bugs e obstáculos achados

| # | Achado | Onde | Fase |
|---|---|---|---|
| B1 | "Ver empresas" quebra: manda `?busca=<uuid da busca>` para um campo de **texto** e a aba é incontrolada (não troca para Empresas) | `_client.tsx:330` + abas sem `value` (`:207-212`) | FASE 6 — fechado (abas controladas + `busca_id` novo filtro da rota) |
| B2 | Deep-link não aplica: `filtros` lê a URL, mas o 1º fetch roda `buscar(VAZIOS)` | `_empresas.tsx:100-107` vs `:157-160` | FASE 6 — fechado (1º fetch parte dos valores congelados da URL) |
| B3 | Janela de 50: GET de prospects default `limite=50` e a UI nunca manda `limite`; contagens ("86 oportunidades") saem dessas 50 linhas | `prospects/route.ts:41,69`, `_empresas.tsx:131-155,306-308` | FASE 6 — fechado na janela (UI manda `limite=200` = máximo da API; paginação de verdade fica na FASE 15) |
| B4 | Chave Google resolvida em 3 lugares (drift de comportamento) | `motor.ts:97`, `searches/route.ts:28`, `executar/route.ts:60` | FASE 2 |
| B5 | `executar` ignora o registro: `new GooglePlacesProvider` direto e grava `provider: "google_places"` fixo | `executar/route.ts:15,73,98` | FASE 2 |
| B6 | Fronteira invertida: o motor importa `CUSTO_*` de dentro do provider Google | `motor.ts:21,307` | FASE 2/13 |
| B7 | `maps_browser` (esqueleto) segue nos metadados expostos à UI | `registro.ts:12,50` (rota já rejeita em `searches/route.ts:84`) | FASE 3/6 |
| B8 | Expansão de categoria é 1:1 rótulo→termo; não há termos relacionados nem serviço configurável | `categorias.ts:99` | FASE 2/5 |
| B9 | Status em inglês cru na aba Pesquisas (`queued`, `running`, `paused`…) | `_client.tsx:309` | FASE 6 — fechado na FASE 3 (`ROTULO_STATUS_BUSCA`) |
| B10 | Sem enriquecimento em 2 etapas nem cache de Place Details (todo detalhe é pago na hora) | `google-places.ts` | FASE 3/4 — fechado por D10/D11 (detalhe já vem na descoberta; Details sem consumidor até a etapa 2) |
| B11 | Sem vendedor/próxima ação no prospect: `business_prospects` não tem `owner` nem `próximo_passo` | schema 0220 | FASE 8 — fechado (migration `0247_prospeccao_fila`: `owner_user_id` + `proximo_passo` + índice parcial org+dono) |
| B12 | Radar **não** lê `business_prospects` (grep vazio em `app/app/radar`); botão "Criar venda automática" só existe em `_empresas.tsx:535` | `app/app/radar/**` | FASE 11 |
| B13 | Testes: 3 unit de lib (`prospeccao-{lib,providers,buscas-normalizacao}`) e 1 e2e (`prospeccao-mapa`, só no full noturno); **nenhum teste de rota/API** de prospecção | `tests/**` | FASE 14 |
| B14 | Docs divergem: CHANGELOG 1.17.0 diz "Radar → aba Empresas" — é **Prospecção → aba Empresas** | `CHANGELOG.md:22` | FASE 6 — fechado (entrada 1.17.0 corrigida) |
| B15 | Performance: `mercado` puxa `limit(10000)×3 + 5000` por request; wizard geocoda até 5 cidades em série | `mercado/route.ts:32,53,82,100`, `_campanha-wizard.tsx:106` | FASE 15 |
| B16 | `lib/database.types.ts` desatualizado (não conhece as tabelas de prospecção; rotas usam `as unknown as`) | tipos gerados | nota (regenerar quando houver acesso) |

### Decisões da evolução

- **D1 — Nome da abstração:** o contrato do prompt (`DiscoveryProvider`) já tem
  equivalente canônico: `BusinessDiscoveryProvider` + `criarProvider()`. Mantém-se o
  nome do repo; registro é o único ponto de fábrica (B5 é a exceção a eliminar).
- **D2 — Duas campanhas, não três:** `prospecting_campaigns` = descoberta recorrente
  (buscas multi-cidade); `automatic_sales_campaigns` (spec 18) = abordagem com
  cota/janela/follow-up. FASE 10 liga as duas no funil no painel; **não** criar
  terceira tabela.
- **D3 — Cliente existente:** predicado único `ja_e_cliente` (contact_id **ou**
  match telefone/email). Mapeia 1:1 para a classificação do prompt; se já tiver
  pedido, o drawer mostra última compra lendo `orders` (coluna nova não precisa).
- **D4 — Custos em config:** `CUSTO_*` sai do provider; FASE 2 cria defaults por
  provider em `lib/prospeccao/custos.ts` (neutros), FASE 13 passa a ler preço e
  franquia de `prospecting_settings`.
- **D5 — Geografia sem tabela de cidades:** cidade fica texto + geocodificação;
  não criar tabela de cidades nesta evolução (se um dia precisar, migration própria).
- **D6 — O técnico vai para a aba Config:** provider/limite/custo/TTL/erros só em
  "Config" (manager-only, já é). A busca vira "Encontrar empresas"
  (Onde/Que tipo/O que encontrar); o **raio permanece** na frente — é linguagem
  comercial ("30 km daqui"), não técnica. *(Leitura fechada na FASE 6: D6 trata
  dos CAMPOS técnicos de Config — provider, limites, TTL, retries; o "Custo
  estimado" e a contagem de erros da linha de progresso da aba Pesquisas são
  resultado por busca, não configuração, e ficam até o painel de custos da
  FASE 13 (§21) nascer — sumir antes deixaria o gasto invisível. "Células"
  saiu da linha: era o único termo de grade na frente.)*
- **D7 — Integrações sem mensagens novas:** Inbox recebe contexto via
  `POST /api/v1/conversations/open-with-contact` + tags (molde da VA, FASE 9);
  Meu Dia recebe tarefas via `commercial_tasks` (FASE 12); Radar ganha seção de
  novos prospects com asmesmas 3 ações (FASE 11).
- **D8 — Enriquecimento em 2 etapas só onde custa:** Place Details sob demanda
  (drawer/fila); OSM não tem etapa 2 (já vem completo e sem custo).
- **D9 — Expansão opt-in (feita na FASE 2):** `CategoryExpansionService` existe
  (`lib/prospeccao/expansao.ts`), mas a varredura de termos relacionados só
  liga com `PROSPECCAO_EXPANSAO=true` — cada termo extra é 1 chamada paga por
  célula, e §6 (custo) pesa mais que §5 (expansão) até o budget guard da
  FASE 13 existir. Default = 1:1, idêntico ao de antes.
- **D10 — Etapa 2 estrutural, não automática (FECHADA na FASE 3):**
  `getDetails` existe atrás da abstração com `X-Goog-FieldMask` mínimo (sem
  wildcard, §22 ✓), **só que a descoberta já pede os mesmos campos que o
  Details devolveria** (masks idênticos) — ligar enriquecimento automático
  hoje seria pagar 11¢ para repetir dado. A etapa 2 vira real quando: (a)
  campos novos entrarem só na máscara do Details, ou (b) prospect OSM sem
  telefone/site merecer busca Google cross-provider — aí com budget guard
  (FASE 13) no caminho. Dedupe por telefone/domínio (§8) também exige o
  contato já na descoberta: não enxugar a máscara da etapa 1 sem antes
  resolver isso.
- **D11 — Cache de Place Details = a própria linha do prospect (FECHADA na
  FASE 4):** o §32 sugere uma entidade `DiscoveryCache`, mas não há o que
  cachear fora do banco enquanto `getDetails` não tem consumidor (D10): a
  descoberta já grava os detalhes pagos nas colunas de `business_prospects`,
  e o dedup nível 1 (provider+external_id) reutiliza a linha em vez de
  recriar. Tabela nova de Details só quando a etapa 2 ligar (D10b, com budget
  guard da FASE 13). O que a FASE 4 entregou de cache: hit de busca **antes**
  do geocode, resposta `do_cache` na API, e `DISCOVERY_CACHE_TTL` (§7 nomeia
  a variável) como default de instalação atrás do TTL por org (Config, 0–365).
  Dedupe (§8) já existia em 5 níveis em `dedup.ts` — fechado sem código novo;
  testes de dedupe/cache/TTL ficam na FASE 14.
- **D13 — Classificação derivada, score só da descoberta (FECHADA na FASE 5):**
  `classificacao` (§10, 8 classes com rótulo pt-BR) nasce a cada GET — cliente
  (vínculo/`contact_id` ou match telefone/email), em negociação
  (`crm_leads.status='open'`), lead existente, sem potencial, já abordado,
  qualificado, aguardando qualificação, novo — e **nunca é gravada**: gravação
  envelhece mentindo (o CRM muda depois). O detalhe segue no
  `status_comercial` (workflow do vendedor). Verdades vêm do service role com
  `organization_id` explícito (verdade do TENANT, não do RLS de quem olha —
  viewer com visão parcial não pode ser mandado a abordar um cliente) em 3
  queries sem N+1. Score (§11) ganhou distância (15 pts, linear do âncora da
  busca até o raio) e aderência (15 pts: termo pedido cheio; expansão §5
  vale metade — §12 diz que o perfil completo da Bill vem "futuramente");
  pesos rebalanceados somam 100 (telefone 20, site 10, WhatsApp 10, nota 15,
  avaliações 15, categoria 15, distância 15). "Já é cliente/já abordado"
  NÃO entram no score: são verdade de leitura (classificação) — misturar
  faria a mesma linha pontuar diferente para cada espectador. Aproveitando:
  `email` estava morto no select da rota (o match por email nunca tinha
  rodado) — consertado. Testes: `prospeccao-classificacao.test.ts` + bloco
  de score estendido em `prospeccao-lib.test.ts`.
- **D14 — "Alta prioridade" = score ≥ 70 (FECHADA na FASE 6):** §11 define a
  banda como "alta aderência ao perfil comercial" e §13/§36 pedem badge e chip
  de filtro, mas nenhum lugar da spec dá número — inventar um seria regra
  escondida. O corte vira constante documentada (`CORTE_ALTA_PRIORIDADE` em
  `score.ts`, 3/4 da escala, 70) para calibrar num lugar só quando o dono
  definir outro. O chip "Alta prioridade" (§36) recorta a lista já carregada;
  "Novos"/"Já abordados" recortam pela `classificacao` (§10) que a API já
  devolve; "Com WhatsApp" é filtro de servidor (mesmo caminho dos toggles
  avançados). "Todos" = limpar tudo.
- **D15 — o funil do §16 usa os status que já existem (FECHADA na FASE 8):**
  o prompt lista Novo → Em contato → Respondeu → Qualificado → Oportunidade →
  Cotação → Pedido → Cliente, mas `status_comercial` (0220) já cobre o arco do
  PROSPECT (novo, contatado, respondeu, qualificado, cliente, sem interesse…)
  e Oportunidade/Cotação/Pedido são estágios do CRM que já vivem em
  `crm_leads`/pedidos — duplicar a pilha no prospect faria dois funis
  discordantes (doutrina: não inventar nem duplicar entidade). Fila = dono +
  status_comercial + prioridade (D14) + próxima ação; o vínculo lead/cliente
  no drawer carrega o resto do funil. "Última ação" (§16) fica para quando
  houver log de eventos de fila — sem regra escrita, não inventamos.

### Gaps por fase (de onde cada uma parte)

- **FASE 2** — consolidar: chave única (`lib/prospeccao/chave.ts`), `executar` pelo
  registro, custos neutros (D4), CategoryExpansionService com termos relacionados (B8).
- **FASE 3** — provider Google já é o FASE 3 (field masks ✓); falta enriquecimento
  sob demanda (B10) e tirar `maps_browser` do seletor (B7).
- **FASE 4** — busca já tem hash+TTL; falta cache de Details e resposta "do cache"
  visível sem reconsulta. *(FECHADA na FASE 4: hit de cache ANTES do geocode —
  repetição não paga nem chamada de mapa; resposta `do_cache` + `ttl_dias` (a UI
  já avisava "Busca recente reutilizada"); default de instalação
  `DISCOVERY_CACHE_TTL` (§7) atrás do TTL por org; uma leitura só de settings;
  Details = decisão D11.)*
- **FASE 5** — match existe (`ja_e_cliente`); falta classificação completa
  (lead/oportunidade/já abordado) e score com distância/aderência Bill.
  *(FECHADA na FASE 5: `classificacao` (§10) derivada a cada GET cruzando
  contacts + crm_leads; score com distância e aderência — ver D13.)*
- **FASE 6** — *(FECHADA na FASE 6: fluxo do §36 na aba "Encontrar empresas"
  (Onde você quer vender? → Que tipo de empresa? → O que você quer encontrar?
  → botão "Encontrar empresas" que cai na aba Pesquisas com progresso); abas
  controladas + novo filtro `busca_id` da rota (uuid nunca vai para o campo de
  texto — link antigo `?busca=<uuid>` também é reconhecido) = B1; 1º fetch
  parte dos valores congelados da URL + critérios sincronizados na URL = B2;
  `limite=200` na listagem = B3; badges de `classificacao` (§10) + "Alta
  prioridade" (D14) em cards/tabela/drawer + motivo da oportunidade (§13);
  linha "N oportunidades encontradas" com chips §36 (Todos / Alta prioridade /
  Com WhatsApp / Novos / Já abordados); "Células" fora da linha de progresso;
  B9 (status em pt-BR, já na FASE 3) e B14 (CHANGELOG) confirmados.)*
- **FASE 7** — *(FECHADA na FASE 7: visão padrão virou cards + mapa — §37
  "principal: cards/lista + mapa + drawer; tabela é modo secundário" — a
  tabela continua acessível pelo alternador e concentra as ações em lote;
  card comercial do §13 completo (nome, classificação + prioridade,
  categoria · cidade/UF, nota/score, telefone, status quando difere de
  novo, botões Abrir / WhatsApp "iniciar conversa" / CRM); preview de
  marcador (§14) já existia com nome, contato, WhatsApp, "Ver empresa" e
  "Adicionar ao CRM". Ações "Adicionar à fila", "ignorar" e "atribuir
  vendedor" (§13/§14) nascem na FASE 8 junto com a fila.)*
- **FASE 8** — *(FECHADA na FASE 8: migration `0247_prospeccao_fila` (+
  `owner_user_id` FK `auth.users` com set null + `proximo_passo` + índice
  parcial org+dono; as três da doutrina: migration, baseline — create table E
  apêndice — e MANIFEST) = B11; PATCH aceita dono/próxima ação; GET ganha o
  filtro `minha_fila` (o dono vem do authz, nunca da query string); chip
  "Minha fila" (§16) na linha de resultados + URL `minha_fila`; ações
  "Adicionar à fila" em card, drawer e preview do marcador (§13/§14) e
  "Ignorar" (→ sem interesse, com confirm) no drawer; drawer com status,
  vendedor e próxima ação editáveis (§16); import leva o dono também para o
  prospect. Ver D15.)*
- **FASE 9** — Inbox de prospecção (§17, D7): a fila vira caixa de entrada.
- **FASE 9/10/11/12** — Inbox, funil de campanhas, Radar, Meu Dia (D7).
- **FASE 13** — `PlacesUsageManager`/`DailyProspectingLimits`/budget guard
  (espelhar cota diária da VA).
- **FASE 14** — testes de rota/API (B13).
- **FASE 15** — N+1, paginação de verdade, mobile, observabilidade (B15).

---

## Prompt original (verbatim)

Você é o responsável por evoluir o módulo de **PROSPECÇÃO** do Nexus Comercial em nível de produção.

REPOSITÓRIO:
https://github.com/spiesdan/nexus

SISTEMA:
Nexus Comercial — Plataforma Inteligente de Vendas da Bill Higiene.

OBJETIVO PRINCIPAL:

Transformar `/app/prospeccao` em um verdadeiro **motor de aquisição de novos clientes**, e não em uma tela técnica de busca/scraping.

O usuário deve conseguir dizer:

> "Quero encontrar empresas desse tipo, nessa cidade/região, que possam comprar da Bill."

E o Nexus deve executar todo o processo:

LOCALIZAÇÃO
→ CATEGORIA
→ DESCOBERTA
→ NORMALIZAÇÃO
→ DEDUPLICAÇÃO
→ CRUZAMENTO COM CLIENTES
→ QUALIFICAÇÃO
→ PRIORIZAÇÃO
→ FILA DE PROSPECÇÃO
→ INBOX
→ CONVERSA
→ OPORTUNIDADE
→ PEDIDO
→ NOVO CLIENTE

IMPORTANTE:

Antes de modificar qualquer coisa:

1. Analise profundamente o repositório atual.
2. Analise o funcionamento atual de `/app/prospeccao`.
3. Analise todos os componentes relacionados.
4. Analise as APIs existentes.
5. Analise os modelos do banco.
6. Analise as integrações existentes.
7. Identifique o que já funciona e deve ser reaproveitado.
8. NÃO recrie entidades que já existem.
9. NÃO duplique APIs ou lógica.
10. NÃO altere o core do ERPNext desnecessariamente.
11. NÃO faça uma implementação paralela que posteriormente precise ser descartada.
12. Preserve compatibilidade com o restanto do Nexus.

A implementação deve evoluir a arquitetura existente.

---

# 1. VISÃO DO NOVO MÓDULO

A página deve deixar de parecer:

* scraper
* ferramenta técnica
* painel de APIs
* tabela de empresas sem contexto
* tela de configuração

Ela deve parecer:

# PROSPECÇÃO

**Encontre novas empresas para vender hoje.**

O Nexus deve transformar dados externos e dados internos em oportunidades comerciais.

O usuário não precisa saber qual API está sendo utilizada.

Não mostrar na interface principal:

* Google Places
* provider
* API key
* request
* endpoint
* pagination
* radius técnico
* SKU
* billing
* cache técnico
* query interna
* parâmetros técnicos

Essas informações pertencem à área administrativa/técnica.

---

# 2. GOOGLE PLACES COMO FONTE DE DESCOBERTA

Utilize **Google Places API / Google Maps Platform** como uma das principais fontes de descoberta de empresas.

IMPORTANTE:

Google é uma fonte de dados.

Google NÃO é o cérebro do Nexus.

A inteligência comercial pertence ao Nexus.

Fluxo:

Google Places
↓
Nexus Discovery Engine
↓
Normalização
↓
Deduplicação
↓
Match com clientes/CRM
↓
Qualificação
↓
Score comercial
↓
Radar
↓
Inbox
↓
Venda

O código deve ser desenvolvido de forma que outras fontes possam ser adicionadas futuramente.

Criar uma abstração semelhante a:

DiscoveryProvider

para permitir futuramente:

* Google Places
* OpenStreetMap
* outras APIs
* bases próprias
* importações
* leads cadastrados manualmente

Não acople toda a aplicação diretamente ao Google.

---

# 3. COMO ENCONTRAR EMPRESAS

O usuário deverá selecionar:

## Onde?

Exemplo:

Cidade:
Canoinhas

UF:
SC

Opcional:

* raio
* múltiplas cidades
* região
* mapa
* cidades próximas

Exemplo:

Canoinhas + raio de 30 km

O sistema pode encontrar:

* Canoinhas
* Três Barras
* Major Vieira
* Bela Vista do Toldo
* outras cidades dentro do raio

A interface deve deixar isso simples.

---

# 4. CATEGORIAS

O usuário seleciona categorias comerciais.

Exemplo:

Restaurantes
Padarias
Hotéis
Mercados
Supermercados
Lanchonetes
Confeitarias
Clínicas
Hospitais
Escolas
Indústrias
Oficinas
Academias
Condomínios
etc.

Permitir:

* pesquisar categoria
* selecionar múltiplas categorias
* criar segmento personalizado

Exemplo:

"Empresas que utilizam bastante produtos de limpeza"

---

# 5. EXPANSÃO INTELIGENTE DE CATEGORIAS

Não faça apenas uma busca literal.

Se o usuário selecionar:

"Restaurantes"

O Nexus pode internamente trabalhar com termos relacionados:

* restaurante
* restaurante self-service
* churrascaria
* pizzaria
* lanchonete
* bistrô
* comida caseira
* refeições
* restaurante por quilo

Porém:

NÃO mostrar essa complexidade ao usuário.

O usuário continua vendo:

**Restaurantes**

O motor de descoberta expande internamente a busca.

Criar uma camada:

CategoryExpansionService

que transforma:

categoria comercial

em:

termos de descoberta + tipos + palavras-chave.

Isso deverá ser configurável futuramente.

---

# 6. GOOGLE PLACES — CONTROLE ABSOLUTO DE CUSTO

ESTE É UM REQUISITO CRÍTICO.

O sistema NÃO pode realizar chamadas ilimitadas ao Google.

Implementar uma camada central:

PlacesUsageManager

Responsável por:

* contabilizar chamadas
* contabilizar tipo de operação
* controlar limites
* controlar consumo mensal
* armazenar métricas
* evitar chamadas duplicadas
* usar cache
* bloquear consultas quando necessário
* gerar alertas
* estimar custo

Nunca chamar diretamente a API do Google espalhada por diversos componentes.

Todas as chamadas devem passar pelo serviço central.

---

# 7. CACHE

Implementar cache agressivo para descoberta.

Exemplo:

Hoje:

Canoinhas
+
Restaurantes

foi pesquisado.

Se amanhã o usuário fizer exatamente a mesma pesquisa:

NÃO consultar novamente o Google imediatamente.

Utilizar os resultados existentes.

Criar uma política de validade configurável.

Exemplo:

DISCOVERY_CACHE_TTL

pode ser:

7 dias
15 dias
30 dias

dependendo do tipo de dado.

O TTL deve ser configurável.

---

# 8. DEDUPLICAÇÃO

O Google pode retornar a mesma empresa em pesquisas diferentes.

Exemplo:

"restaurante Canoinhas"

"pizzaria Canoinhas"

"restaurante self-service Canoinhas"

Podem retornar o mesmo estabelecimento.

Não criar três prospects.

Utilizar como identificadores preferenciais:

* Google Place ID
* telefone normalizado
* CNPJ, quando disponível
* domínio/site
* combinação nome + endereço

Criar um serviço:

ProspectDeduplicationService

com prioridade de identificação.

---

# 9. CRUZAMENTO COM A BASE DO NEXUS

Essa é uma das partes mais importantes.

Encontrar empresa NÃO significa que ela seja prospect.

Após descobrir uma empresa:

consultar o banco do Nexus.

Verificar:

* já é cliente?
* já existe lead?
* já existe prospect?
* já foi abordada?
* já existe oportunidade?
* já possui pedido?
* vendedor responsável?
* última compra?
* quantidade de compras?
* faturamento histórico?
* categoria?
* cidade?
* telefone?
* WhatsApp?
* situação comercial?

Exemplo:

Google encontra:

"Restaurante X"

Nexus encontra:

Cliente existente.

Então NÃO colocar como:

"Novo prospect".

Classificar:

**Cliente existente**

e permitir:

"Ver cliente"

ou

"Reativar relacionamento"

---

# 10. CLASSIFICAÇÃO DO PROSPECT

Cada empresa encontrada deve receber um estado comercial.

Exemplos:

🟢 Novo prospect

🔵 Cliente existente

🟡 Lead existente

🟣 Já abordado

🟠 Em negociação

🔴 Sem potencial / descartado

⚪ Aguardando qualificação

O usuário deve entender rapidamente a situação.

---

# 11. SCORE COMERCIAL

Criar um score interno de oportunidade.

NÃO usar o score como verdade absoluta.

Ele serve para ordenar a fila.

Exemplo de fatores:

* categoria relevante
* localização
* tamanho estimado
* presença de telefone
* presença de WhatsApp
* site
* potencial de consumo
* distância
* não ser cliente
* nunca ter sido abordado
* histórico de interação
* prioridade definida pelo usuário
* aderência aos produtos da Bill

Exemplo visual:

**Prioridade alta**

"Alta aderência ao perfil comercial"

Evitar mostrar uma fórmula matemática complexa ao usuário.

---

# 12. PERFIL COMERCIAL DA BILL

O motor deve conhecer o que a Bill vende.

Não criar mensagens genéricas.

O Nexus deverá futuramente relacionar:

Categoria da empresa
+
necessidade provável
+
produtos/serviços da Bill

Exemplo:

Restaurante

pode ter interesse em:

* produtos de limpeza profissional
* detergentes
* desengordurantes
* sanitizantes
* papel
* descartáveis
* materiais para higiene
* outros produtos relevantes existentes no catálogo

A associação deve usar os produtos reais cadastrados no Nexus.

NÃO inventar produtos.

---

# 13. RESULTADOS

Não mostrar uma tabela gigante como primeira experiência.

Mostrar:

## Empresas encontradas

Cards/lista comercial.

Cada empresa:

Nome
Categoria
Cidade
Telefone
WhatsApp
Status
Prioridade
Motivo da oportunidade

Exemplo:

### Restaurante X

Restaurante · Canoinhas/SC

📞 (47) XXXXX-XXXX

🟢 Novo prospect

**Alta prioridade**

"Restaurante localizado na sua região e ainda não cadastrado como cliente."

Ações:

**Adicionar à fila**

**Abrir empresa**

**Iniciar conversa**

---

# 14. MAPA + LISTA

A tela deve possuir:

LISTA
+
MAPA

O mapa mostra os prospects.

Ao clicar em um marcador:

abrir preview.

Não trocar de página.

O usuário pode:

* abrir detalhes
* adicionar à fila
* iniciar conversa
* ignorar
* atribuir vendedor

---

# 15. CUSTOMER 360

Ao abrir uma empresa, mostrar um drawer/modal rico.

Se for empresa nova:

## Empresa

Nome
Categoria
Endereço
Telefone
WhatsApp
Site
Localização

## Situação no Nexus

Novo prospect

## Oportunidade

Por que o Nexus considera essa empresa relevante.

## Próxima ação

Iniciar conversa

## Histórico

Caso já exista qualquer interação.

Se já for cliente:

mostrar Customer 360 existente.

NÃO criar um segundo cadastro.

---

# 16. FILA DE PROSPECÇÃO

Criar uma fila comercial.

Exemplo:

## Minha fila

Hoje

1. Restaurante X
2. Panificadora Y
3. Hotel Z
4. Mercado A

Cada prospect possui:

* prioridade
* vendedor
* status
* última ação
* próxima ação

Status:

Novo
→ Em contato
→ Respondeu
→ Qualificado
→ Oportunidade
→ Cotação
→ Pedido
→ Cliente

---

# 17. INBOX

O botão:

**Iniciar conversa**

deve abrir o Inbox do Nexus.

Não criar outro sistema de mensagens.

Reutilizar o Inbox existente.

Passar o contexto do prospect.

O Inbox deverá saber:

* quem é a empresa
* categoria
* cidade
* origem do lead
* produtos potencialmente relevantes
* vendedor responsável
* histórico

---

# 18. MENSAGEM AUTOMÁTICA

O Nexus poderá gerar uma sugestão de mensagem.

Exemplo conceitual:

"Olá, tudo bem? Somos da Bill Higiene, trabalhamos com produtos de limpeza e higiene profissional para empresas da região..."

A IA deve adaptar a abordagem:

categoria
+
cidade
+
contexto
+
produtos relevantes

NUNCA inventar:

* nome de pessoa
* relacionamento anterior
* compra anterior
* necessidade específica não conhecida
* informações inexistentes

A mensagem deve ser apresentada ao usuário antes do envio, salvo quando houver uma automação explicitamente autorizada.

---

# 19. VENDA AUTOMÁTICA POR DIA

Adicionar uma operação:

## Venda automática

O usuário escolhe:

Data
Cidade/região
Categorias
Quantidade máxima de empresas
Vendedor
Produtos/segmento
Horário
Modo:

Manual
Semi-automático
Automático

Exemplo:

"Hoje quero prospectar restaurantes de Canoinhas."

O Nexus:

1. busca empresas
2. elimina clientes existentes
3. elimina duplicadas
4. verifica dados
5. prioriza
6. cria fila
7. envia para Inbox
8. acompanha respostas
9. registra interações
10. transforma respostas em oportunidades
11. permite gerar pedido

A automação deve possuir limites configuráveis.

---

# 20. LIMITES DA AUTOMAÇÃO

Criar:

DailyProspectingLimits

Exemplos:

* máximo de empresas descobertas
* máximo de mensagens
* máximo de novos contatos
* máximo de chamadas Google
* máximo de enriquecimentos
* máximo de campanhas simultâneas

Nunca deixar uma automação rodar indefinidamente.

---

# 21. PAINEL DE CUSTOS

Criar uma área administrativa:

## Consumo de Prospecção

Mostrar:

Google Places

Consultas hoje
Consultas no mês
Cache hits
Cache misses
Empresas descobertas
Empresas novas
Enriquecimentos

Estimativa de consumo

Limite mensal configurado

Percentual utilizado

Alertas

Exemplo:

Google Places
2.340 / 10.000

23,4%

⚠️ Próximo do limite configurado

IMPORTANTE:

Os valores de preço e franquias devem ficar em configuração, e não hardcoded no frontend.

O sistema deve permitir atualizar os parâmetros conforme a tabela vigente do Google.

---

# 22. FIELD MASKS

Nas chamadas do Google Places:

Solicitar somente os campos realmente necessários.

Não utilizar wildcard indiscriminado.

Criar diferentes níveis de consulta.

### Discovery

Buscar apenas dados mínimos necessários para identificar o local.

### Enrichment

Somente quando o prospect passar pelos filtros.

Buscar informações adicionais.

Isso reduz custo.

---

# 23. ESTRATÉGIA DE DUAS ETAPAS

Implementar:

## ETAPA 1 — Descoberta barata

Objetivo:

descobrir candidatos.

Retornar apenas informações mínimas.

## ETAPA 2 — Enriquecimento

Somente para prospects relevantes.

Buscar:

telefone
site
detalhes adicionais
etc.

Nunca enriquecer todas as empresas automaticamente se não houver necessidade.

---

# 24. BUDGET GUARD

Criar proteção contra custo inesperado.

Exemplo:

Configuração:

Limite mensal:
R$ 100

Quando atingir:

80%

mostrar aviso.

Quando atingir:

90%

reduzir operações automáticas.

Quando atingir:

100%

bloquear novas consultas pagas automaticamente.

Mostrar:

"Limite de prospecção atingido. Aumente o limite ou aguarde a renovação."

NUNCA ultrapassar silenciosamente o limite definido pelo administrador.

---

# 25. ALERTAS

Criar alertas:

* consumo elevado
* muitas buscas repetidas
* cache muito baixo
* limite próximo
* automação excessiva
* erro na API
* API indisponível
* dados duplicados

---

# 26. FALLBACK

Se Google Places estiver indisponível:

Não quebrar `/app/prospeccao`.

Mostrar:

"Não foi possível atualizar a descoberta agora."

Manter:

* resultados anteriores
* cache
* prospects existentes
* fila
* histórico

O sistema continua funcionando com os dados já armazenados.

---

# 27. HISTÓRICO

Criar:

## Histórico de Prospecções

Registrar:

Data
Usuário
Cidade
Categorias
Quantidade pesquisada
Quantidade encontrada
Quantidade nova
Quantidade já cliente
Quantidade duplicada
Quantidade adicionada à fila
Consumo estimado
Fonte

Permitir reabrir uma pesquisa.

Se o usuário executar novamente:

usar cache quando possível.

---

# 28. CAMPANHAS

As campanhas não devem ser simplesmente uma lista técnica.

Cada campanha deve possuir:

Nome
Objetivo
Região
Categorias
Quantidade de prospects
Contatados
Respostas
Oportunidades
Pedidos
Faturamento

Funil:

Encontrados
→ Selecionados
→ Contatados
→ Responderam
→ Qualificados
→ Oportunidades
→ Pedidos

---

# 29. INTELIGÊNCIA DE MERCADO

A antiga área "Mercado" deve evoluir para:

## Inteligência de Mercado

Mostrar:

* quantidade de empresas por categoria
* cidades
* concentração de prospects
* clientes x não-clientes
* oportunidades por região
* categorias pouco exploradas
* categorias com maior conversão
* regiões com maior potencial
* evolução da prospecção

Não inventar dados.

Tudo deve ser calculado a partir do banco real.

---

# 30. RADAR

Integrar Prospecção ao Radar.

O Radar deve responder:

> "Quem podemos vender hoje?"

Exemplos:

* restaurantes próximos
* clientes que pararam de comprar
* empresas novas
* prospects nunca abordados
* empresas com WhatsApp
* oportunidades por cidade
* empresas semelhantes aos melhores clientes

Cada oportunidade deve permitir:

**Abrir**
**Adicionar à fila**
**Iniciar conversa**

---

# 31. MEU DIA

Integrar com:

`/app/meu-dia`

O Meu Dia deve receber tarefas provenientes da prospecção.

Exemplo:

### Hoje

08:30
→ Contatar Restaurante X

09:00
→ Follow-up Padaria Y

09:30
→ Prospectar 10 restaurantes em Canoinhas

14:00
→ Retornar conversa Hotel Z

Assim Prospecção não fica isolada.

---

# 32. MODELO DE DADOS

Antes de criar tabelas:

analise o Prisma/schema/modelos existentes.

Reutilize entidades existentes.

Criar apenas o que realmente estiver faltando.

Possíveis entidades conceituais:

Prospect
DiscoverySearch
DiscoveryResult
ProspectingCampaign
ProspectingQueue
ProspectInteraction
DiscoveryCache
UsageRecord

Mas NÃO crie essas entidades cegamente.

Primeiro determine quais conceitos já existem.

---

# 33. API

Centralizar a arquitetura.

Exemplo conceitual:

POST /api/v1/prospecting/discover

POST /api/v1/prospecting/enrich

GET /api/v1/prospecting/results

POST /api/v1/prospecting/queue

POST /api/v1/prospecting/start-conversation

GET /api/v1/prospecting/history

GET /api/v1/prospecting/usage

GET /api/v1/prospecting/intelligence

Os endpoints reais devem seguir o padrão já existente no Nexus.

Não criar APIs duplicadas.

---

# 34. OBSERVABILIDADE

Registrar:

Discovery started
Discovery completed
Provider request
Provider response
Cache hit
Cache miss
Deduplication
Customer match
Prospect created
Enrichment
Message queued
Message sent
Conversation started
Opportunity created
Order created

Com IDs de correlação.

Isso permitirá descobrir exatamente:

de onde veio cada prospect

e quanto custou descobri-lo.

---

# 35. SEGURANÇA

Nunca expor:

* Google API key
* tokens
* secrets
* credenciais

no frontend.

Toda integração externa deve ocorrer no backend.

Usar variáveis de ambiente.

Exemplo:

GOOGLE_MAPS_API_KEY

Mas antes de criar:

verificar se o projeto já possui integração/configuração equivalente.

---

# 36. UX

A página deve ser extremamente simples para um vendedor.

Fluxo ideal:

## PROSPECÇÃO

**Onde você quer vender?**

[ Canoinhas, SC ]

**Que tipo de empresa?**

[ Restaurantes ] [ Padarias ] [ Hotéis ]

**O que você quer encontrar?**

[ Novos clientes ]

[ Com telefone ]

[ Com WhatsApp ]

[ Que ainda não são clientes ]

Botão:

### Encontrar empresas

Depois:

## 86 oportunidades encontradas

Filtros:

Todos
Alta prioridade
Com WhatsApp
Novos
Já abordados

Mapa + lista.

---

# 37. NÃO TRANSFORMAR A TELA EM UMA TABELA

Tabela pode existir como modo secundário.

Principal:

Cards/lista + mapa + drawer.

Tabela avançada:

para usuários administrativos.

---

# 38. MOBILE

A prospecção deve funcionar bem no celular.

Prioridade:

* lista
* mapa
* filtros
* drawer
* botão iniciar conversa
* adicionar à fila

Evitar telas com excesso de colunas.

---

# 39. ESTADOS DA INTERFACE

Implementar corretamente:

Loading
Skeleton
Empty
Error
No results
API unavailable
Quota exceeded
Cache results
Partial results
Searching
Enriching
Queued
Contacted

Nunca deixar a interface parecer travada.

---

# 40. IA

A IA deve funcionar como camada de inteligência, não como substituição dos dados.

Pode ajudar em:

* classificação
* segmentação
* recomendação de abordagem
* geração de mensagem
* resumo
* priorização
* sugestão de produtos
* próxima ação

Mas os fatos devem vir dos dados reais.

Nunca permitir que IA invente informações sobre empresas.

---

# 41. ARQUITETURA FINAL

```
                 ┌───────────────┐
                 │   USUÁRIO     │
                 └───────┬───────┘
                         │
                         ▼
                 ┌───────────────┐
                 │ PROSPECÇÃO UI │
                 └───────┬───────┘
                         │
                         ▼
             ┌────────────────────────┐
             │ DISCOVERY ENGINE       │
             └───────────┬────────────┘
                         │
            ┌────────────┼─────────────┐
            ▼            ▼             ▼
      Google Places   Cache        Outras fontes
            │            │             │
            └────────────┼─────────────┘
                         ▼
                NORMALIZAÇÃO
                         │
                         ▼
                DEDUPLICAÇÃO
                         │
                         ▼
                CUSTOMER MATCH
                         │
                         ▼
                QUALIFICAÇÃO
                         │
                         ▼
                 SCORE/RADAR
                         │
                         ▼
              FILA DE PROSPECÇÃO
                         │
                         ▼
                     INBOX
                         │
                         ▼
                   CONVERSA
                         │
                         ▼
                   OPORTUNIDADE
                         │
                         ▼
                      PEDIDO
                         │
                         ▼
                  NOVO CLIENTE
```

---

# 42. PRINCÍPIO MAIS IMPORTANTE

O usuário não deve pensar:

"Vou pesquisar no Google."

Ele deve pensar:

"Quero encontrar empresas para vender."

O Nexus decide tecnicamente como encontrar essas empresas.

Google Places é infraestrutura.

O Nexus é o cérebro comercial.

---

# 43. CUSTO COMO PARTE DO PRODUTO

O custo de descoberta deve ser tratado como uma métrica operacional.

Dashboard:

Empresas descobertas
↓
Empresas aproveitadas
↓
Empresas qualificadas
↓
Conversas
↓
Oportunidades
↓
Pedidos
↓
Faturamento

E também:

Custo de descoberta
↓
Custo por prospect qualificado
↓
Custo por conversa
↓
Custo por oportunidade
↓
Custo por pedido

Isso permitirá futuramente saber quanto a prospecção automatizada está produzindo.

---

# 44. TESTES

Não considerar a tarefa concluída apenas porque a interface funciona.

Criar testes para:

* deduplicação
* customer matching
* cache
* TTL
* category expansion
* usage tracking
* budget guard
* quota
* Google provider
* fallback
* criação de prospect
* fila
* integração Inbox
* campanhas
* score
* filtros
* permissões

Testar APIs críticas.

E2E deve cobrir apenas os fluxos críticos.

Não executar toda a suíte E2E a cada pequena alteração local.

Utilizar testes unitários/integrados rápidos durante desenvolvimento.

E2E completo no pipeline apropriado.

---

# 45. PERFORMANCE

NÃO fazer:

1 request por empresa.

Evitar:

N+1 queries.

Utilizar:

* batch queries
* cache
* índices
* debounce
* paginação
* processamento assíncrono
* filas quando necessário

Uma busca de centenas de empresas não pode travar o navegador.

---

# 46. IMPLEMENTAÇÃO

Divida a implementação em fases.

FASE 1
Auditoria do sistema atual.

FASE 2
Discovery Engine.

FASE 3
Google Places Provider.

FASE 4
Cache + deduplicação.

FASE 5
Customer matching.

FASE 6
Nova UX de Prospecção.

FASE 7
Mapa + resultados.

FASE 8
Fila.

FASE 9
Inbox.

FASE 10
Campanhas.

FASE 11
Radar.

FASE 12
Meu Dia.

FASE 13
Usage + Budget + custos.

FASE 14
Testes.

FASE 15
Performance e produção.

---

# 47. REGRA DE OURO

Antes de implementar qualquer funcionalidade:

PERGUNTE AO CÓDIGO EXISTENTE.

Não assuma.

Não duplique.

Não substitua algo que já funciona sem necessidade.

Não crie uma segunda arquitetura paralela.

Primeiro descubra:

* como o Nexus já faz isso
* onde estão os modelos
* quais APIs existem
* quais componentes existem
* quais serviços existem
* quais integrações existem

Depois evolua.

---

# 48. RESULTADO ESPERADO

Ao final, `/app/prospeccao` deve ser um dos principais módulos comerciais do Nexus.

O vendedor deve conseguir:

1. escolher cidade/região
2. escolher categorias
3. clicar em "Encontrar empresas"
4. receber oportunidades
5. visualizar no mapa
6. saber quais já são clientes
7. saber quais são novos
8. ver prioridade
9. colocar na fila
10. iniciar conversa
11. acompanhar resposta
12. transformar em oportunidade
13. gerar pedido

Tudo dentro do Nexus.

Sem precisar entender:

Google Places
APIs
scraping
providers
queries
cache
SKU
billing

Esses detalhes devem existir somente na infraestrutura e na administração.

O resultado final deve parecer um **vendedor externo digital**, e não uma ferramenta de scraping.

ANTES DE FINALIZAR:

* rode lint
* rode typecheck
* rode testes relevantes
* valide migrations
* valide build
* valide APIs
* valide permissões
* valide integração com Inbox
* valide que nenhum segredo foi exposto
* valide que o limite de custo funciona
* valide que chamadas repetidas utilizam cache
* valide que empresas já cadastradas não são duplicadas
* valide que a interface funciona desktop e mobile

Não declare a implementação concluída enquanto os fluxos críticos não estiverem funcionando de ponta a ponta.
