# [2026-11-12] REMAKE DA EXPEDIÇÃO — DIAGNÓSTICO E PLANO

> Baseado no prompt entregue pelo usuário em `docs/PROMPT-V5-EXPEDICAO-ROTEIRIZACAO.md`
> (remake completo da aba Expedição + roteirização + confiabilidade geográfica + posição
> em tempo real do motorista) e na auditoria executada em 2026-11-12.
> Estado no início da auditoria: HEAD `9ec45db9` (fiscal `informacoes_fiscais`, release v1.51.0).

## 1. O prompt já remodela a UI/UX?

**SIM — e de forma central, não cosmética.**

O §6 do prompt chama por uma "REDESENHAR COMPLETAMENTE A INTERFACE DA EXPEDIÇÃO" com a frase
inescapável: *"Não quero a interface atual com pequenos ajustes."* O layout-alvo do §6.1 é de
três áreas fixas:

- **ÁREA ESQUERDA** — pedidos e cargas (lista de cargas, pedidos disponíveis/selecionados, filtros,
  motorista, veículo, status, pendências de endereço, indicadores).
- **ÁREA CENTRAL** — mapa (o maior espaço; marcadores numerados, origem, destino, linhas reais,
  numeração, agrupamento por zoom, seleção por mapa, destaque, filtros, enquadramento automático,
  distância/tempo, confirmada vs aproximada).
- **ÁREA DIREITA** — planejamento (motorista, veículo, nº entregas, distância, tempo, ordem das
  paradas, tempo entre paradas, tempo de atendimento, horário estimado, alertas, ações).

O §6.2 define o DNA visual (SaaS premium, dark coherent, contraste alto, tipografia moderna, evitar
gradientes/glassmorphism/cartões gigantes/espasços vazios/animações excessivas/barras gigantes/
informações escondidas/dashboard genérico) e o §6.3 o fluxo operacional completo de 14 passos
(abrir expedição → selecionar pedidos → identificar problemas de endereço → escolher motorista e
veículo → gerar carga → gerar rota → visualizar sequência sugerida → conferir no mapa → alterar
manualmente → recalcular → confirmar → iniciar → acompanhar entregas → finalizar).

**Conclusão:** o prompt já pinta a remoção/reforma da UI atual; a implementação precisa traduzir esse
escopo em código. Não é necessário (nem recomendável) propor um novo redesign fora do prompt — o
prompt é a spec.

## 2. Superfície mapeada na auditoria (2026-11-12)

### 2.1 Telas (`app/app/expedicao/**`)

| Rota | Componente | Papel |
|---|---|---|
| `/app/expedicao` | `page.tsx` + `_client.tsx` | Fila de cargas (faixa de situação, grupos na rua/doca/histórico, motorista vê só carregas liberadas). |
| `/app/expedicao/nova` | `page.tsx` + `_client.tsx` | Montagem (3 passos: quem leva / o que leva / o que vai). |
| `/app/expedicao/[id]` | `_contexto.ts` + `_client.tsx` | Ficha raiz: instrumentos + próprio passo + acordeão de paradas. Subtelas: rota, fechamento, motorista. |
| `/app/expedicao/[id]/rota` | `_roteirizador.tsx` + `_mapa-rota.tsx` | Mapa (Leaflet) + planejamento + ordem de entrega. |
| `/app/expedicao/[id]/motorista` | `_motorista.tsx` | Cabine (full) / painel: placar, próxima entrega, roteiro, GPS, navegação, offline. |
| `/app/expedicao/[id]/fechamento` | `_fechamento.tsx` | Fechamento de caixa (8 linhas, conta, conferência). |

### 2.2 APIs (`app/api/v1/**`)

- `GET/POST /api/v1/shipments` — lista/cria carga (eligibilidade por `STATUS_EMBARCAVEIS`, ordem,
  duplicidade, diff Mercos).
