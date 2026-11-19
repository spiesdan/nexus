# 48 — Faturamento: valores com unidade, estado sem apagar a tela

**Data:** 19/11/2026 · **Base:** `nexus/main` @ `fab9ab59` · **Método:** recorte
de design (hierarquia, estados), medido em `next dev` no Supabase local.
Nenhuma query, rota ou regra mudou.

## Duas premissas do despacho que o código não sustenta

1. **"lista e detalhe"** — `/app/faturamento` é **uma** tela (relatório). Não há
   rota de detalhe: a linha aponta para `/app/pedidos/<id>`, que já teve o passe
   (#620). Não criei tela nova.
2. **"ações irreversíveis separadas"** — **não existe ação** nesta tela. Emitir
   e cancelar NF vivem em `/app/notas` (fiscal), não aqui. O único controle é
   **Excel** (exportar CSV), que é leitura. Registro em vez de inventar.

## O que foi feito

1. **Erro não apaga o que estava na tela.** Antes, trocar o período e a leitura
   falhar trocava a tabela inteira pelo estado de erro — o número anterior (que
   ainda serve para conferir) sumia. Agora: **com dados** → faixa
   `role="alert"` acima da tabela, dizendo que a lista é "a última leitura boa",
   com **Tentar de novo**; **sem dados** → estado de erro de sempre, com o texto
   real da falha (`erroLeitura`).
2. **O KPI sem NF ganhou unidade.** Era só `3` — que não diz se é muito ou
   pouco. Agora mostra **R$** do que está sem nota e, embaixo, **"3 pedidos de
   57"**: é o par que o dono usa para cobrar.
3. **"NF —" virou selo "Sem NF".** O traço lia como "não se aplica"; o que
   existe é um estado — pedido faturado que ainda não tem nota.

## Números

| Medida | Resultado |
| --- | --- |
| Contraste AA (escuro) | **0 de 44** textos medidos abaixo do mínimo |
| Contraste AA (claro) | **0 de 44** |
| Não medidos pelo instrumento | **334** — fora da dobra/imagem, contados e **não** aprovados |
| Overflow horizontal | **0** em 1440 e 390 |
| Linhas na fixture | 57 pedidos, **todos sem NF** (por isso os dois KPIs mostram o mesmo valor) |

> O número de "não medidos" é alto porque o instrumento mede o que está na
> dobra: 57 linhas × 6 colunas ficam abaixo dela. Declarado, não escondido.

## Capturas

`capturas/antes-faturamento/` e `capturas/depois-faturamento/` — claro e escuro
× 1440 e 390.

## Matriz `41`

| Rota | Veredito |
| --- | --- |
| `/app/faturamento` | **aplicado** — este doc + capturas |

## Decisão pendente (do dono), não inventada

O cartão "sem NF" mostra **valor + quantidade**. Não somei "custo do que entrou"
nem "margem": essas contas dependem de decisão de negócio (custo do pedido ×
custo do recebimento) e não estão escritas — o mesmo dilema registrado no
recebimento de compras (`47-compras-recebimento-design.md`).

## Fora do escopo

`/app/notas` (emitir/cancelar NF) — é a superfície das ações irreversíveis, e já
teve estados corrigidos na 5.8; o passe visual dela não entrou aqui.
