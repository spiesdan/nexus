# Módulo 5.6 — Pedidos, catálogo, estoque, compras, fornecedores, faturamento, frota e expedição

> **Escopo do prompt:** "Revise lista, criação, edição, impressão, catálogo, descontos, estoque,
> compras, fornecedores, faturamento, frota, expedição, mapa, rota, motorista e fechamento.
> Documente as regras de aprovação, crédito, preço, estoque e sincronização. Mantenha totais e
> valores em centavos com formatação correta. Trate ações irreversíveis com confirmação e audit
> trail."
>
> **Método:** leitura do código e das rotas, sem rodar o produto para cada célula. O que exigia
> execução está marcado como **não medido**. Medido em 2026-11-17 na branch
> `docs/auditoria-aaa`, com quatro leituras paralelas (pedidos, catálogo/faturamento,
> estoque/compras, expedição/frota) e conferência no código.

## 1. Superfície medida

| Fatia | Telas | APIs | Testes que cobrem |
| --- | --- | --- | --- |
| Pedidos | `/app/pedidos`, `/novo`, `/[id]`, `/imprimir` | 6 handlers em `commercial-orders/**` | `pedido-chave-sincronizacao`, `pedidos-contrato`, `patch-itens-servico`, `credito-contrato`, `pedido-idempotencia` (e2e) |
| Catálogo/preços | `/app/products` (3 abas + `?config=tabelas`) | 8 `products/**` + 3 `price-tables/**` | `precos-contrato`, `produtos-*`, `preco-de-planilha-suja`, `products-limite` |
| Estoque/compras | `/app/estoque` (3 abas), `/app/compras`, `/app/compras/[id]`, `/app/fiscal/fornecedores` | 6 handlers (`inventory/movements`, `purchase-orders`, `suppliers`) | `estoque/sugestao`, `compras-do-rascunho-ao-estoque`, `estoque-entrada-saida-e-saldo` |
| Faturamento/fiscal | `/app/faturamento`, `/app/notas` | 1 `faturamento`, 10 `invoices/**` | só indiretos (`invoices`), **0** para `/api/v1/faturamento` |
| Frota | `/app/frota` | 5 `fleet/**` | `fleet-rotas` |
| Expedição | `/app/expedicao`, `/nova`, `/[id]`, `/[id]/rota`, `/[id]/motorista`, `/[id]/fechamento` | 25 `shipments/**` + `rotas` | `jornada-expedicao`, `expedicao-contrato`, `fechamento-expedicao`, `rota-distribuicao-route`, `expedicao-roteador-vrptw`, `shipment-*` + 17 em `lib/rotas` |

**Números:** 22 telas/subtelas, ~56 handlers, 9.752 linhas de client components só em
expedição/frota.

## 2. Regras comerciais — o que o código aplica

| Regra | Aplicada? | Onde | Efeito ao violar |
| --- | --- | --- | --- |
| Teto de desconto na criação escala para `em_analise` | sim | `lib/comercial/criar-pedido.ts:269-279` | `aprovacao_necessaria: true` |
| Aprovar/concluir acima do teto exige `manager` | sim | `app/api/v1/commercial-orders/[id]/route.ts:146-182` | 422 |
| Teto de desconto no PATCH de itens | **não** (corrigido em 17/11) | `lib/comercial/patch-itens.ts` | agora: `em_analise` ou 422 se comprometido |
| Tabela de preço no PATCH de itens | **não** (corrigido em 17/11) | idem | agora: 422 `preco_fora_da_tabela` |
| Estoque no PATCH de itens | **não** (corrigido em 17/11) | idem | agora: 422 `estoque_insuficiente` |
| Crédito na criação | sim | `lib/comercial/credito.ts:14,53-56` | 422 "acima do limite"; rascunho nunca barra |
| Crédito ao trocar status | parcial | `[id]/route.ts:189-212` | só valida quando o status atual é `rascunho` |
| Preço efetivo decidido no servidor (criação) | sim | `lib/schemas/precos.ts:74-81`; `criar-pedido.ts:213-228` | 422 "preço fora da tabela" |
| Estoque na criação | sim | `criar-pedido.ts:229-244` | 422 "estoque insuficiente" |
| Baixa de estoque | sim, fora de rascunho | `criar-pedido.ts:396-408` | **read-modify-write sem transação** — ver A2 |
| Devolução de estoque ao cancelar pedido | **não** | `[id]/route.ts:333-357` (só DELETE) | cancelar não devolve |
| Máquina de estados do pedido | **não** | `[id]/route.ts:215-221` | `entregue→rascunho` e `cancelado→aprovado` passam |
| Idempotência por `chave_sincronizacao` | sim | `criar-pedido.ts:72-102,358-377` | retry → 200 `ja_existia`, não reaudita |
| Total = subtotal − desconto + frete, em centavos | sim | `criar-pedido.ts:257-265` | 422 se desconto > subtotal |
| Movimento de estoque recusa saída > saldo | sim | `inventory/movements/route.ts:88-94` | 422 |
| Compra nasce `rascunho`; receber só `enviado` | sim | `purchase-orders/[id]/route.ts:85-87`; `receber/route.ts:76-96` | 422 |
| Carga só com pedido embarcável; distribuição revalida capacidade/jornada | sim | `shipments/route.ts:87-95`; `rota/distribuicao/route.ts:265-330` | 409/422 |
| Rota: iniciar exige paradas separadas; finalizar exige zero pendência | sim | `rota/_transicao.ts:32-44,58-67` | 422 |

