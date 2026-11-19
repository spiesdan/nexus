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
| 2.7 | Busca por EAN/SKU/scanner | **CORRIGIDO (matriz E)** | EAN mora em `codigo` (identidade única da org; DIRC recusa uma segunda). O `Enter` agora só lança código **exato** ou resultado **único**; a rota devolve a linha exata na frente do `limit=12`. Provas: `tests/unit/criador-busca-scanner.test.tsx`, `tests/unit/products-busca-codigo-exato.test.ts` |
| 2.8 | Quantidade inteira | **EXISTE** | `itemCreateSchema.quantidade: int().min(1)`; steppers em `_itens.tsx` |
| 2.9 | Quantidade fracionária / venda a granel | **PARCIAL / DEPENDE DE REGRA** | o schema só aceita inteiro (`int().min(1)`) e a tela agora trunca (não deixa digitar 1,5 e descobrir no fim); `unidade` aparece e `multiplo` é informado. Não há regra escrita de fração nem validação de múltiplo |
| 2.10 | Tabela de preço no add | **EXISTE** | `page.tsx` carrega tabelas; `_produtos.tsx` aplica `precoEfetivo`; servidor recalcula (`criar-pedido.ts:217-230`) |
| 2.11 | Troca de tabela depois de adicionar itens | **CORRIGIDO (matriz E)** | a troca reprecifica os itens (override > desconto da tabela > base) e preserva o preço **manual**. Prova: `tests/unit/criador-tabela-credito-parcelas.test.tsx` |
| 2.12 | Preço manual / negociado | **EXISTE com alçada e agora visível** | cada linha diz “preço base/tabela/manual”; editar o preço marca manual. Servidor: preço diferente do efetivo só passa com `podeIgnorar` (manager+) — `criar-pedido.ts:222-230` |
| 2.13 | Desconto por item e geral (% × R$) | **EXISTE e agora explícito** | resumo mostra “Desconto total” com “R$ e % somam”, o valor combinado e o teto; servidor soma R$ + % e recusa desconto > subtotal (`criar-pedido.ts:262-269`) |
| 2.14 | Teto de desconto e aprovação | **EXISTE e agora avisa antes** | a página passa `desconto_max_vendedor_pct` (default 5) e o editor calcula a consequência antes do POST; acima do teto → `em_analise` (`criar-pedido.ts:272-283`); aprovação é manager+ (`[id]/route.ts:191`) |
| 2.15 | Margem visível | **EXISTE para manager+ e custo mascarado** | `verMargem` (page) → `_resumo`; `custoSomenteParaQuemVeMargem` zera `custo_cents` antes da fronteira servidor→cliente. Prova: `tests/unit/criador-pedido-cliente-do-link.test.tsx` |
| 2.16 | Crédito | **EXISTE e avisa ANTES (matriz E)** | rascunho não barra; compromisso acima do limite recusa 422 (`lib/comercial/credito.ts`; `criar-pedido.ts:285-305`); a tela faz a mesma conta (`em aberto + este pedido`) com a mesma lista de status e avisa antes do clique. Provas: `criador-tabela-credito-parcelas.test.tsx`, `commercial-orders-credito-gate.test.ts` |
| 2.17 | Estoque: pré-checagem e exibição | **EXISTE** | servidor: `criar-pedido.ts:233-247`; tela: quatro estados (conhecido, sem saldo, insuficiente, não controlado) + “não há reserva”. Prova: `tests/unit/criador-itens-estoque-unidade.test.tsx` |
| 2.18 | Estoque: reserva | **FALTA / DEPENDE DE REGRA** | não há reserva; a baixa ocorre no commit do pedido. Duas vendas simultâneas passam na pré-checagem; uma baixa pode falhar |
| 2.19 | Estoque: falha da baixa depois do insert | **INCOMPLETO** | o pedido e os itens já foram gravados; a falha da baixa só é logada (`criar-pedido.ts`, bloco “baixa de estoque não aplicada”). Não há transação única nem rollback |
| 2.20 | Override de estoque/crédito | **EXISTE na API (gate provado), FALTA na tela** | `ignorar_estoque`/`ignorar_credito` no schema e na rota; o gate manager é provado em `tests/unit/commercial-orders-credito-gate.test.ts` (agent 422 sem escrita; manager passa). Botão para o gerente segue como decisão de produto |
| 2.21 | Numeração do pedido | **EXISTE** | `fn_proximo_numero_pedido` (0209), por org |
| 2.22 | Idempotência / clique duplo | **CORRIGIDO nesta rodada** | `chave_sincronizacao` por editor, persistida no rascunho; guarda síncrona em `comEnvio`; o atalho passa pela mesma porta |
| 2.23 | Retry depois de timeout | **EXISTE com a chave** | `apiClient` **não repete POST** (`lib/api/client.ts:191-205`); o retry manual reusa a mesma chave e o servidor devolve `ja_existia` |
| 2.24 | Autosave / restauração | **CORRIGIDO e escopado por org+usuário (matriz E)** | a chave é `pedido-rascunho:<org>:<user>` (`chaveDoRascunho`): rascunho de outra pessoa/tenant não é retomado. Prova: `tests/unit/criador-rascunho-escopo.test.tsx`. Também nesta rodada (inclusive falha): `_autosave.ts` (2 s) e `aplicarRascunho` devolve **todos** os campos editáveis: desconto R$ e %, frete, tabela, endereço, transportadora, rastreio, contato no cliente, observações e obs. interna. Prova: teste “autosave restaura TODOS os campos”. Restaura também o cliente escolhido **sem itens** (quando não há link). Com link de outro cliente sem itens, o link vence |
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
| 2.37 | Mobile / teclado / leitor de tela | **CORRIGIDO (matriz E)** | busca como combobox/listbox com `aria-selected`; resumo é `role=region` nomeada; desconto/frete com nome acessível; barra e grade quebram linha (320 px). Provas: `tests/unit/criador-acessivel.test.tsx` (jsdom) e `tests/e2e/criador-pedido-acessivel-320.spec.ts` (mede `scrollWidth` em 320, roda no smoke) |

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

