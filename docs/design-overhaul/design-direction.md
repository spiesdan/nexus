# NEXUS — Direção visual única (Fase 3)

> Decisão registrada em 2026-10-15 a partir do código real, não de mock.
> Fontes: `app/globals.css:28-505`, `lib/theme.tsx`, `DESIGN.md`, `docs/PROMPT-V4-REDESIGN-VISUAL-TOTAL.md`.

## 1. Decisões (INFIDO — não reabrir sem evidência nova)

1. **Dark-first MANTIDO.** `lib/theme.tsx:54-55` default `dark`;
   `<html data-theme="dark">` no SSR; `light` gravado em `nexus-theme`.
   A auditoria julga linguagem (bordas/densidade/tipografia), válida nos dois temas.
2. **`DESIGN.md` (Visitors) é referência de estilo**, não mandato de produto:
   Carbon `#181925`, Fog `#e8e8e8`, lavanda, pill 9999px onde o spec não fecha o número.
3. **Accent funcional = grau 600 `#7e77f0`** (não a lavanda 500 `#918df6`):
   500 dá 2,86 contra branco e reprova o piso de componente (3,0); texto sobre o
   accent é Carbon (7+), não branco (4,0). Medido em `scripts/explorar-lavanda.ts`;
   pares fixados em `branding-contraste.test.ts`. Não "melhorar" o accent no olho.
4. **Fonte única de verdade = `app/globals.css`.** Superfícies, texto, borda,
   accent 50–950, semânticas, radius, sombras, z-index, densidade — tudo tokenizado
   nos blocos `:root` / `[data-theme="light"]` / `[data-theme]="dark"]`.
   Nenhum hex novo em tela de produto; exceções legítimas (editor de marca,
   mapas, vitrines) ficam isoladas onde já estão.

## 2. Linguagem (o que "AAA" significa aqui)

- Superfícies grafite/carvão/cinza diferenciadas; **borda 1px discreta**; radius
  médio/grande consistente (`md/lg/xl` — pill só onde o DS manda).
- Tipografia com hierarquia evidente; números tabulares; labels pequenos,
  descrições discretas; títulos de página `text-2xl font-medium tracking-tight`.
- Cor com moderação: verde=positivo, âmbar=atenção, vermelho=erro, azul=ação.
  Badge colorido em excesso é bug visual.
- Gráficos integrados ao painel (título + descrição + métrica + chart), nunca
  widget solto; tabelas densas, legíveis, operáveis.
- Espaçamento intencional na escala do DS; páginas `p-4 sm:p-6`; seções `space-y-4/6`.
- Microinteração curta e discreta (`hover-raise`, transições do DS), com
  `prefers-reduced-motion` respeitado.

## 3. Proibido (não volta)

Gradiente decorativo, neon/roxo-IA, glassmorphism geral, sombra pesada,
card gigante sem função, uma caixa por informação, 10 cores competindo,
título exagerado, densidade de panfleto, animação que atrasa operação,
"dashboard gerado por IA" (KPIs coloridos sem contexto — ver T1/T7 do audit).

## 4. Shell (Fase 5 — estado e alvo)

Estado: `AppShell` trava viewport (`flex h-screen`, só `main` rola), Sidebar sem
`fixed`, TopBar `sticky`, Breadcrumb em faixa própria, `MobileDock` no mobile.
Alvo: manter a estrutura; refinar agrupamento/rótulos da Sidebar por uso diário
(pesquisa de navegação pendente), Topbar minimalista, conteúdo com padrão por
tipo (lista / 3-painéis / analítico / formulário / detalhe) — padronizar o
sistema sem apagar diferenças funcionais.
