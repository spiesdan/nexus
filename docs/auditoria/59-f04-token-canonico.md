# 59 — F-04 fechado: qual é o accent canônico

**Data:** 22/11/2026 · **Base:** `nexus/main@0d0b4f45f` · **Decisão:** manter `#7e77f0`.

## A dúvida

`docs/auditoria/00-linha-de-base.md` F-04 dizia: “docs declaram Sage `#67885d`
canônico; o código usa accent índigo `#7e77f0`”. As duas cores existem — mas em
camadas diferentes, e só uma é o token que o produto consome.

## Evidência no código (o que é fonte)

| Fonte | Valor | Papel |
| --- | --- | --- |
| `app/globals.css:107` | `--color-accent-600: #7e77f0` | **rampa do produto** |
| `app/globals.css:112` | `--color-accent: var(--color-accent-600)` | o accent funcional usado por `bg-accent`, `ring`, foco |
| `app/design/lib/tokens.ts:47` | `sage.accent[500] = #67885d` | **paleta opcional** do seletor de tema; não é o token de runtime |
| `docs/design-system/02-palette-sage.md:31` | `#67885d` “Brand accent canônico” | documento de direção de arte, não casado com `globals.css` |
| `docs/design-overhaul/design-direction.md:13` | `#7e77f0` “Accent funcional = grau 600” | decisão registrada, com medição prévia |

## Contraste medido (WCAG 2.1, fórmula de luminância relativa)

Superfícies lidas de `app/globals.css`: claro `--color-surface: #ffffff`,
`--color-bg: #f6f7f9`, `--color-accent-soft: #e9eaff`; escuro `--color-surface: #1c1c1c`.

| Par | Razão | Leitura |
| --- | --- | --- |
| `#7e77f0` sobre `#ffffff` | **3,63:1** | passa 3:1 para componente; falha 4,5:1 para texto |
| `#67885d` sobre `#ffffff` | 4,00:1 | idem, ainda abaixo de 4,5:1 |
| `#7e77f0` sobre `#e9eaff` (accent-soft) | 3,06:1 | por isso `text-accent` usa `--color-accent-ink` |
| `#67885d` sobre `#e4ebe0` (soft Sage) | 3,28:1 | mesmo regime |
| `#7e77f0` sobre `#181925` | 4,80:1 | texto/preenchimento no escuro |
| `#67885d` sobre `#181925` | 4,36:1 | — |

Nenhum dos dois atinge 4,5:1 como tinta sobre superfície clara — e é exatamente por
isso que `globals.css:96` separa **preenchimento** (`accent`) de **tinta**
(`accent-ink = accent-700`), com 5,56:1 medido no claro. A disputa F-04 não é sobre
contraste: as duas cores estão no mesmo regime. É sobre **qual token o produto usa**.

## Decisão

**`#7e77f0` é o canônico operacional.** É o valor de `--color-accent`, o que o
produto pinta hoje, o que `docs/design-overhaul/design-direction.md:13` fixou com
medição prévia (`scripts/explorar-lavanda.ts`, `branding-contraste.test.ts`) e o
que `lib/branding/regua-do-produto.ts:34` usa como semente da rampa. `#67885d`
continua sendo o grau 500 da paleta Sage opcional (`app/design/lib/tokens.ts`) —
**não é identidade do produto** e não deve ser injetado em `globals.css`.

**Nenhuma cor foi trocada.** F-04 é dúvida documental, não defeito visual; trocar a
identidade exigiria medição em 140 usos de `text-accent` e nos pares de foco,
fora do escopo desta auditoria. A linha F-04 da `00-linha-de-base.md` passa a
registrar o desfecho.
