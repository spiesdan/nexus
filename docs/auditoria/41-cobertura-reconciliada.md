# 41 — Cobertura reconciliada: rotas, subtelas e design

> **Por que este documento existe.** O passe de design do D avança tela por tela;
> sem a lista, ninguém sabe o que falta. O `41` é a espinha dorsal: **toda**
> superfície de `app/` aparece aqui, com estado explícito. O que não foi olhado
> entra como `pendente` — não desaparece.
>
> **Base:** `nexus/main` @ `1a01812ee` (19/11/2026). **Método:** contagem por
> `find`/`git ls-tree` + enumeração estática de `09b-subtelas.json`; nenhum
> veredito de design foi inferido de código sem doc/PR/captura.

## 1. Totais medidos (com o comando ao lado)

| Medida | Comando | Resultado |
|---|---|---:|
| Páginas em `app/app` | `find app/app -name page.tsx \| wc -l` | **111** |
| Páginas em `app` | `find app -name page.tsx \| wc -l` | **159** |
| Páginas em `app/admin` | `find app/admin -name page.tsx \| wc -l` | **22** |
| Rotas `/app` no registry | `grep -c 'href: "/app' lib/navigation/registry.ts` | **78** |
| Telas enumeradas em `09b` | `jq '.telas \| length' docs/auditoria/09b-subtelas.json` | **157** |
| Telas com ao menos uma subtela | idem, filtrando abas/modais/gavetas | **57** |
| Abas / modais / gavetas | idem, somando os arrays | **99 / 72 / 12** |

### 1.1 A soma fecha — e com a diferença explicada

- `111` (app/app) + `22` (admin) + `26` (público/auth/onboarding/legal/estado) = **159**.
- `78` rotas do registry são um **recorte** das 111 de `app/app`; a seção 3
  confirma que **todas as 78 têm `page.tsx`** (nenhum hub sem tela nesta medição).
- `157` telas de `09b` + **2 páginas novas** = 159. As duas que a enumeração
  estática ainda não viu estão nomeadas na seção 6 (não sumiram).
- **A medição do D (111/158/78/21) é um subconjunto desta:**