## 3. Ações irreversíveis — confirmação e audit trail

| Ação | Confirmação na UI | `audit()` | Onde |
| --- | --- | --- | --- |
| Excluir pedido | sim | sim | `pedidos/[id]/_detalhe.tsx:623-629`; `[id]/route.ts:366` |
| Cancelar pedido em massa | **não** | sim, sem metadata | `pedidos/_client.tsx:497-508` |
| Concluir / faturar pedido | **não** | sim | `_detalhe.tsx:587,597-607`; `[id]/route.ts:265-285` |
| Remover item do pedido | **não** | sim (`items_replaced`) | `_editar-itens.tsx:300`; `patch-itens.ts:288` |
| Excluir produto | sim | sim | `products/_client.tsx:751-772`; `products/[id]:107-114` |
| Gravar preços de tabela | **não** | sim, sem valores | `products/_tabelas.tsx:74-119`; `price-tables/[id]/items:88-95` |
| Cancelar NF | sim (autorizada usa `window.prompt`) | sim | `notas/GradeNotas.tsx:363-375`; `invoices/[id]/cancel:161-168` |
| Reemitir NF | **não** | sim | `GradeNotas.tsx:341-349` |
| Movimento de estoque | **não** | sim | `estoque/_client.tsx:729` |
| Enviar/cancelar/receber compra | sim | sim | `compras/[id]/_client.tsx:71-87,282-301` |
| Excluir carga / remover pedido | sim / **não** | sim | `expedicao/_client.tsx:308` / `:270` |
| **Iniciar rota ("Sair para rota")** | **não** | sim — e **notifica os clientes** | `_client.tsx:230-236,699`; `_motorista.tsx:454-463,906`; `_transicao.ts:76-100` |
| **Marcar entregue** | **não** | sim | `_client.tsx:1131-1135`; `_motorista.tsx:1000-1007` |
| Fechar carga | sim | sim | `_client.tsx:283-288`; `_transicao.ts:76-83` |
| Distribuir/reotimizar | sim | sim | `_roteirizador.tsx:715,795,886` |
| Excluir veículo/motorista | sim | sim | `frota/_client.tsx:179,485` |

## 4. Dinheiro

- `_cents` ponta a ponta em pedidos, compras, expedição e fechamento; total recalculado no
  servidor, nunca do corpo (`fechamento/route.ts:180`; `fechamento-carga.ts:106-121`).
- `comoMoeda` é o formatador único (271 usos antes desta rodada).
- **Corrigido:** a mensagem de sobra/falta do fechamento usava `toFixed(2)` e saía
  `Sobra de 2.00` (ponto, sem moeda) — passou a `R$ 2,00` (`fechamento-carga.ts:166-170`).
- **Aberto:** o custo digitado em `/app/compras` faz
  `Number("1.234,56".replace(",", ".")) * 100` → `NaN || 0`, e `centavosDeBr` já existe
  (`lib/format/moeda.ts:24`). É perda silenciosa de valor — P1.

## 5. Por tela (o que o prompt pede)

### Pedidos (`/app/pedidos`, `/novo`, `/[id]`, `/imprimir`)
- **Objetivo/usuário:** vender e acompanhar o pedido; `agent` opera, `manager` aprova desconto.
- **Dados:** `commercial_orders`, `commercial_order_items`, `contacts`, `catalog_products`,
  `commercial_policies`, `price_tables`, `invoices`, `financial_receivables`.
- **Regras:** tabela da §2.
- **Estados:** skeleton só no refiltro; lista tem vazio com CTA e vazio de filtro; erro só em
  toast; `/novo` e `/[id]` não tinham `loading.tsx`/`error.tsx` — **corrigido** nesta rodada.
- **Responsividade:** primária visível em 390; no tablet o título chegou a 0 px e foi corrigido
  (V-46).
- **Problemas abertos:** máquina de estados ausente; `duplicar` copia `desconto_cents` sem
  `desconto_pct`; confirmação ausente em cancelar/concluir/faturar/remover item; baixa de
  estoque não atômica; timeline não conhece `items_replaced`/`deleted`.
