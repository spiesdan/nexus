# 87 — A ação do cabeçalho pertence à página

Medido em 27/11/2026 na auditoria das 5 áreas (`auditoria-uiux-5-areas.md`):

| Página | Botão do cabeçalho | Medição do clique |
|---|---|---|
| `/pedidos` e paradas | "Conferir separação" | rola até a parada — funciona |
| `/rota` | "Conferir separação" | 0 scroll, 0 diálogo, 0 navegação |
| `/fechamento` | "Registrar desfecho" | 0 scroll, 0 diálogo, 0 navegação |

Causa: o resolvedor era único para as quatro páginas e chamava `focarParada`,
que rola até `#parada-<id>` — um id que só existe em "Pedidos e paradas".

## A matriz

| Estado da carga | Pedidos e paradas | Mapa e ordem | Fechamento | Resumo |
|---|---|---|---|---|
| Separação pendente | rola até a parada | vai para a parada (`#parada-<id>`) | vai para a parada | vai para a parada |
| Pronta para sair | vai para `/rota` | — (a página tem "Publicar rota") | vai para `/rota` | vai para `/rota` |
| Em rota, com pendência | rola até o desfecho | vai para a parada | vai para a parada | vai para a parada |
| Em rota, tudo fechado | "Fechar a carga" | vai para o fechamento | — (a página tem "Gravar fechamento") | vai para o fechamento |

Os dois traços são decisões, não esquecimentos: o "Publicar rota" e o "Gravar
fechamento" já estão na página, e repeti-los no banner recriaria o par de CTAs
que a mesma auditoria pediu para desfazer. Uma ação por tela. E sem ação para
oferecer, a faixa "Próxima ação" **não aparece**: ela prometia uma ação e
mostrava a frase sem botão (Design UX, 27/11/2026). O estado continua no selo e
no cartão "Próximo passo".

Nada de regra de negócio nova: todo comportamento usa caminho que já existia —
o mesmo `focarParada`, o mesmo link para `/rota`, o mesmo `POST /rota/finalizar`
de "Fechar a carga", e navegação para a parada onde o alvo vive.

## O salto entre páginas

`#parada-<id>` é resolvido num efeito, uma vez por hash, quando os itens chegam
(o cartão só existe depois do fetch). A ação vira link — antes era um botão que
não levava a lugar nenhum — e o salto **leva o foco junto**: o cartão recebe
`tabIndex={-1}` e é focado depois da rolagem, então teclado e leitor de tela
chegam ao mesmo lugar que os olhos. A prova é a spec com `toBeInViewport` e
`toBeFocused`, não só a existência do botão.

## Mobile (dívidas do PR #959)

1. **Dock ausente.** `MobileDock` pode devolver `null` (papel sem destinos ou
   rota em `SEM_DOCK`). A barra de avanço da nova carga assumia que ele estava
   lá e ficava 57 px acima do rodapé. A regra virou `dockPresente()` — a mesma
   que o dock usa para renderizar — publicada por `DockPresence`; sem dock a
   barra desce a `bottom: 0` e a safe area do aparelho entra num wrapper
   (`pb-[env(safe-area-inset-bottom)]`; o gate de espaçamento recusa `calc()`
   em valor arbitrário).
2. **Teclado no passo 2.** A barra `fixed` ficava ancorada no rodapé de baixo
   do teclado. Ela agora mede a sobra pelo `visualViewport` e sobe junto,
   mantendo o dock na página (sem `SEM_DOCK` novo).

Testes: `tests/e2e/expedicao-acao-do-cabecalho.spec.ts`,
`tests/e2e/expedicao-nova-barra-mobile.spec.ts` e o unitário
`tests/unit/expedicao-barra-acima-do-dock.test.ts`.
