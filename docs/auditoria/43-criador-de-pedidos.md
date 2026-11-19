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
| 2.9 | Quantidade fracionária / venda a granel | **PARCIAL / DEPENDE DE REGRA** | o schema só aceita inteiro (`int().min(1)`) e a tela agora trunca (não deixa digitar 1,5 e descobrir no fim); `unidade` aparece e `multiplo` é informado. Não há regra escrita de fração nem validação de múltiplo |
| 2.10 | Tabela de preço no add | **EXISTE** | `page.tsx` carrega tabelas; `_produtos.tsx` aplica `precoEfetivo`; servidor recalcula (`criar-pedido.ts:217-230`) |
| 2.11 | Troca de tabela depois de adicionar itens | **INCOMPLETO** | `onValueChange` só troca `tabelaId`; os itens mantêm o preço antigo e a linha agora mostra a origem (“preço da tabela”), mas não há reprecificação automática — o servidor recusa fora da tabela (422) |
| 2.12 | Preço manual / negociado | **EXISTE com alçada e agora visível** | cada linha diz “preço base/tabela/manual”; editar o preço marca manual. Servidor: preço diferente do efetivo só passa com `podeIgnorar` (manager+) — `criar-pedido.ts:222-230` |
| 2.13 | Desconto por item e geral (% × R$) | **EXISTE e agora explícito** | resumo mostra “Desconto total” com “R$ e % somam”, o valor combinado e o teto; servidor soma R$ + % e recusa desconto > subtotal (`criar-pedido.ts:262-269`) |
| 2.14 | Teto de desconto e aprovação | **EXISTE e agora avisa antes** | a página passa `desconto_max_vendedor_pct` (default 5) e o editor calcula a consequência antes do POST; acima do teto → `em_analise` (`criar-pedido.ts:272-283`); aprovação é manager+ (`[id]/route.ts:191`) |
| 2.15 | Margem visível | **EXISTE para manager+ e custo mascarado** | `verMargem` (page) → `_resumo`; `custoSomenteParaQuemVeMargem` zera `custo_cents` antes da fronteira servidor→cliente. Prova: `tests/unit/criador-pedido-cliente-do-link.test.tsx` |
| 2.16 | Crédito | **EXISTE** | rascunho não barra; compromisso acima do limite recusa 422 (`lib/comercial/credito.ts`; `criar-pedido.ts:285-305`) |
| 2.17 | Estoque: pré-checagem e exibição | **EXISTE** | servidor: `criar-pedido.ts:233-247`; tela: quatro estados (conhecido, sem saldo, insuficiente, não controlado) + “não há reserva”. Prova: `tests/unit/criador-itens-estoque-unidade.test.tsx` |
| 2.18 | Estoque: reserva | **FALTA / DEPENDE DE REGRA** | não há reserva; a baixa ocorre no commit do pedido. Duas vendas simultâneas passam na pré-checagem; uma baixa pode falhar |
| 2.19 | Estoque: falha da baixa depois do insert | **INCOMPLETO** | o pedido e os itens já foram gravados; a falha da baixa só é logada (`criar-pedido.ts`, bloco “baixa de estoque não aplicada”). Não há transação única nem rollback |
| 2.20 | Override de estoque/crédito | **EXISTE na API, FALTA na tela** | `ignorar_estoque`/`ignorar_credito` no schema e na rota; `grep` no editor: nenhum uso |
| 2.21 | Numeração do pedido | **EXISTE** | `fn_proximo_numero_pedido` (0209), por org |
| 2.22 | Idempotência / clique duplo | **CORRIGIDO nesta rodada** | `chave_sincronizacao` por editor, persistida no rascunho; guarda síncrona em `comEnvio`; o atalho passa pela mesma porta |
| 2.23 | Retry depois de timeout | **EXISTE com a chave** | `apiClient` **não repete POST** (`lib/api/client.ts:191-205`); o retry manual reusa a mesma chave e o servidor devolve `ja_existia` |
| 2.24 | Autosave / restauração | **CORRIGIDO nesta rodada (inclusive falha)** | `_autosave.ts` (2 s) e `aplicarRascunho` devolve **todos** os campos editáveis: desconto R$ e %, frete, tabela, endereço, transportadora, rastreio, contato no cliente, observações e obs. interna. Prova: teste “autosave restaura TODOS os campos”. Restaura também o cliente escolhido **sem itens** (quando não há link). Com link de outro cliente sem itens, o link vence |
| 2.25 | Rascunho de outro cliente × link | **CORRIGIDO nesta rodada** | diálogo “usar o cliente do link × continuar o rascunho”; autosave desligado até a decisão |
| 2.26 | Proteção de navegação | **CORRIGIDO nesta rodada** | `beforeunload` pede confirmação quando há itens; sem itens não incomoda. Navegação SPA entre telas continua sem bloqueio (o autosave cobre o conteúdo) |
| 2.27 | Revisão antes de finalizar | **CORRIGIDO nesta rodada** | a prévia agora mostra cliente, condição, forma de pagamento, NF, endereço, itens (unidade, preço unitário, desconto por item, subtotal), subtotal, descontos R$ e %, frete, total, parcelas, observações e a consequência na aprovação. Prova: “revisão antes de finalizar (B.7)” |
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
5. **Desconto (e mais cinco campos) sumiam ao voltar** — o autosave gravava
   `descontoTexto`, `descontoPctTexto`, `freteTexto`, `tabelaId`, `endereco` e
   `obsInterna`, mas a restauração não os devolvia (achado do estudo do D). A
   varredura campo a campo fechou a classe; o percentual normaliza vírgula para
   ponto porque o input é `type=number`. UI efêmera (`previaAberta`, `iaAberta`,
   `enviando`) e dados buscados (`últimos preços`, histórico) **não** entram de
   propósito; não há campo sensível no editor.
   *Prova:* “autosave restaura TODOS os campos editáveis” (11º caso do arquivo).
