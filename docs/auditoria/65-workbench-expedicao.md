# 65 — Workbench da expedição: uma página, quatro etapas

**Data:** 23/11/2026 · **Base:** `nexus/main@1b4846543`.

## O defeito

A ficha da carga era três abas (`Paradas | Rota | Fechamento`) e a rota tinha outras três no celular (`Pedidos | Mapa | Planejamento`). Pedido disponível era um DIÁLOGO: a doca perdia a carga de vista ao escolher. O dono resumiu: "não mudou nada, continua confuso, com 3 abas que não precisava".

## O que mudou

- **Uma página, quatro etapas**, na ordem do prompt: `1 Pedidos e paradas` → `2 Mapa e ordem` → `3 Planejar e publicar` → `4 Fechamento`. As quatro âncoras no topo ROLAM a página — não trocam de tela. As abas do `_client.tsx` e as abas mobile do `_roteirizador.tsx` foram removidas.
- **Painel de pedidos disponíveis** (_painel-pedidos.tsx) no lugar do diálogo: número, cliente, endereço/cidade, status, valor, situação da localização e "já em outra rota" (desabilitado). Busca, filtro por status, seleção individual/múltipla, "selecionar resultados filtrados" com o alcance escrito, contador, remoção explícita, estados vazio/carregando/erro/atualizar. O GET da fila passou a devolver `endereco_entrega` e `em_outra_rota` (somente leitura; nenhuma regra nova).
- **Planejamento** com identificação da rota, motorista/veículo, nº de pedidos/paradas, sequência, distância/tempo com fonte, capacidade usada **só quando cadastrada**, selo "ordem manual × ordem sugerida", avisos recolhíveis, "Trocar motorista ou veículo", "Descartar proposta" (volta à ordem salva sem tocar nos pedidos) e **uma ação primária** ("Ordenar paradas" sem frota / "Otimizar rota" com frota). O nome OR-Tools saiu da superfície.
- **Mapa no celular** é bloco colapsável ("Abrir mapa" / "Fechar mapa"), aberto por padrão no desktop. A lista vem primeiro e o planejamento abaixo; seleção lista↔mapa compartilhada permanece.

## Prova (mesma base, 4 combinações)

Carga em montagem e carga concluída, claro/escuro × 1440/390: **contraste 0 · overflow 0 · console 0 · axe 0 crítico**. Medição em `capturas/medicao-workbench-real/varredura.json`; capturas em `capturas/{antes,depois}-workbench-real/`.

Verificado no navegador: as quatro âncoras presentes; as quatro seções no DOM; painel de pedidos e botão de abrir mapa no mobile; nenhuma aba `role=tab` restante.

## Fora de escopo

- Regras de negócio, transação, 409 e versão permanecem no backend — nada foi tocado em `/ordem` ou `/iniciar`.
- Volumes/peso por pedido não vêm na fila; por isso a coluna não foi inventada.
