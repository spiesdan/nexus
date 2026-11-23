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
