# 72 — Expedição: dois modos, três blocos com nomes

**Data:** 23/11/2026 · **Base:** `nexus/main@584e2c8fa` · **Auditoria de origem:** `71-auditoria-expedicao-ux.md` (incluída neste PR).

## O que mudou

O status decide o modo — a mesma página não serve mais "montar" e "rodar" ao mesmo tempo:

| Modo | Blocos (âncoras) | KPIs |
| --- | --- | --- |
| `montando` | O que já está na carga (`bloco-carga`) · Adicionar pedidos (`bloco-adicionar`, recolhido) · Fechar e sair (`bloco-saida`) | só paradas e a separar |
| `em_rota` / `concluida` | Próxima parada (`bloco-proxima`) · Mapa e ordem (`bloco-mapa`) · Fechamento (`bloco-fechamento`) | inclui dinheiro; "cobrança pendente" em concluída |

- Acabou a numeração duplicada: os blocos têm **nome**, não "Etapa 1/2/3/4".
- Cabeçalho com **uma** ação primária (`Sair para rota` / `Concluir carga`) + menu "…" (Veículo, Romaneio, Imprimir, Excluir). `Adicionar pedido` saiu do topo — agora vive no bloco 2.
- O painel de pedidos disponíveis vem **depois** do que já está na carga e começa recolhido. Busca/filtros/seleção/"já em outra rota" não foram alterados.
- `?aba=rota` redireciona para `/app/expedicao/<id>/rota` — a visão de operação.
- "Sem endereço no cadastro" agora é link para `/app/pedidos/<order_id>` (Corrigir endereço).
- Reserva inferior (`pb-24`) no workbench inteiro: selos do rodapé e dock mobile não cobrem linha nem botão.

## Prova

Capturas dos dois modos, claro/escuro × 1440/390, dado real (carga `a7c1997e…` montando e `ad90f4b3…` em rota): `capturas/modos-componentes/`.

Âncoras medidas (posição no documento, 1440):

| Modo | y1 | y2 | y3 | distintos |
| --- | --- | --- | --- | --- |
| montagem | 242 | 403 | 973 | ✓ |
| operação | 242 | 880 | 2367 | ✓ |

Cabeçalho em 390: uma linha para as ações do workbench (a ação primária e o menu "…"); nenhum corte. Contraste 0, overflow 0, console 0, axe 0 crítico/sério na medição final (`capturas/medicao-modos-final2/varredura.json`).

Gates: `expedicao-pagina-de-rota-layout` e `rotulo-de-campo-aponta-para-controle` verdes; typecheck limpo.

## Ajuste pós-revisão: ação primária desbloqueante

Na captura de montagem o botão **Sair para rota** era o único preenchido e estava `disabled` exatamente quando faltavam separações — o controle mais destacado da tela não fazia nada. Agora:

- com separação pendente → **Conferir separação** é o primário (leva à parada pendente); "Sair para rota" fica outline com fundo `bg-muted`/`text-muted-foreground`;
- sem pendência → **Sair para rota** assume o preenchimento e o outro botão desaparece;
- o mesmo padrão vale na operação: **Registrar desfecho** prime, **Concluir carga** secundário até todas as paradas terem desfecho.

Par habilitado × desabilitado medido no navegador (cargas `a7c1997e…` bloqueada e `c9f0b81a…` liberada, ambas em montagem):

| | botão | fundo computado |
| --- | --- | --- |
| bloqueada | Conferir separação (primário) | `rgb(164,165,255)` |
| bloqueada | Sair para rota (secundário esmaecido) | `rgb(38,38,38)` |
| liberada | Sair para rota (primário) | `rgb(164,165,255)` |

Capturas: `capturas/modos-componentes/primario-{bloqueado,liberado}_light_{1440,390}.png`. Diferença visível e medida — não é o mesmo roxo sólido com `opacity` enganoso. Em 390 as duas ações da montagem ficam na mesma linha (`y=180`, `h=44`).

## Ajuste 2 — uma ação, um nome, um lugar (sem duplicata)

A revisão do par bloqueado/liberado encontrou a **mesma ação em dois lugares com nomes diferentes**: no cabeçalho "Conferir separação" / "Sair para rota" e no cartão "Próximo passo" "Abrir para conferir" / "Iniciar rota". O usuário tinha que adivinhar qual era a real.

Regra aplicada: **a ação do próximo passo vive só no cartão "Próximo passo"**. O cabeçalho ficou com "Veículo" (natureza diferente) e o menu "…" (Romaneio, Imprimir, Excluir, Motorista) — nenhuma ação de status.

Verificado no navegador, 2 temas × 2 estados × 1440/390: apenas **uma** das ações (`Conferir separação` no estado bloqueado, `Sair para rota` no liberado) existe no documento. Capturas renomeadas com o tema correto: `capturas/modos-componentes/acaounica-{bloqueado,liberado}_{light,dark}_{1440,390}.png`. As capturas antigas `primario-*_light_*` estavam na verdade escuras (toggle com sol); foram substituídas — nome de evidência errado é pior que evidência faltando.
