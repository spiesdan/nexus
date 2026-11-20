# Admin — Usuários (`/admin/users`)

> **Escopo:** a lista de usuários cross-tenant. Contraste, overflow e console
> já vinham limpos da casca (#703); o que reprovava era **alvo de toque** no
> conteúdo, no mesmo padrão de `/admin/tenants` (#714).
> **Medido em:** 20/11/2026, produção (`next build` + `next start`), sessão
> `dono` por cookie, 1440×900 e 390×844, temas claro e escuro.
> **Nada aponta para produção.** Sem deploy.

## Antes/depois (mesma base, mesmo build)

| Medida | Antes | Depois |
|---|---:|---:|
| Alvos < 40 px — 1440 | **24** de 42 | **0** |
| Alvos < 40 px — 390 | **20** de 26 | **0** |
| Overflow horizontal | 0 px | 0 px |
| axe critical/serious | 0/0 | 0/0 |
| Erros de console | 0 | 0 |
| Contraste mínimo amostrado | 4,74:1 | 4,74:1 |

Evidência: `capturas/antes-admin/users_*.png` e
`capturas/depois-admin/users_*.png` (8 PNGs), com `medidas-users.json` de
cada lado.

## O que mudou

- **“Ver”** de cada linha: **18×15 → 40×40** (`min-h-10 min-w-10`,
  `inline-flex`, `justify-center`, margem negativa para a linha não inflar).
- **filtros “Todos os tenants” / “Todos os roles”** (`SelectTrigger`): 36 →
  `min-h-10`.
- **busca** (`Input`): `min-h-10`.

Nenhum desenho mudou de lugar: o texto, a ordem das colunas e os filtros são os
mesmos. O que cresceu foi a área clicável.

## O que NÃO foi mudado, e por quê

- **Tabela rola horizontalmente a 390** (primitiva `Table` com `overflow-auto`):
  a página não estoura (0 px) e as colunas continuam alcançáveis.
- **A ficha `/admin/users/[id]`** é outra linha da matriz; entra no próprio PR.
- O `medidas.json` da pasta é do `/admin/audit`; esta tela usa
  `medidas-users.json` para não sobrescrever a evidência irmã.

## Prova dirigida

`eslint` zerado; `tsc --noEmit` completo: exit 0; a varredura de tokens que
cobre as classes usadas segue verde.