6. **Cliente sem itens e navegação** — um rascunho só com o cliente escolhido
   passou a voltar (quando não há link); com link, o cliente do link vence, sem
   diálogo, porque não há venda para perder. Fechar/recarregar com itens passou a
   pedir confirmação (`beforeunload`).
   *Prova:* “cliente escolhido sem itens também volta”, “com link, rascunho só
   de cliente NÃO troca” e “fechar/recarregar com itens pede confirmação”.
7. **Retry não duplica** — o editor passou a enviar `chave_sincronizacao` (UUID
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

## 8. Segunda fatia — B.7, B.9, B.10, B.12, B.14, B.15

> Medido no mesmo commit da fatia anterior. Cada item traz o estado **antes**,
> o que mudou, a prova e o que continua como decisão (nada de regra inventada).

### B.7 — revisão antes de finalizar

- **Antes:** a prévia mostrava cliente, condição, `nome × preço` e total. Não
  mostrava unidade, desconto por item, subtotal da linha, frete, descontos
  separados, parcelas, endereço nem observações — o vendedor revisava menos do
  que o pedido continha.
- **Agora:** cliente, condição, forma de pagamento, NF, endereço; por item:
  quantidade **com unidade**, preço unitário, desconto do item, subtotal e
  origem do preço; subtotal, desconto R$, desconto %, frete, total, parcelas,
  observações (e obs. interna, marcada como tal) e a consequência na aprovação.
- **Prova:** `tests/unit/criador-pedido-cliente-do-link.test.tsx` —
  “a prévia mostra itens, unidade, descontos, frete, total, parcelas, endereço e
  observações” (valores fechados: 2 kg × R$ 50,00 − 10% = R$ 90,00; −R$ 10,00;
  −R$ 4,50 (5%); +R$ 20,00 = R$ 95,50; 2 parcelas).
- **Pendente:** nada de regra; a prévia é de leitura e não altera o cálculo.

### B.9 — valores

- **Antes:** existiam os dois inputs (R$ e %), mas a tela não dizia que são
  **cumulativos**, não mostrava o desconto combinado e a origem do preço só
  aparecia na busca, não na linha já lançada.
- **Agora:** “Desconto total” com a nota “R$ e % somam”, o valor combinado e o
  teto; cada linha mostra “preço base”, “preço da tabela” ou “preço manual”
  (editar o campo marca manual). **A regra de cálculo não mudou** — o servidor
  continua somando R$ + % e recusando desconto maior que o subtotal.
- **Prova:** o caso B.7 acima (três linhas de desconto e total) +
  `tests/unit/criador-itens-estoque-unidade.test.tsx` (“marca a origem do preço”).
- **Pendente:** reprecificar ao **trocar a tabela** (item B.11/risco P1) — hoje a
  linha mantém o preço antigo e o servidor recusa; a correção exige decidir se
  preço negociado à mão é preservado.

### B.10 — estoque

- **Antes:** a linha mostrava `estoque: N` e um ⚠ quando `N < quantidade`. Zero,
  “não controlado” e “sem saldo” eram o mesmo desenho; nada dizia que não há
  reserva.
- **Agora:** quatro estados explícitos — `N em estoque`, `sem saldo`,
  `insuficiente: N disponível`, `estoque não controlado` — e a nota “O saldo é
  conferido ao gerar o pedido; não há reserva de estoque.”
- **Prova:** `tests/unit/criador-itens-estoque-unidade.test.tsx` (os quatro
  estados na mesma lista).
- **Pendente (decisão):** reserva de estoque e baixa atômica com o pedido. O
  servidor hoje grava pedido + itens e **depois** baixa; uma falha de baixa só é
  logada. Não inventei reserva nem rollback.

### B.12 — preço, teto e aprovação

- **Antes:** o editor não conhecia o teto (`desconto_max_vendedor_pct`); o aviso
  “vai para aprovação” só aparecia **depois** da resposta do POST. Margem era
  escondida na tela, mas `custo_cents` ia inteiro no payload do Server Component.
- **Agora:** a página passa o teto (default 5, o mesmo do servidor); o editor
  calcula `maiorDesconto` (item × global) e mostra a consequência **antes** de
  gerar. Margem/comissão continuam condicionadas a `verMargem`, e o custo é
  zerado para `null` **antes da fronteira** por
  `custoSomenteParaQuemVeMargem` — o número não chega ao browser de quem não
  pode ver.
- **Prova:** casos “margem só para quem pode” (com e sem `verMargem`) e
  “custo não atravessa a fronteira sem permissão”; a prévia B.7 mostra o aviso
  antes do POST.
- **Pendente:** UI para o gerente usar `ignorar_estoque`/`ignorar_credito`
  (hoje só a API aceita) — é decisão de produto, não uma omissão de teste.

### B.14 — quantidade e unidade

- **Antes:** o stepper aceitava `1.5`; o schema do pedido só aceita inteiro
  (`int().min(1)`), então a recusa vinha no fim. `unidade` e `multiplo` não
  apareciam.
- **Agora:** a quantidade é truncada na hora (`Math.max(1, Math.trunc(qtd))`); o
  rótulo mostra a unidade (`Quantidade (kg)`); `multiplo > 1` aparece como
  “vendido em múltiplos de N” — **informativo**.
- **Prova:** `tests/unit/criador-itens-estoque-unidade.test.tsx` (unidade no
  rótulo, truncamento e múltiplo).
- **Pendente (regra):** bloquear/arredondar para o múltiplo e permitir fração
  para produtos a granel. `multiplo` existe no banco (0275); **não há regra
  escrita** de como o pedido deve se comportar. Documentado, não inventado.

### B.15 — falha ao persistir o rascunho

- **Antes:** `useAutosaveDraft` engolia a exceção de `localStorage` (quota/modo
  privado) — o vendedor achava que o rascunho estava salvo.
- **Agora:** o hook expõe `falhaAoSalvar`; o editor mostra um alerta persistente
  (“não foi possível salvar… você pode continuar e gerar o pedido, mas não feche
  a aba”) e **não bloqueia** o botão de gerar. O `beforeunload` com itens
  continua valendo.
- **Prova:** “avisa que o rascunho não foi salvo e deixa continuar” (mock de
  `Storage.prototype.setItem` lançando; banner em até 3 s; botão habilitado).
- **Pendente:** fallback para `sessionStorage` não foi implementado — o aviso
  atual é honesto e não perde o estado em memória. Se o dono quiser sobreviver a
  reload em modo privado, é uma decisão separada.

### Comandos desta fatia

```console
pnpm exec vitest run tests/unit/criador-pedido-cliente-do-link.test.tsx \
  tests/unit/criador-itens-estoque-unidade.test.tsx \
  tests/unit/criador-pedido-busca-produto.test.tsx
# 22 testes (18 + 3 + 1) — todos verdes
```

`tsc` da fatia: 0. ESLint: 0 erros (1 warning pré-existente em `setHoje`).