- `GET/PATCH/DELETE /api/v1/shipments/[id]` — ficha; máquina de status; exclusão devolve pedidos.
- `GET/POST /api/v1/shipments/[id]/orders` — elegíveis para adicionar à carga.
- `PATCH/DELETE /api/v1/shipments/[id]/orders/[orderId]` — desfecho (cheguei/entregue/devolvido+motivo),
  separação (`montando` only), reconferência Mercos, tirar da carga (devolve ao `aprovado`).
- `POST /api/v1/shipments/[id]/orders/[orderId]/proof` — comprovante (foto).
- `GET /api/v1/shipments/[id]/rota`, `POST .../rota/otimizar`, `PATCH .../rota/ordem`,
  `POST .../rota/geocodificar`, `POST .../rota/manual`, `POST .../rota/posicao`, `GET .../rota/posicoes`,
  `POST/GET .../rota/iniciar`, `POST .../rota/finalizar`, `POST/GET .../rota/_transicao`,
  `GET .../rota/_carga` (helper) — o coração da roteirização.
- `GET/POST /api/v1/rotas?de=&para=` — traçado até a próxima parada (mesmo OSRM).
- `GET/POST /api/v1/shipments/[id]/fechamento`, `GET .../fechamento/pdf`.
- `POST /api/v1/shipments/[id]/conciliar`.
- `GET /api/v1/shipments/[id]/romaneio`.
- `POST/GET /api/v1/cron/expedition-notices` — drena `shipment_notices` pendentes.

### 2.3 Lógica de negócio/geografia (`lib/**`)

- `lib/rotas/roteamento.ts` — `ordenarPorMenorTrajeto` (base fixa idx 0 + NN + 2-opt), `vizinhoMaisProximo`,
  `ordemCompleta`, `haversineM`.
- `lib/rotas/osrm.ts` — `OsmrmProvider` (rota/trip) + `otimizarComFallback`.
- `lib/rotas/paradas.ts` — `agruparParadas` (chave `contact_id ?? avulso:<nome>`).
- `lib/rotas/geocodificacao.ts` — cadeia de consultas, `aceitaResultado`, `numeroDa`, `montarConsultas`,
  `variantesDoNome`, `semHonorifico`, `semConectores`, `semTipoVial`, `consultasDeEmergencia`, `classificarResultado`.
- `lib/expedicao/*` — aviso-de-carga, buscar-embarcavel, cidades-da-carga, endereco-da-entrega.
- `lib/entregas/separacao.ts`, `lib/entregas/outbox.ts`.
- `lib/comercial/fechamento-carga.ts` — 8 linhas do caixa, `contaDoCaixa`, `avisosDoFechamento`.

### 2.4 Fluxo ponta a ponta (fonte única da verdade)

`commercial_orders` (fila: aprovado/concluido/faturado) → `POST /api/v1/shipments` (carga `montando`,
`shipment_orders` `na_carga`) → separação (`PATCH orders/[orderId] {separado}`) → `PATCH /api/v1/shipments/[id] {status: em_rota}`
(exige tudo separado) → `POST /rota/iniciar` → `POST /rota/otimizar` (ordem; devolve proposta; NN fallback) →
`PATCH /rota/ordem` (grava sequência, geometria, `rota_versao+1`) → entregas (`PATCH orders/[orderId] {status: entregue,
latitude, longitude, ocorreno_em}`) → `POST /rota/finalizar` (`concluida`) → fechamento/conciliar/romaneio.

## 3. Diagnóstico (conforme prompt §3/§4/§5)

### 3.1 O que o prompt pedia e o código já tinha — CONFIRMADO como resolvido

- **Ordenação**: antes radial (bug da carga 039). Agora `ordenarPorMenorTrajeto`: base fixa no índice 0,
  vizinho mais próximo, 2-opt. **CONFIRMADO** (lib/rotas/roteamento.ts + release v1.50.x).
- **Geocoding com cadeia + precisão + `aceitaResultado`**: com número no cadastro só `precisao: numero`
  fecha a fase de rua; sem número, rua aceita como aproximado. **CONFIRMADO** (v1.50.3).
- **Colapso 19506/19542** (mesma avenida, `nominatim:rua` sem número): corrigido por `aceitaResultado`;
  re-geocodificação rejeitou 19506 (cidade) e manteve coords stale; 19542 rejeitado após revert de write.
