# Princípios de produto — o que o prompt fixa e o que ainda não foi estudado

> **Estado deste documento: as seis referências foram lidas em 17/11/2026** (páginas públicas
> oficiais; a de Attio em `attio.com`, porque `/product` responde 404), e cada ficha registra
> **princípios**, não UI. Nenhum ativo, texto ou layout de terceiro foi copiado — o que se
> aproveita é o padrão de produto, e cada um é ligado a uma superfície **medida** do Nexus.
> O que continua em aberto está na §3, com nome e causa.

## 1. Os princípios que o prompt fixa

| # | Princípio | O que significa no Nexus | Onde foi medido |
| --- | --- | --- | --- |
| PP1 | **Contexto do cliente acessível durante o atendimento** | quem atende vê contato, histórico, pedidos e conversa sem trocar de tela | Customer 360/J5; Inbox/J6; `13-jornadas.md` |
| PP2 | **Navegação previsível** | mesma casca, mesma trilha, mesmos atalhos; URL sempre reencontra o lugar | `11-auditoria-visual.md` §4.3/4.7; `shell-e-navegacao.json` |
| PP3 | **Ações rápidas** | a tarefa frequente custa poucos cliques e não esconde a ação primária | `esforco-da-tarefa.json` (2 cliques + 7 teclas; 1 clique) |
| PP4 | **Flexibilidade do modelo de dados** | campos, funis e destinos sem duplicar objeto nem inventar métrica | 5.3/6.8; `15-tabelas-e-relacoes.md` |
| PP5 | **Automações observáveis** | rascunho, publicação, pausa, retry, falha explicada e trilha | 5.9; J8/J9; `13-jornadas.md` |
| PP6 | **Relatórios utilizáveis** | número com período, origem e confiança; sem tendência inventada | 5.7; `comoMoeda` único; relatórios sem projeção |
| PP7 | **Colaboração pessoa + IA** | handoff nas duas direções, com contexto, veto e retomada | J7; `lib/ai/agent-inbox-copy.ts` |
| PP8 | **Controles claros** | papel, permissão e auditoria visíveis na ação, não só no código | 4.1/6.3; gates de RBAC |
| PP9 | **Desempenho em volume** | lista grande não carrega tudo nem corta em silêncio | 2.12 (1.000 contatos), F-30, F-29 |

## 2. Referências externas — o que falta

| # | Referência | Estado | O que falta |
| --- | --- | --- | --- |
| P1 | Linear | `[ ]` | Ler produto/recursos oficiais e registrar princípios aplicáveis |
| P2 | Attio | `[ ]` | idem (CRM, dados, automações, relatórios) |
| P3 | HubSpot | `[ ]` | idem (CRM) |
| P4 | Salesforce Sales Cloud | `[ ]` | idem |
| P5 | Intercom — Inbox | `[ ]` | idem (atendimento) |
| P6 | Intercom — IA | `[ ]` | idem (capacidades de IA) |
| P7 | Registrar princípios | `[~]` | Este documento cobre os 9 princípios que o prompt fixa; a extração das seis referências continua pendente |

**Regra que fica:** nenhum princípio entra aqui como "estudado" sem a fonte lida e a data. A
coluna "onde foi medido" aponta para artefato do repositório, não para memória.


---

## 3. Referências de produto — fichas (lidas em 17/11/2026)

> Fonte de cada ficha é a página pública indicada; o que se extrai é **princípio de produto**,
> não tela. "Aplicação no Nexus" aponta para a superfície que já existe (e para o que falta,
> quando falta), sempre com o artefato medido em vez de memória.

### P1 · Linear — `linear.app/features`

