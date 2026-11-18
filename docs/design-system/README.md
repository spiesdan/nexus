# Design System Nexus — registro HISTÓRICO (abril/2026)

> ## ⚠️ Esta pasta NÃO é mais a fonte canônica da linguagem visual
>
> **Status:** histórico. Escrita em **2026-04-28** (v1.0, era "Sage") e **superada em
> 2026-09-21** pelo redesign que adotou a direção descrita em [`DESIGN.md`](../../DESIGN.md)
> (commit `385e32bb`, "Redesign Nexus UI").
>
> **Fonte canônica hoje:**
>
> | Pergunta | Onde está a resposta |
> |---|---|
> | Qual é a intenção visual, e por que ela se afasta da referência | [`DESIGN.md`](../../DESIGN.md) (raiz), seção "O que este documento é" |
> | Qual é o VALOR (hex, spacing, raio, sombra, motion) | [`app/globals.css`](../../app/globals.css) — `:root`, `[data-theme="light"]`, `[data-theme="dark"]` |
> | Quais são os componentes do produto | [`components/nexus-ui/`](../../components/nexus-ui) (barril público) + `components/ui/` (shadcn) |
> | O que foi medido e decidido na auditoria AAA | [`docs/auditoria/11-auditoria-visual.md`](../auditoria/11-auditoria-visual.md) |
>
> **Em conflito, o CSS vence.** A frase anterior deste arquivo era o contrário — "quando
> houver conflito entre código e doc, **a doc vence** — ajuste o código" —, e ela ficou
> dois meses no repositório apontando para uma paleta que o produto não usa mais. Quem
> seguisse a instrução reintroduziria Sage e o texto que dizia "não importe roxo"
> (`02-palette-sage.md`) contra o accent que está em produção desde setembro.

## O que continua valendo, e o que foi superado

| Capítulo | Estado | Onde a verdade está hoje |
|---|---|---|
| `01-foundation-tokens` | **parcial** — a escala base 4 e a intenção de densidade valem; os valores são do CSS | `app/globals.css` (`--space-*`, `--radius-*`, `--shadow-*`, `--duration-*`) |
| `02-palette-sage` | **SUPERADO** — o accent é lavanda, não Sage | `app/globals.css` (`--color-accent-*`), `DESIGN.md` |
| `03-typography` | **SUPERADO** — a fonte é Inter via `next/font`, não Atkinson | `app/layout.tsx`, `--font-sans` |
| `04-density-aerada` | válido — linha 56 / gap 24 continua sendo a densidade do produto | `lib/nexus/tokens.ts`, `--density-*` |
| `05-iconography-phosphor` | válido — Phosphor continua canônico | `lib/ui/icons.ts` |
| `06-components` | válido como intenção; o catálogo real é o código | `components/nexus-ui/`, `components/ui/` |
| `07-motion-language` | válido — 4 tipos, curvas e durações | `app/globals.css` (`--ease-*`, `--duration-*`), `lib/nexus/tokens.ts` |
| `08-voice-and-tone` | válido | microcopy no produto |
| `09-anti-patterns` | válido, **exceto** a proibição de roxo (era contra a era Sage) | `DESIGN.md` |

O valor deste material agora é **histórico e de raciocínio**: ele registra por que
algumas escolhas foram feitas (densidade, iconografia, tom de voz, motion). Ele não
descreve o que o produto pinta.

## Índice

| # | Documento | O que cobre |
|---|-----------|-------------|
| 00 | [Overview](./00-overview.md) | Filosofia, princípios, referências |
| 01 | [Foundation Tokens](./01-foundation-tokens.md) | Spacing, radius, shadow, motion, z-index |
| 02 | [Paleta Sage (histórico)](./02-palette-sage.md) | 22 stops com hex (light + dark), estados, contraste |
| 03 | [Tipografia (histórico)](./03-typography.md) | Atkinson Hyperlegible, escala, IBM Plex Mono |
| 04 | [Densidade Aerada](./04-density-aerada.md) | Row 56 / gap 24, quando overrider |
| 05 | [Iconografia Phosphor](./05-iconography-phosphor.md) | Duotone, mapeamento por feature |
| 06 | [Componentes](./06-components.md) | shadcn customizado + componentes do produto |
| 07 | [Motion Language](./07-motion-language.md) | 4 tipos canônicos, curvas, durations |
| 08 | [Voz e Tom](./08-voice-and-tone.md) | PT-BR profissional calmo, microcopy |
| 09 | [Anti-patterns](./09-anti-patterns.md) | O que não fazer, com alternativas |

## Mapa decisão → onde consultar

| Decisão | Onde está canonizada | Quando consultar |
|---------|----------------------|------------------|
| Cor (hex, stop, estado) | `app/globals.css` + `DESIGN.md` | Sempre que precisar referenciar uma cor |
| Spacing / radius / shadow | `app/globals.css` (`--space-*`, `--radius-*`, `--shadow-*`) | Toda vez que escrever CSS de layout |
| Tamanho/peso de texto | `app/globals.css` (utilities do tema) + `DESIGN.md` (escala 12–60 px) | Ao criar headers, body, dados, captions |
| Altura de linha de inbox / kanban / tabela | `04-density-aerada.md` + `lib/nexus/tokens.ts` | Ao desenhar listas e grids |
| Qual ícone usar para feature X | `05-iconography-phosphor.md` + `lib/ui/icons.ts` | Ao adicionar novo ícone |
| Variant/state de um componente | `components/nexus-ui/` e `components/ui/` | Antes de criar novo componente |
| Duração e curva de animação | `07-motion-language.md` + `--duration-*`/`--ease-*` | Toda vez que adicionar `transition` ou `animation` |
| Copy de erro/sucesso/empty | `08-voice-and-tone.md` | Ao escrever microcopy |
| "Posso usar X?" | `09-anti-patterns.md` | Quando em dúvida sobre uma escolha |

## Versionamento

- **v1.0** (2026-04-28) — paleta Sage, tipografia Atkinson, densidade Aerada, iconografia
  Phosphor lockados. **Encerrado em 2026-09-21** pelo redesign.
- Este arquivo não recebe nova versão: mudança de linguagem visual se escreve em
  `DESIGN.md` + `app/globals.css`. O gate
  `tests/unit/docs-de-design-nao-contradizem-o-css.test.ts` reprova quem voltar a
  declarar esta pasta como canônica.
