# 62 — P1-25: o Inbox diz quando está mostrando cache

**Data:** 23/11/2026 · **Base:** `nexus/main@e0f31c1df`.

## O defeito

Quando o canal Realtime não conecta, a lista vem do cache e continua legível —
mas o produto não dizia aquilo. Quem atende acreditava estar vendo o estado ao
vivo e podia responder com informação atrasada sem saber.

## O que mudou

Um selo discreto, acima dos filtros, **só quando** `listQ.realtimeStatus !== "subscribed"`
(único valor “ao vivo”: `connecting`, `channel_error`, `timed_out` e `closed` não
contam). Usa `Badge`/token `warning` e `role="status"`: discreto no layout, mas
anunciado a quem usa leitor de tela. Nenhum estado novo foi inventado — a régua
é o `data-realtime-status` que a tela já expunha para diagnóstico.

## Prova (4 combinações)

Capturas com WebSocket do Realtime bloqueado no Playwright
(`docs/auditoria/capturas/{antes,depois}-inbox-cache/`, claro/escuro × 1440/390):

| | antes | depois |
| --- | --- | --- |
| `data-testid="inbox-selo-cache"` | 0 | **1 em todas as 4** |
| Contraste do selo (warning-bg/warning-fg) | — | passa |
| Overflow horizontal | 0 px | 0 px |
| Console/pageerror | 0 | 0 |

Medição adicional: `medicao-inbox-cache/varredura.json` — 4/4 válidas, contraste
1 falha **pré-existente** (`text-primary` “Ver no 360” 3,63:1 sobre branco) e axe
1 sério pré-existente (`text-muted-foreground` na lista), ambos fora deste passe.

Servidor e Chromium mortos ao fim.