## 9. Matriz E — os dez cenários, com prova e defeito

> **Execução no build oficial 1.60.0** — tag `v1.60.0`, `next start` local,
> `playwright test tests/e2e/criador-de-pedidos-matriz.spec.ts --workers=1`,
> 19/11/2026: **6 de 6 verdes em 2,2 min**. A primeira rodada no build
> reprovou E.3 e E.10 e é ela que dá o valor da matriz — o que segue foi
> achado ali, não deduzido.
>
> **O que a execução achou (e corrigiu nesta branch):**
>
> 1. **E.3 — tabela de preço nunca ativava no app real.** O editor lia
>    `d.itens` do `GET /price-tables/:id`, mas o corpo é
>    `{ data: { …, itens } }` (`ok()` embrulha): o `.then` estourava em
>    `new Map(undefined)` e caía no `.catch`. Só o dublê dos testes devolvia o
>    corpo sem embrulho, então a suíte passava com o app quebrado. Além disso,
>    `adicionar` montava a linha com `produto.preco_cents` e rotulava a origem
>    por existir tabela — item a preço de catálogo dizendo "preço da tabela".
>    Os dois foram corrigidos; o teste de componente novo **falha na versão
>    antiga e passa na corrigida**.
> 2. **E.10 — violação de acessibilidade real.** O `<dl>` do resumo tinha um
>    `<p>` filho direto ("Teto de desconto do vendedor"): `definition-list`
>    **serious** no axe, em 390 px. O texto virou `<span>` dentro do `<dd>` do
>    desconto — continua ligado ao termo e o `<dl>` volta ao content model.
> 3. **Três seletores do spec vencidos contra a própria tela** (não são defeito
>    de produto): o resultado da busca virou `option` (era `button`);
>    `"Cliente"` por substring casava "Contato no cliente" (agora `exact`);
>    o campo de produto é `combobox` "Buscar produto…" (era `textbox`
>    "Produtos"). E a premissa do E.3 mudou de propósito: trocar de tabela
>    **reprecifica**, então o 422 de "preço fora da tabela" passou a ser
>    provocado pela tabela que muda **no servidor** com a tela já carregada —
>    o caso que sobra de verdade.
>
> Medido em 19/11/2026. Cada linha nomeia o arquivo de prova; o que é unitário
> não se apresenta como E2E.

