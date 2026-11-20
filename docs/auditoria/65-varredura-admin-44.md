# 65 — Varredura completa do admin no piso 44×44 (20/11/2026)

> **Medido:** build de produção, `next start` em `127.0.0.1:3311`,
> `tests/captura-admin-matriz.ts` com `--workers=1` implícito (um browser, um
> contexto por vez). **22 rotas × claro/escuro × 1440/390 = 88 medições**.
> Cada rota: `h1` com timeout de 15 s, `urlFinal` (redirect medido no destino),
> overflow, axe `wcag2a/wcag2aa`, console e contraste amostrado, além dos alvos
> com largura **ou** altura **< 44**.
> **Servidor morto ao fim da rodada. Nada aponta para produção.**

## Mapa de defeitos por tipo

| Defeito | Onde antes | Depois |
|---|---|---|
| **Alvo entre 40 e 36 px** (régua antiga de 40) | **19 das 22 rotas** — audit 36, users 25, tenants 21, lgpd 12, tenants/new 8, tenant-ficha 7, tenant-saude 5, google 4, user-ficha 4, audit-entrada 3, inbox-conversa 3, incidents 3, marca 3, forbidden 2, inbox 2, incident-ficha 2, usage 2, lgpd-pedido 1, platform-admins 1 | **22 rotas em 0** (88/88 medições) |
| `h1` ausente | 0 | 0 |
| redirect não medido no destino | 0 — `/admin` → `/admin/dashboard` em 4/4 contextos | 4/4 |
| overflow horizontal | 0 | 0 |
| axe critical/serious | 0 | 0 |
| `console.error`/pageerror | 0 | 0 |
| contraste abaixo do AA | 0 | 0 |

O defeito dominante é o **residual da régua de 40 px**: elementos que passaram
pelo passe anterior (`h-10`, `min-h-10`, `h-9` que virava 40) ficaram 4 px
abaixo do piso atual. Como aparecia em 19 telas, o conserto foi na **casca**,
não tela a tela:

- `components/admin/AdminShell.tsx` — `data-admin-shell` no contêiner;
- `app/globals.css` — regra escopada a `[data-admin-shell]`:
  `:is(a, button, [role=button])` com `min-height`/`min-width: 44px` e
  `:is(input, select, textarea)` com `min-height: 44px`, com `!important` para
  vencer `h-9`/`h-10` utilitários. Fora do admin nada muda.

Piso novo nas peças que nascerem: um filtro esquecido herda o piso da casca.

## Por rota (pior dos 4 contextos)

| Tela | Alvos < 44 antes → depois | h1 | overflow | axe | console | redirect |
|---|---:|---:|---:|---:|---:|---|
| admin-index | 0 → 0 | ok | 0 | 0/0 | 0 | `/admin/dashboard` |
| dashboard | 0 → 0 | ok | 0 | 0/0 | 0 | — |
| tenants | 21 → 0 | ok | 0 | 0/0 | 0 | — |
| tenants-new | 8 → 0 | ok | 0 | 0/0 | 0 | — |
| tenant-ficha | 7 → 0 | ok | 0 | 0/0 | 0 | — |
| tenant-saude | 5 → 0 | ok | 0 | 0/0 | 0 | — |
| users | 25 → 0 | ok | 0 | 0/0 | 0 | — |
| user-ficha | 4 → 0 | ok | 0 | 0/0 | 0 | — |
| audit | 36 → 0 | ok | 0 | 0/0 | 0 | — |
| audit-entrada | 3 → 0 | ok | 0 | 0/0 | 0 | — |
| incidents | 3 → 0 | ok | 0 | 0/0 | 0 | — |
| incident-ficha | 2 → 0 | ok | 0 | 0/0 | 0 | — |
| lgpd | 12 → 0 | ok | 0 | 0/0 | 0 | — |
| lgpd-pedido | 1 → 0 | ok | 0 | 0/0 | 0 | — |
| marca | 3 → 0 | ok | 0 | 0/0 | 0 | — |
| observabilidade | 0 → 0 | ok | 0 | 0/0 | 0 | — |
| usage | 2 → 0 | ok | 0 | 0/0 | 0 | — |
| platform-admins | 1 → 0 | ok | 0 | 0/0 | 0 | — |
| google | 4 → 0 | ok | 0 | 0/0 | 0 | — |
| inbox | 2 → 0 | ok | 0 | 0/0 | 0 | — |
| inbox-conversa | 3 → 0 | ok | 0 | 0/0 | 0 | — |
| forbidden | 2 → 0 | ok | 0 | 0/0 | 0 | — |

## O caso de `/admin/forbidden` — fora da casca

A rota fica fora do route group `(protected)` e, portanto, fora do
`AdminShell`: a regra escopada não a alcança. O remanescente eram dois links de
40 px (`Início`, `Voltar para /app`) em claro/escuro × 1440. Corrigido na
primitiva `components/nexus-ui/feedback/StatusPage.tsx` (`min-h-10` →
`min-h-11`).

A primeira rodada de verificação foi **interrompida pela regra de máquina**
(swap passou de 4 GB, pico 7,2 GB, load 13 de outros processos): servidor e
Chromium mortos na hora, três dos quatro contextos já com 0 alvos. Assim que o
swap voltou a ~1,5 GB, a rota foi **remediada sozinha** com o mesmo instrumento
(`npx tsx tests/captura-admin-matriz.ts depois forbidden`) nos 4 contextos:
**0/2 em todos**. O JSON completo foi atualizado com essas 4 linhas medidas —
não é valor interpolado.

## Tempo

- antes: 14:04:28 → 14:08:39 (**4 min 11 s**, 88 medições);
- depois (rodada completa): 14:26:21 → 14:31:11 (**4 min 50 s**, 88 medições);
- remedição de `forbidden`: 4 medições, servidor morto ao fim.

## Evidência

- `docs/auditoria/capturas/antes-admin/medidas-completa.json` — 88 medições;
- `docs/auditoria/capturas/depois-admin/medidas-completa.json` — 88 medições
  (state anterior ao último ajuste de `forbidden`);
- PNGs claro/escuro × 1440/390 nas duas pastas;
- `medidas-forbidden.json` — remedição isolada da rota fora da casca (4 medições).

## Lição aplicada

Nenhum select com relação foi mexido nesta fatia. A lição do `lead_duplicado`
continua valendo: teste unitário que mocka a consulta **não** pega ambiguidade
de embed; qualquer mudança futura em select com `.select("…tabela(...)")` neste
módulo precisa de prova contra o PostgREST real antes de virar `aplicado`.
