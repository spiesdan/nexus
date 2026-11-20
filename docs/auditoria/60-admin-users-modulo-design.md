# Admin — módulo Usuários: ficha e o redirect do `/admin`

> **Escopo:** `/admin/users/[id]` e `/admin` (redirect). É a rodada do módulo
> usuários; a lista já tem doc próprio (`56-`).
> **Como foi medido:** `tests/captura-admin-matriz.ts` com **build de produção**
> (`next build` + `next start`), claro/escuro × 1440/390, sessão `dono` por
> cookie, espera do `h1` antes do PNG (15 s) e `urlFinal` registrada. Servidor
> derrubado no fim.
> **Nada aponta para produção.** Sem deploy.

## Antes/depois (mesma base, mesma rodada)

| Tela | Medida | Antes | Depois |
|---|---|---:|---:|
| `/admin/users/[id]` | axe serious (`scrollable-region-focusable`) | **1** nas 4 combinações | **0/0** |
| `/admin/users/[id]` | alvos < 40 px (1440/390) | **4 / 1** | **0 / 0** |
| `/admin` → `/admin/dashboard` | axe serious a 390 | **1** | **0/0** |
| `/admin` → `/admin/dashboard` | overflow / console / alvos | 0 / 0 / 0 | 0 / 0 / 0 |

Contraste mínimo: 4,74:1 na ficha e 4,8:1 no destino — iguais antes e depois.

## O que mudou (primitiva + varredura)

1. **Região rolável focável** (`AdminShell`): o `<main>` é `overflow-y-auto` e
   não era alcançável por teclado — axe `scrollable-region-focusable` (sério)
   em toda tela de admin a 390. Ganhou `tabIndex={0}`; o skip-link continua
   levando ao mesmo lugar. **Essa primitiva vale para as 22.**
2. **Ficha do usuário**: o bloco de auditoria recente (`max-h-96 overflow-auto`)
   ganhou `role="region"`, `aria-label` e `tabIndex={0}`.
3. **Alvos**: breadcrumb “Usuários” e o link de cada tenant na tabela de
   memberships (20 px de altura) ganharam `min-h-10`.

## O `/admin` deixou de ser “fora de escopo”

O redirect é medido **no destino**: a captura registra
`urlFinal=/admin/dashboard` e mede lá (h1 ok, 0 alvos pequenos, axe 0/0). O
veredito da linha é o do destino, não um decreto.

## O que NÃO foi mudado, e por quê

- A tabela de memberships rola dentro do `Table` (que já é `tabIndex={0}`), sem
  empurrar a página.
- O conteúdo da ficha é leitura; nenhum outro alvo pequeno apareceu.

## Prova dirigida

`eslint` zerado; `tsc --noEmit` completo: exit 0.