| # | Cenário | Estado | Prova |
|---|---|---|---|
| 1 | EAN/SKU/scanner: código casa produto; EAN inexistente não inventa; SKU ambíguo não escolhe sozinho | **PROVADO no navegador (1.60.0)** — código, nome, marca e scanner; `Enter` só lança identidade inequívoca; produto **fora do lote de 2.000** entra pelo servidor | `criador-busca-scanner.test.tsx`, `products-busca-codigo-exato.test.ts` + E2E “E.1/E.2” |
| 2 | Escala: 600 produtos e 600 contatos; busca responde; catálogo não vai inteiro | **PROVADO no navegador (1.60.0) + unit** — E2E semeia **520 contatos e 2.100 produtos**, alvo fora do lote; carregando e erro visíveis; unit mede a rajada (teto de 8, uma consulta remota) | `criador-escala-busca.test.tsx` + E2E “E.1/E.2” |
| 3 | Tabela/override reflete nos itens; preço manual marcado e preservado | **DEFEITO ACHADO no 1.60.0 e corrigido** — a tabela **nunca ativava** (`d.itens` × `{ data: { itens } }`) e o item entrava a preço de catálogo rotulado de tabela; trocar reprecifica e o manual é preservado | `criador-tabela-credito-parcelas.test.tsx` (teste novo, falha sem a correção) + E2E “E.3” **verde** |
| 4 | Estoque: quatro estados de B.10; **não há reserva** (declarado) | **PROVADO no navegador (1.60.0)** — suficiente, insuficiente (422), desatualizado (saldo muda antes do POST) e não controlado; a tela declara a ausência de reserva | E2E “E.4” + `criador-itens-estoque-unidade.test.tsx` |
| 5 | Crédito avisa **antes** de gerar; `ignorar_credito` só manager | **PROVADO no navegador (1.60.0)** — limite estourado recusa 422 sem gravar, sem limite cria, acima do teto vai a `em_analise` com “Aprovar pedido”; gate do servidor provado no unit | E2E “E.5” + `commercial-orders-credito-gate.test.ts` |
| 6 | Quantidade inteira (B.14); parcelas somam o total; fração/granel não quebra | **OK** (fração segue **DEPENDE DE REGRA**) | `criador-tabela-credito-parcelas.test.tsx`, `parcelas-fecham.test.ts` |
| 7 | Rascunho entre org/usuário não é retomado; `descontoTexto` volta | **DEFEITO CORRIGIDO** — chave única do navegador | `criador-rascunho-escopo.test.tsx`, `criador-pedido-cliente-do-link.test.tsx` |
| 8 | Timeout com resposta perdida não duplica (idempotência/CAS) | **PROVADO no navegador (1.60.0)** — `route.fetch()` commita, `abort` derruba a resposta; reenviar cria **1 pedido**, mesmos itens, sem número queimado; e na rota (`commercial-orders-timeout-retry`) | E2E “E.8/E.9” + `commercial-orders-timeout-retry.test.ts` |
| 9 | Reconciliação: itens/parcelas somam no banco de teste | **PROVADO no navegador (1.60.0) + invariante** — pedido criado pela tela: itens = subtotal, subtotal − desconto + frete = total, `chave_sincronizacao` e 1 item no banco | E2E “E.8/E.9” + `tests/invariants/pedido-reconciliacao.test.ts` |
| 10 | 320 px, teclado e leitor de tela | **PROVADO no navegador (1.60.0)** — 320/390/768/1440 sem overflow; Tab do cliente chega à busca; axe sem `serious`/`critical` em 390 e 1440 (a violação `definition-list` do `<dl>` foi achada e corrigida aqui) | E2E “E.10” + `criador-acessivel.test.tsx`, `criador-pedido-acessivel-320.spec.ts` |

### O que mudou no produto por causa desta matriz

1. **Rascunho isolado por organização e usuário** — a chave era global
   (`pedido-rascunho`); agora é `pedido-rascunho:<org>:<user>`.
2. **`ignorar_preco`** — flag próprio de gerente, sem perdoar estoque/crédito.
3. **Guarda `parcelasFecham`** antes de gravar — divergência de centavo vira 422.
4. **Busca de produto com estados** e **Enter só com identidade inequívoca**.
5. **Produto remoto entra no pedido** — `aoAdicionar` deixou de filtrar por
   `porId`; era o defeito que derrubou E.1/E.2 na janela.
6. **Quantidade inteira, unidade/múltiplo, 320 px/teclado/leitor.**
7. **Tabela de preço ativa ao adicionar** — o preço da linha é o da tabela
   (override > desconto > catálogo). Antes, com a tabela escolhida, o item
   entrava a preço de catálogo **rotulado** de tabela; e a tabela nem ativava,
   porque o cliente lia o corpo da rota sem o embrulho `data`.
8. **`<dl>` do resumo** — o teto de desconto saiu de `<p>` solto para dentro do
   `<dd>` do desconto (axe `definition-list`, serious).

### Pendências declaradas (sem regra escrita)

- EAN/GTIN: sem coluna, sem validação, sem busca; a lacuna é explícita.
- TTL do rascunho local: não existe; 30 dias ainda restaura.
- Reserva de estoque / baixa atômica: não existe.
- Fração/granel e bloqueio por múltiplo: `multiplo` informado, não validado.
- Multimoeda: sem seletor nem cotação.
- E.10: leitor de tela real (NVDA/VoiceOver) segue fora do automatizado —
  a régua é axe + nomes acessíveis + Tab.
- E.3: depois da reprecificação, o 422 de "preço fora da tabela" só acontece
  quando a tabela muda **no servidor** com a tela carregada; a troca de tabela
  na tela reprecifica (e é isso que se quer).
