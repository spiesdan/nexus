# Admin — módulo Tenants: criação e saúde

> **Escopo:** `/admin/tenants/new` e `/admin/tenants/[id]/health` — a rodada do
> módulo tenants. A lista e a ficha já tinham doc próprio (`55-`, `58-`).
> **Como foi medido:** `tests/captura-admin-matriz.ts`, **um build de produção**
> (`next build` + `next start`) para a rodada, claro/escuro × 1440/390, sessão
> `dono` por cookie. O servidor foi derrubado no fim.
> **Nada aponta para produção.** Sem deploy.

## Antes/depois (mesma base, mesma rodada)

| Tela | Alvos < 40 px | Antes | Depois |
|---|---|---:|---:|
| `/admin/tenants/new` | 1440 / 390 | **3 / 1** | **0 / 0** |
| `/admin/tenants/[id]/health` | 1440 / 390 | 0 / 0 | 0 / 0 |

Nas duas: overflow **0 px**, axe **0/0**, console **0**. Contraste mínimo
amostrado 4,8:1 (criação) e 4,69:1 (saúde), igual antes e depois.

Evidência: `capturas/{antes,depois}-admin/tenants-new_*.png` e
`tenant-saude_*.png` + `medidas-tenants-new.json` e `medidas-tenant-saude.json`.

## O que mudou

Só a criação precisava de conserto, e era o mesmo padrão dos filtros: altura
36 px.

- `SelectTrigger` do plano: `min-h-10`;
- “Criar tenant” e “Cancelar”: `min-h-10`.

A saúde do tenant já estava conforme — nenhum alvo pequeno, contraste 4,69:1 e
console limpo. Não foi tocada.

## O que NÃO foi mudado, e por quê

- **Formulário do tenant** mantém a validação e o desenho; só cresceu a área
  clicável dos controles.
- A página de saúde usa cartões de leitura (`HealthCard`), sem alvo de toque.

## Prova dirigida

`eslint` zerado; `tsc --noEmit` completo: exit 0.