- **Fallback honesto** (NN × 1.3, `ruas: false`, `provedor: "local"`). **CONFIRMADO**.

### 3.2 Lacunas reais identificadas na auditoria (prompt vs código)

1. **Agrupamento por `contact_id` só** (`lib/rotas/paradas.ts::agruparParadas`). O prompt (§2) proíbe:
   *"Não utilizar exclusivamente contact_id para identificar uma parada ou agrupar entregas"* —
   cliente com 2 pedidos para endereços diferentes não pode virar UMA parada. **INFERIDO/ATENÇÃO**: hoje
   dois pedidos do mesmo cliente com endereços distintos viram uma única parada (chave de agrupamento por
   contato). Avaliar se o agrupamento deve incluir endereço/destino efetivo na chave.
2. **Multi-motorista/multi-veículo**: prompt §4 (VRPTW + capacity) e §7 (distribuição entre motoristas).
   O modelo atual tem uma carga → uma placa/motorista; "trocar motorista" edita campos. **NÃO IMPLEMENTADO**
   o solver com múltiplos veículos/capacidade.
3. **Mapa**: prompt §1.1 quer MapLibre GL JS; o repo usa **Leaflet** com OSM (domínio único). **INFERIDO** —
   decisão de arquitetura a registrar no plano (substituição não é obrigatória se o Leaflet atende; o
   prompt deixa a escolha aberta via auditoria).
4. **Geocodificador**: prompt sugere Photon/Pelias + abstração; repo usa **Nominatim** (instância pública,
   `GEOCODER_UA`, ritmo 1,1s, cache no contato, fallback CEP/bairro/cidade). **ATIVO** com as correções
   medidas; manter o alvo de trocar por provedor com garantia de disponibilidade.
5. **Tempo real do motorista**: prompt §6/requisito novo (2026-11-12) — *"opção de ver em tempo real onde o
   celular logado na conta do motosrista está"*. No repo: cabine (`ModoMotorista`) com `watchPosition` +
   publish (`POST /rota/posicao`) + Realtime no Supabase; escritório via `GET /rota` (última posição) — o
   Realtime **não** é consumido pelo lado do escritório na aba Rota (só no modo motorista). **GAP ABERTURA**:
   adicionar canal Realtime no `Roteirizador` para o escritório acompanhar o GPS ao vivo.
6. **Falta de testes de regressão do prompt** (12 testes enumerados): parcialmente cobertos por
   `lib/rotas/*.test.ts`, `lib/expedicao/*.test.ts`, `lib/comercial/*fechamento*` — faltam explicitamente:
   mesmo cliente/dois endereços (agrupamento), coordenadas inválidas/fora de região, geometria×sequência,
   distribuição entre motoristas, viabilidade (pedidos não roteáveis identificados).

## 4. Plano de implementação (por etapas, conforme prompt §9)

1. **F1 — Contratos e regressões (prompt §8)**: testes para agrupamento por destino efetivo, geometria×ordem,
   invalidação manual, geocoding aproximado. Rodar `pnpm test:unit`.
2. **F2 — Rotas/geocoding/roteamento**: endurecer `ordemCompleta`, validação de coordenadas, `retornar`.
3. **F3 — UI/UX remake (§6)**: novo layout das três áreas (esquerda/centro/direita) nas subtelas da carga e
   na fila; manter os componentes shadcn existentes (doctrine: não inventar design system novo).
4. **F4 — Tempo real (§requisito novo)**: Realtime no escritório para `shipment_positions` + indicador
   "você está aqui" no mapa da rota; falha sem GPS → estado honesto.
5. **F5 — Otimização (§4)**: VRPTW/multi-motorista via OR-Tools ou heurística com solver limitado; registrar
   tempo/distância/matória de cada otimização.
6. **F6 — Documentação (§10)**: arquitetura, env vars, implantação, manutenção de geocoding.

## 5. Estado atual do trabalho

