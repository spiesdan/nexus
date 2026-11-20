# 54 — Varredura de público/auth (bloco 1): forgot, reset e 403

> **Base:** build de produção da **1.61.1** (`v1.61.1`) em `localhost:3001`,
> Supabase local. **Data:** 20/11/2026. **Instrumento:**
> `tests/captura-publico-auth.ts`, agora com **`<h1>` com timeout de 15 s**,
> **redirect medido no destino** (`urlFinal`), **contraste**, **overflow**,
> **console**, **axe** e **alvos de toque**. 3 rotas × 2 temas × 1440/390 =
> **12 medições**.

## Como foi medido

```bash
BASE=http://localhost:3001 SLUGS=login-forgot,login-reset,403 \
  npx tsx tests/captura-publico-auth.ts varredura-2026-11-20
```

Artefato: `docs/auditoria/capturas/varredura-2026-11-20-publico-auth/`
(12 PNGs + `medidas.json`). O `<h1>` é o sinal de tela; se não vier em 15 s, o
registro leva `sem <h1>`. `redirecionou`/`urlFinal` provam o destino.

## Resultado

| Rota | Tema/largura | `<h1>` | Redirect | Contraste | Overflow | Console | axe (crit/ser) | Alvos <44px |
|---|---|---|---:|---:|---:|---:|---:|---:|
| `/login/forgot` | claro/escuro × 1440/390 | sim | não | **0/6** | 0 | 0 | 0/0 | 3/3 (1440), 2/3 (390) |
| `/login/reset` | claro/escuro × 1440/390 | sim | não | **0/5** | 0 | 0 | 0/0 | 3/3 (1440), 2/3 (390) |
| `/403` | claro/escuro × 1440/390 | sim | não | **0/4** | 0 | 0 | 0/0 | 2/2 (1440), 0/2 (390) |

**Contraste:** nenhum texto abaixo do piso AA (4,5 normal / 3 grande) nas 12
medições.

## Achado de alvo de toque (o que a régua antiga não media)

O piso de toque usado é o **AA (WCAG 2.5.8): 24×24 px**; 44×44 é o conforto
(AAA), não o mínimo. A leitura:

- **`/login/forgot` (390):** o link “Voltar” mede **38×17 px** — abaixo dos
  24 px de altura. **É achado**, e a linha fica `pendente` até o link ganhar
  área de toque (`min-h-11`/`inline-flex`). O input de e-mail tem 276×40 (passa
  AA; fica abaixo do conforto 44).
- **`/login/reset` (390):** os dois inputs medem 276×40 — **passam AA**; não há
  link pequeno. `já conforme` para o piso AA; o conforto 44 é decisão de design.
- **`/403` (390):** 0/2 abaixo de 44 — passa nos dois pisos.

O instrumento conta `<44` como “pequeno” para dar o número de conforto; a
classificação acima usa **24** para separar achado real de conforto.

## Linhas da matriz `41` atualizadas

| Rota | Veredito | Evidência |
|---|---|---|
| `/login/forgot` | **pendente** (toque: link 38×17 <24) | #659 + `capturas/varredura-2026-11-20-publico-auth/` |
| `/login/reset` | **aplicado** (AA ok; conforto 40px é decisão) | #659 + `capturas/varredura-2026-11-20-publico-auth/` |
| `/403` | **já conforme** | #659 + `capturas/varredura-2026-11-20-publico-auth/` |

## O que falta das 16

**13 rotas** ainda sem a régua nova (`<h1>` + redirect + toque): `login`,
`login/recovery`, `login/mfa`, `signup`, `500`, `503`, `account-suspended`,
`legal/privacy`, `legal/terms`, `o/[token]`, `/`, `vitrine-agenda`,
`accept-invite`. O #659 tem 64 medições de contraste/overflow/console, mas sem
`<h1>` explícito e sem toque — é a diferença que esta varredura cobre.

**Nenhum bloqueio de instrumento:** as 12 medições rodaram em ~1,1 min no total
(≈5,5 s/rota), abaixo do limite de 1 min/rota.
