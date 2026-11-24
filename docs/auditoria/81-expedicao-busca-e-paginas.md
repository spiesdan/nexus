# 81 — Adicionar pedidos: busca que filtra, seleção visível e páginas separadas

Queixa do dono: digitou o número e "os outros ficaram aparecendo"; não sabia quando tinha selecionado. Os dois defeitos eram de **render**, não de dado.

## Antes → depois (medido na carga `a7c1997e…`, 141 pedidos disponíveis)

| | antes | depois |
| --- | --- | --- |
| lista com busca por `0248` | 141 linhas | **1 linha** (`PED-0248`), "1 resultados" |
| checkbox | `sr-only` (invisível) | visível 20×20, linha com borda/fundo de seleção |
| contador | só no cabeçalho | **"3 selecionados"** ao lado da ação, que diz **"Adicionar 3 pedidos"** |
| busca sem resultado | lista cheia/sumia | "Nenhum pedido com esse termo." + "Limpar busca" |
| número exato | competia com cliente/cidade | termo numérico ordena o número exato primeiro |

## Três páginas de verdade

`/app/expedicao/[id]` → só "Pedidos e paradas" (+ painel de adicionar);
`/rota` → só "Mapa e ordem"; `/fechamento` → só "Fechamento". Cada `secao` monta só a sua seção — sem `hidden lg:block`, sem âncora, sem aba. A navegação são Links do Next com `aria-current="page"` (medido: uma página ativa em cada rota), cabeçalho único vindo do `contexto` do servidor.

**Estado da seleção NÃO sobrevive à troca de página** (medido: 3 selecionados → 0 ao voltar). O `Set` de seleção é estado local do painel, que é desmontado na navegação. Não há persistência implementada e isto não foi inventado: se o operador precise selecionar e trocar de página, terá de refazer.

Capturas: `capturas/busca-{light,dark}_{1440,390}.png` (resultado único), `capturas/selecao-{light,dark}_{1440,390}.png` (3 marcados + contador) e `capturas/pagina-{pedidos,rota,fechamento}-{light,dark}_{1440,390}.png`. Console limpo nas 8 combinações. Testes: `expedicao-busca-e-paginas`, `expedicao-pagina-de-rota-layout`, `modo-entregador`, `numero-mercos-visivel` (38 verdes).
