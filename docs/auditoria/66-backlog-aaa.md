# 66 — Backlog vivo do programa NEXUS AAA

> Fila viva ao lado do [`39-fila-por-worker.md`](39-fila-por-worker.md). Uma linha
> por item: **id · item · estado · dono · evidência · próximo passo**.
> Estados: `[x]` fechado · `[~]` em curso · `[!]` bloqueado · `[ ]` não iniciado.
> **Nada sem dono.**
> **Placar (24/11):** 26 `[x]` · 4 `[~]` · 4 `[!]` · 6 `[ ]` — 40 itens (contagem só das linhas de tabela; a legenda não entra).
> coordenação não deixa slot vazio.

## P0

| id | item | estado | dono | evidência | próximo passo |
|---|---|---|---|---|---|
| P0-7 | Leitores de `fn_slo_api_resumo` leem array como objeto: série zera no painel e no Sentinel | `[x]` | G | produção: 267 amostras/7d, p95 2660 ms (alvo 800), 0 erros; nenhuma ocorrência `plataforma.slo_estourado` aberta | **#810** → `185127927`; RPC array normalizado nos dois leitores + testes com 267 amostras | verificação pós-deploy: 267+ amostras na tela e ocorrência aberta 
| P0-8 | Performance de `/api/v1/conversations`: p95 2673 ms em produção (259 amostras, alvo 800) | `[~]` | G | medição do dono, 7 dias | **#811** → `d8638cf3` + **#812** → `1b484654`; p95 2673 ms em `/api/v1/conversations` medido | perfilhar N+1/query e medir antes/depois; alvo 800 ms 

| P0-1 | Reauditoria de service role (223 rotas/294 arquivos vs revisão de 42 cadeias em 18/11) | `[x]` | G | **#768** → `62c2fca8c`; reauditoria mergeada com gates | — |
| P0-2 | Registrar verificação do deploy 1.62.3 no `40` (o doc para na 1.62.2) | `[~]` | coordenação | 7 containers, health 1.62.3, `/login` 200, `URI too long` 0, Sentinel 5 reafirmados | item novo no `40` com números e a lição do `exit 124` |
| P0-3 | Motor laya: subir (a) ou limpar `LAYA_URL` (b) | `[!]` | **BLOQUEADO — dono** | `40` §19: 50 qualificações/17 risk/17 radar em 6h | dono escolhe (a) serviço na VPS ou (b) env limpo |
| P0-4 | Reconciliar 119 vs 124 orçamentos Mercos + superfície “Orçamentos parados” | `[~]` | coordenação (recorte) + F (backend) + D (tela) | Recorte escrito no fim deste doc; backend entregue | D projeta a tela sobre o endpoint |
| P0-5 | Confirmação de rota transacional (atomicidade) | `[x]` | G | **#771** → `2ca999665`; ordem e versão na mesma transação (0335) | — |

| P0-6 | P0 de packaging: `update.sh` com schema em transação única (`psql --single-transaction`) ou verificação `to_regclass` antes de trocar imagens | `[x]` | G | aborto da 1.63.0 deixou 0335 aplicada (40 §35); guard protege a imagem, não o schema | **#796** → `596b96bbe`; `psql -1` aplicado em produção 1.64.0 (40 §38) | — 

## P1

