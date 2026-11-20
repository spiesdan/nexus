# 56 — Alvo de toque de 44×44 nas 5 telas de público/auth (medido)

> **Base:** servidor de desenvolvimento da `main` (`6d9a3b070`), mesmo
> `.env.e2e`, um servidor por vez em `localhost:3002`, encerrado ao fim.
> **Data:** 20/11/2026. **Instrumento:** `tests/captura-publico-auth.ts`
> (`<h1>` com timeout de 15 s, redirect medido no destino, contraste AA,
> overflow, console, axe e alvos de toque).
> **Régua:** **44×44 px** para `a`, `button` e `input`, conforme
> `docs/auditoria/40-expedicao-design.md:104` e `41-cobertura-reconciliada.md` §12.

## Como foi medido

```bash
# antes (com as 5 telas ainda no CSS original)
BASE=http://localhost:3002 SLUGS=login,login-recovery,signup,legal-privacy,legal-terms \
  npx tsx tests/captura-publico-auth.ts antes-toque-5
# depois (com os links em min-h-11 min-w-11 inline-flex)
BASE=http://localhost:3002 SLUGS=login,login-recovery,signup,legal-privacy,legal-terms \
  npx tsx tests/captura-publico-auth.ts depois-toque-5
```

Cada rodada: **5 rotas × 2 temas × 1440/390 = 20 medições**. Artefatos:
`capturas/antes-toque-5-publico-auth/` e `capturas/depois-toque-5-publico-auth/`
(20 PNGs + `medidas.json` em cada).

**Tempo medido:** antes **37,7 s** (7,5 s/rota); depois **49,0 s** (9,8 s/rota,
com recompilação a frio do dev server). Referência de escala já registrada na
`55`: **13 rotas / 52 medições / 104 s / 8,0 s por rota** — varrer as 96 telas
de `app/app` leva ~13 min, não semanas.

## Antes → depois (390 px, tema claro; dimensões do elemento `<a>`)

| Tela | Link | Antes | Depois |
|---|---|---|---|
| `/login` | Esqueci minha senha | 130×17 | **138×44** |
| `/login` | Criar conta | 69×17 | **77×44** |
| `/login/recovery` | Voltar ao login | 88×17 | **96×44** |
| `/signup` | Entrar | 38×17 | **46×44** |
| `/legal/privacy` | Voltar (cabeçalho) | 36×20 | **44×44** |
| `/legal/terms` | Voltar (cabeçalho) | 36×20 | **44×44** |
| `/legal/terms` | Política de Privacidade | 139×17 | **147×44** |

Sete elementos em cinco telas. A correção é só classe: `inline-flex min-h-11
min-w-11 items-center justify-center px-1` somada às classes existentes — text
e sublinhado intactos, sem novo espaçamento lateral de página. O cabeçalho de
legal é compartilhado (`app/legal/layout.tsx`), por isso um conserto cobre
privacidade e termos.

**Resultado da varredura:** antes **5/5 telas com alvo pequeno**; depois
**0 links abaixo de 44×44** nas 20 medições. `<h1>` presente em todas,
redirect nenhum nestas rotas, contraste 0 abaixo do AA, overflow 0, axe
critical/serious 0, console 0 (exceto um aviso de hidratação do dev server,
não do produto).

## Fora deste passe (declarado, não escondido)

- **Inputs** (`h-10`, 40 px) e o **botão de tema** (40×40) seguem abaixo de 44.
  São piso do design system, compartilhado por todas as telas; mudá-los aqui
  inflaria o PR para além dos links e é decisão de design, não defeito destas
  5 linhas. O `55` já os mede como "conforto 40 × AA 24".
- O link `mailto:` do DPO em `/legal/privacy` não aparece nesta base (sem
  `dpoEmail` configurado) — não foi medido e não entra na conta.

## Linhas da matriz `41`

As cinco linhas passam a `aplicado` **com a medida anexa** — nenhuma foi fechada
por inferência de código. As que já eram `aplicado` mantêm o veredito e ganham
a evidência `56`; as de legal saem de `já conforme` para `aplicado` porque
houve mudança medida.
