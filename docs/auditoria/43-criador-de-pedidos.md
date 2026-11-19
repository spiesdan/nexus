# 43 — O criador de pedidos: auditoria da jornada real

> **Escopo desta auditoria:** a tela `/app/pedidos/novo`, o que ela chama, o que o
> servidor recalcula e o que acontece depois do “Gerar pedido”. Medido em
> 19/11/2026 no branch `feat/criador-de-pedidos` (base `nexus/main` @ `ccadd516`).
>
> **O que este documento NÃO faz:** não define imposto, prazo, reserva de estoque,
> alçada de desconto nem regra de faturamento. Onde a resposta não está escrita no
> código nem em `docs/business-rules/`, o item aparece como **DEPENDE DE REGRA**.
>
> **Ambiente das provas:** Supabase local; nenhum pedido real em produção.

## 1. Mapa da jornada

```
ficha do cliente / 360° / lista de pedidos
        │  /app/pedidos/novo[?contato=<id>]
        ▼
OrderEditor (client)  ── localStorage "pedido-rascunho" (autosave 2 s)
  cliente · produtos · itens · descontos · frete · detalhes
        │  “Gerar pedido” / “Salvar rascunho” / Cmd+Enter
        ▼
POST /api/v1/commercial-orders        (agent+; overrides = manager+)
  valida Zod → preço de tabela → estoque → desconto/teto → crédito
  → numeração atômica → insert pedido → insert itens → baixa de estoque
        ▼
commercial_orders.status = em_analise (se acima do teto) | rascunho | aprovado
        ▼
detalhe do pedido → aprovar → faturar (fiscal) → expedir → entregar
```

Entradas alternativas: importação por IA (`/api/v1/commercial-orders/importar-ia`),
importação Mercos, shell offline (`lib/offline/outbox.ts`, enfileira com
`chave_sincronizacao`) e criação por tool de IA/MCP (mesmo
`criarPedidoComercial`).

## 2. Estado por área