| Princípio observado | Por que importa | Aplicação no Nexus |
| --- | --- | --- |
| Trabalho organizado por **fluxo** (planejar → construir → medir), não por menu de módulos | reduz troca de contexto | navegação por tarefa (4.2); Meu Dia e busca global |
| **Teclado primeiro** (atalhos, command palette) e densidade alta | quem opera o dia inteiro não quer mouse | `.7` command palette + `⌘K`; 2.6 mediu 2 cliques + 7 teclas para achar cliente |
| **Views salvas** por pessoa/time, com filtro previsível | cada operação tem um recorte próprio | filtros de Pedidos/Contatos — **lacuna**: filtro não vai para a URL (4.5) |
| Feedback **otimista** discreto, sem bloquear a lista | ação rápida não pode custar espera | guards de pendência (2.10); falta prova de duplo clique em mais telas |
| IA como **agente dentro do fluxo**, não chatbot à parte | a IA age onde o trabalho acontece | agentes no inbox/CRM (5.9); falta eval reproduzível |

### P2 · Attio — `attio.com`

| Princípio | Aplicação no Nexus |
| --- | --- |
| **Contexto universal**: e-mail, chamada, produto e cobrança caem no mesmo registro sem digitação | Customer 360/timeline (J5) — Nexus reúne conversa, pedido, nota e tarefa, mas não sincroniza e-mail/calendário por padrão |
| **Modelo de dados flexível** (atributos e objetos sem duplicar) | campos personalizados, funis e tags (5.3); sem objeto novo inventado |
| **Sinais acionáveis** ("mudou de papel", "renovação chegando") em vez de dashboard passivo | Radar de risco/oportunidade, alertas operacionais (5.5) — a recomendação precisa mostrar origem e data |
| **Automação observável** (rascunho → publicar → histórico) | automações com pause/resume e execuções; falta explicação de falha por regra |

### P3 · HubSpot — `hubspot.com/products/crm`

| Princípio | Aplicação no Nexus |
| --- | --- |
| **Um grafo de cliente** (contato ↔ empresa ↔ negócio ↔ atividade) | contatos/leads/pedidos ligados por FK; `15-tabelas-e-relacoes.md` |
| **Timeline de atividade** como prova do relacionamento | histórico do contato (J5); atividades comerciais |
| **Estágio de ciclo de vida** explícito | `lead_state` + estágios de funil; relatório por etapa |
| **Relatório amarrado ao funil**, não número solto | 5.7 (período no fuso da org, baixa parcial honesta); sem tendência inventada |

### P4 · Salesforce Sales Cloud — `salesforce.com/sales/cloud`

| Princípio | Aplicação no Nexus |
| --- | --- |
| **Gestão de atividade** (e-mail, evento, tarefa) no mesmo lugar do registro | tarefas/agenda/atividades; Meu Dia prioriza |
| **Gestão de lead com priorização** e lista de afazeres | score + Radar; falta explicar o score em tela |
| **Previsão e pipeline** com metas explícitas | metas comerciais + projeção (5.7); "projeção" ≠ realizado, e a tela diz qual é qual |
| **Aprovação e cotação** com fluxo | alçadas de desconto/crédito (5.6 A1 corrigido); faturamento e financeiro |
| **Relatórios e dashboards** por papel | 5.7/indicadores; drill-down por período |

### P5 · Intercom Inbox — `intercom.com/helpdesk/inbox`

| Princípio | Aplicação no Nexus | Lacuna declarada |
| --- | --- | --- |
| **Inbox compartilhado** com atribuição e carga por pessoa | fila, atribuição e escopo por papel (J6) | prioridade/SLA ainda sem prova completa (5.4) |
| **Contexto do cliente na lateral** durante o atendimento | Customer 360 no inbox (PP1) | — |
| **Macros** (resposta + ações em um clique) | respostas rápidas/templates | macros compostas não existem (5.4) |
| **Teclado primeiro** | command palette | atalhos por contexto não medidos |
| **Omnicanal de verdade** | WhatsApp é o canal primário; e-mail/outros via integrações | não prometer canal que não existe (matriz em `17-modulos`) |
| **Ticket que continua a conversa** | casos humanos (`agent_cases`) + demandas | ticket formal por e-mail não existe |

### P6 · Intercom IA / Fin — `fin.ai`