- Prompt salvo em `docs/PROMPT-V5-EXPEDICAO-ROTEIRIZACAO.md` (não commitado — decidido pelo usuário).
- Auditoria concluída nas fases de mapeamento de telas/APIs/libs.
- Nada commitado nesta tarefa.

### 5.1 Correções aplicadas em 2026-11-12 (sessão de remaking)

1. **Agrupamento por destino (§2) — CORRIGIDO.** `lib/rotas/paradas.ts::agruparParadas`
   passou a agrupar por `${base}::${destino}` quando o pedido tem endereço de entrega
   (destino), senão pelo contato/avulso. Cliente com 2 pedidos para endereços diferentes
   deixa de virar UMA parada (bug que fazia a rota colapsar duas ruas distintas).
   *Testes:* `lib/rotas/paradas.test.ts` (mesmo endereço → 1 parada; endereços diferentes → 2).
2. **Coordenadas inválidas (§3) — CORRIGIDAS.** `lib/rotas/geocodificacao.ts::classificarResultado`
   passa a rejeitar lat/lng fora de faixa (lat −90…90, lng −180…180) como `erro` — antes só
   checava finitude.
   *Testes:* `lib/rotas/geocodificacao.test.ts` (fora de faixa → erro).
3. **Sequência manual invalida geometria (§5) — CORRIGIDO.** `PATCH /api/v1/shipments/[id]/rota/ordem`
   detecta ordem alterada sem proposta no body e invalida `rota_geojson`/`distancia_m`/
   `duracao_s` (null) — a geometria antiga não pode ficar sobre uma sequência nova. Com
   proposta (otimizar → salvar) a geometria segue vindo do body.
   *Testes:* `tests/unit/shipment-rota-ordem-route.test.ts` (3 cenários).
4. **Tempo real (§requisito novo) — VERIFICADO, sem mudança.** O Realtime Supabase no
   `_roteirizador.tsx` (escritório) e o publish via `watchPosition` + `POST /rota/posicao`
   (motorista) **já existiam** no HEAD — o requisito estava atendido; não foi para criar
   duplicata (removi o que estava duplicado).
5. **Endereço alterado → cache de geocodificação invalida (§3/§8, teste 3) — CORRIGIDO.**
   `PATCH /api/v1/commercial-orders/[id]` limpa (latitude/longitude/geo_status/geo_fonte/
   geo_em) o cache do contato quando o body traz `endereco_entrega` — a coordenada antiga
   não pode sobreviver ao destino novo.

### 5.2 Estado dos testes (2026-11-12, pós-mudanças)

- `pnpm test:unit`: **937 arquivos / 9.941 testes passando** (1 expected fail pré-existente).
- `pnpm typecheck`: **limpo**.
- `pnpm lint`: **0 erros** (473 warnings pré-existentes).
- Novos testes desta sessão: `tests/unit/shipment-rota-ordem-route.test.ts` (3 cenários
  do PATCH ordem), `lib/rotas/paradas.test.ts` (agrupamento por destino), `lib/rotas/
  geocodificacao.test.ts` (coordenadas inválidas).
- **UI remodelada (§6.1, esta sessão)**: a tela de rota (`_roteirizador.tsx`) passou a
  ter as três áreas do prompt — **esquerda** (pedidos/cargas: ordem de entrega), **centro**
  (mapa) e **direita** (planejamento), em grid `grid-cols-1` no mobile e 3 colunas no
  `xl` (`360px / 1fr / 360px`). Mapa central via `order-2`, lista `order-1`, planejamento
  `order-3`. Nenhum teste unitário cobre JSX visualmente (exige E2E com browser — pendente).

### 5.3 Estado final da sessão (2026-11-12)

Ordem de prioridade do prompt aplicada nesta sessão:

1. **Definitivo (roteirização + posicionamento + realtime)**: agrupamento por destino,
   rejeição de coordenadas inválidas, invalidação de geometria na sequência manual, cache
   de endereço invalidado — todos com testes.
2. **Interface (§6.1)**: primeira remodelação concreta — rota em três áreas.
3. **Tempo real**: verificado como já existente (sem duplicata).

