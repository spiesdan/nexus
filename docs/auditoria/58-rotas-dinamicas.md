# 58 — As 24 rotas dinâmicas saem do “bloqueada: sem id”

**Data:** 22/11/2026 · **Base:** `nexus/main@377ddc7d3` (1.62.3) · **Fixture:** somente Supabase LOCAL.

## O que mudou

`scripts/seed-e2e-rotas-dinamicas.ts` lê os ids que já existem no seed e cria **uma**
linha de `ai_routers` (não havia nenhuma) com id fixo `11111111-1111-4111-8111-111111111111`
e uma sessão de canal da org de teste. A saída é
`docs/auditoria/capturas/ids-dinamicos.json`, agora lida por
`scripts/auditoria/varredura-de-modulo.mjs`.

As seis rotas passaram de `pendente — bloqueada: sem id de exemplo` a **medidas**:
6 rotas × 2 temas × 1440/390 = **24 medições, 24 válidas**, `overflow: 0` e
`console: 0` em todas. O artifact é `docs/auditoria/capturas/varredura-dinamicas/varredura.json`.

| Rota | axe crítico | axe sério | Contraste | Alvos <44 | Veredito |
| --- | --- | --- | --- | --- | --- |
| `/ai/agents/[id]` | **8** | 0 | 2 | 65 | **pendente** — 8 críticos de axe |
| `/ai/routers/[id]` | 0 | 0 | 0 | 11 | pendente — 11 alvos <44 |
| `/ai/followups/[id]` | 0 | 0 | 2 | 23 | pendente — contraste + alvos |
| `/ai/followups/enrollments/[id]` | 0 | 0 | 0 | 4 | pendente — 4 alvos <44 |
| `/lgpd/requests/[id]` | 0 | **6** | 0 | 6 | pendente — 6 sérios de axe |
| `/prospeccao/campanhas/[id]` | 0 | 1 | **6** | 14 | pendente — contraste + alvos |

**Nenhuma linha virou `aplicado`**: a regra da matriz só permite `aplicado` quando a
varredura mediu a rota **e** ela passou. Aqui todas foram medidas e todas têm defeito
aberto — o que mudou é o motivo: saiu “sem id” e virou o defeito real, nomeado.

## Limite

Isto é fixture de banco local, nunca produção. O instrumento continua com
`<h1>` por timeout de 3 s, redirect medido no destino e `valida`/`motivo`.
Servidor de dev e Chromium mortos ao fim da rodada.