| Princípio | Aplicação no Nexus | Lacuna declarada |
| --- | --- | --- |
| **Resolução com handoff que preserva contexto** | J7 medido nas duas direções; `agent_inbox`/`human_cases` | — |
| **Controle do dono** sobre tom, comportamento e conhecimento, sem engenheiro | painel de agentes/playbook/knowledge | falta avaliar mudança antes de publicar (teste) |
| **Suíte de teste antes de publicar** | dry-run de agente existe | eval reproduzível por dataset ainda é lacuna (5.9) |
| **Observabilidade** (o que falhou, por quê, onde) | `/app/ai/runs` + `llm_calls` (0312 grava estrutura/hash) | drawer da trilha e `audit:run` pendentes |
| **Ações em sistemas com guardrails** | tools com efeito + guardrails de saída + breaker | injeção indireta tratada por bloco residente (P0-5); teste adversário com modelo real não existe |
| **Custo controlado** (limite/alerta) | orçamento por org + `llm_calls` | — |

### P7 · Princípios consolidados (o que o Nexus adota)

Os nove de §1 continuam valendo; as fichas acrescentam **quatro regras de decisão**:

1. **Dado do cliente mora no registro, não na tela** — qualquer cópia (log, telemetria, trilha) é hash ou é apagada junto (0312, LGPD).
2. **Automação sem observação é dívida** — toda ação automática precisa de execução, motivo de falha e pausa.
3. **IA só age onde há guardrail e volta** — handoff, limite de custo, tool com efeito barrada por política; "agente" não é chatbot.
4. **Relatório diz período, origem e se é realizado ou projeção** — número sem isso não entra em tela.

---

## 4. Contexto inicial — C4 a C12 (medido no checkout)

| # | Pista | Estado | Evidência medida | O que falta / decisão |
| --- | --- | --- | --- | --- |
| C4 | App Android/Capacitor separado, offline com SQLite | `[x]` | `mobile/` (shell Vite + `www/`), `capacitor.config.ts` com `CapacitorSQLite`; captura offline detalhada em `08-mobile-offline.md` | — |
| C5 | PWA/offline de logística; o que funciona offline | `[x]` | `app/manifest.ts`: fluxo (outbox em `lib/entregas/outbox.ts` + última rota em cache) funciona com a aba aberta; **boot do zero sem internet não** (service worker é fase futura, está escrito no próprio manifest) | matriz publicada de páginas offline (7.A1) |
| C6 | Customer 360/timeline, Google Agenda, Radar, score, automações, IA | `[x]` | auditorias 5.2/5.3/5.5/5.9 e `13-jornadas.md`; Google Agenda com saúde e permissões em `17-modulos` | explicar score em tela |
| C7 | `docs/design-overhaul`, `design-system`, `architecture` com contagens antigas | `[x]` | contagens reconciliadas pelo inventário gerado (`inventario.json`); divergência registrada em F-11 (166/169 × **418** rotas) | docs de design ainda citam telas que mudaram — limpeza editorial |
| C8 | `capacitor.config.ts` com identidade/domínio do revendedor | `[x]` | `appId: tech.billhigiene.crm`, `appName: "Bill Higiene"`, `webDir: mobile/www`; F-10 registra o shell fora da catraca de marca | parametrizar marca/domínio no build do APK (7.10) |
| C9 | `app/manifest.ts` documenta limitação de boot offline | `[x]` | o próprio arquivo declara: "abrir a URL do zero sem internet exige service worker, que é fase futura" | SW de boot (frente 7) |
| C10 | `next/font/google` e build sem rede | `[x]` | **Decidido e feito em 18/11/2026: self-host.** `next/font/local` + 16 WOFF2 em `public/fonts/` com as licenças OFL; `pnpm build` roda com `HTTP(S)_PROXY` em porta morta e o artefato não cita `fonts.gstatic/googleapis`. Gate `fontes-sao-locais.test.ts` (4 casos). | — |
| C12 | Licença do `LICENSE` × declarações do README | `[x]` | **Decidido em 18/11/2026: o `LICENSE` manda (MIT).** Os três READMEs passaram a dizer que o **código** é MIT (link para `LICENSE`) e que **nome/marca/logos não são licenciados**; a marca da instalação é configurável. `LICENSE` não foi alterado. | — |
