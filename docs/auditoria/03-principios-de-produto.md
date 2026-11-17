# Princípios de produto — o que o prompt fixa e o que ainda não foi estudado

> **Estado deste documento: parcial, e declarado.** O prompt manda estudar Linear, Attio,
> HubSpot, Salesforce e Intercom e **registrar princípios**, não copiar UI. A Parte 1 do
> prompt já enumera os princípios que importam para o Nexus; esta rodada os registra e os
> liga ao que foi **medido** no produto. O estudo das páginas oficiais das seis referências
> **não foi feito nesta rodada** — e é por isso que P1–P6 seguem `[ ]` no checklist. Escrever
> "estudei" sem ter estudado seria inventar auditoria.

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