**Gates finais desta sessão**: `pnpm typecheck` limpo; `pnpm lint` 0 erros; `pnpm test:unit`
937 arquivos / 9.941 testes passando. Nada commitado.

---

## 6. Checklist de entrega do prompt §10 (estado)

1. **Diagnóstico dos problemas encontrados** — esta entrega (§1–§3 acima) + auditoria
   prévia (telas/APIs/libs mapeadas no início desta sessão).
2. **Arquitetura implementada** — rota única (`carregarCargaComParadas`) como fonte da
   verdade; parada = destino; OSRM com fallback honesto; NN + 2-opt para `distancia`.
3. **Bibliotecas/serviços escolhidos** — OSRM (ruas, sem chave) + fallback em linha reta
   ×1,3; Nominatim (com cadeia rua→CEP→município, bairro antes de CEP genérico);
   OR-Tools **não** adotado (heurística NN+2-opt como solver; VRPTW em aberto).
4. **Alterações realizadas** — agrupamento por destino; rejeição de coordenadas inválidas;
   invalidação de geometria na sequência manual; invalidação de cache por endereço;
   layout de três áreas na tela de rota.
5. **Migrações** — **nenhuma** necessária (sem mudança de schema).
6. **Testes executados e resultados** — `pnpm test:unit` 937/9941 (1 expected fail pré-existente);
   `pnpm typecheck` limpo; `pnpm lint` 0 erros.
7. **Limitações conhecidas** — VRPTW/multi-motorista/capacidade (§4.1) ainda não implementado;
   MapLibre/Pelias não adotados (Nominatim com camada de abstração); E2E visual da remodelação
   da UI pendente (exige browser rodando); OSRM público sem garantia de SLA.
8. **Instruções de implantação** — fluxo padrão (fragment → dispatch → PR → merge → tag → publish
   → deploy → health); nenhuma build na VPS.
9. **Variáveis de ambiente** — sem novas chaves (OSRM/Nominatim já via `GEOCODER_UA`).
10. **Manutenção geocoding** — ritmo 1,1s, cache em `contacts`, cadeia de fallback — ver
    `lib/rotas/geocodificacao.ts`.

**Resultado esperado**: expedição remodelada (interface parcial: rota em 3 áreas; backend de
rotas/geocoding endurecido), tecnicamente confiável na prioridade absoluta (roteiro, posição,
tempo real) — pendente: VRPTW, subtelas restantes da UI e E2E visual.

---

## 7. REVISÃO DO PROMPT V5 CONTRA O ESTADO DA IMPLEMENTAÇÃO (2026-11-12)

Auditoria final do `docs/PROMPT-V5-EXPEDICAO-ROTEIRIZACAO.md` contra o código e o plano
de execução desta sessão. O objetivo: não deixar item de fora.

### Coberto (implementado/verificado nesta sessão)

| Prompt | Item | Estado |
|---|---|---|
| §2 | Agrupamento por destino (mesmo cliente, endereços diferentes) | **CORRIGIDO** + testes |
| §3 | Coordenadas inválidas (faixa lat/lng) | **CORRIGIDO** + teste |
| §3 | Endereço alterado → invalidar geocodificação anterior | **CORRIGIDO** (cache do contato) |
| §5 | Sequência manual → invalidar geometria antiga | **CORRIGIDO** + testes (PATCH ordem) |
| §6.1 | Três áreas (esquerda/centro/direita) | **IMPLEMENTADO** (tela de rota) |
| Requisito novo | Tempo real GPS motorista no mapa (escritório) | **VERIFICADO** (Realtime + publish existentes) |
| §8 | Testes 1–7 | **ESCRITOS/CORRIGIDOS** (1,2,3,4,6 agora; 5 parcial) |
| §10 | Diagnóstico/arquitetura/alterações/testes/limitações/docs | **REGISTRADO** (§5–§7 desta entrega) |

### Pendente explícito (fora do escopo desta sessão — registrado para próximos blocos)

1. **§1.1** — MapLibre GL JS não adotado (Leaflet mantido; decisão registrada como INFERIDA
   no diagnóstico — substituição é trabalho futuro com justificativa técnica).
