# D3 — toda capacidade classificada nos 7 estados

> Fecha o item **D3** do Definition of Done: "toda capacidade está classificada como
> existente, parcial, planejada, ausente, legada ou não verificada, sem duplicar
> funcionalidade existente". A classificação é por **capacidade de produto**, não por
> rota: uma capacidade pode ter 10 telas e ainda assim ser parcial.

## 1. A escala usada

| Estado | Significado |
|---|---|
| **existente** | funciona ponta a ponta, com prova (teste, jornada ou medição) |
| **parcial** | funciona no caminho principal; falta um recorte nomeado |
| **com defeito** | existe e é usada, com defeito conhecido e aberto |
| **planejada** | desenhada/documentada, sem implementação |
| **ausente** | não existe |
| **legado** | existe para compatibilidade; não é caminho novo |
| **não verificada** | existe no código, mas não foi exercitada |

## 2. Classificação

| # | Capacidade | Estado | Evidência | Lacuna nomeada |
|---|---|---|---|---|
| 1 | CRM: contatos, leads, carteira, funis, Customer 360 | **existente** | J5 3/3; 5.3; `15-tabelas-e-relacoes.md` | preferência de filtro na URL (4.5) |
| 2 | Inbox e atendimento (receber, atribuir, responder, encerrar) | **parcial** | J6 7/9; 5.4 | prioridade, SLA, macros, presença e reenvio não provados |
| 3 | Handoff IA↔humano com contexto | **existente** | J7 3/3; `agent_cases`/`agent_inbox_items` | — |
| 4 | Agentes de IA: criar, publicar, pausar, rollback | **existente** | J8 39 ✓ (4 pulados) | avaliação reproduzível (eval) |
| 5 | Conhecimento/RAG por organização | **existente** | 5.9; `search_knowledge`; RLS provada | qualidade do retrieval não medida |
| 6 | Follow-ups (fluxo, enrollments, pausa, snooze, falha) | **existente** | J9 20/20; F-30 (#458) | — |
| 7 | Prospecção e Radar (score, risco, recompra) | **parcial** | 5.5; score e fontes medidos | explicação do score em tela |
| 8 | Automações e webhooks (regras, execuções, HMAC) | **existente** | `automation_rules`/`webhook_sources`; J15 | — |
| 9 | Pedidos: criação, desconto, crédito, estoque, impressão | **com defeito** | 5.6; A1 corrigido, A2–A16 abertos | consertos P0/P1 do módulo |
| 10 | Catálogo, preço e tabelas de preço | **existente** | 5.6; `catalog_products`/`price_tables` | — |
| 11 | Estoque e movimentos | **parcial** | 5.6 | regras de reserva por carga |
| 12 | Compras e fornecedores | **existente** | J11 4/4; 5.6 | — |
| 13 | Expedição: carga, rota, motorista, fechamento | **existente** | J11; `shipments*`; VRPTW | — |
| 14 | Financeiro: recebíveis, pagamentos, baixas | **existente** | J12 3/3; 5.7; 6.A3 (#456) | — |
| 15 | Comissões e títulos | **existente** | 5.7; `commercial_commission_baixas` | — |
| 16 | Fiscal: NF-e, eventos, inutilização, entradas | **parcial** | 5.8; PR #440; J13 3/4 | 1 falha de jornada e 6 achados |
| 17 | Relatórios, indicadores e inteligência | **parcial** | 5.7/2.15; gráficos medidos | custo de JS dos gráficos |
| 18 | Import/export e LGPD | **parcial** | J14 2/4; cascata de anonimização | 1 falha, 1 pulado |
| 19 | Equipe, papéis e convites | **existente** | J1; RBAC; `user_organizations` | — |
| 20 | Configurações e integrações (WAHA, Nuvemshop, Google) | **parcial** | J15; 5.10 | tokens/equipe abertos; saúde do Google |
| 21 | Administração de plataforma (tenants, uso, incidentes) | **parcial** | 5.11 | scope de impersonação e tenant suspenso (corrigidos, testes) |
| 22 | Onboarding do tenant | **existente** | J2 14/14 | — |
| 23 | Mobile: captura offline de pedido | **parcial** | C4; `mobile-offline.spec.ts` no `apk-debug` | J16 bloqueada por emulador |
| 24 | PWA de logística/entregas offline | **parcial** | C5; outbox `lib/entregas` | boot do zero sem SW; matriz por página |
| 25 | Auditoria (trilha de ações) | **parcial** | `api_audit_log`; 6.10 | **audit fire-and-forget adiado** (L15) |
| 26 | Telemetria de IA (custo, latência, trilha) | **existente** | 0312; `/app/ai/runs`; `llm_calls` | drawer da trilha na tela |
| 27 | Busca global e command palette | **existente** | 4.6/4.7 | — |
| 28 | Notificações e alertas | **parcial** | `operational_alerts`; central de avisos | prioridade/SLA do inbox |
| 29 | Nuvemshop (pedidos espelhados) | **existente** | 5.10; `orders`/`nuvemshop_products` | — |
| 30 | iOS | **fora de escopo por decisão** | C4/7.12: não há `ios/` nem `@capacitor/ios`; PWA é o caminho oficial no iPhone | **Decisão do dono, 18/11/2026** — encerrado; ver abaixo |

### Item 30 — iOS: decisão do dono (18/11/2026)

**Estado: encerrado por decisão.** Não é pendência, não é `[!]` órfão, e não entra
no roadmap até que as quatro condições abaixo mudem. Quatro motivos reais, na
ordem em que pesam:

1. **Sem conta Apple (Developer Program) e sem aparelho Apple** nesta operação. O
   prompt mestre proíbe declarar iOS validado sem dispositivo real — e não há
   dispositivo.
2. **A assinatura gratuita expira em 7 dias** e vale só no aparelho do dono; não
   serve para vendedor em campo.
3. **Distribuição num produto self-host**: cada instalação tem domínio próprio.
   App de loja apontando para URL arbitrária colide com as regras, e um build por
   cliente não escala; Enterprise (in-house) com cliente viola os termos.
4. **PWA é o caminho oficial no iPhone** — instala na tela inicial, roda o mesmo
   shell offline, não expira e não depende de loja.

**Um `.ipa` só volta ao escopo com as três coisas juntas:** conta Apple +
aparelho Apple + decisão de distribuição por instalação. Sem as três, o item
continua encerrado.

## 3. O que **não** foi duplicado

A classificação confirma que as capacidades pedidas pelo prompt já existem em um
caminho só — não há "segundo inbox", "segundo financeiro" ou "segunda IA". O que
foi acrescentado na auditoria é **prova e correção**, não módulo novo:
follow-up vivo, Radar, Customer 360, agenda e automações já estavam no código.

## 4. Como manter

- Capacidade nova entra nesta tabela **no mesmo PR** que a cria, com estado e
  evidência; capacidade removida vira `legado` antes de sair.
- O gate `tests/unit/capacidades-classificadas.test.ts` reprova estado fora da
  escala e linha sem evidência (caminho entre crases que não existe).
