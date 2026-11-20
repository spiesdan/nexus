# Admin — Ficha do tenant (`/admin/tenants/[id]`)

> **Escopo:** o detalhe de uma organização (cabeçalho, sub-nav, ações).
> **Medido em:** 20/11/2026, produção (`next build` + `next start`), sessão
> `dono` por cookie, 1440×900 e 390×844, temas claro e escuro.
> **Nada aponta para produção.** Sem deploy.

## Antes/depois (mesma base, mesmo build)

| Medida | Antes | Depois |
|---|---:|---:|
| axe critical/serious | **1 crítico** (`aria-valid-attr-value`) nas 4 combinações | **0/0** |
| Alvos < 40 px — 1440 | **7** de 24 | **0** |
| Alvos < 40 px — 390 | **5** de 12 | **0** |
| Overflow horizontal | 0 px | 0 px |
| Erros de console | 0 | 0 |
| Contraste mínimo amostrado | 4,69:1 | 4,69:1 |

Evidência: `capturas/antes-admin/tenant-ficha_*.png` e
`capturas/depois-admin/tenant-ficha_*.png` + `medidas-tenant-ficha.json`.

## O que mudou

### 1. Sub-nav era `Tabs` sem painel — axe crítico

`_tab-nav.tsx` usava `Tabs`/`TabsList`/`TabsTrigger asChild` **sem nenhum
`TabsContent`**: cada gatilho saía com `aria-controls="…-content-<valor>"`
apontando para um painel que não existe. O axe reprovava como
`aria-valid-attr-value` **crítico** nos quatro recortes — o leitor de tela
anunciava um controle quebrado.

Virou `<nav>` com links e `aria-current="page"`. O estado ativo continua vindo
do `pathname` (deep-link, ctrl+click e voltar funcionam), e o desenho é o mesmo
(borda inferior, tracking, “em breve”). Mesma classe de defeito que o #716
corrigiu nas telas de IA, com o padrão certo para **troca de rota**.

### 2. Alvos de toque

- breadcrumb “Tenants”: 69×20 → `min-h-10`;
- abas “Visão Geral / Saúde / Equipe / Uso”: 38 → `min-h-10`;
- “Impersonar tenant” e “Suspender tenant”: 36 → `min-h-10`.

## O que NÃO foi mudado, e por quê

- **“Equipe” e “Uso” continuam desabilitadas** (“em breve”): não há rota, e
  criar tela é outra fatia. O link desabilitado mantém `aria-disabled` e não é
  foco de teclado.
- O corpo da ficha (contadores, integrações) não tem alvo pequeno.

## Prova dirigida

`eslint` zerado; `tsc --noEmit` completo: exit 0.
