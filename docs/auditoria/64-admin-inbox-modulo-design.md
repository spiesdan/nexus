# Admin — módulo Inbox + estado

> **Escopo:** `/admin/inbox`, `/admin/inbox/[conversationId]` e
> `/admin/forbidden` — a última rodada de módulo.
> **Como foi medido:** `tests/captura-admin-matriz.ts` com **build de produção**
> (`next build` + `next start`), claro/escuro × 1440/390, sessão `dono` por
> cookie, `h1` por timeout antes do PNG e `urlFinal` registrada. Servidor
> derrubado no fim.
> **Nada aponta para produção.** Sem deploy.

## Antes/depois (mesma base, mesma rodada)

| Tela | Medida | Antes | Depois |
|---|---|---:|---:|
| `/admin/inbox` | axe critical (`button-name`) | **1** nas 4 combinações | **0/0** |
| `/admin/inbox` | contraste do texto de “somente-leitura” | **2,91:1** claro · **3,42:1** escuro | 0/0 |
| `/admin/inbox` | alvos < 40 px (1440/390) | **2 / 2** | **0 / 0** |
| `/admin/inbox/[id]` | axe critical (`button-name`) | **1** nas 4 | **0/0** |
| `/admin/inbox/[id]` | contraste da linha selecionada | **2,69:1** claro · **1,55:1** escuro | 0/0 |
| `/admin/inbox/[id]` | axe serious (`scrollable-region-focusable`) | **1–2** | 0/0 |
| `/admin/inbox/[id]` | **h1** | **FALTA** nas 4 | **ok** |
| `/admin/inbox/[id]` | alvos < 40 px | **3 / 3** | **0 / 0** |
| `/admin/forbidden` | alvos < 40 px (1440/390) | **2 / 0** | **0 / 0** |

Overflow **0** e console **0** nas três.

## O que mudou

- **Filtros da lista** (`InboxList`): busca e select de status 32 → 40 px; o
  select não tinha nome acessível (`button-name` crítico) → `aria-label`.
- **Nota de “somente-leitura”** (`inbox/page.tsx`): `opacity-70` sobre muted
  media 2,91/3,42:1 → `text-text-subtle` (4,69/5,50).
- **Linha selecionada da lista**: `bg-accent/60` com texto muted media
  **1,55:1** no escuro. Os textos (hora e prévia) passam a `text-text` quando
  a linha está selecionada.
- **Thread**: região de mensagens ganhou `role="region"`, `aria-label` e
  `tabIndex={0}`; o `h1` da página é `sr-only` e estável em 1440 e 390 (fora do
  flex do cabeçalho, com `relative` no pai para não estourar o clipping).
- **“Abrir tenant”** (painel lateral): `text-primary` (3,41:1) →
  `text-accent-ink`; 40 px de alvo.
- **`/admin/forbidden`**: os dois botões do `StatusPage` em 40 px (primitiva
  compartilhada pelos estados).

## O que NÃO foi mudado, e por quê

- O inbox é **somente-leitura** (sem composer): a decisão de produto não muda
  com o passe visual.
- A coluna lateral continua só em ≥ xl (o 390 usa o fio em tela cheia e o
  “Voltar” `md:hidden`, como no #703).

## Prova dirigida

`eslint` zerado; `tsc --noEmit` completo: exit 0.
