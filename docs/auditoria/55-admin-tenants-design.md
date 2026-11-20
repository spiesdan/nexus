# Admin — Tenants (`/admin/tenants`)

> **Escopo:** a lista de organizações da plataforma. Contraste, overflow e
> console já vinham limpos da casca (#703); o que reprovava era **alvo de
> toque** no conteúdo.
> **Medido em:** 20/11/2026, produção (`next build` + `next start`), sessão
> `dono` por cookie, 1440×900 e 390×844, temas claro e escuro.
> **Nada aponta para produção.** Sem deploy.

## Antes/depois (mesma base, mesmo build)

| Medida | Antes | Depois |
|---|---:|---:|
| Alvos < 40 px — 1440 | **20** de 38 | **0** |
| Alvos < 40 px — 390 | **19** de 26 | **0** |
| Overflow horizontal | 0 px | 0 px |
| axe critical/serious | 0/0 | 0/0 |
| Erros de console | 0 | 0 |
| Contraste mínimo amostrado | 4,8:1 | 4,8:1 |

Evidência: `capturas/antes-admin/tenants_*.png` e
`capturas/depois-admin/tenants_*.png` (8 PNGs), com `medidas-tenants.json` de
cada lado (o `medidas.json` da pasta é o do `/admin/audit`).

## O que mudou

O alvo dominante era o link **“Ver”** de cada linha: **18×15 px**. Ganhou área
de toque de **40×40** (`min-h-10 min-w-10`, `inline-flex`, `justify-center`,
com margem negativa para não inflar a linha) sem mudar o desenho do texto.

Os outros três fecham a conta:

- **“Novo tenant”** (`Button size="sm"`): 115×32 → `min-h-10`;
- **filtro de status** (`SelectTrigger`): 36 → `min-h-10`;
- **busca** (`Input`): `min-h-10`.

Com isso os 20/19 alvos pequenos viram **0** — o número bruto restante é só o
`sr-only` de skip-link (1×1), que o instrumento ignora de propósito.

## O que NÃO foi mudado, e por quê

- **Tabela rola horizontalmente a 390** (primitiva `Table` com `overflow-auto`):
  a página não estoura (0 px) e todas as colunas seguem alcançáveis.
- **Dados do seed local**: a lista mostra as 18 organizações de E2E — é o banco
  de desenvolvimento, não uma amostra de cliente.
- **Paginação (“Carregar mais”)**: não apareceu nesta base (`hasNextPage`
  falso); quando aparecer, herda `size="sm"` e entra na régua na próxima tela
  que a exercitar.

## Prova dirigida

```bash
pnpm exec vitest run tests/unit/admin-inbox-uma-coluna-no-celular.test.tsx
# e a varredura de tokens que já cobre as classes usadas
```

`eslint` zerado; `tsc --noEmit` completo: exit 0.