- **Decisão:** corrigir a porta dos fundos (patch) agora; máquina de estados e estorno de
  estoque ficam para P0 da Fase 10, porque a regra do que fazer com pedido faturado **não está
  escrita** no repositório.

### Catálogo e preços (`/app/products`, `?config=tabelas`)
- **Objetivo/usuário:** catálogo que a IA e o vendedor consultam; `manager` edita.
- **Dados:** `catalog_products`, `product_images`, `product_categories`, `price_tables`,
  `price_table_items`.
- **Regras:** preço efetivo = item da tabela > desconto da tabela > preço base
  (`lib/schemas/precos.ts:74-81`).
- **Estados:** vazio e busca sem resultado; **sem estado de erro** — falha de query vira
  "Nenhum produto cadastrado" (`products/page.tsx:119,144,155`).
- **Problemas:** erro engolido; PUT da tabela apaga→insere sem transação; GET corta em 2.000
  itens e a tela reenvia o conjunto; sem histórico de preço; `Number("10,5")` vira 0 na UI.
- **Decisão:** P1 (erro engolido e transação); histórico de preço é capacidade nova (P3).

### Estoque e compras (`/app/estoque`, `/app/compras`, `/[id]`, `/fiscal/fornecedores`)
- **Objetivo/usuário:** saldo, razão e reposição; comprar e receber; `agent` opera, `manager`
  configura.
- **Dados:** `catalog_products`, `inventory_movements`, `purchase_orders`,
  `purchase_order_items`, `suppliers`.
- **Regras:** saída > saldo recusa; receber só `enviado`; custo × quantidade no subtotal.
- **Estados:** skeleton/vazio/erro+retry nas duas primeiras; `/fiscal/fornecedores` **sem
  loading nem erro** e engole o erro da query.
- **Problemas:** saldo read-modify-write sem transação; recebimento grava 3 tabelas em
  `Promise.all` sem rollback; catálogo truncado em 500; custo BR vira zero; cancelar compra não
  estorna; recebimento não atualiza `custo_cents`; fornecedor sem editar/desativar.
- **Decisão:** P0 para atomicidade do saldo/recebimento e estorno; P1 para o custo BR e o
  catálogo truncado; editar fornecedor é P2 (capacidade ausente, não regressão).

### Faturamento e notas (`/app/faturamento`, `/app/notas`)
- **Objetivo/usuário:** pedidos faturados × NF; `viewer` lê, `agent` emite/cancela.
- **Dados:** `commercial_orders`, `invoices`, `fiscal_jobs`, `fiscal_events`.
- **Regras:** só status faturável vira nota; cancelar autorizada transmite à SEFAZ antes.
- **Problemas:** `.lt()` em "até" exclui o dia; `limit(2000)` silencioso e soma no cliente;
  NF cancelada/denegada ainda conta como vinculada; reemitir sem confirmação; `/faturamento`
  sem teste de API.
- **Decisão:** P1 (data e limite), P2 (KPI por status), P2 (teste de API).

### Frota (`/app/frota`)
- **Objetivo/usuário:** veículos e motoristas; escrita `manager`.
- **Dados:** `fleet_vehicles`, `fleet_drivers`.
- **Estados:** vazio; erro por toast.
- **Problemas:** nenhum estrutural encontrado; capacidade/jornada são revalidadas na
  distribuição (`rota/distribuicao/route.ts:265-330`).
- **Decisão:** manter.

### Expedição (`/app/expedicao`, `/nova`, `/[id]`, `/rota`, `/motorista`, `/fechamento`)
- **Objetivo/usuário:** montar carga, distribuir, roteirizar, entregar e fechar; `agent` opera,
  `motorista` vê só as cargas dele, `manager` fecha.
- **Dados:** `shipments`, `shipment_orders`, `shipment_destinations` (snapshot de endereço),
  `shipment_route_versions`, `shipment_positions`, `shipment_proofs`, `shipment_closings`.
- **Regras:** carga só com pedido embarcável (409 se já embarcado); snapshot do destino na
  inclusão; iniciar exige separação; finalizar exige zero pendência; distribuição revalida
  capacidade/jornada e versiona com `versao_base` (409 em concorrência).
- **Estados:** OSRM fora → "Ordem aproximada" e distância em reta ×1,3; navegação 503 com
  motivo; sem coordenada → `nao_roteirizaveis` + "Esta parada não tem coordenada".
- **Problemas:** iniciar rota e marcar entregue **sem confirmação** (e iniciar notifica os
  clientes); `cancelada` inalcançável na UI; PATCH permite `em_rota→montando/cancelada` sem
  checar itens; remover pedido da carga sem confirmação; audit de status sem metadata;
  lista de cargas limitada a 200 sem paginação.
- **Decisão:** confirmação nas três ações e bloqueio da regressão de status são P1 desta
  rodada; paginação é P2 (F-30).

