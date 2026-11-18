# 9.5 — snapshots visuais: baseline com gate, sem aprovação cega

> Medido em 17/11/2026. Spec: `tests/e2e/visual-snapshots.spec.ts`. Baselines:
> `tests/e2e/visual-snapshots.spec.ts-snapshots/` (14 PNGs, ~452 KB).

## 1. O que existia (e o que faltava)

| Antes | Consequência |
|---|---|
| **Zero** `toHaveScreenshot`/`toMatchSnapshot` em 100 specs | nenhum gate de regressão visual |
| capturas do instrumento de auditoria (`captura-visual.mjs`) | registram estado para leitura humana; **não reprovam** quando um componente muda |

A lacuna era a maior da Fase 9: o produto podia perder contraste, espaçamento,
hierarquia ou um botão inteiro sem nenhum teste vermelho.

## 2. O conjunto (pequeno, de propósito)

**14 baselines:**

| Tela | Desktop escuro | Desktop claro | Celular escuro |
|---|---|---|---|
| `/login` | ✓ | — | ✓ |
| `/app` | ✓ | ✓ | ✓ |
| `/app/pedidos` | ✓ | ✓ | ✓ |
| `/app/contacts` | ✓ | ✓ | ✓ |
| `/app/notas` | ✓ | ✓ | ✓ |

O produto é **dark-first** (`lib/theme.tsx`: quem nunca escolheu fica no escuro),
então o escuro é medido em tudo e o claro nas telas autenticadas de desktop. Não
é a matriz de 156 telas: baseline de tudo vira manutenção de artefato, e o time
aprende a rodar `--update-snapshots` no automático — que é pior que não ter
baseline.

## 3. Como a instabilidade é tratada (e não escondida)

| Fonte de ruído | Tratamento |
|---|---|
| fonte carregando | `await document.fonts.ready` + 400 ms de assentamento |
| animação no meio | `animations: "disabled"` no `toHaveScreenshot` |
| skeleton trocando pela lista | espera `load` + zero `.animate-pulse`/`aria-busy` (10 s) |
| scroll restaurado | `window.scrollTo(0,0)` antes de capturar |
| avatar / data / número | `mask` em `img`, `time`, `[datetime]`, `[data-visual-volatil]` |
| contador de avisos do sino | `mask` no **botão** (`alerts-bell`) — mascarar só o número falha quando ele é zero e o elemento não existe |
| toast de boas-vindas | `mask` em `[data-sonner-toast]` |
| lista mudando de tamanho | captura é a **faixa superior** (`clip` 1440×280 / 390×420): cabeçalho, título, ações e filtros — o que carrega a identidade da tela e não depende do dado |
| timeout de 30 s sob banco compartilhado | `test.describe.configure({ timeout: 90_000 })` |

`maxDiffPixelRatio: 1%` absorve antialiasing; acima disso é layout.

**Medição de estabilidade:** duas execuções consecutivas da spec inteira, depois
dos ajustes — **14/14 em cada**, sem falha intermitente.

## 4. Como atualizar o baseline (de propósito)

```bash
pnpm e2e:build   # `next start` usa build de produção
pnpm exec playwright test tests/e2e/visual-snapshots.spec.ts --update-snapshots
```

**Revise as imagens no diff do PR antes de commitar.** Atualizar baseline sem
olhar aprova qualquer mudança — inclusive a que quebrou a tela.

## 5. A lacuna declarada: CI por plataforma

O Playwright grava baseline com **sufixo de plataforma** (`…-darwin.png`,
`…-linux.png`). Os 14 baselines versionados foram gerados em macOS; o job `e2e`
roda em `ubuntu-latest`, e sem baselines linux ele reprovaria **por plataforma**,
não por regressão visual.

Por isso a spec está em `FORA_DO_CI` **com o motivo escrito**, junto das outras
três. Fechar isso exige runner fixo (container oficial do Playwright, onde
baseline e execução usam a mesma imagem); é decisão de infraestrutura, não de
teste. Enquanto isso, a spec é gate **local** — e o `pnpm test:e2e` a executa
quando alguém roda a suíte completa.

## 6. Critério de conclusão

- 9.5 fica `[~]`: baseline existe, roda e é estável localmente; falta a execução
  no CI por plataforma.
- D5 ganha a evidência: a consistência visual agora tem régua que reprova, não
  só captura para leitura.