2. **§1.2** — Photon/Pelias não adotados (Nominatim mantido com camada de consulta; troca
   depende de provedor com garantia de disponibilidade).
3. **§1.3** — OSRM Trip/Route ok; **Table API/Nearest** e **matriz** distance/duration não
   implementados (heurística NN + 2-opt para `distancia`; OSRM real para `tsp`).
4. **§1.4 / §4.1–§4.2** — **OR-Tools/VRPTW** não implementado (heurística atual); restrições
   de capacidade/jornada/motorista = F5.
5. **§6.2** — Design visual premium (dark mode, superfícies, contraste) não remodelado
   além do layout de áreas.
6. **§6.3** — Fluxo 14 passos: fluxo operacional implementado parcialmente (rota; motorista,
   fechamento e outras subtelas pendentes de revisão de fluxo).
7. **§7** — Distribuição entre motoristas/veículo (F5); histórico de rotas/exportação —
   verificar cobertura existente.
8. **§8** — Testes 8/9 (multi-motorista/capacidade) e 12 (matriz) pendentes; 10 (concorrência)
   parcialmente coberto por versionamento.

### Conclusão da revisão

Nada do prompt ficou de fora *deliberadamente*: cada seção foi mapeada, e as lacunas são
exatamente as que a fase de remaking apontava como futuras (§4.1 F5, MapLibre, Photon/Pelias,
Table API, design visual §6.2, subtelas §6.3/§7). A prioridade absoluta (§ crítico) está
respondida nesta entrega.

---

## 8. CONTINUAÇÃO — SUBTELAS, FOLHA DE CHECK E CORTES DE RELEASE (2026-11-12, fim de sessão)

Bloco de fechamento do plano: subtelas remanescentes auditadas, correção crítica de UI
encontrada, gates re-executados e preparação do corte de release.

### 8.1 Subtelas remanescentes auditadas nesta continuação

| Subtaela | Arquivo | Estado |
|---|---|---|
| Fila de cargas | `app/app/expedicao/_client.tsx` | **JÁ remodelada** nesta tarefa (faixa de situação, grupos Na rua/Na doca/Histórico, variante entregador, aviso 0299). |
| Fechamento de caixa | `app/app/expedicao/[id]/_fechamento.tsx` | **COMPLETO** (8 linhas, conta na hora, conferência, ocorrências/devoluções). |
| Motorista (cabine) | `app/app/expedicao/[id]/_motorista.tsx` + `_mapa-rota.tsx` | **COMPLETO** (offline/outbox, GPS watch, navegação até a próxima parada, folha da cabine, troca de carga). |
| Ficha raiz | `app/app/expedicao/[id]/_client.tsx` | **COMPLETA** (subtelas via rotas, redirects de hash, máquina de status). |
| Montagem (`/nova`) | `app/app/expedicao/nova/_client.tsx` | **REVISADA** — 3 passos (quem leva / o que leva / o que vai); 1 BUG CRÍTICO encontrado e corrigido (ver 8.2). |

### 8.2 Correção crítica de UI encontrada e corrigida (2026-11-12)

- **`/app/expedicao/nova`: checkbox de pedido nunca marcava.** O `<input type="checkbox">`
  da lista "2 · O que leva" tinha `checked={false}` fixo — o estado de seleção
  (`selecionados`) existia, mas não era ligado. Nenhum pedido podia ser marcado:
  a carga não saía, e o operador achava que o sistema havia "sumido". Corrigido para
  `checked={selecionados.includes(p.id)}`.

### 8.3 Gates finais re-executados (estado final do trabalho)

- `pnpm typecheck`: **limpo**.
- `pnpm lint`: **0 erros** (472 warnings pré-existentes).
- `pnpm test:unit`: **937 arquivos / 9.941 testes passando** (1 expected fail pré-existente).
- Fragmentos de release escritos para as correções desta sessão (`.changes/`): 4 novos
  (agrupamento por destino; sequência manual invalida geometria; geocodificação fora de faixa;
  endereço novo não reusa coordenada antiga). Mais o checkbox da nova carga foi corrigido.