| Linha | app/app | admin | outras | total |
|---|---:|---:|---:|---:|
| Base do D (pré-#643) | 111 | **21** | 26 | **158** |
| + `app/app/settings/devices` (`bac0e87f1`) | +1 | — | — | +1 |
| + `admin/observabilidade` (`608d59f9c`) | — | +1 | — | +1 |
| **Medido agora** | **111** | **22** | **26** | **159** |

Por isso a matriz fecha em **159/22** e mantém a linha de base visível: nada da
base sumiu; duas telas entraram depois dela.

## 2. Superfícies de `app/app` (111)

| Caminho | Módulo | Design | Evidência | Dono |
|---|---|---|---|---|
| `/app/agenda` | agenda | **aplicado** | #653 · `50-agenda-design.md` · `capturas/{antes,depois}-agenda/` | D |
| `/app/ai/agents/[id]` | ai | **pendente** — 8 críticos de axe | `58-rotas-dinamicas.md` · `capturas/varredura-dinamicas/varredura.json` | — | D |
| `/app/ai/agents/new` | ai | **pendente** | — | D |
| `/app/ai/agents` | ai | **pendente** | — | D |
| `/app/ai/cases` | ai | **pendente** | — | D |
| `/app/ai/controle` | ai | **pendente** | — | D |
| `/app/ai/credentials` | ai | **pendente** | — | D |
| `/app/ai/decisoes` | ai | **pendente** | — | D |
| `/app/ai/evolution` | ai | **pendente** | — | D |
| `/app/ai/followups/[id]` | ai | **pendente** — contraste 2 + alvos 23 | `58-rotas-dinamicas.md` · `capturas/varredura-dinamicas/varredura.json` | — | D |
| `/app/ai/followups/enrollments/[id]` | ai | **pendente** — 4 alvos <44 | `58-rotas-dinamicas.md` · `capturas/varredura-dinamicas/varredura.json` | — | D |
| `/app/ai/followups` | ai | **pendente** | — | D |
| `/app/ai/inbox` | ai | **pendente** | — | D |
| `/app/ai/knowledge/sources` | ai | **pendente** | — | D |
| `/app/ai/memory` | ai | **pendente** | — | D |
| `/app/ai` | ai | **pendente** | — | D |
| `/app/ai/proposals` | ai | **pendente** | — | D |
| `/app/ai/providers` | ai | **pendente** | — | D |
| `/app/ai/routers/[id]` | ai | **pendente** — 11 alvos <44 | `58-rotas-dinamicas.md` · `capturas/varredura-dinamicas/varredura.json` | — | D |
| `/app/ai/routers` | ai | **pendente** | — | D |
| `/app/ai/runs` | ai | **pendente** | — | D |
| `/app/ai/skills` | ai | **pendente** | — | D |
| `/app/ai/usage` | ai | **pendente** | — | D |
| `/app/audit` | audit | **pendente** | — | D |
| `/app/busca` | busca | **pendente** | — | D |
| `/app/campanhas` | campanhas | **pendente** | — | D |
| `/app/carteira` | carteira | **pendente** | — | D |
| `/app/comissoes` | comissoes | **pendente** | — | D |
| `/app/compras/[id]` | compras | **aplicado** | #648 · `47-compras-recebimento-design.md` · `capturas/antes-compras/` + `capturas/recebimento-*.png` | D |
| `/app/compras` | compras | **pendente** | — | D |
| `/app/connections` | connections | **pendente** | — | D |
| `/app/contacts/[id]` | contacts | **pendente** | — | D |
| `/app/contacts` | contacts | **pendente** | — | D |
| `/app/estoque` | estoque | **aplicado** | #646 · `46-estoque-design.md` · `capturas/{antes,depois}-estoque/` | D |
| `/app/expedicao/[id]/fechamento` | expedicao | **aplicado** | #607 · `40-expedicao-design.md` | D |
| `/app/expedicao/[id]/motorista` | expedicao | **aplicado** | #607 · `40-expedicao-design.md` | D |
| `/app/expedicao/[id]` | expedicao | **aplicado** | #607 · `40-expedicao-design.md` | D |
| `/app/expedicao/[id]/rota` | expedicao | **aplicado** — workbench de 4 etapas sem abas, painel de pedidos disponíveis, planejamento com fonte/avisos e lista↔mapa; contraste 0, overflow 0, console 0 | #607 · #673 · `60-workbench-mobile.md` · `61-mapa-lista.md` · `65-workbench-expedicao.md` · `capturas/{antes,depois}-workbench-real/` | D |
| `/app/expedicao/nova` | expedicao | **pendente** | — | D |
| `/app/expedicao` | expedicao | **aplicado** | #607 · `40-expedicao-design.md` | D |
| `/app/faturamento` | faturamento | **aplicado** | #649 · `48-faturamento-design.md` · `capturas/{antes,depois}-faturamento/` | D |
| `/app/financeiro` | financeiro | **pendente** | — | D |
| `/app/fiscal/configuracoes` | fiscal | **pendente** | — | D |
| `/app/fiscal/eventos` | fiscal | **pendente** | — | D |
| `/app/fiscal/fornecedores` | fiscal | **pendente** | — | D |
| `/app/fiscal/manifestacoes` | fiscal | **pendente** | — | D |
| `/app/fiscal/notas/[id]` | fiscal | **pendente** | — | D |
| `/app/fiscal/notas` | fiscal | **pendente** | — | D |
| `/app/fiscal` | fiscal | **pendente** | — | D |
| `/app/fiscal/pendentes` | fiscal | **pendente** | — | D |
| `/app/fiscal/produtos` | fiscal | **pendente** | — | D |
| `/app/fiscal/relatorios` | fiscal | **pendente** | — | D |
| `/app/fiscal/resumos` | fiscal | **pendente** | — | D |
| `/app/fiscal/sincronizacoes` | fiscal | **pendente** | — | D |
| `/app/fiscal/xml` | fiscal | **pendente** | — | D |
| `/app/frota` | frota | **pendente** | — | D |
| `/app/inbox/[id]` | inbox | **aplicado** | #640 · `45-inbox-design.md` | D |
| `/app/inbox` | inbox | **aplicado** — selo de cache quando `realtimeStatus ≠ subscribed` (1/1 em 4 combinações) + painel de handoff (quando/motivo/resumo, 4/4 combinações); contraste/overflow/console medidos | #638/#640 · `45-inbox-design.md` · `62-inbox-selo-cache.md` · `63-inbox-handoff.md` · `capturas/{antes,depois}-inbox-cache/` | D || `/app/indicadores` | indicadores | **pendente** | — | D |
| `/app/integrations/nuvemshop` | integrations | **pendente** | — | D |
| `/app/inteligencia` | inteligencia | **pendente** | — | D |
| `/app/kanban` | kanban | **pendente** | — | D |
| `/app/laboratorio` | laboratorio | **pendente** | — | D |
| `/app/leads/[id]` | leads | **pendente** | — | D |
| `/app/lgpd/requests/[id]` | lgpd | **pendente** — 6 sérios de axe | `58-rotas-dinamicas.md` · `capturas/varredura-dinamicas/varredura.json` | — | D |
| `/app/lgpd/requests` | lgpd | **pendente** | — | D |
| `/app/metrics` | metrics | **pendente** | — | D |
| `/app/meu-dia` | meu-dia | **pendente** | — | D |
| `/app/notas` | notas | **aplicado** | #655 · `51-notas-natureza.md` · `capturas/{antes,depois}-notas/` | D |
| `/app` | público | **aplicado** — estado vazio explícito quando a série de vendas não tem dado; contraste/overflow/console 0 em 4 combinações | `64-dashboard-estado-vazio.md` · `capturas/{antes,depois}-dashboard-vazio/` | D |
| `/app/pedidos/[id]` | pedidos | **aplicado** | #620 · hierarquia na lista e na ficha · `capturas/{antes,depois}-pedidos/` | D |
| `/app/pedidos/imprimir` | pedidos | **fora de escopo** | documento de impressão — layout de papel, não superfície de operação | D |
| `/app/pedidos/novo` | pedidos | **aplicado** | `44-criador-de-pedidos-experiencia.md` (aplicado em #615) | D |
| `/app/pedidos` | pedidos | **aplicado** | #620 · hierarquia na lista e na ficha · `capturas/{antes,depois}-pedidos/` | D |
| `/app/pipelines/[id]` | pipelines | **pendente** | — | D |
| `/app/products` | products | **pendente** | — | D |
| `/app/prospeccao/campanhas/[id]` | prospeccao | **pendente** — contraste 6 + alvos 14 | `58-rotas-dinamicas.md` · `capturas/varredura-dinamicas/varredura.json` | — | D |
| `/app/prospeccao/nova` | prospeccao | **pendente** | — | D |
| `/app/prospeccao` | prospeccao | **pendente** | — | D |
| `/app/radar/categorias` | radar | **pendente** | — | D |
| `/app/radar/oportunidades` | radar | **pendente** | — | D |
| `/app/radar` | radar | **pendente** | — | D |
| `/app/radar/prospeccao` | radar | **pendente** | — | D |
| `/app/radar/recuperacao` | radar | **pendente** | — | D |
| `/app/radar/risco` | radar | **pendente** | — | D |
| `/app/recuperacao` | recuperacao | **pendente** | — | D |
| `/app/relatorios` | relatorios | **pendente** | — | D |
| `/app/sentinel` | sentinel | **aplicado** | #652 · `49-sentinel-design.md` · `capturas/{antes,depois}-sentinel/` + `sentinel-detalhe-*` | D |
| `/app/settings/api-tokens` | settings | **aplicado** — cabeçalho canônico | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` | D |
| `/app/settings/atendimento` | settings | **aplicado** — moldura + rodapé de salvamento | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` · varredura 90-100 final (medido 4/4): 0 alvos<44, axe 0  | D |
| `/app/settings/atualizacao` | settings | **aplicado** — superfície do dono (`UpdatePanel`); medida como platform admin | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` · varredura 90-100 final (medido 4/4): 0 alvos<44, axe 0 | D |
| `/app/settings/billing` | settings | **aplicado** — moldura canônica | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` · varredura 90-100 final (medido 4/4): 0 alvos<44, axe 0 | D |
| `/app/settings/canal-oficial` | settings | **redirect → `/app/connections?aba=oficial`, medido lá** | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` · varredura 90-100 final (medido 4/4): 0 alvos<44, axe 0 | D |
| `/app/settings/devices` | settings | **pendente** — moldura canônica | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` · varredura 90-100 final (medido 4/4): selects 260×36 | D |
| `/app/settings/marca` | settings | **pendente** — moldura + seletor de arquivo em pt-BR | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` · varredura 90-100 final (medido 4/4): input cor 40×40 e arquivo 147×40 | D |
| `/app/settings/notifications` | settings | **aplicado** — hidratação (4→0 console) + coluna Email fora do 390 | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` · varredura 90-100 final (medido 4/4): 0 alvos<44, axe 0 | D |
| `/app/settings` | settings | **medido; sem mudança** — hub usa NavHub; medido, sem cabeçalho duplicado | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` | D |
| `/app/settings/profile` | settings | **pendente** — 1 coluna no 390 + rodapé de salvamento | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` · varredura 90-100 final (medido 4/4): botões 244×36 | D |
| `/app/settings/security` | settings | **aplicado** — moldura canônica | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` · varredura 90-100 final (medido 4/4): 0 alvos<44, axe 0 | D |
| `/app/settings/templates` | settings | **redirect → `/app/connections?aba=oficial&sub=templates`, medido lá** | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` · varredura 90-100 final (medido 4/4): 0 alvos<44, axe 0 | D |
| `/app/settings/tenant/agenda` | settings | **aplicado** — moldura canônica | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` | D |
| `/app/settings/tenant` | settings | **aplicado** — 1 coluna no 390 + rodapé de salvamento | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` | D |
| `/app/settings/tenant/pipelines` | settings | **medido; sem mudança** — já usa `NexusPageHeader`; 390 alvos de reordenação declarados | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` | D |
| `/app/settings/tenant/whatsapp` | settings | **redirect → `/app/connections`, medido lá** | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` | D |
| `/app/tarefas` | tarefas | **pendente** | — | D |
| `/app/team/invite` | team | **pendente** | — | D |
| `/app/team` | team | **pendente** | — | D |
| `/app/templates` | templates | **pendente** | — | D |
| `/app/titulos` | titulos | **pendente** | — | D |
| `/app/venda-automatica` | venda-automatica | **pendente** | — | D |
| `/app/webhooks` | webhooks | **pendente** | — | D |

## 2.1 Superfícies de `app/admin` (22)

| Caminho | Módulo | Design | Evidência | Dono |
|---|---|---|---|---|
| `/admin/audit/[entryId]` | admin | **aplicado** — alvos < 40 px: 1 → 0 | `57-admin-audit-ficha-design.md` · `capturas/{antes,depois}-admin/` · `medidas-audit-entrada.json` | G |
| `/admin/audit` | admin | **aplicado** | `54-admin-audit-design.md` · `capturas/{antes,depois}-admin/` · `medidas.json` | G |
| `/admin/dashboard` | admin | **aplicado** | `48-admin-dashboard-design.md` · `capturas/admin-dashboard-{antes,depois}/` | G |
| `/admin/google` | admin | **aplicado** — contraste 3,92:1 no escuro → 0; alvos 1/0 → 0 | `63-admin-config-modulo-design.md` · `medidas-google.json` | G |
| `/admin/inbox/[conversationId]` | admin | **aplicado** — axe crítico 1 → 0, contraste 1,55 → 0, série de regiões roláveis → 0; **h1 faltava**, agora ok; alvos 3/3 → 0 | `64-admin-inbox-modulo-design.md` · `medidas-inbox-conversa.json` | G |
| `/admin/inbox` | admin | **aplicado** — axe crítico 1 → 0; contraste 2,91/3,42 → 0; alvos 2/2 → 0 (build de produção, claro/escuro × 1440/390) | `64-admin-inbox-modulo-design.md` · `medidas-inbox.json` | G |
| `/admin/incidents/[id]` | admin | **aplicado** — axe sério 1 → 0; alvos 2/1 → 0 (mesma rodada; fixture local sintética) | `61-admin-incidents-modulo-design.md` · `medidas-incident-ficha.json` | G |
| `/admin/incidents` | admin | **aplicado** — axe crítico 1 → 0; alvos 3/3 → 0 (build de produção + `next start`, claro/escuro × 1440/390, `h1` por timeout) | `61-admin-incidents-modulo-design.md` · `medidas-incidents.json` | G |
| `/admin/lgpd` | admin | **aplicado** — axe crítico 1 → 0; alvos 12/12 → 0 (build de produção + `next start`, claro/escuro × 1440/390) | `62-admin-lgpd-modulo-design.md` · `medidas-lgpd.json` | G |
| `/admin/lgpd/requests/[id]` | admin | **aplicado** — axe sério 2 → 0 (progressbar sem nome + contraste 2,52–3,29:1); alvos 1/0 → 0 | `62-admin-lgpd-modulo-design.md` · `medidas-lgpd-pedido.json` | G |
| `/admin/marca` | admin | **aplicado** — alvos 2/0 → 0 (primitiva do campo de arquivo + Salvar) | `63-admin-config-modulo-design.md` · `medidas-marca.json` | G |
| `/admin/observabilidade` | admin | **aplicado** — alvos 1/0 → 0; 500 inicial era schema local (ver doc §Nota) | `63-admin-config-modulo-design.md` · `medidas-observabilidade.json` | G |
| `/admin` | admin | **aplicado no destino** — redirect medido em `/admin/dashboard` (`urlFinal`): axe 1 → 0 a 390, alvos 0 | `60-admin-users-modulo-design.md` · `medidas-admin-index.json` | G |
| `/admin/platform-admins` | admin | **aplicado** — contraste 3,69:1 no escuro → 0; alvos 1/1 → 0 | `63-admin-config-modulo-design.md` · `medidas-platform-admins.json` | G |
| `/admin/tenants/[id]/health` | admin | **já conforme** — 0 alvos < 40 px; overflow/axe/console limpos (mesma rodada de captura) | `59-admin-tenants-modulo-design.md` · `medidas-tenant-saude.json` | G |
| `/admin/tenants/[id]` | admin | **aplicado** — axe crítico 1 → 0; alvos 7/5 → 0 | `58-admin-tenant-ficha-design.md` · `capturas/{antes,depois}-admin/` · `medidas-tenant-ficha.json` | G |
| `/admin/tenants/new` | admin | **aplicado** — alvos < 40 px: 3/1 → 0 (captura: build de produção + `next start`, claro/escuro × 1440/390) | `59-admin-tenants-modulo-design.md` · `capturas/{antes,depois}-admin/` · `medidas-tenants-new.json` | G |
| `/admin/tenants` | admin | **aplicado** — alvos < 40 px: 20/19 → 0 | `55-admin-tenants-design.md` · `capturas/{antes,depois}-admin/` · `medidas-tenants.json` | G |
| `/admin/usage` | admin | **aplicado** — axe crítico 1 → 0 (`button-name`); alvos 2/1 → 0 (build de produção, claro/escuro × 1440/390) | `63-admin-config-modulo-design.md` · `medidas-usage.json` | G |
| `/admin/users/[id]` | admin | **aplicado** — axe sério 1 → 0; alvos 4/1 → 0 (captura: build de produção + `next start`, claro/escuro × 1440/390, `h1` esperado) | `60-admin-users-modulo-design.md` · `medidas-user-ficha.json` | G |
| `/admin/users` | admin | **aplicado** — alvos < 40 px: 24/20 → 0 | `56-admin-users-design.md` · `capturas/{antes,depois}-admin/` · `medidas-users.json` | G |
| `/admin/forbidden` | admin | **aplicado** — piso 44: alvos 2 → 0 nos 4 contextos (fora do `AdminShell`: primitiva `StatusPage` com 44 px) | `65-varredura-admin-44.md` · `medidas-forbidden.json` | G |

## 2.2 Superfícies fora de `app/app` e `app/admin` (26)

> **21/11/2026 — passe por PRIMITIVA (25 medidas · 1 exceção).**
> Medido em `next dev` nas duas pontas (antes/depois na mesma base): 64 medições
> por lado, **0** textos abaixo do AA, **0** overflow, **0** axe serious. O
> recorte por peça (§2.2.1) é o que pega divergência entre irmãs — uma tela que
> ganha cartão e a outra não.
>
> **Todas as 25 fecham por medição.** `/login/mfa` era a exceção: sem sessão
> parcial a rota redireciona para `/login`. Foi medida em 21/11 com o login
> parado **antes do 2º fator** (admin do E2E, `tests/captura-mfa.ts`): h1
> «Verificação em duas etapas» confirmado nas 4 combinações, 0 contraste abaixo
> do AA, 0 overflow, 0 axe. `/design` segue exceção declarada (§5).

| Caminho | Módulo | Design | Evidência | Dono |
|---|---|---|---|---|
| `/login/forgot` | público/auth | **aplicado** (cartão da casca) | #659 · 24 textos, 0 abaixo do AA · overflow 0 · axe 0 | D |
| `/login/mfa` | público/auth | **aplicado** (cartão da casca) | 4 textos, 0 abaixo do AA · overflow 0 · axe 0 · **h1 «Verificação em duas etapas» confirmado** com sessão parcial (login parado antes do 2º fator) · `capturas/medido-mfa-publico-auth/` | D |
| `/login` | público/auth | **aplicado** (cartão + toque 44×44) | #659 · 32 textos, 0 abaixo do AA · overflow 0 · axe 0 · **h1 «Entrar» confirmado** (régua 21/11) · `56`: links 130×17→138×44 e 69×17→77×44, medido antes/depois | D |
| `/login/recovery` | público/auth | **aplicado** (cartão + toque 44×44) | #659 · 28 textos, 0 abaixo do AA · overflow 0 · axe 0 · **h1 «Recuperar acesso» confirmado** · `56`: link 88×17→96×44, medido antes/depois | D |
| `/login/reset` | público/auth | **aplicado** (cartão da casca) | #659 · 20 textos, 0 abaixo do AA · overflow 0 · axe 0 | D |
| `/signup` | público/auth | **aplicado** (cartão + toque 44×44) | #659 · 36 textos, 0 abaixo do AA · overflow 0 · axe 0 · **h1 «Criar conta» confirmado** · `56`: link 38×17→46×44, medido antes/depois | D |
| `/403` | estado/erro | **já conforme** | #659 · 16 textos, 0 abaixo do AA · overflow 0 · axe 0 · `57`: 4 critérios verificados (ação clicada, sem vazamento, texto próprio, nome + 44), sem mudança | D |
| `/500` | estado/erro | **já conforme** | #659 · 12 textos, 0 abaixo do AA · overflow 0 · axe 0 (4 de console = o próprio status 500) · **h1 «500 — Erro interno» confirmado** · `57`: 4 critérios verificados, sem mudança | D |
| `/503` | estado/erro | **já conforme** | #659 · 12 textos, 0 abaixo do AA · overflow 0 · axe 0 | D |
| `/account-suspended` | estado/erro | **aplicado** (saída + contato) | #659 · 12 textos, 0 abaixo do AA · overflow 0 · axe 0 · `57`: Sair GET→POST (Server Action, redirect /login medido) · contato 139×17→147×44 · antes/depois em `capturas/{antes,depois}-estados-publico-publico-auth/` | D |
| `/design` | interno | **fora de escopo** | styleguide interno, não é tela do produto | — |
| `/legal/privacy` | público/legal | **aplicado** (toque 44×44) | #659 · 120 textos, 0 abaixo do AA · overflow 0 · axe 0 · `56`: link 36×20→44×44, medido antes/depois | D |
| `/legal/terms` | público/legal | **aplicado** (toque 44×44) | #659 · 128 textos, 0 abaixo do AA · overflow 0 · axe 0 · `56`: links 36×20→44×44 e 139×17→147×44, medidos antes/depois | D |
| `/o/[token]` | público/orçamento | **aplicado** (estado inválido) | #659 · 12 textos, 0 abaixo do AA · overflow 0 · axe 0 — estado inválido; válido exige token real | D |
| `/onboarding/connect-nuvemshop` | onboarding | **já conforme** (passo desligado) | #670 · 88 textos, 0 abaixo do AA · overflow 0 · axe 0 | F |
| `/onboarding/connect-whatsapp` | onboarding | **já conforme** | #670 · 108 textos, 0 abaixo do AA · overflow 0 · axe 0 | F |
| `/onboarding/done` | onboarding | **já conforme** | #670 · 360 textos, 0 abaixo do AA · overflow 0 · axe 0 | F |
| `/onboarding/funil` | onboarding | **aplicado** (contraste no callout escuro) | #670 · 196 textos, 0 abaixo do AA · overflow 0 · axe 0 | F |
| `/onboarding/invite-team` | onboarding | **já conforme** | #670 · 100 textos, 0 abaixo do AA · overflow 0 · axe 0 | F |
| `/onboarding` | onboarding | **já conforme** (roteador) | #670 · redireciona ao primeiro passo pendente; 4 combos do destino medidos em `welcome` | — |
| `/onboarding/setup-ai` | onboarding | **aplicado** (contraste no callout escuro) | #670 · 292 textos, 0 abaixo do AA · overflow 0 · axe 0 | F |
| `/onboarding/testar` | onboarding | **já conforme** | #670 · 84 textos, 0 abaixo do AA · overflow 0 · axe 0 | F |
| `/onboarding/welcome` | onboarding | **já conforme** | #670 · 152 textos, 0 abaixo do AA · overflow 0 · axe 0 (1 aviso de hidratação de tema, declarado) | F |
| `/` | público | **medido · redireciona** (→ `/login?next=/app`) | #659 · 4 combos, destino `/login?next=%2Fapp`; 32 textos, 0 abaixo do AA | D |
| `/team/accept-invite/[token]` | público/auth | **já conforme** | #659 · 8 textos, 0 abaixo do AA · overflow 0 · axe 0 — estado de token inválido | D |
| `/vitrine-agenda` | público | **medido · exige sessão** (→ `/login`) | #659 · 4 combos, destino `/login?next=%2Fvitrine-agenda`; 32 textos, 0 abaixo do AA | D |

### 2.2.1 As primitivas por trás das 26 — o passe foi por peça, não por tela

> Medir tela a tela responde "esta rota está boa"; não responde "as telas de
> acesso são a MESMA tela". O recorte por primitiva é o que pega irmã que
> divergiu (uma ganha cartão, a outra não) e o que permite medir 5 rotas
> pagando uma.

| Primitiva | Onde é usada | Medição |
|---|---|---|
| **Cartão de acesso** — `Card` no layout de `(public)` | login, forgot, recovery, reset, mfa, signup | **6 de 6** medidas: 156 textos, 0 abaixo do AA, overflow 0, axe 0 (mfa com sessão parcial) |
| **Cartão de status** — `StatusPage` | 403, 500, 503, account-suspended e 404 (`not-found`) | **5 de 5**: 52 textos (16+12+12+12) nas 4 rotas + 16 no 404 (§2.3), 0 abaixo do AA |
| **Documento legal** — `legal/layout` (medida de leitura `3xl`) | privacy, terms | **2 de 2**: 248 textos, 0 abaixo do AA, overflow 0 |
| **Página pública** — `o/[token]` e os destinos de redirect | orçamento inválido, `/`, `vitrine-agenda` | **3 de 3**: estado inválido com 12 textos; `/` e `/vitrine` medidas como **redirect** (destino `/login?next=…`) |
| **Wizard** — `onboarding/layout` + `Stepper` | 8 telas + roteador | **9 de 9**: 1.380 textos; o callout âmbar foi o único defeito (contraste no escuro, `setup-ai` e `funil`) e está corrigido |

**Régua a partir de 21/11/2026 — h1 por timeout + redirect no destino.** A
captura passou a exigir, por linha, o **h1** da tela (lido com timeout de 20 s) e,
quando a rota redireciona, a medição **do destino** (`urlFinal` começa por ele).
Motivo: a rodada de 20/11 esperava "algum texto da tela", e foi assim que
`/login/mfa` passou por medido sem ter sido — o texto do `/login`, para onde ele
redireciona, satisfazia a espera. O instrumento está nessa régua
(`tests/lib/rotas-publico-auth.ts` + teste que reprova rota sem h1 ou sem
destino). A re-medição rodou em **21/11** nas **5 primitivas + MFA** (24 medições
contra o servidor da 3311, compartilhado): login, signup, recuperação, 404 e 500
deram `medida=ok` com o h1 esperado; **MFA deu `medida=NAO`** (`h1 «Entrar»`,
`urlFinal=/login`) — a prova de que a linha antiga estava errada. As demais linhas
mantêm a medição de 20/11, em que o `urlFinal` confirmou a rota certa.

**Total de texto medido (4 combinações por rota):** 540 nas rotas de acesso/
estado/legal/público + 1.380 no wizard. A soma inclui o que caiu em `/login` na
medição do MFA — mas essa linha **não** é contada como MFA medido.

## 2.3 Estado de erro fora de rota (3 arquivos)

> **21/11/2026 — lacuna fechada.** `app/not-found.tsx`, `app/error.tsx` e
> `app/global-error.tsx` existem desde sempre e **não apareciam nesta matriz**
> (zero menções a 404): o E2E cobria a cópia do `/404`, não a superfície. Não
> são `page.tsx`, então não entram nos totais da §1 — são arquivos de estado.

| Arquivo | Estado | Evidência |
|---|---|---|
| `app/not-found.tsx` (404) | **medido no navegador · sem achado** — 4 combinações (claro/escuro × 1440/390): **0** textos abaixo do AA (4 avaliados), **0** overflow, **0** axe serious/critical · **h1 «404 — Página não encontrada» confirmado** (régua 21/11). Renderiza o `StatusPage` da variante `nao-encontrada`. Rota inexistente **anônima** não chega aqui: o proxy manda para `/login?next=…` (307) — o 404 é para sessão, ou para `/404` direto | `capturas/medido-estado-erro-publico-auth/` (8 PNG + `medidas.json`) · `57`: 4 critérios verificados (ação clicada, sem vazamento, texto próprio, nome + 44), sem mudança |
| `app/error.tsx` | **medido · unit** — `SegmentError` (root) com título, ID do erro (`digest`) e os dois botões nomeados; “Tentar de novo” chama o `reset`. **Não** medido no navegador: exigiria inventar uma exceção, e não há rota de gatilho no produto | `tests/unit/segment-error-estado.test.tsx` |
| `app/global-error.tsx` | **medido · unit** — fallback do layout raiz: título, ID e reset provados; cores **inline** de propósito (o layout que falhou é quem carrega o CSS), e por isso ele é **sempre claro** — decisão declarada, não esquecimento do tema | `tests/unit/segment-error-estado.test.tsx` |

## 3. Registry de navegação (78 rotas `/app`)

> O registry é a fonte da sidebar. Nesta medição **as 78 rotas têm `page.tsx`**
> (nenhum hub sem página); a coluna confirma isso e impede ler 78 como 78 telas
> se alguma virar hub no futuro.

| Rota do registry | Tem `page.tsx`? | Design | Evidência |
|---|---|---|---|
| `/app/ai` | sim | pendente | — |
| `/app/settings` | sim | medido; sem mudança | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` |
| `/app` | sim | aplicado | `64-dashboard-estado-vazio.md` · `capturas/{antes,depois}-dashboard-vazio/` |
| `/app/meu-dia` | sim | pendente | — |
| `/app/indicadores` | sim | pendente | — |
| `/app/busca` | sim | pendente | — |
| `/app/inbox` | sim | aplicado | #638/#640 · `45-inbox-design.md` |
| `/app/radar` | sim | pendente | — |
| `/app/ai/followups` | sim | pendente | — |
| `/app/agenda` | sim | aplicado | #653 · `50-agenda-design.md` |
| `/app/templates` | sim | pendente | — |
| `/app/pedidos` | sim | aplicado | #620 · hierarquia na lista e na ficha |
| `/app/contacts` | sim | pendente | — |
| `/app/products` | sim | pendente | — |
| `/app/kanban` | sim | pendente | — |
| `/app/comissoes` | sim | pendente | — |
| `/app/titulos` | sim | pendente | — |
| `/app/faturamento` | sim | aplicado | #649 · `48-faturamento-design.md` · `capturas/{antes,depois}-faturamento/` |
| `/app/financeiro` | sim | pendente | — |
| `/app/carteira` | sim | pendente | — |
| `/app/tarefas` | sim | pendente | — |
| `/app/estoque` | sim | aplicado | #646 · `46-estoque-design.md` · `capturas/{antes,depois}-estoque/` |
| `/app/compras` | sim | pendente | — |
| `/app/expedicao` | sim | aplicado | #607 · `40-expedicao-design.md` |
| `/app/frota` | sim | pendente | — |
| `/app/sentinel` | sim | aplicado | #652 · `49-sentinel-design.md` · `capturas/{antes,depois}-sentinel/` |
| `/app/campanhas` | sim | pendente | — |
| `/app/laboratorio` | sim | pendente | — |
| `/app/venda-automatica` | sim | pendente | — |
| `/app/fiscal` | sim | pendente | — |
| `/app/notas` | sim | aplicado | #655 · `51-notas-natureza.md` |
| `/app/fiscal/notas` | sim | pendente | — |
| `/app/fiscal/pendentes` | sim | pendente | — |
| `/app/fiscal/xml` | sim | pendente | — |
| `/app/fiscal/resumos` | sim | pendente | — |
| `/app/fiscal/manifestacoes` | sim | pendente | — |
| `/app/fiscal/fornecedores` | sim | pendente | — |
| `/app/fiscal/produtos` | sim | pendente | — |
| `/app/fiscal/eventos` | sim | pendente | — |
| `/app/fiscal/relatorios` | sim | pendente | — |
| `/app/fiscal/sincronizacoes` | sim | pendente | — |
| `/app/fiscal/configuracoes` | sim | pendente | — |
| `/app/recuperacao` | sim | pendente | — |
| `/app/settings/tenant/agenda` | sim | aplicado | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` |
| `/app/settings/tenant/pipelines` | sim | medido; sem mudança | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` |
| `/app/ai/agents` | sim | pendente | — |
| `/app/ai/routers` | sim | pendente | — |
| `/app/ai/credentials` | sim | pendente | — |
| `/app/ai/providers` | sim | pendente | — |
| `/app/ai/knowledge/sources` | sim | pendente | — |
| `/app/ai/memory` | sim | pendente | — |
| `/app/ai/skills` | sim | pendente | — |
| `/app/ai/cases` | sim | pendente | — |
| `/app/ai/inbox` | sim | pendente | — |
| `/app/ai/proposals` | sim | pendente | — |
| `/app/ai/decisoes` | sim | pendente | — |
| `/app/ai/runs` | sim | pendente | — |
| `/app/ai/usage` | sim | pendente | — |
| `/app/ai/controle` | sim | pendente | — |
| `/app/metrics` | sim | pendente | — |
| `/app/ai/evolution` | sim | pendente | — |
| `/app/audit` | sim | pendente | — |
| `/app/relatorios` | sim | pendente | — |
| `/app/inteligencia` | sim | pendente | — |
| `/app/settings/profile` | sim | aplicado | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` |
| `/app/settings/security` | sim | aplicado | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` |
| `/app/settings/notifications` | sim | aplicado | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` |
| `/app/team` | sim | pendente | — |
| `/app/settings/atendimento` | sim | aplicado | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` |
| `/app/settings/tenant` | sim | aplicado | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` |
| `/app/settings/marca` | sim | aplicado | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` |
| `/app/settings/billing` | sim | aplicado | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` |
| `/app/lgpd/requests` | sim | pendente | — |
| `/app/settings/api-tokens` | sim | aplicado | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` |
| `/app/settings/devices` | sim | aplicado | `56-settings-sistemico.md` · `capturas/varredura-settings-{antes,depois}/` |
| `/app/connections` | sim | pendente | — |
| `/app/integrations/nuvemshop` | sim | pendente | — |
| `/app/webhooks` | sim | pendente | — |

## 4. Subtelas: 57 telas, 99 abas, 72 modais, 12 gavetas

> Fonte: `docs/auditoria/09b-subtelas.json` (gerado em 18/11/2026). A contagem
> bate com o `09b` e com o `34-prova-de-dod`: **99 / 72 / 12**. “Estado” diz o
> que foi **medido**; o resto é `existe; estados não medidos`, não “OK”.

| Tela | Abas | Modais | Gavetas | Estado medido |
|---|---:|---:|---:|---|

| `/admin` | 0 (—) | 0 (—) | 1 (Menu de navegação) | existe; estados não medidos |
| `/admin/inbox` | 1 ((rótulo dinâmico)) | 0 (—) | 0 (—) | existe; estados não medidos |
| `/admin/tenants/[id]` | 1 (em breve) | 0 (—) | 0 (—) | existe; estados não medidos |
| `/app/agenda` | 1 ((rótulo dinâmico)) | 0 (—) | 2 (Remarcar agendamento / Novo agendamento, Cancelar agendamento) | existe; estados não medidos |
| `/app/ai/agents` | 0 (—) | 1 (Renomear agent) | 0 (—) | existe; estados não medidos |
| `/app/ai/agents/[id]` | 11 ((rótulo dinâmico), Configuração, Teste, Capacidades, Execuções, Histórico, Propostas, Geral, Modelo, RAG, Guardrails) | 1 (Diff) | 1 (Execução) | existe; estados não medidos |
| `/app/ai/agents/new` | 1 ((rótulo dinâmico)) | 0 (—) | 0 (—) | existe; estados não medidos |
| `/app/ai/cases` | 3 (Abertos, Concluídos, Contato sem nome) | 0 (—) | 0 (—) | existe; estados não medidos |
| `/app/ai/credentials` | 0 (—) | 1 (Adicionar credencial) | 0 (—) | existe; estados não medidos |
| `/app/ai/decisoes` | 2 (Aguardando decisão, Já decididas) | 0 (—) | 0 (—) | existe; estados não medidos |
| `/app/ai/followups` | 2 (Fluxos, Fila) | 1 (Novo fluxo de follow-up) | 0 (—) | existe; estados não medidos |
| `/app/ai/followups/[id]` | 0 (—) | 0 (—) | 1 (Adicionar nó) | existe; estados não medidos |
| `/app/ai/followups/enrollments/[id]` | 0 (—) | 2 (Adiar o próximo passo, Por onde seguir?) | 0 (—) | existe; estados não medidos |
| `/app/ai/inbox` | 2 (Abertos, Resolvidos) | 0 (—) | 0 (—) | existe; estados não medidos |
| `/app/ai/knowledge/sources` | 0 (—) | 1 (Ensinar algo novo ao agente) | 0 (—) | existe; estados não medidos |
| `/app/ai/memory` | 0 (—) | 1 (Versão) | 0 (—) | existe; estados não medidos |
| `/app/ai/proposals` | 2 (Aguardando decisão, Já decididas) | 0 (—) | 0 (—) | existe; estados não medidos |
| `/app/ai/routers` | 1 ((rótulo dinâmico)) | 1 (Novo roteador) | 0 (—) | existe; estados não medidos |
| `/app/ai/routers/[id]` | 1 ((rótulo dinâmico)) | 0 (—) | 0 (—) | existe; estados não medidos |
| `/app/ai/usage` | 0 (—) | 1 (Orçamento de IA) | 0 (—) | existe; estados não medidos |
| `/app/campanhas` | 8 (Campanha, Prospecção, (rótulo dinâmico), (rótulo dinâmico), (rótulo dinâmico), (rótulo dinâmico), (rótulo dinâmico), (rótulo dinâmico)) | 3 (Campanha por região, Enviar mensagem para   empresas, Importar arquivo) | 1 ((rótulo dinâmico)) | existe; estados não medidos |
| `/app/compras` | 2 (Pedidos, Fornecedores) | 2 (Nova compra, Novo fornecedor) | 0 (—) | existe; estados não medidos |
| `/app/compras/[id]` | 0 (—) | 1 ((rótulo dinâmico)) | 0 (—) | existe; estados não medidos |
| `/app/connections` | 7 (Números por QR, API Oficial (Meta), Provedor parceiro, Conexão, Modelos do parceiro, Conexão, Templates da Meta) | 0 (—) | 0 (—) | existe; estados não medidos |
| `/app/contacts` | 2 (Pessoa jurídica, Pessoa física) | 2 (Importar clientes de planilha, Novo cliente) | 0 (—) | existe; estados não medidos |
| `/app/contacts/[id]` | 11 (Visão geral, Pedidos, Produtos, Financeiro, WhatsApp, Histórico, Oportunidades, Inteligência, LGPD, Pessoa jurídica, Pessoa física) | 2 (Anonimizar cliente (LGPD), Editar cliente) | 0 (—) | existe; estados não medidos |
| `/app/estoque` | 0 (—) | 1 (Novo movimento) | 0 (—) | medido: aba ativa, saldo 0 e vazio (#646) |
| `/app/expedicao/[id]` | 0 (—) | 4 (Adicionar pedido à carga, Veículo e motorista, (rótulo dinâmico), Trocar carga) | 0 (—) | medido: carregando/erro (40) |
| `/app/expedicao/[id]/fechamento` | 0 (—) | 4 (Adicionar pedido à carga, Veículo e motorista, (rótulo dinâmico), Trocar carga) | 0 (—) | medido: carregando/erro (40) |
| `/app/expedicao/[id]/motorista` | 0 (—) | 4 (Adicionar pedido à carga, Veículo e motorista, (rótulo dinâmico), Trocar carga) | 0 (—) | medido: carregando/erro (40) |
| `/app/expedicao/[id]/rota` | 0 (—) | 4 (Adicionar pedido à carga, Veículo e motorista, (rótulo dinâmico), Trocar carga) | 0 (—) | medido: carregando/erro (40) |
| `/app/financeiro` | 6 (Contas a receber, Contas a pagar, Cobranças, Conciliação, Fluxo de caixa, Títulos) | 0 (—) | 0 (—) | existe; estados não medidos |
| `/app/fiscal` | 0 (—) | 1 (Associar item ao catálogo) | 0 (—) | existe; estados não medidos |
| `/app/fiscal/notas/[id]` | 0 (—) | 1 (Associar item ao catálogo) | 0 (—) | existe; estados não medidos |
| `/app/frota` | 2 (Veículos, Motoristas) | 0 (—) | 0 (—) | existe; estados não medidos |
| `/app/inbox` | 0 (—) | 0 (—) | 2 (Ficha do contato, Ficha do contato) | medido: lista, vazio/erro/carregando (45) |
| `/app/kanban` | 0 (—) | 1 (Importar leads de uma planilha) | 0 (—) | existe; estados não medidos |
| `/app/lgpd/requests/[id]` | 0 (—) | 1 (Prévia de dados do titular) | 0 (—) | existe; estados não medidos |
| `/app/notas` | 1 ((rótulo dinâmico)) | 4 (Corrigir nota, (rótulo dinâmico), (rótulo dinâmico), Associar item ao catálogo) | 0 (—) | existe; estados não medidos |
| `/app/pedidos/[id]` | 0 (—) | 1 (Foto do produto) | 0 (—) | existe; estados não medidos |
| `/app/pedidos/novo` | 2 (Pessoa jurídica, Pessoa física) | 3 (Prévia do pedido, Adicionar produtos com IA / Confira os produtos encontrados, Novo cliente) | 0 (—) | existe; estados não medidos |
| `/app/pipelines/[id]` | 0 (—) | 2 (Excluir, Novo Lead) | 0 (—) | existe; estados não medidos |
| `/app/products` | 13 (Produtos, Promoções, Destaques, Configurações, Categorias, Tabelas de preço, Produtos e tabelas, Importar fotos, (rótulo dinâmico), Tabelas de preço, Informações gerais / há um NCM sugerido, Variações, Peso e dimensões) | 1 (Foto do produto) | 0 (—) | existe; estados não medidos |
| `/app/prospeccao` | 7 ((rótulo dinâmico), (rótulo dinâmico), (rótulo dinâmico), (rótulo dinâmico), (rótulo dinâmico), (rótulo dinâmico), (rótulo dinâmico)) | 2 (Enviar mensagem para   empresas, Importar arquivo) | 1 ((rótulo dinâmico)) | existe; estados não medidos |
| `/app/prospeccao/campanhas/[id]` | 0 (—) | 1 (Enviar mensagem para   empresas) | 0 (—) | existe; estados não medidos |
| `/app/prospeccao/nova` | 1 ((rótulo dinâmico)) | 0 (—) | 0 (—) | existe; estados não medidos |
| `/app/radar` | 1 ((rótulo dinâmico)) | 1 (Campanha de recuperação) | 0 (—) | existe; estados não medidos |
| `/app/radar/categorias` | 1 ((rótulo dinâmico)) | 0 (—) | 0 (—) | existe; estados não medidos |
| `/app/radar/recuperacao` | 0 (—) | 1 (Campanha de recuperação) | 0 (—) | existe; estados não medidos |
| `/app/sentinel` | 0 (—) | 4 (Abrindo ocorrência, (rótulo dinâmico), (rótulo dinâmico), Configurações do Sentinel) | 0 (—) | existe; estados não medidos |
| `/app/settings/api-tokens` | 0 (—) | 2 (Criar novo token, Token criado) | 0 (—) | existe; estados não medidos |
| `/app/settings/security` | 0 (—) | 3 (Configure a verificação em duas etapas, Escaneie o QR code, Códigos de recuperação) | 0 (—) | existe; estados não medidos |
| `/app/team` | 2 (Membros, Atendimento) | 3 (Horário de, Números que enxerga, Revogar acesso) | 0 (—) | existe; estados não medidos |
| `/app/templates` | 0 (—) | 1 (Editar template / Novo template) | 0 (—) | existe; estados não medidos |
| `/app/venda-automatica` | 0 (—) | 1 ((rótulo dinâmico)) | 0 (—) | existe; estados não medidos |
| `/app/webhooks` | 4 (Receber dados, Leads recebidos, Automações, Atividade) | 1 (Nova fonte de captação) | 3 (Captação, Editar automação / Nova automação, (rótulo dinâmico)) | existe; estados não medidos |
| `/vitrine-agenda` | 1 ((rótulo dinâmico)) | 0 (—) | 0 (—) | existe; estados não medidos |

**Totais:** 57 telas com subtela · **99** abas · **72** modais · **12** gavetas.

## 5. Exceções com motivo (não serão redesenhadas)

| Superfície | Motivo |
|---|---|
| `/app/pedidos/imprimir` | É **documento de impressão** (papel/PDF), não tela de operação; o passe de design não se aplica ao layout de impressão. |
| `/design` | **Styleguide interno** (showcase de componentes), não superfície do produto. |

Nenhuma outra tela foi marcada como exceção. Páginas de estado (`403`, `500`,
`503`, `account-suspended`) **não** são exceção: seguem `pendente`.

## 6. Não classificado (o que sobra é dito, não escondido)

1. **Duas páginas novas** não estão na enumeração de subtelas de `09b`
   (gerada antes delas): `/app/settings/devices` (`bac0e87f1`) e
   `/admin/observabilidade` (`608d59f9c`). Elas estão na seção 2 como
   `pendente`; a seção 4 ainda não as enumera.
2. **Rotas do registry sem `page.tsx`**: nenhuma nesta medição (78/78). Se uma
   virar hub de grupo, ela entra na seção 3 como “não (hub/grupo)” — destino de
   navegação, não tela.
3. **Estados vazio/erro/permissão** só foram medidos nas telas com doc de
   design (`estoque`, `inbox`, `expedição`, `criador`). Nas demais, a coluna
   “Estado” diz `não medido`; isso é pendência, não aprovação.

## 7. Linha do #646 (estoque) — `aplicado`

| Rota | Tela | Veredito | Evidência | Dono |
|---|---|---|---|---|
| `/app/estoque` (abas Saldos/Movimentos) | lista + razão | **aplicado** — abas com estado acessível e saldo zerado distinguido | **#646** · `docs/auditoria/46-estoque-design.md` · `capturas/{antes,depois}-estoque/` | D |

## 8. Donos e próximo passo

- **Dono do design:** D, para todas as superfícies de produto; `admin` entra no
  mesmo passe depois das telas de operação.
- **Próximo passo:** o D usa a seção 2 como fila (as `pendente` são a fila) e
  atualiza a linha ao publicar o doc/PR da tela. Nenhuma tela vira “aplicado”
  sem evidência (PR + captura ou doc).
- **O que este documento não faz:** não decide regra de negócio e não declara
  “conforme” o que não foi aberto.


## 9. Superfícies da frente do criador (completadas nesta rodada)

> As rotas e subtelas que nasceram/já foram trabalhadas na frente do criador
> entram aqui com o estado medido. O que não foi olhado continua na seção 2
> como `pendente` — esta seção **não** promove nada por proximidade.

| Superfície | Tipo | Estado | Evidência |
|---|---|---|---|
| `/app/pedidos/novo` | rota | **aplicado** | `44-criador-de-pedidos-experiencia.md`; E2E da matriz 1.61.0 |
| Prévia do pedido | modal | existe; vazio (“Nenhum item”), totais, parcelas e aviso de aprovação; leitura | `_editor.tsx` + E2E E.1/E.2 |
| Conflito de rascunho | modal | existe; só com rascunho de outro cliente; decisão explícita | `_editor.tsx` + `criador-pedido-cliente-do-link.test.tsx` |
| Adicionar com IA | modal | existe; entrada/processando/erro; permissão de IA | `_ia.tsx` |
| Cadastro de cliente no pedido | modal | existe; validação e erro preservando o pedido | `components/contacts/NewContactDialog.tsx` |
| Menu “Enviar” / “Mais opções” | menu | existe; ações de rascunho/email/WhatsApp | `_editor.tsx` |
| `/app/pedidos` | rota | **aplicado** | #620 (hierarquia na lista) |
| `/app/pedidos/[id]` | rota | **aplicado** | #620 (hierarquia na ficha) |
| `/app/pedidos/imprimir` | rota | **fora de escopo** | documento de impressão |

**Não classificado na enumeração de subtelas do `09b`:** os quatro modais e o
menu acima nasceram depois do JSON de 18/11; ficam listados aqui, não somem.
Se entrarem no `09b`, a contagem de subtelas sobe (72 → 77 modais e 12 gavetas
permanecem), o que deve ser remedido — não somado de cabeça.

## 10. Pendentes sem dono (o que a matriz não pode esconder)

- **118 linhas `pendente`**: **96** de `app/app` (com **D** como dono do
  passe de design) + **22** de `app/admin` (sem dono funcional na fila atual).
- **38 linhas concluídas**: **14** de `app/app` (`aplicado`) + **24** de
  público/auth/onboarding (`aplicado`/`já conforme`, com #659/`50` e
  `51-onboarding-design`). As 24 linhas de público/auth/onboarding agora têm
  dono explícito — **D** (acesso/estado/legal) e **F** (onboarding) — e não são
  mais “sem dono”.
- **2 exceções** (`/app/pedidos/imprimir`, `/design`) e **1 roteador**
  (`/onboarding`, sem UI própria) fecham a conta: **118 + 38 + 2 + 1 = 159**.

## 11. Alvos de toque — expedição (aplicado)

Piso de 44 px para `a`, `button` e `input` dentro do `main`; medição pelo
instrumento do D (`scripts/auditoria/captura-visual.mjs`), largura 1440,
conteúdo isolado do shell.

| Tela | Antes (<40 px no `main`) | Depois |
|---|---:|---:|
| `/app/expedicao` | 12 | **0** |
| `/app/expedicao/[id]` | 11 | **0** |
| `/app/expedicao/[id]/rota` | 11 | **0** |
| `/app/expedicao/[id]/fechamento` | 1 | **0** |
| `/app/expedicao/[id]/motorista` | 1 | **0** |

A página inteira ainda conta ~30 por causa da sidebar/topbar globais; ver
`40-expedicao-design.md` §Pendências. TalkBack: locale do sistema e TTS em
pt-BR provados por `getprop`/`settings`; áudio não, AVD `-no-audio`.

## 12. Admin — casca de 44 px (aplicado)

A casca compartilhada das 22 rotas ganhou piso de 44 px nos alvos (sidebar,
topbar, busca, menu do usuário, banner). O `/admin/dashboard` foi medido antes/
depois: **16 → 1** alvos <40 em 1440 e **2 → 1** em 390 (o que resta é o
skip-link `sr-only`; nenhum alvo visível); overflow e console 0;
contraste 0/33 em dark e light. O skip-link `sr-only` 1×1 permanece e não é alvo
de toque em repouso.

As demais telas seguem `pendente` para auditoria de **conteúdo** — a casca já
entrega 44 px em todas. `/admin/audit` ainda tinha 72 no total (conteúdo próprio).

Entregue no **PR #686** (`admin/fila-22`), com `48-admin-dashboard-design.md`.


## 13. Varredura completa do admin no piso 44×44 (20/11/2026)

As **22 rotas** foram medidas em build de produção (`next start`), claro/escuro
× 1440/390, `h1` por timeout, redirect medido no destino e axe/console/contraste
— **88 medições**, servidor morto ao fim. O defeito dominante era o residual da
régua de 40 px em **19/22 telas**; corrigido na casca (`data-admin-shell` +
regra escopada a 44 px), e as 21 rotas dentro da casca passaram a **0 alvos < 44**.
Mapa por tipo/módulo, antes/depois por rota e o limite de `/admin/forbidden` em
`docs/auditoria/65-varredura-admin-44.md`. Somente as rotas que a varredura
mediu têm linha `aplicado` nesta seção — as 22, inclusive `forbidden`, cuja
quarta medição foi remediada isoladamente quando o swap liberou.

### Varredura 100–110 (medida, 40/40 válidas)

- **Limpar (0 alvos<44, axe 0):** `/app/settings/tenant/agenda`, `/app/tarefas`, `/app/templates`. Contraste serious/critical corrigido na origem: `nexus-kpi` (skeleton com `text-transparent` virou barra), `agenda` (`opacity-60` virou `bg-muted/40`), `team/invite` (`SelectTrigger` com `aria-label`) e o token `text-primary` (3,63:1 no claro) trocado por `text-accent-ink` em 25 arquivos; remedição na main atual: `contraste=0` nas 40 combinações.
- **Remedição final (medida, não inferida):** os 52 alvos de `/tenant/pipelines`, 14 de `/tenant/whatsapp` e 10 de `/team` saíram corrigindo `SelectTrigger`, `Button` (piso 44 no toque), `ConnectionsClient` e `NomeCell`. A fatia fechou **10/10 limpas**, 40/40 válidas. Ver `80-cauda-100-110.md`.
