# 55 — Varredura de público/auth (bloco 2): as 13 restantes

> **Base:** build de produção da **1.61.1** em `localhost:3001`; **data**
> 20/11/2026. 13 rotas × 2 temas × 1440/390 = **52 medições**.
> **Tempo:** **104,0 s no total** (13 rotas, 4 medições cada) — **8,0 s/rota**,
> abaixo do limite de 1 min/rota. O instrumento não precisou de ajuste.

## Como foi medido

```bash
SLUGS=login,login-recovery,login-mfa,signup,500,503,account-suspended,\
legal-privacy,legal-terms,orcamento,landing,vitrine-agenda,accept-invite \
BASE=http://localhost:3001 npx tsx tests/captura-publico-auth.ts varredura-2026-11-20-resto
```

Artefato: `capturas/varredura-2026-11-20-resto-publico-auth/` (52 PNGs +
`medidas.json`). Régua: `<h1>` com timeout 15 s, redirect no destino
(`urlFinal`), contraste AA, overflow, console, axe e alvos de toque.

## Resultado

- **Contraste:** 0 texto abaixo do piso em todas as 52 medições.
- **Overflow:** 0; **axe critical/serious:** 0; **`<h1>`:** presente em todas.
- **Redirects medidos (não são falha):**
  - `/login/mfa` → **`/login`** (sem desafio MFA ativo no contexto anônimo);
  - `/` → **`/login?next=%2Fapp`** e `/vitrine-agenda` → **`/login?next=%2Fvitrine-agenda`** (auth de borda).
  O destino foi registrado; a tela de destino tem `<h1>`.
- **`/500`:** 1 erro de console — é a **própria página registrando o 500** (comportamento correto), não erro de instrumento.

## Achados de alvo de toque (piso AA 24×24)

| Rota | Alvo | Medida | Veredito |
|---|---|---|---|
| `/login` | 2 links | 130×17 e 69×17 | **pendente** |
| `/login/recovery` | 1 link | 88×17 | **pendente** |
| `/signup` | 1 link | 38×17 | **pendente** |
| `/legal/privacy` | 1 link | 36×20 | **pendente** |
| `/legal/terms` | 2 links | 36×20 e 139×17 | **pendente** |
| `/login/forgot` | link “Entrar” | **38×17 → 38×44** | **corrigido** (altura ≥24 AA; captura depois) |
| `/503`, `/account-suspended`, `/o/[token]`, `/accept-invite` | — | 0 abaixo de 24 | **já conforme** |

`/login/forgot` era o achado do bloco 1: o link ganhou `min-h-11`/`inline-flex`,
medindo **38×44** (antes 38×17) — passa AA; a densidade do parágrafo não mudou.
Capturas antes/depois em `capturas/varredura-2026-11-20-publico-auth/` e
`capturas/depois-fix-publico-auth/`.

## Linhas da matriz `41`

| Rota | Veredito | Evidência |
|---|---|---|
| `/login` | **pendente** (links 17px) | varredura 2026-11-20-resto |
| `/login/recovery` | **pendente** (link 88×17) | idem |
| `/signup` | **pendente** (link 38×17) | idem |
| `/legal/privacy` | **pendente** (link 36×20) | idem |
| `/legal/terms` | **pendente** (links 17–20px) | idem |
| `/login/mfa` | **já conforme** (redirect medido → `/login`) | idem |
| `/` | **já conforme** (redirect → `/login?next=/app`) | idem |
| `/vitrine-agenda` | **já conforme** (redirect → `/login?next=…`) | idem |
| `/500` | **já conforme** (console do próprio 500) | idem |
| `/503`, `/account-suspended`, `/o/[token]`, `/accept-invite` | **já conforme** | idem |
| `/login/forgot` | **aplicado** (link 38×44; AA) | bloco 1 + `depois-fix-publico-auth/` |

**Nenhum bloqueio de instrumento.** Os links de 17–20 px são um achado
sistêmico de alvo de toque, não de contraste/overflow; ficam na fila do design.