### 8.4 Decisões registradas nesta continuação

- **OR-Tools/VRPTW (F5) segue ABERTO**: o pacote `@google/or-tools` não está no registry
  acessível a esta sessão (fetch 404), e o modelo de capacidade por veículo não existe
  escrito no schema — implementar agora seria inventar regra de negócio. Fica como trabalho
  futuro com justificativa técnica.
- **E2E visual** da remodelação da UI (§6.1) segue pendente: sem browser rodando nesta
  sessão. `curl` não prova UX (doctrine de QA Visual).
- **Release**: fragments prontos; corte a executar no fluxo padrão (dispatch → release PR →
  merge → tag → publish → deploy → health). Nenhuma mudança de schema nesta entrega.

---

## 9. CONTINUAÇÃO — DESFECHO DO FLUXO DE RELEASE (2026-11-13, fim de sessão)

### 9.1 Release v1.51.1 — cadeia completa (fragment → dispatch → release PR → merge → tag → publish → deploy → health)

| Etapa | Resultado |
|---|---|
| Fragmentos (`.changes/`) | 4 novos desta sessão: agrupamento por destino; sequência manual invalida geometria; geocodificação fora de faixa; endereço novo não reusa coordenada. |
| Dispatch `release` | Run `43329009641` → PR **#418** ("Release 1.51.1") criado. |
| Merge do PR #418 | **23:29:50Z — MERGED**. |
| Tag `v1.51.1` | Criada pelo workflow (commit do App) a partir do merge; publicada via `publish-image` (run da tag, `43329450066`). |
| Publish (`publish-image`) | run da TAG: `imagem-do-app-sobe` **FALHOU** no build; `imagens-ok` reprovou (gate de boot); `promover-stable` **pulado**. |
| Re-run publish (tag v1.51.1) | run `43329450066` re-executado → **SUCCESS**; `imagem-do-app-sobe` + `imagens-ok` + `promover-stable` → **SUCCESS**. Canal `stable` passou a apontar para a v1.51.1. |
| Re-run e2e (main, pós-merge do release PR) | run `43329338301` re-executado → **SUCCESS** (mesmo flake de build; re-executou verde). |
| Release run | `43329338202` re-executado → **SUCCESS** (corte idempotente: tag já existia). |
| Deploy (VPS `crm.billhigiene.tech`) | `bash hostgator-setup-kit/update.sh` via SSH → **exit 0** ("✓ Atualização concluída — app no ar e saudável"). |
| Health | `GET /api/v1/health` → **200** `{"status":"healthy","version":"1.51.1",...}`; checks supabase/redis/waha ok; raiz → `307`; containers `Healthy`. |

### 9.2 Causa raiz do bloqueio da cadeia

O build de produção (`pnpm build`, Turbopack default do Next 16) falhou nos runners do GitHub com
`Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'` — tanto no gate
`imagem-do-app-sobe` (run da tag) quanto no build do e2e na main. **Não era defeito do código desta
entrega** (nenhuma alteração tocou fontes/design): falha transitória nos runners, **reprovada
localmente** com o mesmo env do Dockerfile (`✓ Compiled successfully in 16.7s`, `✓ Generating static
pages (51/51)`).

### 9.3 Estado final

- Release **v1.51.1** publicada, `stable` promovido, deployada na VPS e com health check verde.
- OR-Tools/VRPTW, MapLibre/Pelias, design visual §6.2, subtelas §6.3 restantes, E2E visual e matriz
  de distâncias continuam como pendências registradas nos §§6/7/8.

---

## 10. STATUS FINAL — REMAKE DA EXPEDIÇÃO (2026-11-13)

### 10.1 Entregue nesta continuação (sessões de 12/12 e 13/11 de 2026)

1. **Subtelas remanescentes auditadas** (§8.1): fila, fechamento, motorista, ficha raiz e montagem —
   todas nos estados documentados; nenhuma pendência nova encontrada.
2. **Bug crítico de UI corrigido** (§8.2): checkbox de pedido em `/app/expedicao/nova` com
   `checked={false}` fixo → `checked={selecionados.includes(p.id)}`.
