# 63 — P1-26: o handoff aparece no cabeçalho do Inbox

**Data:** 23/11/2026 · **Base:** `nexus/main@e0f31c1df`.

## O que mudou

Quando a IA entrega a conversa, o atendente passa a ver **quando** (`last_handoff_at`),
**por quê** (`last_handoff_reason`) e o **resumo curto** num `<details>`
discreto do cabeçalho — não precisa abrir o CRM para saber o que aconteceu.

- `last_handoff_reason` passa a ser selecionado na API de conversas e declarado
  em `lib/types/messaging.ts` (já era coluna do banco, migration 0011).
- `lib/inbox/handoff.ts` é puro: devolve `quando`, `motivo` e `resumo`, ou
  `null` quando não houve handoff. O resumo vem de `buildHandoffSummary`.
- O painel usa o mesmo vocabulário visual do `OwnerBadge`/comando da conversa:
  tinta `text-text-muted`, borda `border-border`, sem cor de estado nova.
- Motivo em branco não vira rótulo vazio (`null`).

## O obstáculo real (medido)

`buildHandoffSummary` morava em `human-handoff.ts`, que importa `pg`, cron e
logger. Importá-lo direto no cliente fez o Turbopack tentar empacotar
`node:timers/promises` no bundle do navegador — **`/app/inbox` virou 500**
(panic log: “chunking context does not support external modules”). A função foi
extraída para `lib/agent-engine/agent/handoff-summary.ts` (só zod + `declaracao.ts`),
e `human-handoff.ts` a reexporta: nenhum chamador do motor mudou.

## Prova

- `lib/inbox/handoff.test.ts`: 3/3 (sem handoff → `null`; quando/motivo/resumo;
  motivo em branco → `null`).
- `handoff-por-orcamento` + `inbox-abas-espelham-o-comando`: 27/27 verdes.
- Capturas claro/escuro × 1440/390 com conversa que tem handoff:
  `painel-handoff` presente em 4/4 (antes: 0/4).
- `capturas/medicao-inbox-cache/varredura.json`: 4/4 válidas, overflow 0,
  console 0; o contraste 1 e o axe 1 são pré-existentes e declarados no #P1-25.

O resumo ainda é o texto honesto de “sem resumo acumulado” porque o checkpoint
durável não tem rota no Inbox — não foi inventado resumo a partir do preview.
Servidor e Chromium mortos ao fim.