| # | Área | Estado | Evidência |
|---|---|---|---|
| 2.1 | Entrada “Gerar pedido” do cliente **com o cliente** | **CORRIGIDO nesta rodada** | `lib/pedidos/link-do-novo-pedido.ts`; `page.tsx` lê `searchParams`; `_editor.tsx` abre com `contatoInicial` |
| 2.2 | Cliente: autocomplete com busca no servidor | **EXISTE** | `_cliente.tsx:134-142` (`/api/v1/contacts?search=…&limit=12`), com a lista local como reforço |
| 2.3 | Cliente avulso (sem cadastro) | **EXISTE** | `pedidoCreateSchema.contact_id` nullable + `cliente_nome` obrigatório; snapshot preservado |
| 2.4 | Homônimos | **PARCIAL** | a opção mostra nome + telefone (`_cliente.tsx:194-197`), sem documento/razão social; o desempate é manual |
| 2.5 | Catálogo grande | **CORRIGIDO nesta rodada** | busca remota em `/api/v1/products?busca=&limite=12` somada à lista local; inativo não entra (`_produtos.tsx`). Prova: `tests/unit/criador-pedido-busca-produto.test.tsx` |
| 2.6 | Busca por código/nome/marca | **EXISTE** | `_produtos.tsx:60-72` (exato primeiro, depois trecho) |
| 2.7 | Busca por EAN/SKU/scanner | **FALTA** | `lib/schemas/produtos.ts` não tem coluna EAN/SKU; `COLUNAS_DO_PRODUTO` só traz `codigo`, `nome`, `marca` |
| 2.8 | Quantidade inteira | **EXISTE** | `itemCreateSchema.quantidade: int().min(1)`; steppers em `_itens.tsx` |
| 2.9 | Quantidade fracionária / venda a granel | **FALTA / DEPENDE DE REGRA** | `permite_fracao` existe na linha mas nasce `false` (`_editor.tsx` no `adicionar`); schema recusa fração. Não há regra escrita de venda por peso |
| 2.10 | Tabela de preço no add | **EXISTE** | `page.tsx` carrega tabelas; `_produtos.tsx` aplica `precoEfetivo`; servidor recalcula (`criar-pedido.ts:217-230`) |
| 2.11 | Troca de tabela depois de adicionar itens | **INCOMPLETO** | `onValueChange` só troca `tabelaId` (`_editor.tsx:839-840`); os itens mantêm o preço antigo e o servidor recusa fora da tabela (422) — falha alto, mas o vendedor tem de reprecificar à mão |
| 2.12 | Preço manual / negociado | **EXISTE com alçada** | preço diferente do efetivo só passa com `podeIgnorar` (manager+) — `criar-pedido.ts:222-230` |
| 2.13 | Desconto por item e geral (% × R$) | **EXISTE** | `_itens.tsx` e `_resumo.tsx`; servidor soma R$ + % e recusa desconto > subtotal (`criar-pedido.ts:262-269`) |
| 2.14 | Teto de desconto e aprovação | **EXISTE** | `desconto_max_vendedor_pct` (default 5 quando não há política); acima do teto → `em_analise` (`criar-pedido.ts:272-283`); aprovação é manager+ (`[id]/route.ts:191`) |
| 2.15 | Margem visível | **EXISTE para manager+** | `verMargem` (page) → `_resumo` |
| 2.16 | Crédito | **EXISTE** | rascunho não barra; compromisso acima do limite recusa 422 (`lib/comercial/credito.ts`; `criar-pedido.ts:285-305`) |
| 2.17 | Estoque: pré-checagem | **EXISTE** | `criar-pedido.ts:233-247`; `permite_estoque_negativo` default **false** |
| 2.18 | Estoque: reserva | **FALTA / DEPENDE DE REGRA** | não há reserva; a baixa ocorre no commit do pedido. Duas vendas simultâneas passam na pré-checagem; uma baixa pode falhar |
| 2.19 | Estoque: falha da baixa depois do insert | **INCOMPLETO** | o pedido e os itens já foram gravados; a falha da baixa só é logada (`criar-pedido.ts`, bloco “baixa de estoque não aplicada”). Não há transação única nem rollback |
| 2.20 | Override de estoque/crédito | **EXISTE na API, FALTA na tela** | `ignorar_estoque`/`ignorar_credito` no schema e na rota; `grep` no editor: nenhum uso |
| 2.21 | Numeração do pedido | **EXISTE** | `fn_proximo_numero_pedido` (0209), por org |
| 2.22 | Idempotência / clique duplo | **CORRIGIDO nesta rodada** | `chave_sincronizacao` por editor, persistida no rascunho; guarda síncrona em `comEnvio`; o atalho passa pela mesma porta |
| 2.23 | Retry depois de timeout | **EXISTE com a chave** | `apiClient` **não repete POST** (`lib/api/client.ts:191-205`); o retry manual reusa a mesma chave e o servidor devolve `ja_existia` |
| 2.24 | Autosave / restauração | **EXISTE com limite** | `_autosave.ts` (2 s) e restauração na montagem; só restaura se houver **itens** (cliente sozinho não persiste) |
| 2.25 | Rascunho de outro cliente × link | **CORRIGIDO nesta rodada** | diálogo “usar o cliente do link × continuar o rascunho”; autosave desligado até a decisão |
| 2.26 | Proteção de navegação | **FALTA** | não há `beforeunload`/bloqueio de rota; a mitigação é o autosave |
| 2.27 | Revisão antes de finalizar | **EXISTE (leitura)** | `previaAberta` (`_editor.tsx:1132`); a prévia fecha e o estado permanece |
| 2.28 | Erros preservando dados | **EXISTE** | `showApiError` sem limpar estado; validação local rola até a seção |
| 2.29 | Cmd/Ctrl+Enter | **EXISTE com guarda** | `_atalhos.ts`; agora `finalizar → comEnvio` |
| 2.30 | Fiscal | **PARCIAL** | `exige_nf`, `forma_pagamento`, `informacoes_fiscais` no schema; a emissão é outro fluxo. Nenhum imposto é calculado no criador |
| 2.31 | Expedição | **PARCIAL** | `endereco_entrega`, `transportadora_nome`, `modalidade_frete`, `previsao_entrega` no schema; a tela do criador **não expõe** modalidade/previsão |
| 2.32 | Offline | **EXISTE em outro caminho** | `lib/offline/outbox.ts` captura no shell, com `chave_sincronizacao`; o editor web **não** enfileira — sem rede, o POST falha e o rascunho local é a rede |
| 2.33 | IA | **EXISTE** | `AdicionarComIa` + `importar-ia`; o POST usa `fetch` cru para não repetir em timeout (`_ia.tsx:373-375`) |
| 2.34 | Lead → orçamento | **PARCIAL** | `rascunho` = “Em orçamento”; há link público (`/orcamento`) e envio por WhatsApp. A criação a partir de um lead **não** é automática |
| 2.35 | Permissões | **EXISTE** | criar = `agent+`; override/desconto/acima do teto = `manager+`; viewer não abre |
| 2.36 | Multimoeda | **FALTA** | `moeda` no schema (default BRL), sem seletor na tela; não há cotação nem regra escrita |
| 2.37 | Mobile / teclado / leitor de tela | **PARCIAL** | layout 70/30 + barra sticky; atalhos e labels existem, mas não há prova E2E dedicada ao criador |

## 3. Corrigido nesta rodada (com prova)

