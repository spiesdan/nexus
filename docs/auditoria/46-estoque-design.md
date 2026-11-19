# 46 — Estoque: o passe de design na lista e nos movimentos

**Data:** 19/11/2026 · **Base:** `nexus/main` · **Método:** recorte de design
(hierarquia, tipografia, estados), medido em `next dev` no Supabase local com a
org de teste do `.e2e-creds.json`. Nenhuma query, handler ou regra mudou.

## Linha da matriz

> **A matriz `41` não existe no repositório** — verificado com
> `git ls-tree -r --name-only nexus/main | grep docs/auditoria/4[0-9]`: existem
> 40, 42, 43, 44, 45, mas **não 41**. Esta é a linha que entra nela quando ela
> for publicada:

| Rota | Tela | Veredito | Evidência |
| --- | --- | --- | --- |
| `/app/estoque` (abas Saldos/Movimentos) | lista + razão | **aplicado** — abas com estado acessível e saldo zerado distinguido | `capturas/{antes,depois}-estoque/`, contraste 0/82 |

## O que mudou

1. **As três abas eram botões de texto.** Ativa e inativa se distinguiam só pelo
   `font-medium`; não havia `aria-current`. Agora usam o **mesmo idioma das
   seções da carga**: sublinhado `border-b-2` na ativa, `aria-current="page"` e
   `aria-label="Seções do estoque"` no `nav`. Peso e cor sozinhos não dizem onde
   a pessoa está — o `aria-current` diz, inclusive para leitor de tela.
2. **Saldo zerado deixou de ser igual a saldo normal.** `0` sai em
   `text-text-subtle`; positivo segue na tinta normal. Vale na tabela **e** no
   cartão do celular (mesma função, `classeDoSaldo`).

## O que a medição derrubou: **saldo negativo não existe**

O pedido falava em "estado negativo/zerado". Ao tentar produzir o negativo no
banco local, o Postgres recusou:

```
ERROR: new row for relation "catalog_products" violates check constraint
       "catalog_products_quantidade_nao_negativa"
```

Ou seja: **negativo é impossível nesta modelagem** — não é um estado que a tela
deixe de pintar, é um valor que não pode ser gravado. O ramo de estilo negativo
ficou como defesa (uma linha, comentada): se a constraint relaxar, `-2` não é
pintado igual a `2`. Não inventei tela para um estado que o dado proíbe.

## Números

| Medida | Resultado |
| --- | --- |
| Contraste AA (escuro) | **0 de 82** textos abaixo do mínimo |
| Contraste AA (claro) | **0 de 82** |
| Overflow horizontal | **0** (2 abas × 2 larguras × 2 temas) |
| Erros de console | **0** |
| Elementos não medidos (imagem/fundo) | 27 na lista, 65 nos movimentos — contados, não aprovados |

## Instrumento: a captura esperava texto, não o esqueleto

`/app/estoque` pinta a tabela com blocos `animate-pulse` **sem escrever
"Carregando"**. A primeira captura saiu com a tabela em esqueleto e o artefato
dizia "0 problemas". `captura-publica.mjs` passou a esperar também o
**desaparecimento do `animate-pulse`** — mesma lição do V-72 (esperar a tela, não
o `<h1>`).

## O que NÃO foi tocado

- Nenhuma query, rota, handler ou cálculo de saldo.
- `_editor/_cliente/_itens/_resumo` do criador de pedidos.
- O texto de amostra parcial (2.000) e o diálogo de novo movimento.

## Fila (não entrou nesta fatia)

Compras (recebimento), Faturamento, Sentinel — na ordem do despacho.
