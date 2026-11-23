# 60 — P1-8: workbench de expedição em abas no celular

**Data:** 23/11/2026 · **Base:** `nexus/main@29df915bb` · **Rota medida:** `/app/expedicao/b406f296-cdcc-4ccc-82ed-68836f92de2a/rota`.

## O problema medido

Em 390 px a página abria com o mapa de `min(50vh, 520px)` (≈422 px) **antes**
da ordem de entrega: a lista ficava abaixo da dobra e o operador precisava rolar
sem saber o que havia depois. Em 1440 px os três painéis já ficam lado a lado
(`lg:grid-cols-2 xl:grid-cols-3`) — o defeito era só do celular.

## O que mudou

`app/app/expedicao/[id]/_roteirizador.tsx` ganhou **um estado** (`abaMobile`)
e uma barra `role="tablist"` visível só em `lg:hidden`:

- **Pedidos** (padrão) — mostra a ordem de entrega, que é onde se trabalha;
- **Mapa** — mostra o mapa e o GPS;
- **Planejamento** — mostra as colunas de planejamento e distribuição, e só
  existe quando a carga é editável (carga concluída não oferece aba vazia).

Cada aba tem `role="tab"`, `aria-selected`, `aria-current`, `aria-controls`,
alvo de **44 px** (`min-h-11`) e anel de foco `focus-visible:outline-2`. O estado
é compartilhado pelas três áreas; nada do cálculo da rota foi reescrito — só as
classes de visibilidade das três áreas já existentes.

## Prova (mesma base, 4 combinações)

| Régua | Antes | Depois |
| --- | --- | --- |
| Contraste AA reprovado | 0 | 0 |
| Overflow horizontal | 0 px | 0 px |
| Console/pageerror | 4* | **0** |
| axe crítico/sério | 0/0 | 0/0 |
| Alvos <44 px | 6 | 6 (pré-existentes) |

\* Os 4 erros do “antes” eram **deriva de schema local**: o banco de teste não
tinha `rota_versao_confirmada` / `rota_confirmada_em` (migration 0334), então o
GET da rota devolvia 404. As duas colunas foram aplicadas **no Supabase local**
antes da medição final; não é defeito do produto e nada foi alterado em produção.

Interação verificada no navegador (390 px): `Mapa` → `mapa=block, pedidos=none`;
`Planejamento` → `mapa=none, pedidos=none`; `Pedidos` → `pedidos=block, mapa=none`.
`aria-selected` acompanha o clique nas três.

Capturas: `docs/auditoria/capturas/{antes,depois}-workbench/` (4 PNGs por lado,
claro/escuro × 390/1440). Medição: `capturas/medicao-workbench-b406/varredura.json`.