1. **“Gerar pedido” não levava o cliente** — três botões apontavam para
   `/app/pedidos/novo` sem o id; a página não lia `searchParams`; o editor nascia
   com `null`. Agora o destino é único (`linkDoNovoPedido`), a página resolve o
   contato com `organization_id` explícito (cobre carteira > 500) e o editor abre
   com nome e id preenchidos.
   *Prova:* `tests/unit/criador-pedido-cliente-do-link.test.tsx`.
2. **Rascunho de outro cliente** — não restaura nem descarta em silêncio: diálogo
   com as duas decisões, autosave desligado até decidir.
   *Prova:* os casos “rascunho de outro cliente” e “mesmo cliente” do mesmo arquivo.
3. **Clique duplo** — `Cmd/Ctrl+Enter` chamava `enviar()` direto e furava o
   `enviando`; dois toques no mesmo frame criavam dois pedidos. Agora o atalho
   passa por `comEnvio`, com guarda síncrona em `ref`.
4. **Catálogo acima do lote carregado** — a busca do produto passou a
   perguntar ao servidor (`/api/v1/products?busca=`) e somar o resultado à lista
   local, escondendo inativo. Antes, produto fora dos 2.000 carregados era
   invisível.
   *Prova:* `tests/unit/criador-pedido-busca-produto.test.tsx` (1 caso: acha o
   produto remoto e não mostra o inativo).
5. **Retry não duplica** — o editor passou a enviar `chave_sincronizacao` (UUID
   por editor, **persistido no rascunho**): timeout + retry (ou reload + retry)
   devolve o pedido existente (`ja_existia`) em vez de criar outro.
   *Prova:* “Cmd/Ctrl+Enter duas vezes” (1 POST) e “depois de um erro, o retry
   reusa a mesma chave” (2 POSTs, mesma chave).

## 4. Riscos abertos, em ordem

| Prio | Risco | Estado | Próximo passo |
|---|---|---|---|
| **P1** | Estoque sem reserva e baixa fora da transação do pedido | aberto | decidir com o dono: reserva na criação? baixa atômica via RPC? compensação? |
| **P1** | Troca de tabela não reprecifica itens já lançados | aberto | ao trocar, oferecer “reprecificar itens” e mostrar o delta; hoje o servidor recusa 422 |
| **P1** | Override de estoque/crédito só por API | aberto | botão de gerente com confirmação, enviando `ignorar_*` |
| **P2** | Navegação sem aviso | aberto | `beforeunload` quando houver itens (o autosave cobre o conteúdo, não a surpresa) |
| **P2** | Rascunho sem itens (só cliente) não restaura | aberto | persistir cliente escolhido mesmo sem linhas |
| **P2** | Quantidade fracionária | **DEPENDE DE REGRA** | confirmar se o produto vende a granel; só então schema/UI |
| **P2** | Modalidade de frete / previsão não expostas | aberto | campos existem no schema; falta UI |
| **P2** | Multimoeda | **DEPENDE DE REGRA** | não há taxa, cotação nem regra escrita |

## 5. O que NÃO foi inventado (e continua sem resposta escrita)

- **Reserva de estoque** na criação: não existe no código; a decisão é do dono.
- **Cálculo de imposto** no pedido: o criador não calcula ICMS/IPI/ST; a emissão
  fiscal é outro fluxo.
- **Prazo/parcelas**: `calcularParcelas` deriva do texto da condição; não há
  regra de juros, entrada ou vencimento no criador.
- **Alçada de desconto**: o default de 5% vem do código quando não há política na
  organização. O valor **correto** é decisão de negócio, não desta auditoria.
- **Crédito**: limite é `contacts.limite_credito_cents`; não há regra de análise,
  garantia ou tolerância além do `<=`.

## 6. Evidências

```console
# prova do link + autosave + duplo submit/idempotência (10 casos)
pnpm exec vitest run tests/unit/criador-pedido-cliente-do-link.test.tsx

# provas existentes da jornada (não alteradas nesta rodada)
pnpm exec playwright test tests/e2e/jornada-venda.spec.ts
pnpm exec playwright test tests/e2e/pedido-idempotencia.spec.ts
```

- `jornada-venda` cobre login → cliente → item → desconto → gerar → faturável.
- `pedido-idempotencia` cobre a chave no caminho real do banco.
- `tests/unit/pedido-chave-sincronizacao.test.ts` cobre a unique por org/corrida.
- `tests/unit/pedido-itens-route.test.ts` cobre a rota de itens.

## 7. Benchmark (D) e testes (E) — próximos passos

O comparativo com CRM/ERP maduros e a matriz de testes de dispositivos/teclado/
leitor de tela pertencem às etapas seguintes desta frente; este documento fixa o
mapa e os riscos que aquelas etapas precisam cobrir, sem antecipar conclusão.
