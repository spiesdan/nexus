# Admin — módulo LGPD

> **Escopo:** `/admin/lgpd` e `/admin/lgpd/requests/[id]` — a rodada do módulo.
> **Como foi medido:** `tests/captura-admin-matriz.ts` com **build de produção**
> (`next build` + `next start`), claro/escuro × 1440/390, sessão `dono` por
> cookie, `h1` por timeout antes do PNG e `urlFinal` registrada. Servidor
> derrubado no fim.
> **Nada aponta para produção.** Sem deploy.

## Antes/depois (mesma base, mesma rodada)

| Tela | Medida | Antes | Depois |
|---|---|---:|---:|
| `/admin/lgpd` | axe critical (`button-name`) | **1** nas 4 combinações | **0/0** |
| `/admin/lgpd` | alvos < 40 px (1440/390) | **12 / 12** | **0 / 0** |
| `/admin/lgpd/requests/[id]` | axe serious (`aria-progressbar-name` + `color-contrast`) | **2** nas 4 combinações | **0/0** |
| `/admin/lgpd/requests/[id]` | alvos < 40 px (1440/390) | **1 / 0** | **0 / 0** |

Overflow 0 e console 0 nas duas. Os pares que o axe reprovava na ficha:
datas do marco com `opacity-70` (**3,03:1** claro · **3,29:1** escuro) e o
“por \<id\>” com `opacity-60` (**2,52:1** · **2,79:1**).

## O que mudou

### Lista

- Os três `SelectTrigger` (status, tipo, risco) não tinham nome acessível —
  `button-name` crítico. Ganharam `aria-label` e passaram de 32 para 40 px.
- “Ver” de cada linha: 28 px → 40×40.

### Ficha

- **Barra de prazo**: `role="progressbar"` sem nome → `aria-label`
  (“Progresso do prazo LGPD”), mantendo `aria-valuenow/min/max`.
- As duas datas/“por” com véu de opacidade viraram `text-text-subtle`
  (4,69:1 claro · 5,50:1 escuro) — o alpha derrubava para 2,52–3,29:1.
- Botão de voltar: 32 → `min-h-10`.

## O que NÃO foi mudado, e por quê

- A barra continua decorativa-informativa; o texto ao lado já diz o prazo em
  dias, e o `aria-label` agora nomeia o controle.
- O conteúdo do pedido é leitura, sem outros alvos pequenos.

## Prova dirigida

`eslint` zerado; `tsc --noEmit` completo: exit 0.