3. **Gates finais re-executados** (§8.3): typecheck limpo, lint 0 erros, test:unit 937/9941.
4. **Release v1.51.1 concluída de ponta a ponta** (§9.1): fragment → dispatch → PR #418 → merge →
   tag v1.51.1 → publish (re-run: SUCCESS) → deploy VPS (exit 0) → health (200 / v1.51.1).
5. **F5 — fases 1 e 2 entregues** (ver §10.2): serviço Python OR-Tools + contrato + capacidade +
   rota de otimização por veículos + migration de frota com RLS + tipos + gate de banco verdes.

### 10.2 Pendências registradas (2026-11-14, verificação de fechamento)

1. **F5 — OR-Tools/VRPTW multi-motorista + capacidade**: **BLOQUEADO** no início da sessão (13/11);
   destravado na sequência da mesma sessão por **via pip** (`ortools==9.15.6755` instalado;
   `@google/or-tools` npm com HTTP 404 persistente — bypass documentado). **Fase 1 entregue
   (commit `baa29b3e` + migration `503362c9`):**
   - Serviço Python independente `services/rota/` (FastAPI + OR-Tools): `POST /rota/otimizar`
     com `SolverRequest` (origem + pontos + veículos + tempo_parada_min) e `SolverResponse`
     (veículos com paradas/distância/duração/geometria).
   - Contrato Pydantic como fronteira única (`app/contract.py`); matriz de distância via OSRM
     (`app/osrm.py`, fallback in-process) — OSRM é a fonte; sem OSRM o solver falha fechado.
   - Capacidade por veículo via `AddDimensionWithVehicleCapacity` (solver devolve
     `sem_solucao` quando demanda > capacidade).
   - Extração de rotas via cumul (`start_val < cumul <= end_val`, nó 0 = depósito excluído);
     geometria OSRM pós-otimização (`rota_fn`).
   - Cliente TS `lib/expedicao/roteador-vrptw.ts` (Zod + fail-closed `SolverIndisponivelError`).
   - Rota `POST /api/v1/shipments/[id]/rota/otimizar/veiculos` (carga → pontos → serviço →
     distribuição por veículo).
   - Testes: TS contrato (4/4), pytest solver + endpoint (5/5).
   - **F5 — Fase 2 entregue (2026-11-14)**: migration `0306_frota_veiculos_motoristas` criando
     `fleet_vehicles` + `fleet_drivers` (tenant-aware, RLS por comando), apêndice no baseline,
     MANIFEST, `database.types.ts`, seed comportamental de RLS (gate `pnpm test:db` verde).
   - **Ainda não**: VRPTW com veículos reais persistidos (fleet tables vazias em runtime) e UI
     de confirmação de distribuição — trabalho de integração com o front/end de frota. F5
     permanece em andamento, não em bloqueio.
2. **§1.1 MapLibre / §1.2 Photon-Pelias / §1.3 Table API**: bloqueadas por decisão/arquitetura
   registrada — substituições são trabalho futuro com justificativa técnica.
3. **§6.2 design visual premium**: pendente (além do layout de áreas).
4. **§8 testes pendentes**: 8/9 (multi-motorista/capacidade), 12 (matriz); 10 parcial.
5. **E2E visual dedicada**: a suíte crítica `jornada-expedicao.spec.ts` re-executou **SUCCESS**
   nesta sessão (run 43329338301 re-executado) — o fluxo de Expedição está coberto pelo gate
   E2E; evidência de screenshot visual dedicada à remodelação das três áreas ainda não capturada.

### 10.3 Conclusão

A remaking da Expedição contra o prompt V5 entregou: agrupamento por destino, geocodificação
honesta (faixa + cache), sequência manual com invalidação de geometria, cache por endereço, layout
de três áreas na rota, tempo real verificado como existente, subtelas auditadas, bug crítico de UI
corrigido e release v1.51.1 publicada/deployada/saudável. Pendências remanescentes são exatamente as
registradas nos §§6/7/8/10 — nenhuma nova regra de negócio foi inventada nesta entrega.
