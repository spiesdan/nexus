# 47 — Compras: o recebimento vira campo por item

**Data:** 19/11/2026 · **Base:** `nexus/main` · **Método:** recorte de design +
uma mudança de interação que a própria rota já permitia. Medido em `next dev`
no Supabase local. Nenhuma query/regra mudou.

## Linhas da matriz (`41-cobertura-reconciliada.md`)

| Rota | Tela | Veredito | Evidência |
| --- | --- | --- | --- |
| `/app/compras` | lista de compras | **pendente** — não entrou nesta fatia | — |
| `/app/compras/[id]` | recebimento | **aplicado** | `47-compras-recebimento-design.md` · `capturas/antes-compras/` + `capturas/recebimento-*.png` · este PR |

## O que estava errado

A rota `POST /purchase-orders/[id]/receber` **sempre aceitou receber parte**:

```ts
// app/api/v1/purchase-orders/[id]/receber/route.ts
// `{ itens: [{ item_id, quantidade }] }` (default: o restante de cada item)
```

A tela, não. O botão "Receber no estoque" abria um diálogo que chamava a rota
**sem corpo** — recebia tudo. Quem recebia **3 de 10** não tinha onde escrever 3:
ou recebia 10, ou não recebia. O `Recebido` da tabela era leitura, sem ação.

## O que foi feito

1. **Quantidade vira campo, com o restante como padrão.**
   `Receber no estoque` abre um painel na própria ficha (não um diálogo): uma
   linha por item pendente, com `restante X` ao lado do código, input numérico
   já preenchido com o restante e o resumo vivo **"N unidades para receber"**.
2. **Validação inline, sem brigar com o teclado.** Número inteiro, não negativo,
   nunca acima do restante. O erro fica **debaixo do campo**, com
   `aria-invalid` + `aria-describedby` + `role="alert"` — e o botão de confirmar
   desabilita enquanto há erro. `0` é legítimo ("não chegou nada deste") e não
   entra no lote, porque a rota recusa `quantidade: 0` (`min(1)`) e derrubaria
   o lote inteiro.
3. **Erro de envio não perde o digitado.** A falha vira faixa acima do rodapé
   (`role="alert"`, `mensagemDeErro`), os valores continuam nos campos e o
   operador só confirma de novo. **Sem toast duplicado** — a regra "um erro, um
   anúncio" da pendência anterior.
4. **Um caminho só.** O diálogo de "Receber tudo" saiu (`Acao` deixou de ter
   `receber`): antes havia dois jeitos de receber, um deles sem mostrar quanto.

## A régua, fora do JSX

A decisão do campo foi para `lib/compras/quantidade-digitada.ts`
(`problemaDaQuantidade`, `restanteDoItem`, `linhasParaReceber`) — o repo já
guarda a decisão do recebimento ali, e agora o teste exercita sem navegador:

```console
$ npx vitest run lib/compras/quantidade-digitada.test.ts lib/compras/recebimento.test.ts
Tests  16 passed (16)
```

## Números

| Medida | Resultado |
| --- | --- |
| Contraste AA (claro/escuro) | **0 de 56** abaixo do mínimo — na ficha; o painel **não** foi medido pelo instrumento (ele não abre painel) |
| Overflow horizontal | **0** em 1440 e 390, com o painel aberto |
| Erros de console | **0**, com o painel aberto |
| Campos no painel | 1 por item pendente (a fixture tem 1) |
| Resumo | "3 unidades para receber" — acompanha o campo |
| Validação | digitar `999` com restante 3 → **"O restante é 3."** |

## O que NÃO foi tocado

- A rota de recebimento, o CAS de idempotência e `lib/compras/recebimento.ts`.
- A lista `/app/compras` (segue `pendente` na matriz).
- Nada do criador de pedidos.

## Capturas

- `capturas/antes-compras/` — a ficha com o botão e **sem** painel (o "antes").
- `capturas/recebimento-{light,dark}-{1440,390}.png` — o painel com valores.
- `capturas/recebimento-invalido-{light,dark}-1440.png` — a validação inline.

## Pendência declarada

O resumo diz **unidades**, não valor: somar `custo_unit_cents × quantidade`
digitada é decisão de negócio (custo do que entrou ≠ custo do pedido) e não
estava escrita em lugar nenhum. Fica como item, não como suposição.
