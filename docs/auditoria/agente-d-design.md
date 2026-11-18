# Agente D — Design system, UI e acessibilidade · relatório da rodada

> **Data:** 18/11/2026 · **Fonte:** `docs/auditoria/PROMPT-MESTRE-AAA.md` (lei), seções 6, 7 e 2.2.
> Nada foi deployado. Nenhuma regra de negócio, fiscal, financeira ou de autorização foi tocada.
> Produção/VPS: só leitura, e nesta rodada nem isso.

## 1. Objetivo e escopo

Evoluir o design system existente — tokens, temas claro/escuro, tipografia, densidade, raios,
sombras, movimento, componentes globais, shell — **sem criar um segundo sistema**, com contraste
WCAG 2.2 AA medido sobre a cor final composta e prova reproduzível por fatia.

## 2. O que foi entregue

| Fatia | PR | Estado | Achado → correção |
| --- | --- | --- | --- |
| Tema claro: `text-subtle` | **#491** | **mergeada** (`62e52a41`) | V-52: `#999999` = **2,85:1** sobre o cartão, **74 usos de texto**. Agora `#6f6f6f` (5,02 / 4,69 / 4,81). V-53: o instrumento de tokens lia o `:root` como se fosse o tema escuro ("127/127/127") |
| Accent como tinta | **#516** | **mergeada** (`77dd46f3`) | V-54: `text-accent` = **3,63:1** no claro e **3,06:1** no `Badge` default. Criado `--color-accent-ink` (accent-700 no claro, 400 no escuro). `Button destructive` usava branco fixo → **3,48:1** no escuro; passou a `--destructive-foreground` |
| Shell: trilha e avisos | **#523** | aberta | V-56: migalha sem destino virava `<Link href="#">` (alvo de Tab que não navega). V-57: o sino mudava de número sem anúncio (sem região viva) |
| Foco visível | **#524** | aberta | V-58: seis campos sinalizavam foco com borda **1,21 → 1,40**; as duas buscas escondiam o anel e não pintavam nada no lugar |
| Densidade e z-index | **#525** | aberta | O CSS tem quatro `--density-*` e sete `--z-*` que **nenhum componente lê**: agora são espelho vigiado de `lib/nexus/tokens.ts` |
| Aviso (toast) em inglês | **#527** | aberta | V-59: o botão de fechar era anunciado como **"Close toast"** num produto pt-BR. E o prop `closeButtonAriaLabel` do `<Toaster>` é aceito e **ignorado** — só funciona por `toastOptions` |

Detalhe completo, com números e método, em `11-auditoria-visual.md` (V-52 a V-59).

## 3. Instrumentos (o que passou a medir)

| Instrumento | Antes | Depois |
| --- | --- | --- |
| `scripts/auditoria/contraste.mjs` | um tema (o padrão, escuro) | **os dois**, com `tema` em cada registro e resumo por tema |
| `scripts/auditoria/tokens-do-tema.mjs` | contava tokens; "dark" era o `:root` por um `indexOf` no `@custom-variant` | blocos ancorados na linha + **contraste de texto por tema** (`127 / 79 / 90` tokens) |
| `tests/unit/tailwind-tokens.test.ts` | excluía `text-subtle` como "decoração" | mede `text`, `text-muted` e `text-subtle` nos dois temas |
| novos gates | — | `docs-de-design-nao-contradizem-o-css`, `tinta-do-accent-passa-aa`, `trilha-sem-link-morto`, `central-de-avisos-anuncia`, `densidade-css-e-espelho-ts`, `toast-fala-portugues` |

## 4. Decisões pendentes (medidas, não tomadas)

- **V-55 · borda de campo de formulário a 1,21:1** (claro) / 1,31:1 (escuro) contra o piso 3:1 da
  WCAG 1.4.11. A correção é um token + três primitivos, mas muda **todo** formulário e o
  `DESIGN.md` declara "hairline borders". **Decisão do dono.**
- **`richColors` do aviso** pinta com a paleta da biblioteca, fora dos tokens. Trocar é mudança
  visível de superfície → exige captura.
- **Trilhas de cor da agenda**: as 8 cores de pessoa são da era Sage. Medido agora: no escuro o
  índigo fica a **0,052** do accent (mais perto do accent do que de qualquer outra trilha), e o pior
  par entre pessoas é 0,079 (índigo × violeta). Re-derivar é decisão de produto; o número está aqui.
- **`docs/design-system/`** foi corrigido para se declarar histórico (era "a doc vence — ajuste o
  código", contra um produto lavanda + Inter desde 21/09).

## 5. Limitações e riscos

- **Sem captura visual nesta rodada.** O runtime foi reiniciado seis vezes (dois builds de produção
  interrompidos, um dev server), e a regra nova de operação proíbe build/suíte por rotina. Todas as
  provas acima são reproduzíveis **sem banco e sem build** (`node scripts/auditoria/tokens-do-tema.mjs`,
  `vitest run <arquivo>`), exceto as duas que dependem de render.
- **`app/app/fiscal/**` não foi tocado** (17 usos de `text-accent`, ainda a 3,63:1 no claro), por
  acordo de frentes; a dívida está declarada no teste que a vigia.
- **Typecheck local não rodado** nas últimas fatias (passa de 20 min sob carga); o job `verify` cobre.
- O worktree `aaa-front-design` foi **apagado pelo ambiente** no meio da rodada; o trabalho não
  commitado dele (fatia do shell) foi refeito em `aaa-front-shell`, e as fatias anteriores já estavam
  mergeadas.

## 6. Worktrees, branches e commits

| Branch | PR | Commit |
| --- | --- | --- |
| `front/design` | #491 (mergeada) | `c111b81c` |
| `front/design-tinta` | #516 (mergeada) | `99958a18` |
| `front/shell-2` | #523 | `da9381cb` |
| `front/foco-visivel` | #524 | `4cfe930c` |
| `front/densidade` | #525 | `35dadeb3` |
| `front/toast` | #527 | `e9cdda90` |

## 7. Próximo passo sugerido

1. Mergear as quatro PRs abertas quando o CI fechar (todas pequenas e independentes).
2. Fatia com **captura**: alinhar o aviso (`richColors`) aos tokens do produto e a borda dos campos
   (V-55), se o dono aprovar — as duas mudam pixel e por isso ficaram esperando prova visual.
3. Re-derivar as trilhas da agenda contra o accent violeta (medida acima), com aprovação do dono.