## 6. Achados por severidade

| # | Achado | Sev. | Estado |
| --- | --- | --- | --- |
| A1 | Patch de itens furava alçada, tabela de preço e estoque | **P0** | **corrigido** (commit `e4d2b2e7`) |
| A2 | Saldo de estoque e recebimento de compra: read-modify-write/3 escritas sem transação | **P0** | **parcial**: CAS no saldo (`a546932c`); recebimento ainda sem transação única |
| A3 | Cancelar pedido/compra não devolve estoque | **P0** | **corrigido** (`a546932c`): pedido devolve; compra estorna o recebido |
| A4 | Sem máquina de estados do pedido (qualquer status→qualquer) | **P0** | **corrigido** (`a546932c`): `transicoes-do-pedido.ts` + botão concluir |
| A5 | `duplicar` copia `desconto_cents` sem `desconto_pct` | P1 | **corrigido** (`55291df5`) |
| A6 | Custo BR em `/app/compras` vira zero | P1 | **corrigido** (`b43f54f4`) |
| A7 | Catálogo truncado em 500 no estoque/compras | P1 | aberto (F-30) |
| A8 | Iniciar rota / marcar entregue / tirar pedido sem confirmação | P1 | **corrigido**: iniciar (`b43f54f4`), entregar e tirar da carga pedem confirmação |
| A9 | PATCH de carga permite regressão `em_rota→montando/cancelada` | P1 | **corrigido** (`b43f54f4`) |
| A10 | `/faturamento` `.lt()` exclui o dia; limite 2.000 silencioso | P1 | **data corrigida** (`55291df5`); limite ainda silencioso (log) |
| A11 | Catálogo engole erro de query e mostra "nenhum produto" | P1 | **corrigido** (`55291df5`) |
| A12 | Tabela de preço: PUT apaga→insere sem transação | P1 | aberto |
| A13 | Timeline não conhece `items_replaced`/`deleted`/`approved_by_client` | P2 | aberto |
| A14 | Fornecedor sem editar/desativar; `observacoes` nunca exibidas | P2 | aberto |
| A15 | Lista de cargas 200 sem paginação | P2 | aberto (F-30) |
| A16 | Mensagem de sobra/falta com `toFixed` | P3 | **corrigido** |

## 7. O que foi corrigido nesta rodada

1. **Patch de itens** (A1): preço de tabela, estoque, alçada e `desconto_cents` — 24 testes.
2. **Pedidos `loading.tsx`/`error.tsx`**: o primeiro paint bloqueava e a falha subia sem
   contexto (`app/app/pedidos/loading.tsx`, `error.tsx`).
3. **Busca de produto/cliente** sem resultado agora diz "nenhum" em vez de silêncio.
4. **Erro de leitura** do financeiro/fiscal do pedido deixou de virar "sem financeiro"/"sem
   nota".
5. **Sobra/falta do fechamento** em `R$ 2,00` (A16).
6. **Iniciar rota** pede confirmação nos dois lugares (ficha e cabine) — a ação
   notifica todos os clientes e não tem volta pelo botão (A8, parcial).
7. **PATCH da carga** não regride `em_rota→montando` (422) e cancelar rota em
   andamento exige `manager` (403); o audit grava antes/depois (A9).
8. **Custo da compra** em formato BR deixou de virar zero: `centavosDeBr` (A6).
9. **Marcar entregue** e **tirar pedido da carga** pedem confirmação — a entrega é
   terminal e a retirada muda o que o motorista leva (A8 completo).

## 8. O que fica aberto, e por quê

- **A2/A3/A4** exigem decisão de arquitetura/negócio: transação no Postgres (RPC) para saldo e
  recebimento; regra de estorno ao cancelar; e a máquina de estados do pedido. O repositório
  **não escreve** o que acontece com comissão, NF e expedição ao cancelar — inventar aqui seria
  fabricar política comercial. Vão para a Fase 10 como P0, com a pergunta escrita.
- **A5–A12** são correções contidas, mas cada uma mexe em fluxo com dado real (duplicar,
  recebimento, faturamento); entram em blocos próprios, com teste antes/depois.
- **A13–A15** são consistência e volume; P2.

## 9. Validação desta rodada

```console
$ pnpm exec tsc --noEmit -p tsconfig.typecheck.json     # exit 0
$ pnpm exec vitest run tests/unit/patch-itens-servico.test.ts   # 24 ✓
$ pnpm test:unit                                         # 988 arquivos / 16.931 testes ✓ (+1 expected fail)
```

**Não medido:** render real em 390/1440 de cada tela, comportamento com OSRM/Nominatim lentos,
e se as telas `[id]/*` da expedição passam em `podeFechar` no navegador. O que depende de
execução fica registrado como não medido, não como aprovado.
