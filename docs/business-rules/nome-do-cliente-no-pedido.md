# Nome do cliente no pedido — fantasia primeiro

> **Decisão do dono, 18/11/2026.** Registrada aqui para não virar folclore: a
> precedência é uma só e vale para a tela de Pedidos, a busca de cliente e o
> cadastro feito na hora de criar o pedido.

## Regra

O nome que aparece **primeiro** é o **nome fantasia**. Sem fantasia, vale a
razão social (PJ) ou o nome (PF).

```
fantasia (trim, não vazio)  →  display_name  →  name  →  "Sem nome"
```

Texto do dono:

> "Mercos tem um produto de código 411, que não tem aqui." *(contexto separado)*
>
> "Na tela Pedidos, na busca de cliente e ao adicionar cliente na hora de criar
> o pedido, o nome que aparece primeiro é o nome fantasia. Se não houver
> fantasia, aí sim a razão social (PJ) ou o nome (PF)."

## Onde mora

- Resolvedor único: [`lib/contacts/nome-de-exibicao.ts`](../../lib/contacts/nome-de-exibicao.ts)
  (`nomeDeExibicao`). Não repetir `display_name ?? name` em tela nenhuma.
- Escrita: `criarPedidoComercial` (`lib/comercial/criar-pedido.ts`) e o `PATCH`
  de pedido (`app/api/v1/commercial-orders/[id]/route.ts`) gravam
  `cliente_nome` pelo resolvedor, lendo o cadastro pelo `contact_id`.
- Leitura: a lista (`app/app/pedidos/page.tsx`) resolve o nome **do contato
  vinculado em tempo de leitura**, caindo no snapshot quando não há vínculo.
  Pedido antigo passa a mostrar a fantasia atual **sem reescrever histórico**.
- Busca e cadastro inline: `app/app/pedidos/novo/_cliente.tsx`, inclusive no
  `aria-label` da opção.

## Por que o snapshot é preservado

`commercial_orders.cliente_nome` é o nome que valia no dia do pedido e é o que o
documento impresso/fiscal usou. Reescrevê-lo para "consertar a tela" apagaria a
prova do que foi emitido. A tela resolve; o banco não mente sobre o passado.

## Guardas

- `contacts.fantasia` só de espaços **não** conta como nome.
- Identificador técnico (`@lid`, `Contato 123`) **não** vira razão social —
  mesma guarda de `rotuloDoContato`.
- Cliente avulso (sem `contact_id`) mantém o nome digitado.
- **Sem migration**: a coluna já existia no baseline.

## Provas

- `tests/unit/nome-de-exibicao.test.ts` — precedência, trim, técnico, snapshot.
- `tests/unit/pedido-cliente-fantasia.test.tsx` — render da busca: fantasia ≠
  razão social, `aria-label`, escolha devolve a fantasia.