| id | item | estado | dono | evidência | próximo passo |
|---|---|---|---|---|---|
| P1-1 | 96 telas `app/app` por concentração + contraste por token | `[x]` | D | varredura fatiada de 99 rotas; tenent-switcher 82 rotas | **#806** → `e02678acc`; varredura das 96 entregue | — 
| P1-2 | `rota_versao_confirmada` (0334) + escrita pelo app | `[x]` | G | **#773** → `29df915bb`; `rota_versao_confirmada` (0336) + escrita pelo app |
| P1-3 | Mapa↔lista sincronizados + pino por precisão | `[~]` | D | PRs de rotas do passe de expedição | seleção no mapa reflete na lista e vice-versa |
| P1-4 | GPS “sem sinal há N min” + `PHOTON_URL` no env/template | `[x]` | G | **#774** → `3bbde8db5`; GPS honesto + `PHOTON_URL` no kit | — |
| P1-5 | E2E 17/18/19: GPS ausente, mobile real, fila offline com retry/conflito | `[ ]` | G (próximo) | specs em `tests/e2e/`; Android real nunca rodou | escrever specs e marcar bloqueio de dispositivo |
| P1-6 | 24 rotas dinâmicas sem id: criar fixture local e medir | `[x]` | D | **#769** → `20f0b3b2b` (+ `e3fbaf994`); fixture das dinâmicas e seed anuncia destino |
| P1-7 | F-04: token canônico (`#67885d` vs `#7e77f0`) com medição | `[ ]` | D (próximo) | dois hex em arquivos de design | escolher token, medir contraste, documentar |
| P1-8 | Workbench de expedição no mobile em abas/drawer (hoje empilha) | `[x]` | D | **#780** → `32521385e`; abas Pedidos/Mapa/Planejamento, medido 390/1440 px | — |
| P1-9 | Matriz única de capacidades de expedição (hoje dispersa em handoffs) | `[ ]` | coordenação | handoffs em `docs/frentes/` | consolidar em matriz com dono/estado |
| P1-10 | 10 `.in()` sem teto restantes (doc 51) — priorizar os de cron | `[x]` | G | **#791** → `4d846f57`; `.in()` nos crons com teto | — |
| P1-11 | `anon` com GRANT em 58/179 tabelas no descartável (limite F-09) | `[x]` | G | **#792** → `250bbbec`; investigação registrada | — |
| P1-12 | `Idempotency-Key` em `POST /messages` (pré-requisito do outbox web) | `[x]` | F | **#766** → `6bd44c3e8`; `Idempotency-Key` em `POST /messages` | — |
| P1-13 | SLO p95 real quando a série acumular (hoje 1 amostra = 1428 ms) | `[x]` | G | **#793** → `e0f31c1d`; p95 local 505 ms (série local, não produção) | — |
| P1-14 | 5 leads duplicados reais | `[!]` | **BLOQUEADO — dono (merge)** | Sentinel 5 reafirmadas; sem merge automático | dono decide mesclar; ferramenta só linka |
| P1-15 | Android físico / iOS | `[!]` | **BLOQUEADO — dono** | iOS fora por decisão; Android real nunca executado | dispositivo + decisão de escopo |
| P1-16 | Recontar inventário vivo (440 rotas hoje vs 419 em 18/11) com delta explicado | `[x]` | coordenação | **#767** → `0d0b4f45f`; inventário reconciliado | — |

| P1-17 | Controle de gastos da campanha: orçamento de prospecção + verba Meta, simulação mínimo/esperado/máximo na criação e guard 80%/100% com override de gerente auditado | `[x]` | F | **#772** → `35bf529d9`; simulação + guards 80%/100% + override auditado; gasto Meta manual | — |

### P1-17 — aceite e dependências

- **Dependências:** `grade.ts` para alcance; `custos.ts` para preço; `uso.ts` para
  consumo. Nada de motor paralelo de custo.
- **Simulação:** mínimo / esperado / máximo na **criação**, com premissas visíveis
  (CPM e CTR configuráveis, **declarados como premissa** — nunca como fato).
- **Guard:** 80% (aviso) e 100% (bloqueio), com **override de gerente** com motivo e
  auditoria.
- **Gasto de mídia Meta:** **lançamento manual** até existir Marketing API; a tela
  diz isso explicitamente e nunca importa nem simula valor como real.
- **Entrega:** PR com `.changes/` (`capacidade_nova` ⇒ a release deriva **minor**),
  testes do guard/override/simulação e fragmento conferido antes do corte.
- **Depois do merge:** avisar **D** para o passe visual/medição do wizard e do painel
  (D não implementa a lógica).

## P2

| id | item | estado | dono | evidência | próximo passo |
|---|---|---|---|---|---|
| P2-1 | `prompt-mestre.sha256` inválido (registra `ee40a0a2…`, arquivo mede `c37217c4…`) | `[ ]` | coordenação | hashes fornecidos pelo dono | recalcular hash e corrigir registro |
| P2-2 | Docs com contagens antigas (F-11) | `[ ]` | coordenação | F-11 em `docs/auditoria/` | trocar número por comando onde couber |
| P2-3 | Reclassificar fragmento `observabilidade-sonda`? | `[!]` | **BLOQUEADO — dono** | fragmento `capacidade_nova` definou 1.62.0 | dono decide; mudança só com reclassificação honesta |

## Itens adicionais (22/11/2026)

| id | item | estado | dono | evidência | próximo passo |
|---|---|---|---|---|---|
| P1-18 | NF-e avulsa: auto-preencher cliente (CPF do `source_metadata`), enviar todos os extras e chamar `/validar` | `[x]` | F | **#762** → `0b444b589`; avulsa com extras/CPF/validar | — |
| P1-19 | “Informações fiscais (NF-e)” no criador, separada de observações | `[x]` | F | **#763** → `0840cfa86`; informações fiscais no criador | — |
| P1-20 | Formas de pagamento configuráveis (tabela + tela, forma × prazo, `tpag` só com fonte oficial) | `[x]` | F | **#764** → `7bd8a63a8`; formas de pagamento configuráveis | — |
| P1-21 | “Editar pedido” no lugar de “Adicionar produto ao pedido” | `[x]` | F | **#765** → `ac2d92738`; “Editar pedido” no lugar de adicionar produto | — |
| P1-22 | Não sobrescrever coordenada com `null` quando `estado:"erro"` na regeocodificação | `[x]` | G | **#776** → `a9cb4015e`; coordenada preservada | — |
| P1-23 | `separacaoPendente` na decisão de publicar (botão não habilitar o que `iniciar` recusa) | `[x]` | G | **#777** → `55d5acfb`; mesma regra no cliente e no servidor | — |
| P1-24 | “Último sync” visível na cabine + política explícita de foto offline | `[ ]` | G | docs de cabine/offline | estado visível + política escrita |
| P1-25 | Inbox: selo “mostrando o que já carregou” quando `realtimeStatus ≠ ativo` | `[x]` | D | passe de inbox | **#798** → `c05c07ea`; selo medido 1/1 em 4 combinações | — 
| P1-26 | Inbox: superfície do handoff (`buildHandoffSummary`, motivo, `last_handoff_at`) no cabeçalho/painel | `[x]` | D | `lib/inbox/handoff.ts` | **#799** → `82c90c18`; painel de handoff no cabeçalho, 4/4 combinações | — 
| P1-27 | Dashboard: estado vazio explícito com `NexusEmptyState` onde hoje há ausência silenciosa de série | `[x]` | D | passe de dashboard | **#804** → `aff53e90`; `NexusEmptyState` no Dashboard | — 
| P2-4 | Consolidar `PROMPT-EXPEDICAO.md` no repo e linkar na auditoria | `[x]` | coordenação | `PROMPT-EXPEDICAO.md` na raiz (#761 → `7b70052b`) e linkado neste doc |

| P1-28 | Multi-campanha + retomada 48h: empresa em outra campanha entra na nova; nunca contatada recebe template Meta, já contatada recebe mensagem de retomada; follow-up +48h uma vez, idempotente, cancelado em resposta/opt-out, no ritmo/rotação de `disparo.ts` | `[x]` | F (frente da fila) | decisão do dono; causa raiz `prospect_em_outra_campanha` em `baseline.sql:22109-22122` (desde 0277) | **#794** → `940c140e`; multi-campanha + retomada 48h (template Meta aprovado: pré-requisito operacional) | — 

### P1-28 — dependências e aceite

- **Causa raiz:** trigger `prospect_em_outra_campanha` (`baseline.sql:22109-22122`,
  desde 0277) impede a empresa de pertencer a duas campanhas. Migration de
  membresia substitui a exclusividade por coexistência — nada destrutivo.
- **Dependências:** (1) **template de retomada aprovado na Meta** — fora da janela
  de 24h o texto livre é rejeitado (131047), então a retomada **não dispara sem
  template aprovado**; (2) migration de membresia multi-campanha; (3)
  `prospecting_sends` continua com **1 envio por campanha**; (4) texto vem de
  **preset configurável pela marca do tenant**, nunca hardcoded.
- **Aceite:** “Ver empresas” mostra nunca-contatada → template Meta da campanha;
  já-contatada → retomada. Follow-up automático **+48h**, **uma vez**,
  **idempotente**, cancelado se houver resposta ou opt-out, usando ritmo e
  rotação de `disparo.ts`. Sem template aprovado, o fluxo fica pronto e é
  declarado **“aguardando aprovação”** — nunca marcado como disparado.
- **Próxima release:** entra na **próxima** janela, por decisão do dono ao fechar
  o lote da 1.63.0; o código pode ser mergeado antes, mas a feature só é anunciada
  quando o template estiver aprovado.

## Fonte de requisitos da Expedição

[`PROMPT-EXPEDICAO.md`](../../PROMPT-EXPEDICAO.md) está versionado na raiz — é a
fonte dos requisitos de Expedição e a referência dos itens P0-5, P1-2, P1-3, P1-4,
P1-5, P1-8 e P1-9.

**Cobertura dos requisitos:** os IDs `R1–R42` são uma **numeração sequencial
adotada neste inventário** (o prompt não traz IDs próprios), sobre as listas do
prompt (Objetivo, P0, P1, P2 e critérios de aceitação). Mapeados: 22 em itens do
backlog, 16 atendidos, 4 não aplicáveis (dependência de hardware/credencial sem
origem real). Nenhum requisito sem destino.

**Cobertura R1–R42 recalculada após os merges.**


## Depois do deploy da 1.63.0 (decisão do dono, 23/11)

**Na janela da 1.63.0:** P0-5 · P1-2 · P1-4 · P1-8 · P1-22 · P1-23 — expedição
pronta e no ar até 07:00 (alvo de tag 05:30, deploy/verificação até 06:30).
O E2E inteiro **não** é pré-requisito do corte: specs novas não prontas vão na
próxima.

**Ficam para depois do deploy:** P1-28 multi-campanha/retomada 48h (F) ·
orçamentos parados (P0-4, recorte + tela) · Inbox/Dashboard (P1-25/26/27) ·
10 `.in()` sem teto (P1-10) · `anon` em 58/179 tabelas (P1-11) · SLO p95 real
(P1-13) · E2E restante (P1-5). Congelamento de features vale até o corte.
## Regra de retomada 48h (decisão do dono, 23/11/2026)

Empresa **nunca contatada** entra na campanha com o template Meta escolhido;
empresa **já contatada** entra com o **texto de retomada**. O texto é PRESET
CONFIGURÁVEL em `prospecting_message_presets` (categoria `retomada`) — nunca
texto fixo no código, porque contém a marca do tenant.

Após o envio inicial, agendar **1** follow-up para +48h somente se não houve
resposta. Cancelar se respondeu, pediu opt-out, a conversa foi encerrada por
opt-out ou o prospect foi excluído. Idempotente por `(campaign_id, prospect_id)`
e com teto de tentativas.

**Limite técnico (não negociável):** fora da janela de 24h da Meta, texto livre
é rejeitado com `131047`. A retomada fora da janela só sai com **template
aprovado na Meta**; sem o template, o fluxo fica bloqueado com motivo nomeado.
A checagem usa `lib/channels/janela.ts`.

**Status:** implementado no P1-28 (membresia multi-campanha + matching sem
case/acento da campanha `3a0909d6`). Sem template aprovado o estado é
**`aguardando_aprovacao`** — nunca `enviado`. Liberado para merge após a
1.63.1; nenhuma release nova sem pedido do dono.


## Reconciliação 119 × 124 — recorte escrito (23/11/2026)

- **124**: 20/11, `40` §16 — `origem='mercos' AND status='rascunho'` (todos), R$ 218.003,63, primeiro 2024-10-23, último 2026-11-19, 0 com previsão de entrega. **CONFIRMADO**.
- **119**: mesmo filtro **mais** `created_by IS NULL` (rascunhos do Mercos nunca abertos pela nossa equipe). **INFERIDO** de 124 − 5 rascunhos com autor humano; não re-medido em produção nesta rodada.
- Diferença = 5, por `created_by` — não é divergência de contagem.

Backend: `GET /api/v1/commercial-orders/orcamentos-parados` devolve número, cliente, valor, idade em dias, `dias_limite` e próximo passo por linha. Régua de 60 dias lida de `organizations.settings->'orcamentos_parados'->>'dias_limite'`; código em `lib/comercial/orcamentos-parados.ts`. D faz a tela.


## Fechamentos e continuidade (24/11, 1.65.0)

- **#813** (uma leitura de auth por request), **#810** (leitura array da RPC) e
  **#814** (docs da policy set-based) fecharam. O #814 é documentação da
  medição (63,5 → 19,8 ms local, 897 → 331 buffers); **a migration da policy
  set-based segue com G** e entra na **1.64.2/next** depois de medida.
- **O redesenho do workbench da Expedição segue com D** (prioridade do dono).
- Release 1.65.0 é minor derivado: fragmento `capacidade_nova` do painel de
  gastos (#808) — a régua é o fragmento, não a frase dita antes de conferi-lo.
