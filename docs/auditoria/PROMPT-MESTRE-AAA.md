# PROMPT MESTRE — Auditoria, reconstrução e evolução integral do Nexus

> **REGRA PERMANENTE — AUTORIDADE (ordem do usuário, 15/11/2026).**
> O prompt abaixo é a **lei desta frente de trabalho** e tem **autoridade sobre qualquer
> `.md`** deste repositório — incluindo este arquivo, `AGENTS.md`, `CLAUDE.md`, docs de
> arquitetura, design, doutrina e runbooks. Onde houver divergência entre o prompt mestre e
> qualquer outro documento, **vale o prompt**. Documento que o contradiga está desatualizado
> ou deve ser corrigido; nunca o prompt.
>
> **Nada pode ser omitido.** Este arquivo guarda o prompt **íntegro e verbatim**: todas as
> regras de execução, o contexto inicial, as referências de produto, as Fases 0–10, o
> inventário inicial de rotas e o Definition of Done global. É proibido resumir, cortar,
> reescrever, reordenar ou "interpretar" o texto. Acréscimos só podem ser **aditivos e
> marcados como acréscimo** (a Parte 2 e as evidências), nunca substituições.
>
> **Cada passo é marcado.** A Parte 2 reproduz, item por item, toda tarefa, critério de
> aceitação e item de DoD do prompt, com marcação de estado e evidência. Um passo sem marca
> é um passo não executado.
>
> **Integridade é verificável, não declarada.** O texto da Parte 1 é conferido contra um hash
> gravado: `pnpm exec tsx scripts/auditoria/verificar-prompt.ts`. Mudar uma palavra quebra o
> gate. Ver §3.6.

**Como este arquivo está organizado**

| Parte       | Conteúdo                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| **Parte 1** | O prompt mestre, íntegro e verbatim (Fases 0–10, DoD global, regras, contexto, referências, inventário inicial). |
| **Parte 2** | Checklist de execução: cada tarefa/critério do prompt com marcação e evidência medida.                           |
| **Parte 3** | Registro de execução: decisões, achados, riscos e artefatos produzidos (documento vivo).                         |

**Legenda de marcação**

| Marca | Significado                                                                      |
| ----- | -------------------------------------------------------------------------------- |
| `[x]` | Concluído, com evidência registrada (comando, arquivo ou captura).               |
| `[~]` | Em andamento / parcial: parte medida, parte pendente — o que falta está escrito. |
| `[ ]` | Pendente.                                                                        |
| `[!]` | Bloqueado: causa e impacto registrados.                                          |
| `[-]` | Não aplicável: justificativa registrada (nunca usado para "pular" tarefa).       |

**Fonte de verdade do inventário:** `scripts/auditoria/inventario.ts` (gera
`docs/auditoria/inventario.json` e `docs/auditoria/inventario-rotas.md`). Números escritos à
mão envelhecem; o comando não.

---

# PARTE 1 — PROMPT ÍNTEGRO (VERBATIM)

## PROMPT MESTRE — Auditoria, reconstrução e evolução integral do Nexus

Você é o Codex responsável por conduzir a evolução integral do Nexus, CRM e sistema operacional de vendas com IA, WhatsApp e operação comercial.
Repositório: https://github.com/spiesdan/nexus
Seu objetivo é levar o produto a um padrão de qualidade AAA: visual consistente e profissional, fluxos claros, funcionalidades confiáveis, arquitetura sustentável, acessibilidade, segurança, desempenho e experiência coesa em desktop, tablet, web mobile e aplicativo nativo.

### Regras de execução

1. Comece auditando o estado atual do checkout. Confirme branch, commit, mudanças locais, estrutura, scripts, documentação e configuração. Refaça as contagens e inventários: o projeto evolui e os documentos existentes podem estar desatualizados.
2. Não presuma que uma função está ausente, concluída ou planejada. Para cada capacidade, registre seu estado com evidências:
   - existente e funcional
   - existente, parcial
   - existente, com defeitos
   - planejada/documentada
   - ausente
   - legado/redirect/resolver
   - não verificada
3. Antes de alterar um módulo, leia suas telas, componentes, endpoints, modelos, regras, migrações, permissões, testes e documentação relacionada. Preserve contratos, links, regras comerciais, integrações e comportamento que já funcionam.
4. Trabalhe em fases pequenas, com mudanças revisáveis e progresso documentado. Não faça uma reescrita em massa sem demonstrar necessidade. Não remova dados, rotas, APIs, integrações, migrações ou regras sem justificar impacto, compatibilidade, plano de migração e recuperação.
5. Não invente dados, métricas, endpoints ou regras comerciais. Quando a interface precisar de uma informação que o backend não fornece, registre a lacuna e projete a solução compatível, sem falsificar o resultado.
6. Não replique a identidade visual ou os ativos de Linear, Attio, HubSpot, Salesforce ou Intercom. Use-os como referências de qualidade e padrões de interação; crie uma identidade própria para o Nexus.
7. Mantenha um registro vivo de achados, decisões, riscos, rotas auditadas, rotas alteradas e evidências de validação.
8. Só declare uma fase concluída quando cumprir seus critérios de aceitação e Definition of Done. Registre falhas que não puderam ser resolvidas, com causa e impacto.

### Contexto inicial observado no repositório

Use os dados abaixo como pistas que precisam ser confirmadas no checkout, não como inventário definitivo:

- Aplicação Next.js/React/TypeScript, Supabase/PostgreSQL e arquitetura multi-tenant.
- Inventário observado: aproximadamente 156 páginas, 416 handlers de API e 293 migrações SQL.
- Há superfícies extensas de CRM, inbox, IA, operação de vendas, pedidos, estoque, compras, logística, financeiro, fiscal, administração e configuração.
- Há uma aplicação Android/Capacitor separada, voltada à captura offline de pedidos com SQLite e sincronização. O app nativo não parece representar todo o CRM offline.
- Há fluxo PWA/offline próprio para logística/entregas; confirme exatamente quais páginas, operações e cenários funcionam offline.
- O código já apresenta Customer 360/timeline, Google Agenda, Radar de risco/recuperação/prospecção, pontuação de leads, automações e capacidades de IA. Verifique sua cobertura e confiabilidade; não os recrie por padrão.
- docs/design-overhaul, docs/design-system e docs/architecture contêm material útil, mas há evidências de contagens ou mapas antigos e de decisões visuais divergentes. Verifique cada afirmação contra o código atual.
- capacitor.config.ts contém identidade e domínio específicos da Bill Higiene; entenda o contexto de implantação e marca branca antes de alterar.
- app/manifest.ts documenta limitações de inicialização offline. Valide o comportamento em runtime.
- app/layout.tsx usa fontes via next/font/google; avalie confiabilidade de build sem acesso à rede.
- O script db:migrate pode ser apenas um placeholder; confirme o script atual e o fluxo real de atualização do banco.
- Verifique a relação entre a licença no arquivo LICENSE e as declarações do README.
- Existe uma proteção para impedir que testes usem um banco remoto vindo de arquivo de ambiente. Preserve-a e fortaleça a validação, sem enfraquecer controles.
- Os números e observações acima podem estar desatualizados. Gere seus próprios dados antes de decidir.

### Referências de produto

Estude os fluxos e padrões atuais, priorizando as páginas oficiais. Extraia princípios de produto e comportamento, não copie a UI:

- Linear — produto e recursos
- Attio — CRM, dados, automações e relatórios
- HubSpot — CRM
- Salesforce — Sales Cloud
- Intercom — Inbox e atendimento
- Intercom — capacidades de IA

Registre quais princípios são relevantes para o Nexus, por exemplo: contexto do cliente acessível durante o atendimento, navegação previsível, ações rápidas, flexibilidade do modelo de dados, automações observáveis, relatórios utilizáveis, colaboração entre pessoas e IA, controles claros e bom desempenho em grandes volumes.

### Fase 0 — Segurança do trabalho e linha de base

Tarefas

- Verifique o estado do repositório e identifique arquivos modificados pelo usuário. Não os sobrescreva.
- Leia AGENTS.md, convenções do projeto, documentação de arquitetura, design, deploy, segurança, banco, mobile, CI e instruções de contribuição.
- Identifique os comandos realmente disponíveis para lint, typecheck, build, testes unitários, API, integração, E2E, jornadas, acessibilidade, mobile e release.
- Não execute mudanças destrutivas. Não rode testes contra serviços ou bancos remotos. Confirme a configuração local e os guardrails antes de executar testes com acesso a banco.
- Registre a linha de base com erros já existentes e resultados dos comandos aplicáveis.

Critérios de aceitação

- Mudanças locais anteriores estão identificadas e preservadas.
- Comandos de validação e seus efeitos estão documentados.
- Ambiente de teste e destino do banco estão claros e protegidos.
- Nenhuma alteração funcional foi feita nesta fase.

### Fase 1 — Inventário rastreável de todo o produto

Tarefas

Crie um inventário verificável e atualizado, incluindo:

1. Rotas e telas: todas as páginas Next.js, layouts, rotas públicas, autenticadas, administrativas, páginas dinâmicas, redirects, resolvers, páginas de erro e experiências instaláveis.
2. Subtelas e estados: abas, filtros, drawers, modais, menus, formulários, painéis laterais, estados vazios, loading, erro, sucesso, permissão negada, ausência de dados, confirmação e operações em andamento.
3. Componentes: shell, design system, componentes compartilhados, componentes específicos de módulo, tabelas, gráficos, formulários e componentes de mobile.
4. APIs: todos os handlers, métodos HTTP, autenticação, autorização, validação, limites, payloads, efeitos colaterais, erros, idempotência e chamadas externas.
5. Dados: migrações, tabelas, views, funções/RPCs, triggers, filas, índices, políticas RLS, Storage, tipos gerados, baseline e estratégia de atualização.
6. Integrações e infraestrutura: WhatsApp/WAHA, Meta, Nuvemshop, Google Agenda, provedores de IA, webhooks, worker, cron, notificações, instalação self-hosted, atualizador e backup.
7. Mobile e offline: Android/Capacitor, SQLite, fila de saída, sincronização, conflitos, dados locais, modo PWA e acessibilidade por toque.
8. Cobertura de testes: testes unitários, API, banco, invariantes, jornadas, E2E, visuais, mobile, shell e CI.
9. Documentação: identifique conteúdo obsoleto, divergências com o código e regras operacionais não cobertas.

Para cada rota, registre: objetivo, usuário/perfil, entrada, ações, saída, dependências, permissões, dados exibidos, estados, links, API/tabelas, telas relacionadas, problemas observados, decisão e cobertura de teste.

Use uma matriz em que cada rota, subtela e estado tenha um status e uma evidência. Não conclua uma auditoria de módulo com itens não verificados.

Inventário inicial de rotas a reconciliar

A lista abaixo é uma base de conferência. Descubra a árvore atual automaticamente e acrescente toda rota que não estiver aqui. Não retire rota da lista sem comprovar que é obsoleta ou duplicada e documentar a migração/compatibilidade.

Raiz, público, autenticação, onboarding e legal

/, /403, /500, /503, /design, /vitrine-agenda, /signup, /login, /login/forgot, /login/mfa, /login/recovery, /login/reset, /account-suspended, /legal/privacy, /legal/terms, /o/[token], /team/accept-invite/[token], /onboarding, /onboarding/welcome, /onboarding/connect-nuvemshop, /onboarding/connect-whatsapp, /onboarding/done, /onboarding/funil, /onboarding/invite-team, /onboarding/setup-ai, /onboarding/testar.

Administração global

/admin, /admin/dashboard, /admin/forbidden, /admin/audit, /admin/audit/[entryId], /admin/google, /admin/inbox, /admin/inbox/[conversationId], /admin/incidents, /admin/incidents/[id], /admin/lgpd, /admin/lgpd/requests/[id], /admin/marca, /admin/platform-admins, /admin/tenants, /admin/tenants/new, /admin/tenants/[id], /admin/tenants/[id]/health, /admin/usage, /admin/users, /admin/users/[id].

Aplicação tenant e CRM

/app, /app/meu-dia, /app/contacts, /app/contacts/[id], /app/leads/[id], /app/inbox, /app/inbox/[id], /app/busca, /app/carteira, /app/kanban, /app/pipelines/[id], /app/tarefas, /app/agenda, /app/notas, /app/team, /app/team/invite, /app/templates, /app/connections, /app/audit, /app/lgpd/requests, /app/lgpd/requests/[id], /app/settings, /app/settings/api-tokens, /app/settings/atendimento, /app/settings/atualizacao, /app/settings/billing, /app/settings/canal-oficial, /app/settings/marca, /app/settings/notifications, /app/settings/profile, /app/settings/security, /app/settings/templates, /app/settings/tenant, /app/settings/tenant/agenda, /app/settings/tenant/pipelines, /app/settings/tenant/whatsapp, /app/integrations/nuvemshop, /app/webhooks.

Vendas, operação comercial e receita

/app/campanhas, /app/prospeccao, /app/prospeccao/nova, /app/prospeccao/campanhas/[id], /app/radar, /app/radar/categorias, /app/radar/oportunidades, /app/radar/prospeccao, /app/radar/recuperacao, /app/radar/risco, /app/recuperacao, /app/venda-automatica, /app/pedidos, /app/pedidos/novo, /app/pedidos/[id], /app/pedidos/imprimir, /app/products, /app/estoque, /app/compras, /app/compras/[id], /app/expedicao, /app/expedicao/nova, /app/expedicao/[id], /app/expedicao/[id]/fechamento, /app/expedicao/[id]/motorista, /app/expedicao/[id]/rota, /app/frota, /app/faturamento, /app/financeiro, /app/titulos, /app/comissoes.

Inteligência, indicadores e relatórios

/app/relatorios, /app/indicadores, /app/metrics, /app/inteligencia, /app/laboratorio.

Fiscal

/app/fiscal, /app/fiscal/configuracoes, /app/fiscal/eventos, /app/fiscal/fornecedores, /app/fiscal/manifestacoes, /app/fiscal/notas, /app/fiscal/notas/[id], /app/fiscal/pendentes, /app/fiscal/produtos, /app/fiscal/relatorios, /app/fiscal/resumos, /app/fiscal/sincronizacoes, /app/fiscal/xml.

IA e automações

/app/ai, /app/ai/agents, /app/ai/agents/new, /app/ai/agents/[id], /app/ai/cases, /app/ai/controle, /app/ai/credentials, /app/ai/decisoes, /app/ai/evolution, /app/ai/followups, /app/ai/followups/[id], /app/ai/followups/enrollments/[id], /app/ai/inbox, /app/ai/knowledge/sources, /app/ai/memory, /app/ai/proposals, /app/ai/providers, /app/ai/routers, /app/ai/routers/[id], /app/ai/runs, /app/ai/skills, /app/ai/usage.

Contabilidade do inventário: confirme a lista real com o filesystem/router e registre as contagens corretas; esta lista é uma base para verificação e não uma declaração de completude.

Definition of Done da fase

- Há catálogo de rotas e módulos gerado a partir do checkout atual.
- Todas as rotas estão classificadas; redirects e resolvers não são confundidos com telas completas.
- Toda subtela e estado observável tem cobertura planejada.
- Cada capacidade está classificada com evidência, inclusive itens planejados ou ainda desconhecidos.
- Contradições entre documentação e implementação estão registradas.

### Fase 2 — Auditoria funcional, visual e de experiência

Avalie o produto em execução e no código. Para cada rota, valide a tela em desktop, tablet e celular; para as jornadas principais, valide interações reais. Se o ambiente impedir a execução, registre precisamente o bloqueio e use análise estática sem alegar inspeção visual em runtime.

Avaliação por tela

Verifique:

- propósito e próximo passo evidentes;
- hierarquia e densidade da informação;
- consistência de headers, breadcrumb, ações primárias, filtros e navegação;
- quantidade de cliques e digitação para tarefas frequentes;
- busca, ordenação, filtros, paginação, seleção em massa e persistência de preferências;
- formulários: rótulos, validação, erros no campo, dados preservados, salvamento, cancelamento e confirmação;
- estados de loading, skeleton, vazio, erro com recuperação, sucesso, offline e permissão negada;
- feedback imediato para ações e prevenção de duplicidade;
- contraste, foco, navegação por teclado, leitor de tela, tamanho de toque, zoom e redução de movimento;
- comportamento com nomes longos, valores extremos, tabelas grandes, conteúdo ausente, latência e falha de rede;
- largura e overflow horizontal e interno, sticky headers, modais, drawers e navegação em telas estreitas;
- tradução, moeda, datas, timezone e convenções brasileiras;
- desempenho perceptível e renderização de gráficos.

Não aplique mecanicamente um header padronizado onde saudação, editor ou fluxo guiado tenha uma composição intencional. Padronize a experiência sem destruir hierarquia ou contexto de tarefa.

Jornadas críticas a mapear e validar

Confirme no código quais jornadas existem e seu estado real. Inclua, no mínimo:

1. login, recuperação de acesso, MFA e convite de usuário;
2. onboarding do tenant, configuração de funil, equipe, WhatsApp, Nuvemshop e IA;
3. captura, qualificação e atribuição de lead;
4. mover lead entre etapas, agendar próximo passo e registrar resultado;
5. buscar ou criar contato, revisar Customer 360 e histórico;
6. receber, atribuir, responder, encaminhar e encerrar conversa no inbox;
7. transferir conversa entre IA e pessoa, com contexto, controle e auditoria;
8. criar/publicar/pausar/rollback de agente, editar conhecimento, testar e avaliar resposta;
9. configurar follow-up e controlar enrollment, pausa, retomada, cancelamento, snooze e falha;
10. criar e processar pedido, aplicar políticas, verificar estoque, cobrança e comissão;
11. compras, entrada de estoque, expedição, rota, motorista e fechamento;
12. financeiro, títulos, recebimentos e indicadores;
13. operações fiscais e tratamento de falhas de sincronização;
14. importar/exportar dados, LGPD, solicitações e trilha de auditoria;
15. atualizar, configurar integração, revisar erro e recuperar o serviço;
16. captura de pedido offline, fila, sincronização, conflito e rejeição.

### Fase 3 — Identidade visual e design system do Nexus

Crie uma identidade profissional própria, de alta qualidade, consistente em toda a aplicação e adequada a um CRM de vendas e operações. Revise a identidade proposta contra o produto real e a marca existente antes de implementar.

Tokens de referência

Use os valores abaixo como proposta inicial. Valide contraste e legibilidade e ajuste se necessário, registrando a razão. Não deixe valores hex soltos em páginas ou componentes fora do sistema de tokens.

Tema claro

- canvas: #F5F7FA
- surface: #FFFFFF
- surface-subtle: #EEF2F7
- text-primary: #172033
- text-secondary: #5E6B82
- border: #DCE3ED
- primary: #4F46E5
- primary-hover: #4338CA
- accent: #0F766E
- success: #15803D
- warning: #B45309
- danger: #B42318
- info: #0369A1

Tema escuro

- canvas: #0D1321
- surface: #151E2E
- surface-raised: #1B2739
- text-primary: #F1F5FA
- text-secondary: #A5B1C2
- border: #2A384C
- primary: #8B83FF
- primary-hover: #A49EFF
- accent: #5EEAD4
- success: #4ADE80
- warning: #FBBF24
- danger: #FDA4AF
- info: #7DD3FC

Crie aliases semânticos para estados, interação, foco, seleção, disabled, overlays, gráficos e visualização de dados. Não use somente cor para transmitir status. Verifique contraste WCAG 2.2 AA, incluindo texto, ícones, limites de controles e foco.

Tokens estruturais

- Tipografia: Inter para interface e IBM Plex Mono para valores técnicos, identificadores e logs, se o licenciamento e o pipeline permitirem. Evite dependência de rede durante build; prefira assets locais ou fallback consistente e validado.
- Escala tipográfica: texto funcional geralmente entre 13–16 px; títulos de seção entre 20–28 px; títulos de página entre 24–32 px; use pesos, line-height e largura de leitura intencionais.
- Espaçamento: base de 4 px, com tokens 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Bordas: raio de 6 px para controles densos, 10 px para cards/painéis, 14 px para superfícies de destaque. Evite excesso de arredondamento.
- Sombras: elevação sutil e funcional; não use sombras pesadas para separar todos os blocos.
- Movimento: 120–220 ms para feedback; respeite prefers-reduced-motion.
- Ícones: use o conjunto já adotado no projeto de modo consistente, com tamanho e traço normalizados.
- Densidade: permita leitura confortável de dados e, quando fizer sentido, controle de densidade sem variar aleatoriamente entre módulos.

Componentes globais a padronizar

Sidebar desktop e mobile, Topbar, seletor de tenant, breadcrumb, busca global, command palette, notificações, menu do usuário, navegação de módulos, navegação por teclado, dock mobile, banners de status, headers de página, cards e KPIs, tabelas e listas, filtros, paginação, tabs, formulário, field, combobox, seletor de data, badges, avatar, tooltip, popover, dialog, sheet, toast, skeleton, empty state, error state, confirmação destrutiva, uploader, editor, timeline, chart, mapas, estados offline e controles de acessibilidade.

Para cada componente defina variantes, estados, tokens, comportamento de teclado, acessibilidade, responsividade e exemplos de uso. Centralize sem criar abstrações que tornem mais difícil entender componentes de domínio.

### Fase 4 — Shell e navegação

Tarefas

- Reorganize a navegação por tarefas e papéis, mantendo descoberta das áreas avançadas.
- Avalie agrupamento de CRM, vendas, atendimento, operação, financeiro, insights, IA, equipe e configuração com base no uso observado e nas permissões reais.
- Padronize sidebar, Topbar, busca, breadcrumb, seletor de empresa/tenant, notificações e atalhos.
- Defina comportamento claro para menu expandido/recolhido, tablet, celular, modais de navegação e retorno à origem.
- Garanta deep links, redirects, hashes, filtros relevantes e estado de navegação sem quebrar URLs já usadas.
- Faça busca global distinguir pessoas, empresas, leads, pedidos, conversas e ações, respeitando acesso e contexto.
- Reduza mudanças de contexto nas jornadas mais comuns. Use command palette e atalhos apenas se forem descobríveis, acessíveis e consistentes.

Aceitação

- Todas as páginas têm caminho de entrada e retorno claro.
- A navegação em teclado e leitor de tela funciona.
- Nenhuma rota acessível anteriormente fica órfã ou perde deep link sem alternativa compatível.
- Em telas pequenas, a navegação não ocupa a área útil da tarefa nem encobre o conteúdo.

### Fase 5 — Redesign individual de todos os módulos

Audite e trate cada rota e subtela do inventário. Para cada módulo, documente objetivo, usuário, dados, regras, APIs, estados, responsividade, problemas, decisão visual/funcional, alterações e validação.

#### 5.1 Público, login, onboarding e legal

Revise site público, login, criação de conta, recuperação, MFA, convite, páginas de erro, suspensão e termos/privacidade. Faça onboarding progressivo, com passos salváveis, validação, estados recuperáveis e indicação de requisitos para concluir integração. Preserve URLs e fluxos existentes. Não mostre sucesso de integração antes da confirmação real do backend.

#### 5.2 Dashboard, Meu Dia, busca, tarefas e agenda

Organize ações por urgência e próxima ação, com métricas confiáveis e período explícito. Evite redundâncias de cartões ou contadores. Disponibilize retry e explique lacunas de dados. Revise gráficos em telas estreitas. Em Meu Dia, priorize tarefas e compromissos e permita ações diretas sem navegar desnecessariamente para outra página. Avalie o estado real da integração de Google Agenda e suas permissões/sincronização.

#### 5.3 Contatos, leads, carteira, funis e Customer 360

Valide captura, atribuição, deduplicação, filtros, importação/exportação, customização de campos, associações, funis, motivos de perda, duração de etapa e próximas ações. Não adicione objetos ou métricas antes de verificar o modelo existente.

No Customer 360, avalie timeline unificada, dados de contato/empresa, conversas, pedidos, atividades, oportunidades, tarefas, consentimento e preferências, permissões, histórico e consistência. Contexto deve estar disponível sem duplicar ou vazar informação entre tenants. Pontuação e recomendações devem indicar origem, confiança e data de atualização.

#### 5.4 Inbox, atendimento e campanhas

Preserve os canais e conectores existentes. Confirme se cada canal suporta leitura, envio, mídia, status, reconexão, templates e limites. Não prometa omnichannel para integrações que ainda não existam.

Para o Inbox, audite filas, filtros, atribuição, prioridade, tags, SLA, macros, contexto do cliente, mensagens, anexos, busca, presença, atualização em tempo real, falha de envio, reenvio e handoff IA/humano. Valide o layout de uma, duas e três colunas em cada breakpoint. Campanhas precisam de consentimento, segmentação, prevenção de duplicidade, limite de envio, rastreio e tratamento de opt-out, conforme suporte existente e regras aplicáveis.

#### 5.5 Radar, prospecção, recuperação e inteligência

Verifique Radar de risco, recompra, oportunidades e prospecção: critérios, fonte, período, explicação de recomendação, ações, status e resultados. Preserve comportamento real do score e das regras. Evite mostrar “insights” que não derivem de dados válidos. Revise mapas, filtros, exportação, carregamento e grandes volumes.

#### 5.6 Pedidos, catálogo, estoque, compras e expedição

Revise lista, criação, edição, impressão, catálogo, descontos, estoque, compras, fornecedores, faturamento, frota, expedição, mapa, rota, motorista e fechamento. Documente as regras de aprovação, crédito, preço, estoque e sincronização. Mantenha totais e valores em centavos com formatação correta. Trate ações irreversíveis com confirmação e audit trail.

#### 5.7 Financeiro, títulos e comissões

Valide saldos, recebíveis, pagamentos, baixas, conciliação, filtros, datas, moeda, comissão, regras e relatórios. Não invente comparativos ou tendências se a base necessária não existir. Distinga projeção de realizado e sinalize origem e período.

#### 5.8 Fiscal

Audite todas as subtelas, XML, notas, eventos, manifestações, produtos, fornecedores, pendentes, sincronizações, relatórios e configurações. Preserve requisitos fiscais e fluxos existentes. Exponha estado da integração, erros recuperáveis e histórico. Não simplifique ações que possam gerar efeitos fiscais sem análise do fluxo e dos guardrails.

#### 5.9 IA, agentes, conhecimento, follow-ups e automações

A área de IA já possui diversas rotas e deve ser avaliada antes de sugerir capacidades novas. Audite agentes, versões, publicação, routers, provedores, credenciais, ferramentas, skills, memória, fontes de conhecimento, runs, casos, decisões, propostas, usage, evolução, controle, follow-ups e integrações com inbox.

Fortaleça, conforme lacunas verificadas:

- inspeção de entradas, contexto, fontes e saída;
- testes e avaliações reproduzíveis, com datasets seguros;
- estados de versão, publicação, rollback e aprovação;
- controle de custo, latência, limite, falha e indisponibilidade;
- guardrails para envio e operações sensíveis;
- revisão humana, veto, transferência e retomada de contexto;
- trilha de auditoria de decisões e efeitos;
- proteção contra prompt injection, exposição de segredos e cruzamento de tenant.

Automações devem ter validação, rascunho, publicação, histórico, pause/resume, retry com limites, idempotência, monitoramento e explicação de falha. Não execute efeitos externos durante testes sem fixture ou ambiente seguro.

#### 5.10 Equipe, configurações, integração, auditoria e LGPD

Revise papéis, permissões, convites, setores, canais, tokens, segurança, notificações, billing, marca, atualizações, templates, atendimento, configurações do tenant, integração Nuvemshop, webhooks, logs de auditoria e solicitações LGPD.

Avalie least privilege, expiração/revogação de tokens, isolamento multi-tenant, auditoria de ações administrativas, exportação, redação e retenção conforme a política vigente. Preserve fluxos de atualização self-hosted e marca branca. Resolver ou redirect não deve ser redesenhado como tela sem necessidade; verifique seu contrato de URL.

#### 5.11 Administração global

Revise dashboard, tenants, saúde, usuários, auditoria, incidentes, inbox, LGPD, marca, Google, usage e administradores de plataforma. Diferencie claramente controles de plataforma e de tenant. Exija autorização e audit trail em impersonação, suspensão, reativação e outras operações privilegiadas.

### Fase 6 — Backend, APIs, banco e regras comerciais

Tarefas

- Gere o catálogo completo de APIs, métodos, payloads, autenticação, permissões, validação e efeitos colaterais.
- Verifique consistência dos contratos entre UI, handlers, serviços, workers, webhooks e banco.
- Revise RLS em todas as tabelas sensíveis, isolamento tenant, service-role, credenciais, upload, logs e mensagens de erro.
- Identifique endpoints duplicados, sem uso, legados ou com nomenclatura inconsistente. Não os remova sem busca de consumidores, telemetria ou compatibilidade.
- Revise paginação, busca, filtros, ordenação, limites, rate limiting, idempotência, retries, concorrência, timeout, cache, filas e observabilidade.
- Analise migrations e baseline como histórico crítico. Preserve forward compatibility e instalações existentes. Prefira migrações aditivas, reversíveis quando possível, com validação e plano de rollback. Não reescreva baseline/histórico para mascarar divergências.
- Confirme estratégia de migração local, CI e self-host. Corrija placeholders operacionais somente após descobrir o fluxo suportado pelo produto.
- Documente tabelas, entidades, relacionamentos, regras de exclusão, retenção, soft delete, constraints, índices, triggers e jobs.
- Revise backups, atualização, restauração, health checks e instalação em VPS.
- Defina SLIs e logs úteis para falhas, sem registrar segredos ou dados pessoais desnecessários.

Aceitação

- Nenhum endpoint perde comportamento sem decisão e compatibilidade explícitas.
- RLS e isolamento são testados em ao menos dois tenants.
- Operações externas e financeiras têm idempotência, auditoria e tratamento de repetição apropriado.
- As migrações novas são testadas a partir do baseline e em atualização de uma base representativa.
- O runbook documenta deploy, migração, health, backup, recuperação e atualização.

### Fase 7 — Web responsiva, PWA, Capacitor e offline

Web

Verifique layouts em larguras representativas de desktop, tablet, telefones compactos e telefones grandes. Inclua no mínimo 320, 360, 390, 430, 768, 1024, 1280 e 1440 px. Teste zoom, orientação, teclado virtual e áreas seguras.

PWA e offline

- Distinga offline após uma sessão ativa de inicialização offline desde zero.
- Documente quais páginas e operações podem funcionar sem conexão.
- Verifique cache, validade, atualização, mensagens offline, integridade, dados privados, logout e limpeza do dispositivo.
- Teste perda e retorno de rede, fila, retry, conflitos, duplicidade e dados rejeitados.
- Não apresente como sincronizada uma ação que ainda está apenas local.

Capacitor/Android

- Inspecione mobile/, Capacitor, Android, SQLite, fila, sincronizador, identidade de aplicativo, links e endpoint de produção.
- Preserve a captura offline de pedidos e a integridade da fila.
- Avalie parametrização segura de domínio e marca; não substitua valores de produção sem compreender os ambientes e contratos.
- Valide instalação, ciclo de vida, retorno de rede, armazenamento, atualização, permissões, teclado, leitor de tela, notificações e construção do APK.
- Determine se iOS é uma plataforma suportada antes de incluí-la na entrega.

Aceitação

- A matriz de suporte offline está publicada e corresponde à execução real.
- Nenhum pedido desaparece em caso de falha de rede ou rejeição do servidor.
- Os estados pendente, enviando, sincronizado e rejeitado são distinguíveis e recuperáveis.
- O APK mantém as funções existentes; qualquer mudança de branding/servidor é configurável e testada.

### Fase 8 — Segurança, privacidade, desempenho e acessibilidade

Audite autenticação, sessão, MFA, autorização, RLS, secrets, CORS, CSRF, XSS, SSRF, upload, webhooks, rate limits, dependências, logs, IA e multi-tenancy. Revise limites de exposição de dados e segurança administrativa.

Meça carregamento inicial e navegação, consultas lentas, grandes listas, gráficos, bundle, imagens, fontes e workers. Não otimize com base em suposição: registre baseline, gargalo e resultado.

Valide WCAG 2.2 AA, teclado, foco, semântica, contraste, leitores de tela, mensagens de erro, toque e prefers-reduced-motion.

### Fase 9 — Testes e qualidade

Crie ou amplie cobertura conforme a arquitetura atual, evitando testes frágeis de detalhes de implementação.

- Unitários: regras de domínio, cálculos, validação, formatação, máquina de estados e sincronização.
- API: autenticação, autorização, validação, tenant, idempotência, erros, paginação e limites.
- Banco/invariantes: constraints, RLS, migrações, baseline, jobs e isolamento.
- Jornadas E2E: caminhos críticos de ponta a ponta, incluindo permissões, falhas e recuperação.
- Visual: snapshots/capturas das páginas e estados por tema e breakpoint; revise diferenças e não aprove atualizações cegas.
- Acessibilidade: axe e testes por teclado/foco, complementados por revisão de semântica.
- Mobile/offline: banco local, fila, conflitos, retorno de rede, retry, rejeição e persistência.
- Operação: instalação, atualização, health check, backup e restauração conforme os scripts disponíveis.

Use dados sintéticos e ambientes isolados. Mantenha guardrails que bloqueiam banco remoto em testes. Nunca enfraqueça uma proteção para fazer a suíte passar.

### Fase 10 — Execução progressiva e ordem de prioridade

Após concluir o inventário e auditoria, apresente um plano priorizado, sem esperar nova autorização para trabalho reversível já solicitado. Execute em fatias verticais:

- P0: segurança, perda/corrupção de dados, isolamento multi-tenant, operações críticas, falhas que impedem deploy ou uso.
- P1: jornadas centrais de CRM, vendas, inbox, pedidos e mobile; erros sem recuperação; controles de acessibilidade graves.
- P2: consistência visual, densidade, tabelas, navegação, relatórios e automações.
- P3: novas capacidades confirmadas como ausentes e melhorias de conveniência.

Para cada item, registre impacto, evidência, dependências, risco, arquivos/módulos envolvidos, estratégia, validação e critério de conclusão. Faça commits lógicos somente se o fluxo do usuário pedir ou o ambiente exigir; preserve mudanças preexistentes.

### Definition of Done global

O projeto só pode ser declarado concluído quando:

1. 100% das rotas atuais e rotas adicionadas durante o trabalho estão no inventário e auditadas.
2. Todas as subtelas, modais, abas, fluxos e estados relevantes têm evidência de avaliação ou bloqueio explícito.
3. Toda capacidade está classificada como existente, parcial, planejada, ausente, legada ou não verificada, sem duplicar funcionalidades existentes.
4. Todas as jornadas críticas têm critérios de sucesso e validação.
5. O design system, tokens, tema claro/escuro, navegação e componentes são consistentes.
6. Desktop, tablet, web mobile, PWA, Capacitor e cenários offline estão testados conforme suporte real.
7. Segurança, isolamento tenant, regras comerciais, privacidade e integridade dos dados permanecem protegidos.
8. Lint, typecheck, build e suítes de teste pertinentes passam, ou cada falha preexistente/bloqueio está documentado e atribuível.
9. Migrações, instalação, atualização e recuperação estão documentadas e validadas.
10. Não há erros críticos de acessibilidade, overflow, perda de dados, ações sem feedback ou telas sem estado de erro recuperável.
11. Documentação, inventário, capturas e decisões finais correspondem ao código entregue.
12. Nenhuma funcionalidade existente foi removida sem justificativa, compatibilidade e plano de migração aceitos.

Ao final, entregue um relatório conciso com: escopo realizado, mudanças por módulo, inventário de cobertura, testes executados e resultados, itens não resolvidos, riscos restantes e links para a documentação produzida.

---

# PARTE 2 — CHECKLIST DE EXECUÇÃO

> Reproduz **todo** item do prompt acima, na mesma ordem. Nenhum item foi agrupado nem
> omitido. Evidência = comando/arquivo/medição; "medido em" aponta quando foi medido.

## Regras de execução (R1–R8)

| #   | Regra                                                     | Estado | Evidência / observação                                                                                                                                                                    |
| --- | --------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Auditar o checkout; refazer contagens                     | `[x]`  | Branch `docs/auditoria-aaa` (base `9f8e6faa`). Inventário gerado por script: 143 telas, 13 resolvers, 418 APIs, 13 layouts, 292 migrations. Falta varrer tabelas/RLS/workers/integrações. |
| R2  | Classificar cada capacidade com 7 estados                 | `[~]`  | Escala adotada na Parte 3. Classificação iniciada em rotas (tela/resolver); APIs e capacidades ainda sem estado.                                                                          |
| R3  | Ler módulo antes de alterar                               | `[x]`  | Regra mantida em cada alteração; o bloco de consertos começou depois do inventário e está listado na Parte 3.                                                                                                  |
| R4  | Fases pequenas; não remover sem impacto/compat/rollback   | `[x]`  | Nada removido. Toda remoção futura exige bloco "impacto/compatibilidade/rollback".                                                                                                        |
| R5  | Não inventar dado/regra; registrar lacuna                 | `[x]`  | Inventário é gerado; números à mão foram substituídos por comando. Lacunas listadas na Parte 3.                                                                                           |
| R6  | Não copiar UI de Linear/Attio/HubSpot/Salesforce/Intercom | `[x]`  | Nenhum ativo externo usado; identidade a definir na Fase 3.                                                                                                                               |
| R7  | Registro vivo de achados/decisões/riscos                  | `[~]`  | Parte 3 deste arquivo + `inventario.json`.                                                                                                                                                |
| R8  | Só concluir fase com critério + DoD; registrar falhas     | `[x]`  | Este checklist marca fase a fase; nenhuma fase declarada concluída ainda.                                                                                                                 |

## Contexto inicial — 13 pistas a confirmar

| #   | Pista                                                                                                                | Estado | Evidência medida                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Next.js/React/TS + Supabase/Postgres multi-tenant                                                                    | `[x]`  | `package.json` (next 16, react 19, ts 6), `supabase/`, RLS em migrations.                                                                                                                                                                                                                                                                                                                                                   |
| C2  | ~156 páginas, 416 handlers, 293 migrations                                                                           | `[x]`  | Medido: **156 `page.tsx`** (143 telas + 13 resolvers), **418 `route.ts`**, **292 migrations**. Os números do prompt estavam levemente defasados — confirmado.                                                                                                                                                                                                                                                               |
| C3  | Superfícies amplas (CRM, inbox, IA, vendas, pedidos, estoque, compras, logística, financeiro, fiscal, admin, config) | `[x]`  | `inventario.json` → `telas_por_grupo`.                                                                                                                                                                                                                                                                                                                                                                                      |
| C4  | App Android/Capacitor separado, offline com SQLite                                                                   | `[~]`  | `capacitor.config.ts` e `mobile/` existem; conteúdo não auditado.                                                                                                                                                                                                                                                                                                                                                           |
| C5  | PWA/offline de logística; mapear o que funciona offline                                                              | `[~]`  | Pendente (Fase 7).                                                                                                                                                                                                                                                                                                                                                                                                          |
| C6  | Já existe Customer 360/timeline, Google Agenda, Radar, score de lead, automações, IA                                 | `[~]`  | Rotas existem; estado real não auditado.                                                                                                                                                                                                                                                                                                                                                                                    |
| C7  | `docs/design-overhaul`, `docs/design-system`, `docs/architecture` com contagens antigas                              | `[~]`  | Pendente (Fase 1.9).                                                                                                                                                                                                                                                                                                                                                                                                        |
| C8  | `capacitor.config.ts` com identidade/domínio da Bill Higiene                                                         | `[~]`  | Pendente (Fase 7).                                                                                                                                                                                                                                                                                                                                                                                                          |
| C9  | `app/manifest.ts` documenta limitação de boot offline                                                                | `[~]`  | Pendente (Fase 7).                                                                                                                                                                                                                                                                                                                                                                                                          |
| C10 | `app/layout.tsx` usa `next/font/google`; risco de build sem rede                                                     | `[~]`  | Pendente (Fase 3/8).                                                                                                                                                                                                                                                                                                                                                                                                        |
| C11 | `db:migrate` pode ser placeholder                                                                                    | `[x]`  | **CONFIRMADO e CORRIGIDO**: era `echo 'TODO: wire supabase db push or pg-migrate' && exit 0` — sucesso sem aplicar nada. Agora `bash scripts/db/aplicar-schema.sh` aplica o `baseline.sql` com `ON_ERROR_STOP=1`, **verifica** o schema e sai 1 quando falta objeto ou quando o psql não conecta. Gate: `tests/unit/db-migrate-nao-e-placeholder.test.ts`. Evidência: [`12-migrations-e-rls.md`](12-migrations-e-rls.md) §6 |
| C12 | Licença do `LICENSE` vs. declarações do README                                                                       | `[~]`  | Pendente (Fase 0/6).                                                                                                                                                                                                                                                                                                                                                                                                        |
| C13 | Guardrail contra banco remoto em testes                                                                              | `[x]`  | Existe; preservado até aqui. Auditoria e reforço pendentes (Fase 9).                                                                                                                                                                                                                                                                                                                                                        |

## Referências de produto — princípios a registrar

| #   | Referência                                                                                                                                                                                                      | Estado | Observação                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------ |
| P1  | Linear                                                                                                                                                                                                          | `[ ]`  | Estudar e registrar princípios aplicáveis.             |
| P2  | Attio                                                                                                                                                                                                           | `[ ]`  | idem.                                                  |
| P3  | HubSpot                                                                                                                                                                                                         | `[ ]`  | idem.                                                  |
| P4  | Salesforce Sales Cloud                                                                                                                                                                                          | `[ ]`  | idem.                                                  |
| P5  | Intercom — Inbox                                                                                                                                                                                                | `[ ]`  | idem.                                                  |
| P6  | Intercom — IA                                                                                                                                                                                                   | `[ ]`  | idem.                                                  |
| P7  | Registrar princípios relevantes (contexto do cliente, navegação previsível, ações rápidas, flexibilidade de dados, automações observáveis, relatórios, colaboração humano+IA, controles, performance em volume) | `[~]`  | Saída em `docs/auditoria/03-principios-de-produto.md`. |

## Fase 0 — Segurança do trabalho e linha de base

**Status: concluída.** Registro completo em [`00-linha-de-base.md`](00-linha-de-base.md).

| #   | Tarefa                                                                                                           | Estado | Evidência                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1 | Verificar estado do repo e arquivos do usuário; não sobrescrever                                                 | `[x]`  | Untracked preservados: `.debug-detalhe.mjs`, `.probe-cliente{,2,3}.mjs`, `.repara-mercos{,2,4}.mjs`, `docs/PROMPT-V5-EXPEDICAO-ROTEIZACAO.md` (este último **não** é commitado).     |
| 0.2 | Ler AGENTS.md e docs de arquitetura/design/deploy/segurança/banco/mobile/CI                                      | `[x]`  | Lidos: `AGENTS.md`, `CLAUDE.md`, `docs/current-state.md`, `docs/harness-audit.md`, `docs/threat-model.md`, `docs/design-system/*`, `docs/deploy-selfhost/README.md`, os 8 workflows. |
| 0.3 | Identificar comandos reais (lint, typecheck, build, unit, API, integração, E2E, jornadas, a11y, mobile, release) | `[x]`  | `package.json` medido — ver `00-linha-de-base.md` §2.                                                                                                                                |
| 0.4 | Não rodar destrutivo; não testar contra banco/serviço remoto; confirmar guardrails                               | `[x]`  | Guardrail lido: `scripts/lib/env-de-teste.ts` → `recusarSeRemotoVindoDoArquivo()`. Nenhum teste tocou banco, VPS ou serviço externo.                                                 |
| 0.5 | Registrar linha de base com erros existentes                                                                     | `[x]`  | `00-linha-de-base.md` §3: typecheck exit 0 · lint exit 0 (505 avisos) · unit 1 falha por timeout sob carga, isolada passa 22/22.                                                     |

Critérios de aceitação

| #    | Critério                                                 | Estado |
| ---- | -------------------------------------------------------- | ------ |
| 0.A1 | Mudanças locais identificadas e preservadas              | `[x]`  | `00-linha-de-base.md` §1                                             |
| 0.A2 | Comandos de validação e efeitos documentados             | `[x]`  | `00-linha-de-base.md` §2                                             |
| 0.A3 | Ambiente de teste e destino do banco claros e protegidos | `[x]`  | `00-linha-de-base.md` §4                                             |
| 0.A4 | Nenhuma alteração funcional nesta fase                   | `[x]`  | só `docs/`, `scripts/auditoria/`, `scripts/discord/`, `.env.example` |

## Fase 1 — Inventário rastreável

**Status: inventário concluído; subtelas e estados seguem EM ABERTO** (1.2, 1.10, 1.11, 1.D3).
F-09 (P0) aberto para a Fase 10. Registro: [`01-inventario.md`](01-inventario.md).

> Correção de alegação (2026-11-16): **156 = 143 páginas + 13 resolvers é cobertura de ROTAS, não
> auditoria de subtelas, estados e jornadas.** Contar `page.tsx` prova que nenhuma rota do prompt
> ficou sem arquivo; não prova que cada aba, drawer, estado vazio/erro/permissão e jornada J1–J16
> foi vista funcionando. A matriz da 1.2 lista onde cada estado _aparece no código_ — sinal, não
> execução. Quem lê `[x]` ali está lendo uma prova que o artefato não dá.

| #   | Tarefa                                                                                                                                                                    | Estado | Evidência                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Rotas e telas (páginas, layouts, públicas, autenticadas, admin, dinâmicas, redirects, resolvers, erro, instaláveis)                                                       | `[x]`  | 156 telas · 13 resolvers · 13 layouts · 6 fronteiras de erro · 8 `loading` + `not-found` · 2 especiais. `inventario-rotas.md`                                                                                                                                                                                                                                                                                                                                                                                                 |
| 1.2 | Subtelas e estados (abas, filtros, drawers, modais, menus, forms, painéis, vazio, loading, erro, sucesso, permissão negada, ausência de dados, confirmação, em andamento) | `[~]`  | Matriz **156 × 12 de SINAL no código** em `09-telas-estados.md`, medida no **segmento de rota** (page + `_client` + `_components` + imports locais; 143/143 com ≥1 sinal — F-20/V-07). Diz onde o estado existe, não que ele funciona. Subtelas (abas, drawers, modais), estados de escrita (salvar, confirmar, duplicidade) e as jornadas continuam sem execução. Medido em 2026-11-16: **37 telas distintas** abertas em navegador (57 arquivos — 37 rotas em desktop 1440 + as mesmas 20 em celular 390; 20 ⊂ 37), de 156. |
| 1.3 | Componentes (shell, design system, compartilhados, de módulo, tabelas, gráficos, forms, mobile)                                                                           | `[x]`  | `05-componentes.md`: 242 arquivos, 19 primitivas `ui/`, tipo por diretório                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1.4 | APIs (handlers, métodos, authn, authz, validação, limites, payloads, efeitos, erros, idempotência, chamadas externas)                                                     | `[x]`  | `06-apis.md`/`.json`: 418 handlers com métodos, guarda, schema, efeitos, idempotência (2), rate limit (F-12, F-13)                                                                                                                                                                                                                                                                                                                                                                                                            |
| 1.5 | Dados (migrations, tabelas, views, RPCs, triggers, filas, índices, RLS, Storage, tipos, baseline, estratégia de update)                                                   | `[~]`  | `04-inventario-dados.md` (contagem de TEXTO) + **[`12-migrations-e-rls.md`](12-migrations-e-rls.md)** (medido em Postgres descartável): 180 tabelas criadas pelo baseline, **RLS ligado em 179 de 179 de `public`**, **305 políticas** (300 em `public`), 104 triggers, 92 funções em `public`; instalação e **update sobre dados** verdes; **F-09: a cadeia de migrations NÃO reproduz o schema** (35 de 292 aplicam; 257 falham por pré-requisito).                                                                         |
| 1.6 | Integrações e infra (WAHA, Meta, Nuvemshop, Google Agenda, IA, webhooks, worker, cron, notificações, self-host, updater, backup)                                          | `[x]`  | `07-integracoes.md`: 10 integrações, 16 workers, 30 crons, serviços do compose, env                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 1.7 | Mobile e offline (Capacitor, SQLite, fila, sync, conflitos, dados locais, PWA, toque)                                                                                     | `[x]`  | `08-mobile-offline.md` + F-10 (marca no shell) + F-15 (correção do F-08)                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 1.8 | Cobertura de testes (unit, API, banco, invariantes, jornadas, E2E, visuais, mobile, shell, CI)                                                                            | `[x]`  | `10-cobertura-testes.md`: 1.121 arquivos; 58 telas com sinal, 98 sem (F-14)                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 1.9 | Documentação: obsoleto vs. código; regras operacionais não cobertas                                                                                                       | `[x]`  | F-01 (licença), F-04 (Sage × índigo), **F-11 (rotas 166/169 × 418)**, F-15                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Itens estruturais da Fase 1

| #    | Item                                                                                                                                                                                                         | Estado |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1.10 | Para cada rota registrar: objetivo, usuário/perfil, entrada, ações, saída, dependências, permissões, dados exibidos, estados, links, API/tabelas, telas relacionadas, problemas, decisão, cobertura de teste | `[~]`  | Estrutura gerada (tela, guarda, estados, teste). Os campos narrativos são preenchidos tela a tela na Fase 2 — preencher antes seria inventar auditoria                                                                                                                                                       |
| 1.11 | Matriz rota × subtela × estado com status e evidência                                                                                                                                                        | `[~]`  | `09-telas-estados.md` entrega rota × 12 sinais de estado. **Faltam duas colunas do que o item pede**: "subtela" (abas/drawers/modais são componentes, não rotas — a matriz não os enumera) e "status + evidência" por célula, que é o que a Fase 2 preenche.                                                 |
| 1.12 | Reconciliação das rotas listadas no prompt (acrescentar as que faltam; não remover sem prova)                                                                                                                | `[x]`  | **Cobertura de ROTAS**: 156 rotas do prompt = 143 páginas com JSX + 13 resolvers; 0 ausentes; 0 fora da lista. `docs/auditoria/02-reconciliacao-rotas.md`, gerado por `scripts/auditoria/reconciliar-rotas.ts`. Não é cobertura de subtelas/estados/jornadas — ver a correção de alegação no topo da Fase 1. |

Definition of Done da Fase 1

| #    | Item                                          | Estado |
| ---- | --------------------------------------------- | ------ |
| 1.D1 | Catálogo de rotas/módulos gerado do checkout  | `[x]`  |
| 1.D2 | Todas as rotas classificadas; resolver ≠ tela | `[x]`  | 143 telas com JSX · 13 resolvers sem JSX                                                                                                 |
| 1.D3 | Toda subtela/estado com cobertura planejada   | `[~]`  | Matriz de sinais pronta; **o plano de cobertura por subtela/estado/jornada não existe** — a Fase 2 cobre tela a tela e está em 37 de 156 |
| 1.D4 | Cada capacidade com estado + evidência        | `[x]`  |                                                                                                                                          |
| 1.D5 | Contradições doc × implementação registradas  | `[x]`  | F-01, F-04, F-11, F-15                                                                                                                   |

## Fase 2 — Auditoria funcional, visual e de experiência

**Status: em andamento.** Medido pelo conteúdo de `docs/auditoria/capturas/`: **57 arquivos**
— 37 rotas em desktop 1440 e **as mesmas** 20 em celular 390 —, ou seja, **37 telas distintas**
de 156. A contagem anterior ("42 telas") não fechava com arquivo nenhum: 37 + 20 = 57, e as 20 do
celular são subconjunto das 37 do desktop. Nenhuma tela foi declarada vista sem captura
correspondente. Registro: [`11-auditoria-visual.md`](11-auditoria-visual.md) · instrumento:
`node scripts/auditoria/captura-visual.mjs --grupo <inicio|vendas|operacao|admin>`.

Achados: **V-01 corrigido** — 36 de 40 páginas tinham o mesmo `<title>`; título agora vem de
`lib/navigation/titulos.ts` (fonte: o registro de navegação, que tem gate) e há teste que lê o
disco. **V-02 corrigido** — `#/app/inbox` era a única tela sem `<h1>`; agora tem, `sr-only`,
medido 1×1 px sem overflow. **V-03 descartado** — o "botão que cobria a barra inferior" era o
TanStack Query Devtools, só em `NODE_ENV=development`; com ele removido, 0 colisões em 6 telas.
**V-04 pendente de decisão** — formato de data vem do navegador. **V-05 aberto** — desempenho só
medido em dev. **V-07 corrigido** — a matriz de estados media o `page.tsx` e não a tela: 156 linhas
com tudo em `—` e `error.tsx` ✓ em 156 (arquivo global). Agora lê o segmento + imports locais,
remove comentários e separa `próprio`/`herdado`: **143 de 143** telas com ≥1 sinal. Gate de 11 casos.

Correção de método registrada: a primeira rodada capturou um checkout **208 commits divergente**
(`/Users/bill/Downloads/nexus`); todas as medidas foram refeitas em servidor do próprio worktree
(`localhost:3011`).

| #    | Item                                                                                               | Estado                                                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.1  | Avaliar produto em execução e no código; desktop/tablet/celular                                    | `[x]` | **129 estáticas** em 1440/390 (258 medições) · **32** em tablet 834 · **26 dinâmicas, todas com prova**: 20 medidas (40 medições, 200, 0 overflow), 1 com link assinado (`/o/[token]`, token redigido), 4 com fixture criada e apagada (`rotas-com-fixture.mjs`, `sobrou=nada`) e 1 por E2E (`invite-lifecycle`, 12 verdes). **6 larguras**: 320, 360, 390, 430, 834, 1440 |
| 2.2  | Se impedido, registrar bloqueio e usar análise estática sem alegar inspeção visual                 | `[x]`                                                                                                                                      |
| 2.3  | Propósito e próximo passo evidentes                                                                | `[x]` | **Título próprio em todas as rotas**: título de aba do registro + `<h1>` em 100% das medições (V-01/V-02/V-08/V-12). A última tela sem título era o roteador de intenção — corrigida em V-45 (h1 com o nome do roteador), medido com fixture. **Próximo passo**: 1 ação primária por tela de operação e ao menos 3 alvos na dobra em 320 (2.4); vazio com CTA (`/app/pedidos/imprimir`). **Orientação em tela profunda**: trilha (tenant) ou voltar + abas (admin) — 2.5 |
| 2.4  | Hierarquia e densidade                                                                                        | `[x]` | **12 telas em 3 larguras** (1440/834/320): **1 ação primária** por tela de operação em 1440 e 834; a 320, financeiro e notas têm a primária abaixo da dobra (declarado). **Densidade** de 7 (kanban) a **64** alvos (contatos em 834); leitura com máximo de 53 caracteres por linha. A medição achou e corrigiu o cabeçalho esmagando o título no tablet (V-46: h1 0 px → 498 px) |
| 2.5  | Consistência de headers, breadcrumb, ações, filtros, navegação                                     | `[x]` | **Título**: 117 de 119 `h1` visíveis a 24 px/500, um por tela (V-35/V-36; 2 exceções declaradas). **Breadcrumb**: 51 das 51 rotas profundas reais do tenant têm trilha (as 4 que pareciam sem são aliases medidos no destino). **Admin**: sem trilha por decisão — as 4 telas de detalhe usam voltar + abas (conferido nas 4). **Ações**: 1 primária por tela (2.4). Regra declarada: tenant = trilha; admin = voltar + abas |
| 2.6  | Cliques/digitação em tarefas frequentes                                                            | `[~]`                                                                                                                                      | **Medido no navegador** (`esforco-da-tarefa.mjs`, `pointerdown`/`keydown` reais): achar cliente e abrir a ficha = **2 cliques + 7 teclas**; abrir pedido do topo = **1 clique**; ver vencidos = **1 clique**; `jornada-venda` = 5 cliques + 5 digitações. Régua corrigida duas vezes (`fill()` não conta tecla; primeiro link de Pedidos é "Criar pedido"). **Falta**: Inbox (lista virtualizada) e demais jornadas |
| 2.7  | Busca, ordenação, filtros, paginação, seleção em massa, persistência de preferências               | `[~]`                                                                                                                                      | **Medido no dedo** (`lista-busca-e-paginacao.mjs`): contatos 25 → 19 com "E2E" e 25 → 50 com "Carregar mais"; pedidos 49 → 11 com o termo, 47 linhas na Tabela e **47 selecionados** após selecionar todos. **Filtro não vai para a URL** nessas duas telas (decisão de produto, 4.5). **Falta**: ordenação por coluna e seleção em massa fora de Pedidos |
| 2.8  | Formulários (rótulos, validação, erros, preservação, salvar, cancelar, confirmar)                  | `[x]` | **Recusa**: 3 formulários vazios recusam, explicam e não gravam. **Caminho válido**: `contato-salva-email` e `jornada-venda` verdes em 12,2 s; e os 2 que faltavam medidos — renomear agent (mudou no banco e voltou) e criar token de API (criado, plaintext uma vez, revogado; `limpo=true`). **34 arquivos** com botão de envio, todos cobertos. **101 rótulos** ligados, 0 soltos |
| 2.9  | Estados (loading, skeleton, vazio, erro recuperável, sucesso, offline, permissão negada)           | `[~]` — onde cada estado **existe** está medido (143/143 com ≥1 sinal, V-07); vazio e permissão negada observados em execução, o resto não | **Offline medido em 5 telas** (`offline-e-erro.mjs`): SW ativo, app abre; contatos/inbox/financeiro com "Algo deu errado … Tentar novamente"; ação pausada avisa "Sem conexão" (V-42); Audit Log deixou de dizer "Nenhum log" com busca pausada (V-43). Pedidos offline **corrigido em 17/11/2026**: alerta "Sem conexão" + retry + revalidação na volta da rede; erro de consulta não vira lista vazia (`tests/unit/pedidos-offline.test.tsx`). Loading/vazio/erro/sucesso cobertos; permissão negada em 10 rotas. **Falta**: offline de escrita — frente 7 
| 2.10 | Feedback imediato e prevenção de duplicidade                                                       | `[~]`                                                                                                                                      | Feedback: **125 arquivos** usam `toast` (Sonner montado no layout raiz) e 26 `aria-live`. Duplicidade: 244 botões com guarda de pendência; `pedido-idempotencia` prova **ao vivo** dois POSTs → um pedido. **Falta**: `Idempotency-Key` só existe em 1 rota (limitação L4), e nenhum teste tenta a duplicata com clique duplo                                                                                                                                                                                                                                                                      |
| 2.11 | A11y: contraste, foco, teclado, leitor de tela, toque, zoom, reduced motion                        | `[~]`                                                                                                                                      | **Contraste**: 22 → **0 de 1.030** textos abaixo do mínimo (V-37/V-38). **Foco/teclado**: 301 paradas em 9 telas, 0 sem foco visível. **Movimento**: 0 de 20 animando com `prefers-reduced-motion`. **Zoom 200%** (720×450, 20 rotas): **0 overflow**, 0 erro de console. **Alvos**: p50 3 em 390 e 7,5 em 320 (sinal). **Falta**: leitor de tela real (NVDA/VoiceOver) |
| 2.12 | Casos extremos: nomes longos, valores extremos, tabelas grandes, ausência, latência, falha de rede | `[x]` | **Nome longo** (V-44): linha 97/177 px → **53 px** com truncate + title. **Valor extremo**: pedido de **R$ 99.999.999,99** e de **R$ 0,01** legíveis em 1440 e 320, 0 overflow. **Tabela grande**: +1.000 contatos, primeira linha em **526 ms**, **25** na tela e **50** após carregar mais — não carrega 1.000. Extremos fiscais cobertos por teste. `limpo=true` |
| 2.13 | Largura/overflow, sticky, modais, drawers em telas estreitas                                       | `[x]` | **Overflow 0 em 6 larguras** (320×20, 360×5, 430×5, 390×129, 834×32, 1440×129) **e em rotação** (844×390 × 6 telas). **Sticky**: cabeçalho visível na rotação. **Modais/drawers**: 32 modais e 85 abas em 390/834, 0 overflow. **Teclado virtual** (390×508 com campo focado): campo em 339–379, acima da dobra útil. Alvos < 40 px: p50 3 em 390, 7,5 em 320 (V-06, sinal) | **Overflow 0 em 6 larguras** (320 × 20 rotas, 360 × 5, 430 × 5, 390 × 129, 834 × 32, 1440 × 129): nenhuma rola na horizontal, 320 inclusive. **Alvos < 40 px**: p50 3 em 390 e **7,5 em 320** (máx 99 em `/app/pedidos`) — V-06 segue sinal. V-41: a varredura pedia `/app/lgpd`, rota que não existe, e registrava 404 do produto — corrigido no grupo. **Falta**: teclado virtual e rotação 
| 2.14 | Idioma, moeda, datas, timezone, convenções BR                                                      | `[~]`                                                                                                                                      | **Datas**: camada única (`useTagDeIdioma`) e guarda que cobra **idioma fixo E ausência** — 12 achadas, 11 corrigidas (V-25), 0 exceções: o PDF de puladas passou a seguir o idioma de quem pediu. **Moeda**: 271 usos de `comoMoeda` (helper único) contra 17 `toFixed(2)` + 16 `Intl.NumberFormat` manuais — sinal de divergência, não corrigido. **Fuso**: 142 referências a `timeZone`/`America/Sao_Paulo`. **Formato de data no `input[type=date]`** é comportamento nativo do navegador — V-04, **decisão de produto pendente**                                                                                    |
| 2.15 | Desempenho percebido e gráficos                                                                    | `[~]`                                                                                                                                      | **Medido em produção**: desktop p50 1.495 ms / p90 1.990 ms / máx 2.838 ms; celular p50 1.172 ms / p90 1.536 ms / máx 1.920 ms. **Trace** (12 telas × 2): desktop LCP máx 924 ms, CLS máx 0,026, TBT 0–17 ms; celular LCP máx 1.428 ms, CLS máx **0,037**, TBT máx 181 ms (sinal). **INP** (6 telas × 2): pior **96 ms** (celular 4×), 0 interações > 200 ms; kanban/ai sem interação roteirizável (declarado). CLS de `/app/financeiro` 0,130 → **0,000** (V-34). **Falta**: custo de render dos gráficos por canvas; INP de campo (CrUX) |
| 2.16 | Não padronizar mecanicamente onde a composição é intencional                                       | `[x]` | **7 exceções declaradas com motivo**: showcase `/design` (2 h1), título-identificador (`#A1B2C3`, `Orçamento #123`), admin sem trilha, paleta de categoria em gráfico (V-30), `h1` `sr-only` do Inbox, esqueleto do radar, duas cascas. **Padronizado com medida**: título 24 px/500 (117/119), um h1 por tela, 1 ação primária, 101 rótulos ligados, 35/35 botões de envio com progresso, contraste 22 → 0 |

Jornadas críticas (16)

| #   | Jornada                                                                         | Estado |
| --- | ------------------------------------------------------------------------------- | ------ |
| J1  | Login, recuperação, MFA, convite                                                | `[x]`  |
| J2  | Onboarding do tenant (funil, equipe, WhatsApp, Nuvemshop, IA)                   | `[x]`  |
| J3  | Captura, qualificação e atribuição de lead                                      | `[~]`  |
| J4  | Mover lead, agendar próximo passo, registrar resultado                          | `[x]`  |
| J5  | Buscar/criar contato, Customer 360, histórico                                   | `[x]`  |
| J6  | Inbox: receber, atribuir, responder, encaminhar, encerrar                       | `[~]`  |
| J7  | Handoff IA↔humano com contexto, controle e auditoria                            | `[x]`  |
| J8  | Agente: criar, publicar, pausar, rollback, conhecimento, testar, avaliar        | `[~]`  |
| J9  | Follow-up: configurar, enrollment, pausa, retomada, cancelamento, snooze, falha | `[x]`  |
| J10 | Pedido: criar, políticas, estoque, cobrança, comissão                           | `[x]`  |
| J11 | Compras, entrada de estoque, expedição, rota, motorista, fechamento             | `[x]`  |
| J12 | Financeiro, títulos, recebimentos, indicadores                                  | `[x]`  |
| J13 | Fiscal e falhas de sincronização                                                | `[~]`  |
| J14 | Import/export, LGPD, solicitações, auditoria                                    | `[~]`  |
| J15 | Atualizar, configurar integração, revisar erro, recuperar serviço               | `[x]`  |
| J16 | Pedido offline: fila, sync, conflito, rejeição                                  | `[ ]`  |

> **Evidência medida em 2026-11-16 (`13-jornadas.md`):** J1 23/23 · J2 14/14 · J3 14/15 (1 falha) ·
> J4 59 ✓ (2 pulados) · J5 3/3 · J6 7/9 (2 falhas) · J7 3/3 · J8 39 ✓ (4 pulados) · J9 20/20 ·
> J10 4/4 · J11 4/4 · J12 3/3 · J13 3/4 (1 falha) · J14 2/4 (1 falha, 1 pulado) · J15 18 ✓
> (1 falha esperada) · **J16 sem spec no `full`** — o `mobile-offline` roda só no job `apk-debug`.
> Quatro jornadas têm falha aberta e uma não tem cobertura; o 9.4 dizia `[x]`, agora diz `[~]`.

## Fase 3 — Identidade visual e design system

| #    | Item                                                                                                                    | Estado |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | ------ |
| 3.1  | Identidade própria, consistente, revista contra produto e marca real                                                    | `[~]`  |
| 3.2  | Tokens claros aplicados (canvas, surface, subtle, text, border, primary, hover, accent, success, warning, danger, info) | `[x]`  |
| 3.3  | Tokens escuros aplicados (idem + surface-raised)                                                                        | `[x]`  |
| 3.4  | Aliases semânticos (estado, interação, foco, seleção, disabled, overlay, gráficos)                                      | `[~]`  |
| 3.5  | Status nunca só por cor                                                                                                 | `[x]`  |
| 3.6  | Contraste WCAG 2.2 AA (texto, ícones, bordas de controle, foco)                                                         | `[x]`  |
| 3.7  | Tipografia Inter + IBM Plex Mono (licença/pipeline), sem dependência de rede no build                                   | `[~]`  |
| 3.8  | Escala tipográfica 13–16 / 20–28 / 24–32                                                                                | `[x]`  |
| 3.9  | Espaçamento base 4 (4,8,12,16,20,24,32,40,48,64)                                                                        | `[x]`  |
| 3.10 | Raios 6/10/14                                                                                                           | `[~]`  |
| 3.11 | Sombras sutis                                                                                                           | `[x]`  |
| 3.12 | Movimento 120–220 ms + reduced motion                                                                                   | `[x]`  |
| 3.13 | Ícones consistentes                                                                                                     | `[~]`  |
| 3.14 | Densidade controlada                                                                                                    | `[~]`  |
| 3.15 | Componentes globais padronizados (lista completa do prompt)                                                             | `[~]`  |
| 3.16 | Para cada componente: variantes, estados, tokens, teclado, a11y, responsividade, exemplos                               | `[~]`  |

> **Evidência (3.1 e 3.14, medida em 17/11/2026):** a marca resolve do banco
> (`lib/branding.ts:89-91`), mas `DEFAULT_APP_NAME = "NEXUS"` segue fixo
> (`:20`) e a catraca de marca não varre `mobile/` nem `android/` — onde o shell
> ainda traz nome e domínio do revendedor (`capacitor.config.ts`,
> `mobile/index.html`, `android/.../strings.xml`). Densidade: só a Aerada existe
> (`globals.css:102-106`), com as telas de 5 gráficos em Indicadores. Relatório:
> [`19-fase-8-seguranca-performance-a11y.md`](19-fase-8-seguranca-performance-a11y.md).

## Fase 4 — Shell e navegação

| #    | Item                                                                             | Estado |
| ---- | -------------------------------------------------------------------------------- | ------ |
| 4.1  | Navegação por tarefas e papéis, com descoberta de áreas avançadas                | `[~]`  |
| 4.2  | Agrupamento CRM/vendas/atendimento/operação/financeiro/insights/IA/equipe/config | `[x]`  |
| 4.3  | Sidebar, Topbar, busca, breadcrumb, tenant, notificações, atalhos padronizados   | `[x]`  |
| 4.4  | Comportamento expandido/recolhido, tablet, celular, modais, retorno              | `[~]`  |
| 4.5  | Deep links, redirects, hashes, filtros sem quebrar URLs                          | `[~]`  |
| 4.6  | Busca global distingue entidades e respeita acesso                               | `[~]`  |
| 4.7  | Command palette/atalhos só se descobríveis e acessíveis                          | `[x]`  |
| 4.A1 | Toda página com entrada e retorno                                                | `[~]`  |
| 4.A2 | Teclado e leitor de tela funcionam                                               | `[ ]`  |
| 4.A3 | Nenhuma rota órfã / deep link perdido                                            | `[~]`  |
| 4.A4 | Mobile não encobre conteúdo                                                      | `[ ]`  |

## Fase 5 — Redesign por módulo

| #    | Módulo                                             | Estado |
| ---- | -------------------------------------------------- | ------ |
| 5.1  | Público, login, onboarding, legal                  | `[~]`  | [`18-modulos-5.1-5.7.md`](18-modulos-5.1-5.7.md): 17 rotas e fluxos medidos; signout corrigido; Nuvemshop/WhatsApp deixam de declarar conexão sem backend |
| 5.2  | Dashboard, Meu Dia, busca, tarefas, agenda         | `[~]`  | [`18-modulos-5.1-5.7.md`](18-modulos-5.1-5.7.md): telas medidas; busca corrigida (falso vazio + falha silenciosa); saúde do Google e semana em 390 abertos |
| 5.3  | Contatos, leads, carteira, funis, Customer 360     | `[~]`  | [`18-modulos-5.1-5.7.md`](18-modulos-5.1-5.7.md): duplicata 409, lista sem mesclados, tempo de etapa por `stage_changed_at`, vazamento entre orgs corrigido |
| 5.4  | Inbox, atendimento, campanhas                      | `[~]`  | [`17-modulos-5.4-5.11.md`](17-modulos-5.4-5.11.md): matriz de canais e inbox medidos; faltam prioridade/SLA/macros/presença/reenvio |
| 5.5  | Radar, prospecção, recuperação, inteligência       | `[~]`  | [`18-modulos-5.1-5.7.md`](18-modulos-5.1-5.7.md): score e fontes medidos; TEMP removido e amostra de 25k declarada; explicação do score aberta |
| 5.6  | Pedidos, catálogo, estoque, compras, expedição     | `[~]`  | [`16-modulo-5.6.md`](16-modulo-5.6.md): 22 telas, ~56 handlers, regras de desconto/crédito/preço/estoque/sincronização medidas; **A1 corrigido** (patch de itens furava alçada/tabela/estoque), A2–A16 abertos com severidade. Auditoria de módulo feita; restam os consertos P0/P1. |
| 5.7  | Financeiro, títulos, comissões                     | `[~]`  | [`18-modulos-5.1-5.7.md`](18-modulos-5.1-5.7.md): mês no fuso da org, baixa parcial honesta, período inclusivo e KPIs no filtro |
| 5.8  | Fiscal                                             | `[~]`  | [`17-modulos-5.4-5.11.md`](17-modulos-5.4-5.11.md): regras e 8 achados; erro da SEFAZ e confirmação de emissão corrigidos |
| 5.9  | IA, agentes, conhecimento, follow-ups, automações  | `[~]`  | [`17-modulos-5.4-5.11.md`](17-modulos-5.4-5.11.md): capacidades medidas. **Injeção indireta (P0-5, 17/11/2026):** bloco residente declara que conteúdo de ferramenta/fonte é DADO, não ordem, em todo turno; gate `injecao-indireta.test.ts` (6 casos) congela as 12 tools (read-only × efeito com motivo escrito). [`24-injecao-indireta.md`](24-injecao-indireta.md). **Lacunas**: run trace na tela (API pronta no PR #460), `audit:run`, eval e teste adversário com modelo real |
| 5.10 | Equipe, configurações, integração, auditoria, LGPD | `[~]`  | [`17-modulos-5.4-5.11.md`](17-modulos-5.4-5.11.md): guards medidos; MFA do platform admin corrigido; tokens/equipe abertos |
| 5.11 | Administração global                               | `[~]`  | [`17-modulos-5.4-5.11.md`](17-modulos-5.4-5.11.md): impersonação/suspensão auditadas; scope e tenant suspenso abertos |

## Fase 6 — Backend, APIs, banco, regras comerciais

| #    | Item                                                                                                                                   | Estado |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 6.1  | Catálogo completo de APIs (métodos, payloads, authn, authz, validação, efeitos)                                                        | `[x]` | **417 handlers** com métodos, guarda, validação, efeitos e agora **payload + tabelas escritas** (`catalogo-de-apis.mjs`): 108 com chaves inline de `z.object`; mutações que leem corpo sem schema = 24 (11 multipart, 9 webhook, 4 com validação manual). **Corpo JSON sem nenhuma validação: 0**. Escrita por tabela: contacts 12, catalog_products 9, shipment_orders 8… Limite declarado: 102 mutações delegam a `lib/` e aparecem sem tabela |
| 6.2  | Consistência de contratos UI ↔ handlers ↔ serviços ↔ workers ↔ webhooks ↔ banco                                                        | `[~]` | **403 de 417** rotas respondem por `ok()`/`fail()`; **8** montam `Response` na mão — 1 é o `/api/mcp` (protocolo próprio) e 7 são binário/CSV (avatar, mídia, imagens, import, export), onde JSON não se aplica. **Falta**: contratos de payload por rota (o catálogo tem guarda e validação, não o schema de resposta) |
| 6.3  | RLS em tabelas sensíveis, isolamento, service-role, credenciais, upload, logs, erros                                                   | `[~]`  | **RLS medido**: 179 de 179 tabelas de `public` com RLS ligada, 0 sem; 300 políticas em `public` (305 com `storage`); 5 tabelas sem política são de plataforma (deny-all intencional, nomeadas); 96 tabelas com prova comportamental de isolamento cross-tenant, 73 em dívida conhecida (F-17). **Pendentes**: service-role por handler (209 dos 416 citam `createAdminClient` sem gate de `organization_id`), upload, logs, erros. [`12-migrations-e-rls.md`](12-migrations-e-rls.md) §5 **Gate de hoje**: `pnpm test:db` verde — 159 arquivos / **1.492 testes** de invariante (isolamento cross-tenant, RLS, governança) contra Postgres efêmero. |
| 6.4  | Endpoints duplicados/sem uso/legados — sem remover sem consumidores/telemetria                                                         | `[x]` | **417 rotas**, **35 sem chamador interno** (22 de integração: internal/mcp/cron/webhook; 13 internas). As 13 **todas declaradas em spec** — API antes da tela, não lixo. **0 duplicadas** (normalização rota→rota) e **0** com legacy/deprecated no nome. Nada removido: lista em `capturas/apis-sem-chamador.json` para consulta |
| 6.5  | Paginação, busca, filtros, ordenação, limites, rate limit, idempotência, retries, concorrência, timeout, cache, filas, observabilidade | `[~]` | **127 rotas** com `.limit`/`.range`/`Math.min`; **147** com teto; **rate limit em 3** handlers (login/signup ficam em Server Actions e o dispatcher tem o próprio); **Idempotency-Key em 2**. **80 GETs de lista sem teto no handler** — F-30; **medido em 17/11/2026 após a fatia: 79**. `/ai/followups/enrollments` agora pagina (`limit` 200/teto 500, `offset`, `meta.has_more`/`next_offset`, ordem total por `updated_at, id`) e `/admin/usage` conta com `count: "exact", head: true` por org (zero linha para contar), com `llm_calls` lida uma vez para total e série. Instrumento: **contagem no banco: 19 rotas**. Teste de regressão: `tests/api/followup-enrollments.test.ts` (página/teto/sinal) e `tests/unit/admin-usage-conta-sem-baixar-linhas.test.ts` (head por tabela, uma passada em `llm_calls`). Restam 79 listas, por ordem de crescimento |
| 6.6  | Migrations/baseline como histórico; aditivas, reversíveis, com rollback; não reescrever histórico                                      | `[~]`  | A cadeia **é** histórico, e está provado que não reproduz o schema (F-09: 35 de 292 aplicam; 257 falham por pré-requisito; 10 stubs `SELECT 1;`). O caminho de instalação/atualização é o `baseline.sql`, idempotente e re-aplicável sobre dados. **Reversibilidade e rollback não foram auditados** — aberto para a Fase 10 **Medido hoje**: `install ok` e `update ok` (zero erro na re-aplicação) no gate `test:db`; F-09 (a cadeia não reproduz o schema) segue aberto. |
| 6.7  | Estratégia de migração local/CI/self-host; corrigir placeholder após descobrir fluxo                                                   | `[~]`  | **Placeholder corrigido** e estratégia declarada: schema entra pelo `baseline.sql` (`install.sh`/`update.sh`), `db:migrate` aplica + verifica, e **desde 17/11/2026 o `deploy.sh` aplica o baseline e VERIFICA antes do `up -d`** (antes ele não mutava schema e subia imagem nova contra banco sem objeto novo; o gate é `tests/shell/deploy-aplica-schema.test.sh`, 10 casos com dublês). **`db:reset` corrigido** em 16/11: recria `public`/`private`, restabelece o DEFAULT ACL do Supabase antes do baseline e aplica + verifica (`scripts/db/resetar-schema.sh`, gate `tests/unit/db-reset-aplica-baseline.test.ts`). A cadeia em si continua sem reproduzir o schema (Fase 10) **Medido hoje**: o gate roda install → update → invariantes num pg15 efêmero, do zero, em ~5 min. |
| 6.8  | Documentar tabelas, entidades, relações, exclusão, retenção, soft delete, constraints, índices, triggers, jobs                         | `[~]` | **Documento gerado** (`15-tabelas-e-relacoes.md`): 180 tabelas com colunas, dono, FKs e documentação; 170 de tenant, 10 globais. **Exclusão**: 0 soft delete; 315 FKs (215 cascade, 88 set null, 3 restrict); LGPD anonimiza em cascata (`/api/v1/lgpd/anonymize`). **Retenção**: 6 janelas com piso em `lib/retencao/politica.ts` (auditoria 1825 d = L-10), poda por 4 RPCs + rastro em `retention.sweep_run`. **Falta**: **104 de 180** tabelas sem `COMMENT ON TABLE` — é migration (baseline + MANIFEST), não doc |
| 6.9  | Backups, atualização, restauração, health checks, instalação em VPS                                                                    | `[~]` | **Kit medido**: `install.sh`, `update.sh` (7 etapas, backup antes do banco), `backup.sh` (pg_dump pela conexão de schema, **recusa dump < 4 KiB**, + volume waha-data), `restore.sh` (exige digitar RESTAURAR, `psql_run`), `healthcheck.sh`/`diagnostico.sh` (`/api/v1/health` de dentro da rede), `agent.sh`. **`pnpm test:shell` verde hoje** (validadores do kit, isolamento de crontab, sidecar fiscal). **F-32 medido em 17/11/2026**: ensaio ponta a ponta (install → seed → backup → drop → restore → linhas/RLS/isolamento) **passou**, e achou um defeito real — dump com `--no-privileges` restaurava **sem os GRANTs** e o role do app recebia `permission denied`. Corrigido: `pg_dump_run` sem `--no-privileges`, e `restore.sh` verifica `has_table_privilege` e re-aplica o baseline para backup antigo, falhando alto se ainda faltar. Evidência: [`25-ensaio-de-restauracao.md`](25-ensaio-de-restauracao.md) + `evidencias/restore/`. **Ainda aberto (`[!]`)**: uploads/storage fora do backup, rotação do storage e sequência restore→health com app real |
| 6.10 | SLIs e logs úteis sem segredo/dado pessoal                                                                                             | `[~]` | **Logs medidos**: **0** `console.log` fora de `lib/logger.ts` (as 5 ocorrências são 3 comentários e o próprio logger); **0** chamada com chave de dado pessoal/segredo — as 5 que casavam "telefone/email/token" registram id, booleano, hash ou mensagem, nunca o valor (`lgpd-export-worker` usa `sha256(detail)`). Gate novo em `tests/unit/log-sem-dado-pessoal.test.ts` (2.030 casos), testado com `{ phone }` plantado. `lib/sentry/scrub.ts` com teste. **Falta**: SLIs/SLOs definidos — o produto tem log estruturado e Sentry, não indicadores de serviço com meta |
| 6.A1 | Nenhum endpoint perde comportamento sem decisão e compatibilidade                                                                      | `[x]`  |
| 6.A2 | RLS testada em ≥2 tenants                                                                                                              | `[x]`  | `tests/invariants/rls-isolation.test.ts` semeia 2 organizações com 1 usuário cada, simula JWT com `set_config('request.jwt.claims')`, faz `set role authenticated` e conta linhas cross-tenant **com controle positivo** — 73 tabelas; mais 23 em `PROVA_PROPRIA` com teste próprio. Total **96 tabelas** com prova comportamental. `pnpm test:db`: 159 arquivos, 1492 testes passando. [`12-migrations-e-rls.md`](12-migrations-e-rls.md) §5.2                                          |
| 6.A3 | Operações externas/financeiras com idempotência, auditoria, repetição tratada                                                          | `[ ]`  |
| 6.A4 | Migrações testadas desde o baseline e em atualização                                                                                   | `[x]`  | **Testadas, com resultado negativo registrado**: instalação em Postgres 15.19 limpo (exit 0), update sobre 10 linhas semeadas (dados iguais antes e depois), e replay das 292 migrations contra o baseline. O replay reprovou a cadeia (F-09) — o teste existe e o veredito é o achado, não a ausência de teste. [`12-migrations-e-rls.md`](12-migrations-e-rls.md) §2 e §4                                                                                                              |
| 6.A5 | Runbook: deploy, migração, health, backup, recuperação, atualização                                                                    | `[ ]`  |

## Fase 7 — Web responsiva, PWA, Capacitor, offline

| #    | Item                                                                                             | Estado |
| ---- | ------------------------------------------------------------------------------------------------ | ------ |
| 7.1  | Larguras 320, 360, 390, 430, 768, 1024, 1280, 1440                                               | `[~]`  |
| 7.2  | Zoom, orientação, teclado virtual, safe areas                                                    | `[~]`  |
| 7.3  | Distinguir offline pós-sessão de boot offline do zero                                            | `[~]`  |
| 7.4  | Documentar páginas/operações offline                                                             | `[~]`  |
| 7.5  | Cache, validade, update, mensagens, integridade, dados privados, logout, limpeza                 | `[~]`  |
| 7.6  | Perda/retorno de rede, fila, retry, conflitos, duplicidade, rejeição                             | `[~]`  |
| 7.7  | Não exibir como sincronizado o que é local                                                       | `[~]`  |
| 7.8  | Inspecionar `mobile/`, Capacitor, Android, SQLite, fila, sync, identidade, links, endpoint       | `[~]`  |
| 7.9  | Preservar captura offline e integridade da fila                                                  | `[~]`  |
| 7.10 | Parametrização segura de domínio/marca                                                           | `[~]`  |
| 7.11 | Instalação, ciclo de vida, rede, storage, update, permissões, teclado, leitor, notificações, APK | `[~]`  |
| 7.12 | Determinar suporte a iOS antes de incluir                                                        | `[~]`  |
| 7.A1 | Matriz offline publicada e fiel                                                                  | `[ ]`  |
| 7.A2 | Nenhum pedido desaparece em falha/rejeição                                                       | `[~]`  |
| 7.A3 | Estados pendente/enviando/sincronizado/rejeitado distinguíveis e recuperáveis                    | `[~]`  |
| 7.A4 | APK mantém funções; branding/servidor configuráveis e testados                                   | `[ ]`  |

> **Evidência (7.7, 7.10 e 7.12, medida em 17/11/2026):** nenhum rótulo de
> "sincronizado" foi encontrado sem confirmação do backend (pedidos, Nuvemshop,
> expedição, offline) — falta gate contra toast otimista novo. `APP_URL` é
> configurável, com default `http://localhost:3000` e fallback silencioso no
> callback da Nuvemshop; o shell mobile tem domínio fixo. **iOS não existe**:
> não há `ios/` nem `@capacitor/ios`, e o PWA iOS instala sem ícone próprio.
> Relatório: [`19-fase-8-seguranca-performance-a11y.md`](19-fase-8-seguranca-performance-a11y.md).

## Fase 8 — Segurança, privacidade, desempenho, acessibilidade

| #   | Item                                                                                                                                         | Estado |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 8.1 | Auditar authn, sessão, MFA, authz, RLS, secrets, CORS, CSRF, XSS, SSRF, upload, webhooks, rate limits, dependências, logs, IA, multi-tenancy | `[~]`  |
| 8.2 | Limites de exposição de dados e segurança administrativa                                                                                     | `[~]`  |
| 8.3 | Baseline de carregamento, navegação, queries lentas, listas, gráficos, bundle, imagens, fontes, workers                                      | `[~]`  | **Bundle — uma frente fechada em 17/11/2026**: `gpt-tokenizer` (~1 MB gz) era import estático no contador de tokens do editor de agente e ia em toda visita; agora é `import()` dentro do efeito. Medido no build: o chunk do tokenizador tem **1.034.435 bytes gz** e **não** aparece entre os 26 chunks do manifesto inicial da rota (`total 333.816 gz ≈ 326 KB`); gate `token-counter-carrega-sob-demanda.test.tsx` (2 casos). **Maplibre `-dev` corrigido em 17/11/2026**: o bundler copiava `maplibre-gl-dev` (2,4 MB) + `maplibre-gl-worker-dev` (1,1 MB) para `.next/static/media` porque a lib escolhe o worker em runtime; `scripts/limpar-assets-dev-do-maplibre.mjs` roda no `pnpm build` e remove **3,5 MB** que nenhuma requisição pede (gate `maplibre-dev-fora-do-build.test.ts`, 3 casos). **Inbox medido hoje: 368.212 gz (~360 KB)** — ainda acima do budget de 250 KB; cortar exige fatiar a tela (sidebar/conversa) com prova e2e, não é ajuste de import. **Falta**: Inbox, imagens/fontes e workers |
| 8.4 | Otimizar só com baseline → gargalo → resultado                                                                                               | `[~]`  |
| 8.5 | WCAG 2.2 AA, teclado, foco, semântica, contraste, leitores, erros, toque, reduced motion                                                     | `[~]`  |

> **Evidência (Fase 8, medida em 17/11/2026):** `pnpm audit --prod` caiu de
> **1 crítica / 7 altas / 20 moderadas** para **0 / 1 / 1** (a alta restante,
> `picomatch`, não tem versão corrigida publicada). Performance medida no build:
> Inbox **386 KB gz** (budget 250), `gpt-tokenizer` **1007 KB gz** estático nas
> telas de agente, maplibre `-dev` **5,3 MB**, sem baseline de Core Web Vitals.
> A11y: axe cobre 8 telas, só na main, com tags WCAG 2.0/2.1 — sem foco em
> diálogo nem reflow. Relatório: [`19-fase-8-seguranca-performance-a11y.md`](19-fase-8-seguranca-performance-a11y.md).

## Fase 9 — Testes e qualidade

| #   | Item                                                                               | Estado |
| --- | ---------------------------------------------------------------------------------- | ------ |
| 9.1 | Unitários (domínio, cálculos, validação, formatação, máquina de estados, sync)     | `[x]` | **650** arquivos em `tests/unit` + **253** em `lib/` + 7 em `components/` (1.144 `*.test.*`); `pnpm test:unit` **988 arquivos / 16.921 testes** verdes hoje. Cobre domínio, cálculos, validação, formatação e máquina de estado |
| 9.2 | API (authn, authz, validação, tenant, idempotência, erros, paginação, limites)     | `[x]` | **46** `route.test.ts` junto ao código + **6** em `tests/api`, dentro do `test:unit`. Cobrem authn/authz, validação, tenant, erro e paginação por handler |
| 9.3 | Banco/invariantes (constraints, RLS, migrations, baseline, jobs, isolamento)       | `[x]` | **159** arquivos em `tests/invariants`; `pnpm test:db` **1.492 testes** verdes com baseline aplicado em install **e** update (constraints, RLS, isolamento, jobs) |
| 9.4 | Jornadas E2E (caminhos críticos, permissões, falhas, recuperação)                  | `[~]` | **99** specs Playwright; smoke **32 verdes** hoje contra o build; as **16 jornadas (J1–J16)** foram medidas com **254 testes** e as 7 falhas abertas uma a uma |
| 9.5 | Visual (snapshots por tema/breakpoint, revisão sem aprovação cega)                 | `[~]` | **Zero snapshot visual**: nenhuma spec usa `toHaveScreenshot`/`toMatchSnapshot`. A regressão visual hoje depende das capturas do instrumento de auditoria, que não é gate. **Falta**: snapshots por tema/breakpoint |
| 9.6 | Acessibilidade (axe + teclado/foco + semântica)                                    | `[~]` | `AxeBuilder` em **3 de 100** specs (auth, rbac-roles, axe-telas-principais — 8 telas) (`auth`, `rbac-roles`); teclado/foco (301 paradas, 0 sem foco) e contraste (22 → 0) medidos por instrumento, não por gate. **Falta**: axe nas demais telas |
| 9.7 | Mobile/offline (banco local, fila, conflitos, rede, retry, rejeição, persistência) | `[~]`  |
| 9.8 | Operação (instalação, atualização, health, backup, restauração)                    | `[~]` | Kit do self-host medido no 6.9: install/update/backup/restore/health com `pnpm test:shell` verde. **Ensaio de restauração feito em 17/11/2026** (`scripts/auditoria/ensaio-de-restore.sh`): install → seed → backup → drop → restore → linhas, 179/179 RLS, privilégio do app e isolamento cross-tenant — **passou**, e achou o defeito dos GRANTs (corrigido). **Falta**: uploads/storage no backup e restore→health com app real |
| 9.9 | Dados sintéticos, ambientes isolados, guardrail de banco remoto intacto            | `[x]` | Guardrail de banco remoto no loader (`recusarSeRemotoVindoDoArquivo`, lança em vez de avisar): **31 dos 33** seeds usam o loader, **1** tem guarda própria com teste, **1** é placeholder. Destino remoto só por decisão explícita |

## Fase 10 — Execução progressiva

| #    | Item                                                                                          | Estado |
| ---- | --------------------------------------------------------------------------------------------- | ------ |
| 10.1 | Plano priorizado após inventário/auditoria                                                    | `[x]`  |
| 10.2 | P0 — segurança, perda/corrupção, isolamento, operações críticas, bloqueio de deploy           | `[~]`  |
| 10.3 | P1 — CRM, vendas, inbox, pedidos, mobile; erros sem recuperação; a11y grave                   | `[~]`  |
| 10.4 | P2 — consistência visual, densidade, tabelas, navegação, relatórios, automações               | `[~]`  |
| 10.5 | P3 — capacidades ausentes confirmadas e conveniência                                          | `[~]`  |
| 10.6 | Por item: impacto, evidência, dependências, risco, arquivos, estratégia, validação, conclusão | `[x]`  |
| 10.7 | Commits lógicos só quando o fluxo pedir; preservar mudanças preexistentes                     | `[x]`  |

> **Evidência (Fase 10):** o plano priorizado está em
> [`20-plano-priorizado.md`](20-plano-priorizado.md) — **5 P0, 12 P1, 10 P2 e 10
> P3**, cada um com impacto, evidência, dependências, risco, arquivos,
> estratégia, validação e critério de conclusão. A execução entra por P0
> (cross-tenant, migrations silenciosas, trilha da IA) — a falha **crítica** de
> dependência já foi fechada na 1.54.1. `10.7`: ≈50 commits na branch
> `docs/auditoria-aaa`, todos pushados; os arquivos locais do usuário
> (`.repara-mercos*.mjs`, `.probe-cliente*.mjs`, `docs/PROMPT-V5-*.md`) foram
> preservados fora do git.

## Definition of Done global (12)

| #       | Critério                                                                                                      | Estado |
| ------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| D1      | 100% das rotas no inventário e auditadas                                                                      | `[~]`  | Inventário gerado; **37 de 156** telas com captura e 129 estáticas medidas — auditoria em andamento.                                                                                                                                                       |
| D2      | Subtelas/modais/abas/fluxos/estados com evidência ou bloqueio                                                 | `[~]`  |
| D3      | Toda capacidade classificada, sem duplicar                                                                    | `[ ]`  |
| D4      | Jornadas críticas com critério de sucesso e validação                                                         | `[~]`  | 12 `[x]`, 4 `[~]`, 1 `[ ]` (J16); mapa e falhas em `13-jornadas.md` |
| D5      | Design system, tokens, temas, navegação, componentes consistentes                                             | `[~]`  |
| D6      | Desktop, tablet, mobile, PWA, Capacitor, offline testados conforme suporte real                               | `[~]`  |
| D7      | Segurança, isolamento, regras, privacidade, integridade preservados                                           | `[~]`  |
| D8      | Lint/typecheck/build/testes passam ou falha documentada e atribuível                                          | `[x]`  |
| D9      | Migrações, instalação, atualização, recuperação documentadas e validadas                                      | `[~]`  | Migrações, instalação e atualização **documentadas e validadas** ([`12-migrations-e-rls.md`](12-migrations-e-rls.md)). **Recuperação medida em 17/11/2026**: ensaio de restore ponta a ponta com dados, RLS e isolamento ([`25-ensaio-de-restauracao.md`](25-ensaio-de-restauracao.md)); achou e corrigiu a perda de GRANTs. **Falta**: storage/uploads e rollback de schema |
| D10     | Sem erro crítico de a11y, overflow, perda de dados, ação sem feedback, tela sem erro recuperável              | `[~]`  |
| D11     | Documentação, inventário, capturas e decisões fiéis ao código                                                 | `[~]`  | Inventário fiel por construção (gerado); restante pendente.                                                                                                                                      |
| D12     | Nenhuma funcionalidade removida sem justificativa/compat/migração                                             | `[x]`  | Nada removido.                                                                                                                                                                                   |
| D-Final | Relatório final (escopo, mudanças, cobertura, testes, pendências, riscos, links) — parágrafo após os 12 itens | `[ ]`  |

---

# PARTE 3 — REGISTRO DE EXECUÇÃO (documento vivo)

## 3.1 Comandos reais do repositório (medido em `package.json`, 15/11/2026)

```bash
pnpm dev            # next dev
pnpm build          # next build
pnpm lint           # eslint .
pnpm typecheck      # tsc --noEmit -p tsconfig.typecheck.json
pnpm test:unit      # vitest run
pnpm test:db        # invariantes de banco + gate do baseline (Docker)
pnpm test:e2e       # playwright test
pnpm test:e2e:smoke | :critical | :full   # suítes do CI
pnpm test:e2e:fiscal
pnpm test:journeys  # playwright -c tests/journeys/playwright.config.ts
pnpm test:shell     # gate do kit de instalação
pnpm gov:verify     # typecheck + lint + test:unit
pnpm format:check   # prettier --check
pnpm db:migrate     # aplica supabase/baseline.sql + VERIFICA o schema (sai 1 se faltar objeto)
pnpm db:verificar   # só confere, não escreve (modo de deploy)
pnpm db:reset       # recria o schema pelo baseline (NÃO usa a cadeia) — exige --forcar fora de host local
```

## 3.2 Inventário medido (15/11/2026, base `9f8e6faa`)

| Medida                        | Valor     | Como                                                                                  |
| ----------------------------- | --------- | ------------------------------------------------------------------------------------- |
| `page.tsx`                    | **156**   | `find app -name page.tsx \| wc -l`                                                    |
| Telas (com JSX)               | **143**   | script                                                                                |
| Resolvers/redirects (sem JSX) | **13**    | script                                                                                |
| `route.ts`                    | **418**   | `find app -name route.ts` (416 em `app/api`, + `app/auth/confirm`, + `app/icone-512`) |
| Layouts                       | **13**    | script                                                                                |
| Migrations                    | **292**   | `ls supabase/migrations/*.sql`                                                        |
| Arquivos de teste             | **1.121** | script (por diretório na Parte 2, item 1.8)                                           |

Resolvers identificados: `/`, `/admin`, `/app/financeiro`, `/app/inbox/:id`, `/app/leads/:id`,
`/app/metrics`, `/app/prospeccao`, `/app/recuperacao`, `/app/settings/canal-oficial`,
`/app/settings/templates`, `/app/settings/tenant/whatsapp`, `/app/titulos`, `/onboarding`.

## 3.3 Decisões

| Data  | Decisão                                                                                                                                                   | Razão                                                                                                                                                                                           |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15/11 | Inventário é **gerado por script**, nunca escrito à mão                                                                                                   | Prosa envelhece; o prompt exige refazer contagens.                                                                                                                                              |
| 15/11 | Página com JSX é **tela** mesmo com `redirect()` condicional                                                                                              | Guard de permissão não transforma tela em resolver; só quem redireciona sem JSX é resolver.                                                                                                     |
| 15/11 | Este arquivo tem **autoridade sobre qualquer `.md`**                                                                                                      | Ordem do usuário (15/11/2026).                                                                                                                                                                  |
| 16/11 | O **preâmbulo** do Postgres descartável vive em **um arquivo** (`scripts/sql/preambulo-supabase-descartavel.sql`), consumido pelo gate e pelo instrumento | Dois textos divergiram e o instrumento inventou 2 migrations "quebradas" (0014/0017) + 1 publicação ausente (0025). Instrumento que mede outro universo produz achado falso com cara de achado. |
| 16/11 | `db:migrate` aplica o **`baseline.sql`**, não `supabase db push`                                                                                          | A cadeia de 292 migrations não reproduz o schema (10 stubs `SELECT 1;`), e `db push` marcaria migrations como aplicadas sobre schema parcial.                                                   |
| 16/11 | `deploy.sh` **não** roda `pnpm db:migrate`                                                                                                                | A imagem de runtime não tem `pnpm`; o passo falhava sempre e o `\|\| true` escondia. O schema é do kit.                                                                                         |
| 16/11 | Contagem de RLS por **texto** é rotulada como texto                                                                                                       | O baseline liga RLS por laço (`execute format(...)`); a contagem textual dizia 142/38 quando o banco diz 179/0.                                                                                 |
| 17/11 | **Parte 1 volta a ser verbatim**: a evidência da Fase 10 havia sido inserida dentro da Parte 1, trocando `### Definition of Done global` por um bloco novo — e quebrou o hash. A evidência fica na Parte 2/3; a Parte 1 só muda quando o usuário muda o prompt | O gate `verificar-prompt.ts` é a lei: adição de auditoria vai para a Parte 2/3, nunca para o texto verbatim |
| 16/11 | **156 telas = cobertura de ROTAS**, não auditoria de telas                                                                                                | Ver a correção de alegação no topo da Fase 1: subtelas, estados e jornadas seguem sem execução.                                                                                                 |

## 3.4 Riscos e lacunas abertos

| #   | Risco/lacuna                                                                                                                                                                   | Impacto                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | `db:migrate` **corrigido** e `db:reset` **corrigido** (não passa mais pela cadeia)                                                                                             | Resta a cadeia em si (F-09): `supabase db push` ainda a aplicaria. Fase 10.                                                                                                                                                                                                                                                                                                                                                                                |
| L2  | **209 de 416** handlers de `app/api/**` citam `createAdminClient`/`SUPABASE_SERVICE_ROLE` no próprio arquivo, sem gate automático de `organization_id`                         | Risco de vazamento cross-tenant; Fase 6/8. (A linha dizia "89 de 169" — número de um repo menor.)                                                                                                                                                                                                                                                                                                                                                          |
| L6  | Cadeia de 292 migrations não reproduz o schema: 35 aplicam, 257 falham, **71** objetos distintos ausentes (81 nomes crus — 10 sem schema repetiam objeto já contado), 10 stubs | F-09 (P0). Instalação/atualização pelo `baseline.sql` funcionam — o caminho de migrations, não.                                                                                                                                                                                                                                                                                                                                                            |
| L7  | 73 tabelas tenant-aware **sem prova comportamental** de isolamento (`DEBITO_CONHECIDO`)                                                                                        | RLS ligado e política presente, mas nenhum teste cross-tenant. Gate impede crescimento; não resolve. F-17.                                                                                                                                                                                                                                                                                                                                                 |
| L8  | `pnpm test:shell` **verde** (395 ✓, 0 ✗)                                                                                                                                       | Era 1 falha no macOS: o `load_env` do kit usava um replacement entre aspas que o bash 3.2 não desescapa. Corrigido em `_common.sh`, provado nos dois bash. F-19.                                                                                                                                                                                                                                                                                           |
| L3  | Duas specs E2E fora do CI (`vps-fresh-onboarding`, `inbox-tempo-real`)                                                                                                         | Jornada de instalação fresca sem gate; Fase 9.                                                                                                                                                                                                                                                                                                                                                                                                             |
| L4  | Crons e MCP sem rate limit                                                                                                                                                     | Abuso/DoS; Fase 8.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| L5  | `git ls-files 'app/**/page.tsx'` devolve 155, mas o checkout tem **156**                                                                                                       | **Resolvido**: o glob `**/` não casa diretório zero, então `app/page.tsx` ficava de fora. `git ls-files 'app/**/page.tsx' app/page.tsx` = 156, igual a `find`. Não é divergência de código.                                                                                                                                                                                                                                                                |
| L9  | A matriz de telas × estados media só o `page.tsx`: **12 colunas em `—`** nas 156 linhas e `error.tsx` ✓ em todas                                                               | **Corrigido**. 89/156 telas delegam a UI a `_client`/`_components`; o `app/error.tsx` global marcava todas; o regex lia comentário. Agora mede o segmento + imports locais, sem comentário, com `próprio`/`herdado`: **143 de 143** com ≥1 sinal. F-20/V-07, gate de 11 casos                                                                                                                                                                              |
| L10 | O lote de captura gravou **149 de 168** rotas como `ERR_CONNECTION_REFUSED` — o servidor caiu, não as telas                                                                    | **Corrigido**: o instrumento espera o servidor, reconhece queda, repete uma vez e registra `reconexoes`; `--faltantes` pula rota dinâmica **com motivo escrito**. F-21                                                                                                                                                                                                                                                                                     |
| L11 | "42 telas capturadas" não fechava com arquivo nenhum                                                                                                                           | **Corrigido para 37**: 57 arquivos = 37 rotas em desktop + as mesmas 20 em celular (20 ⊂ 37). Contado por `ls docs/auditoria/capturas/*.png`, não por memória                                                                                                                                                                                                                                                                                              |
| L12 | `networkidle` como condição de sucesso reprovava tela que **renderiza**: `/admin/platform-admins` estourava 45 s com `h1` correto e API 200 em 191 ms                          | **Corrigido**: o Next prefetcha os `<Link>` do menu (67 requisições em 8 s, 25 `fetch`) e a rede nunca fica 500 ms quieta. Agora é `domcontentloaded` + 4 s de assentamento opcional, e cada medição grava `assentou`. V-10                                                                                                                                                                                                                                |
| L13 | `/admin/**` respondia "Acesso negado" — `e2e-dono` não estava em `platform_admins`                                                                                             | **Corrigido pelo caminho documentado** (`scripts/seed-e2e-system-update.ts`, o mesmo do job `e2e`). A área de admin só é auditável com o dono promovido; instalação fresca sem ninguém promovido tem a área inalcançável **por desenho**. V-11                                                                                                                                                                                                             |
| L14 | **3 rotas** com campo visível sem nome acessível na varredura de 258 medições; o detector também acusava o `BubbleSelect` do Radix (1×1 px, `aria-hidden`)                     | **Corrigido e classificado**: das 3, **2 eram falso positivo** (o `<select>` nativo oculto que o Radix injeta no `<form>`; o controle real é `button[role=combobox]` com `<label for>`) e **1 era real** — `/app/audit` tinha 4 `<label>` sem `htmlFor` e campos sem `id`. Corrigidos os 4 + 2 que só o gate estático via (`CapturasTab`, rótulo visível ≠ nome acessível). Gate novo analisa os **101** `<label>` de `app/`+`components/`: 0 soltos. V-15 |

## 3.5 Artefatos produzidos

| Arquivo                                                                 | O quê                                                                                                                                                                                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/auditoria/PROMPT-MESTRE-AAA.md`                                   | Este arquivo: prompt íntegro + checklist + registro.                                                                                                                                                     |
| `scripts/auditoria/inventario.ts`                                       | Gerador do inventário (rotas, APIs, layouts, migrations, testes).                                                                                                                                        |
| `docs/auditoria/inventario.json`                                        | Inventário estruturado (fonte para consultas).                                                                                                                                                           |
| `docs/auditoria/inventario-rotas.md`                                    | Inventário legível (tabelas por tipo).                                                                                                                                                                   |
| `docs/auditoria/00-linha-de-base.md`                                    | Fase 0: estado do repo, comandos, baseline medido, guardrails e 8 achados.                                                                                                                               |
| `scripts/auditoria/reconciliar-rotas.ts`                                | Cruza a lista de rotas do prompt com o checkout.                                                                                                                                                         |
| `docs/auditoria/02-reconciliacao-rotas.md`                              | Resultado: 156 rotas do prompt, 0 ausentes, 0 acréscimos.                                                                                                                                                |
| `scripts/auditoria/verificar-prompt.ts`                                 | Gate de integridade do texto da Parte 1.                                                                                                                                                                 |
| `docs/auditoria/prompt-mestre.sha256`                                   | Hash do prompt (301 linhas).                                                                                                                                                                             |
| `scripts/discord/notificar.ts`                                          | Posta no canal de atualizações (embed, cor por nível, URL nunca impressa).                                                                                                                               |
| `scripts/discord/configurar-servidor.ts`                                | Blueprint idempotente do servidor Discord (canais, cargos, permissões).                                                                                                                                  |
| `docs/auditoria/12-migrations-e-rls.md`                                 | As 6 perguntas de banco: reprodução com versões, causa de cada falha, diff dos dois caminhos, instalação **e** update, RLS + isolamento, `db:migrate`.                                                   |
| `scripts/auditoria/replay-migrations.sh`                                | Os dois caminhos de schema medidos lado a lado, com classificação de cada falha.                                                                                                                         |
| `scripts/auditoria/inventario-schema.sql`                               | Uma linha por objeto (`tipo<TAB>objeto`) — o mesmo SELECT nos dois bancos, `diff`.                                                                                                                       |
| `scripts/auditoria/diagnostico-rls.sql`                                 | RLS desligado, política `using (true)`, predicado sem org, comando sem política.                                                                                                                         |
| `scripts/sql/preambulo-supabase-descartavel.sql`                        | Fonte única do banco descartável (gate + instrumento).                                                                                                                                                   |
| `scripts/db/aplicar-schema.sh`                                          | `db:migrate`/`db:verificar` real: aplica baseline, verifica, falha em conexão.                                                                                                                           |
| `scripts/test-update-com-dados.sh`                                      | Prova que o update re-aplica o baseline **sobre dados** sem perder linha.                                                                                                                                |
| `docs/auditoria/evidencias/replay-migrations/`                          | Evidência bruta: ambiente, console, 257 logs de falha, inventários, diff, RLS.                                                                                                                           |
| `scripts/auditoria/captura-visual.mjs`                                  | Instrumento da Fase 2: abre a rota em navegador real, mede `<h1>`, overflow, alvos de toque, campos sem rótulo, título, erros de console/5xx e tempo. `--area`, `--perfil`, `--larguras`, `--faltantes`. |
| `tests/unit/log-sem-dado-pessoal.test.ts`                          | Gate: nenhum `console.log` fora do logger e nenhuma chave de PII/segredo no contexto de `logger.*` (2030 casos, testado com `{ phone }` plantado). |
| `scripts/auditoria/dados-documentados-e-retencao.mjs`              | Gera `15-tabelas-e-relacoes.md` do `baseline.sql`: colunas, dono (tenant × plataforma), FKs com ação de exclusão, `COMMENT ON TABLE`, e os crons de retenção com as RPCs de poda. |
| `scripts/auditoria/catalogo-de-apis.mjs`                           | Segunda metade do catálogo: chaves do payload (`z.object` inline), tabelas LIDAS e ESCRITAS por handler (`.from` + `.insert/.update/.upsert/.delete` na mesma cadeia) e mutações que leem corpo sem schema. Artefato: `capturas/catalogo-de-apis.json`. |
| `scripts/auditoria/superficie-de-api.mjs`                          | Conta por rota: paginação, teto, rate limit, idempotência, wrapper canônico vs `Response` na mão e uso de service-role. Artefato: `capturas/superficie-de-api.json`. |
| `scripts/auditoria/apis-sem-chamador.mjs`                          | Cruza as 417 rotas com todo o código que não é rota: quem não tem chamador é listado, separando integração (internal/mcp/cron/webhook) de interno. Detecta duplicata por normalização. Artefato: `capturas/apis-sem-chamador.json`. |
| `scripts/auditoria/teclado-virtual-e-rotacao.mjs`                   | Mede rotação (844×390) e teclado virtual (390×508 com campo focado): overflow, cabeçalho visível e se o campo fica acima da dobra útil. Artefato: `capturas/teclado-virtual-e-rotacao.json`. |
| `scripts/auditoria/valores-extremos-e-tabela-grande.mjs`            | Cria pedido de R$ 99.999.999,99 e de R$ 0,01 e 1.000 contatos no banco E2E; mede legibilidade, overflow, tempo até a primeira linha e paginação; apaga e confere (`limpo`). |
| `scripts/auditoria/caminhos-validos-restantes.mjs`                | Cria e desfaz: renomeia um agent (e volta) e cria um token de API (revoga em seguida), conferindo o banco. Redige o plaintext do token no artefato. |
| `scripts/auditoria/rotas-com-fixture.mjs`                          | Cria a fixture mínima de `ai_routers`, `lgpd_requests` e `incidents`, mede as 4 rotas que não tinham dado e **apaga** (`sobrou=nada`). Artefato: `capturas/rotas-com-fixture.json`, com aviso de que é fixture. |
| `scripts/auditoria/esforco-da-tarefa.mjs`                          | Conta cliques e teclas REAIS (listener antes do primeiro script) por tarefa de leitura, sem gravar dado. Artefato: `capturas/esforco-da-tarefa.json`. |
| `scripts/auditoria/inp.mjs`                                        | Mede INP: interações roteirizadas (tecla, aba, filtro) e a maior duração por `interactionId`, filtrando só eventos que a métrica conta. Artefato: `capturas/inp-producao.json`. |
| `scripts/auditoria/casos-extremos.mjs`                              | Cria no banco de E2E um contato de nome realista e outro patológico (emoji, 128 caracteres), mede altura de linha/truncamento/overflow e **apaga** (confere `limpo=true`). Artefato: `capturas/casos-extremos.json`. |
| `scripts/auditoria/hierarquia-e-densidade.mjs`                      | Conta ação primária (por cor computada), secundárias, alvos na dobra e caracteres por linha (por `Range`) em 12 telas. Artefato: `capturas/hierarquia-e-densidade.json`. |
| `scripts/auditoria/offline-e-erro.mjs`                            | Coloca o navegador offline com a tela carregada, provoca ação e reload, e registra o que aparece (alerta, "Tentar novamente", texto). Confere o service worker antes de medir. Artefato: `capturas/offline-e-erro.json`. |
| `scripts/auditoria/lista-busca-e-paginacao.mjs`                    | Digita no filtro e conta as linhas antes/depois; clica "Carregar mais", alterna visão e mede a seleção em massa. Artefato: `capturas/lista-busca-e-paginacao.json`. |
| `scripts/auditoria/feedback-e-duplicidade.mjs`                      | Mede feedback e duplicidade SEM gravar: intercepta o POST e aborta após 2,5 s; registra botão desabilitado, rótulo, contagem de requisições por clique e erro visível. Artefato: `capturas/feedback-e-duplicidade.json`. |
| `tests/unit/botao-de-envio-diz-o-que-faz.test.ts`                   | Gate: todo `<Button type="submit">` tem `disabled` e rótulo de progresso (V-40). |
| `scripts/auditoria/desempenho.mjs`                                  | Trace do navegador: LCP, CLS e TBT em 12 telas × 2 condições (desktop 1440 sem estrangulamento; celular 390 com CPU 4× e 1,6 Mbps/150 ms). Grava `capturas/desempenho-producao.json`. |
| `scripts/auditoria/titulos-de-pagina.ts`                            | Mede, por tela (page + `_client` + `_components`), de onde vem o título: `NexusPageHeader`, `h1` à mão, família de tamanho e breadcrumb. Ignora comentário (`semComentarios`) — o `grep` cru dizia 28 telas onde havia menos. Artefato: `capturas/titulos-de-pagina.json`. |
| `docs/auditoria/capturas/h1-em-producao.json`                       | `<h1>` medido no DOM das 130 rotas estáticas: texto, tamanho, peso, `sr-only` separado de visível, título da aba e breadcrumb. Antes/depois de V-35/V-36 no arquivo `...-antes-v35.json`. |
| `tests/unit/titulo-de-pagina-uma-familia.test.ts`                   | Gate: subtela embutida não emite o segundo `h1` e `h1` de 24 px não declara peso diferente de `font-medium` (2 exceções de identificador, com motivo). |
| `tests/unit/kpi-skeleton-espelha-o-grid.test.ts`                    | Gate: esqueleto de KPI usa o grid e as mesmas classes do cartão; tela com `NexusKpiGrid` não monta esqueleto à mão (V-34). |
| `docs/auditoria/capturas/medicoes-producao-{tenant,admin,publica}.json` | As **258** medições (129 rotas × 2 larguras) em build de produção.                                                                                                                                       |
| `scripts/auditoria/segmento-de-rota.ts`                                 | Regra testável de "a tela" (page + `_client` + `_components` + imports locais), usada pela matriz de estados.                                                                                            |
| `tests/unit/matriz-telas-le-segmento.test.ts`                           | Gate de 11 casos: a matriz de estados lê a tela, não só o `page.tsx` (F-20).                                                                                                                             |
| `tests/unit/link-para-arquivo-estatico-existe.test.ts`                  | Gate: todo `href`/`src` com extensão existe em `public/` (o runbook que dava 404 — V-13).                                                                                                                |
| `tests/unit/rotulo-de-campo-aponta-para-controle.test.ts`               | Gate: todo `<label>` do produto se liga ao campo por `htmlFor`, embrulhamento ou `aria-labelledby` (V-15).                                                                                               |
| `public/runbook/platform-admin-management.md`                           | Runbook do "somente DBA", escrito do schema real; era o destino do link que respondia 404.                                                                                                               |
| `scripts/auditoria/subtelas.ts`                                         | Enumerador de **aba, modal e gaveta** por tela (rótulo, arquivo, linha) + modais sem `Title`.                                                                                                            |
| `docs/auditoria/09b-subtelas.md`                                        | O inventário: 82 abas, 68 modais, 12 gavetas em 156 telas (F-22).                                                                                                                                        |
| `tests/unit/subtela-tem-nome.test.ts`                                   | Gate de 8 casos: o extrator lê, o rótulo não é `className`, laço é dito dinâmico, modal sem `Title` é contado.                                                                                           |
| `scripts/auditoria/jornadas.ts`                                         | Mapa **J1–J16 → specs** + contagem do disco + resultado lido do log do Playwright.                                                                                                                       |
| `docs/auditoria/13-jornadas.md`                                         | As 16 jornadas do prompt: superfície, spec, resultado medido e o que fica descoberto.                                                                                                                    |
| `tests/unit/jornadas-fecham.test.ts`                                    | Gate: 99 specs do disco, 0 sem jornada e 0 sem motivo; a tabela do doc é a do gerador.                                                                                                                   |
| `scripts/auditoria/escrita-e-validacao.mjs`                             | Submete formulário **inválido** e mede: recusou? explicou? citou o campo? gravou?                                                                                                                        |
| `docs/auditoria/capturas/escrita-1440.json`                             | Os três casos, antes e depois da V-24.                                                                                                                                                                   |
| `tests/unit/formulario-que-recusa-explica.test.ts`                      | Gate: `noValidate` sem `erro=`/`role="alert"` é recusa muda.                                                                                                                                             |
| `scripts/auditoria/captura-subtelas.mjs`                                | **Abre** aba e modal e mede (h1, overflow, console, campo sem nome, aba que não seleciona). Não clica em verbo destrutivo.                                                                               |
| `docs/auditoria/capturas/subtelas-{tenant,dono,admin}.json`             | As 50 abas e 11 modais medidos em 39 telas.                                                                                                                                                              |
| `scripts/auditoria/cod-rotulo-acessivel.mjs`                            | `aria-label` a partir do rótulo visível; `planejar()` é a régua do gate. Idempotente.                                                                                                                    |
| `tests/unit/rotulo-visivel-vira-nome-acessivel.test.ts`                 | Gate da V-20: exige `planejar()` vazia e prova que 93 `<Label>` foram lidos.                                                                                                                             |
| `docs/auditoria/24-injecao-indireta.md`                                | P0-5: o risco de injeção indireta, o bloco residente no system, o gate determinístico das 12 tools e o que não foi feito (teste adversário com modelo, sanitização de conteúdo). |
| `docs/auditoria/25-ensaio-de-restauracao.md`                            | F-32: o ciclo install→seed→backup→drop→restore→conferência, o defeito dos GRANTs que ele achou, a correção no kit e as lacunas (storage, rotação, health com app). |

## 3.7 Canal de atualizações (Discord)

Ordem do usuário (15/11/2026): **toda mudança desta frente é anunciada no canal de
atualizações** — é o registro que se lê sem abrir o repositório.

| Peça             | Valor                                              |
| ---------------- | -------------------------------------------------- |
| Servidor (guild) | `1571693710016643193`                              |
| Canal do feed    | `1571693710486409381`                              |
| Credencial       | `DISCORD_WEBHOOK_URL` em `.env.local` (gitignored) |

O webhook é **mão única**: escreve no canal, não lê nem edita o servidor. Estrutura
(categorias, canais, cargos, permissões) exige **bot**; o blueprint está escrito em
`scripts/discord/configurar-servidor.ts` e roda com `--seco` sem token.

**Aplicado em 15/11/2026** — 6 categorias, 16 canais, 5 cargos, `@everyone` sem
`MENTION_EVERYONE`/`MODERATE_MEMBERS`. Registro completo, incluindo os dois limites do
Discord (canal de anúncio exige Comunidade; listar membros exige intent privilegiado):
[`discord.md`](discord.md).

Regra: a URL nunca entra em documento, commit, log ou mensagem. Erro do script passa por
`redigir()` antes de sair. Vazou? Rotacionar no Discord invalida na hora.

**Postagens desta frente** (o registro começa aqui; o que foi enviado antes não foi anotado e
não é reconstruído de memória — seria inventar):

| Data       | Título                                                                     | Nível       | Saída do script                |
| ---------- | -------------------------------------------------------------------------- | ----------- | ------------------------------ |
| 16/11/2026 | Banco provado por execução: migrations, schema e RLS                       | `auditoria` | `enviado (arquivo, auditoria)` |
| 16/11/2026 | Fase 2 medida em produção: 258 medições, 15 achados, 6 gates               | `auditoria` | `enviado (arquivo, auditoria)` |
| 16/11/2026 | As 16 jornadas medidas: 254 testes verdes e 7 falhas abertas uma a uma     | `auditoria` | `enviado (arquivo, auditoria)` |
| 16/11/2026 | Subtela aberta, não só enumerada: 55 campos ganharam nome                  | `auditoria` | `enviado (arquivo, auditoria)` |
| 16/11/2026 | 14 telas dinâmicas medidas com dado real — e o editor de agente sem título | `auditoria` | `enviado (arquivo, auditoria)` |
| 16/11/2026 | Três erros do instrumento faziam o produto parecer pior                    | `auditoria` | `enviado (arquivo, auditoria)` |
| 16/11/2026 | Mais três vezes em que a régua culpou o produto                            | `auditoria` | `enviado (arquivo, auditoria)` |
| 16/11/2026 | As mesmas subtelas em 390 px: 42 abas, zero overflow                       | `auditoria` | `enviado (arquivo, auditoria)` |
| 16/11/2026 | Dois formulários recusavam em silêncio (só o balão do navegador)           | `auditoria` | `enviado (arquivo, auditoria)` |
| 16/11/2026 | 11 datas seguiam o idioma do navegador, não o de quem lê                   | `auditoria` | `enviado (arquivo, auditoria)` |
| 16/11/2026 | O produto ignorava a preferência por menos movimento                       | `auditoria` | `enviado (arquivo, auditoria)` |
| 16/11/2026 | Contraste medido: 48 textos abaixo do mínimo, 22 após 4 correções | `auditoria` | `enviado (arquivo, auditoria)` |
| 16/11/2026 | A nota rejeitada agora se corrige sozinha pelo cadastro do CNPJ    | `auditoria` | `enviado (arquivo, auditoria)` |
| 17/11/2026 | Título de página com um h1 só — e o esqueleto deixou de pular       | `auditoria` | `enviado (arquivo, auditoria)` |
| 17/11/2026 | O mapa de empresas voltou — e o contraste chegou a zero reprovados   | `auditoria` | `enviado (arquivo, auditoria)` |
| 17/11/2026 | Um clique criava três clientes — e um botão mudo não dizia que salvava| `auditoria` | `enviado (arquivo, auditoria)` |
| 17/11/2026 | Offline: o app abria, mas duas telas não diziam o que acontecia       | `auditoria` | `enviado (arquivo, auditoria)` |
| 17/11/2026 | Hierarquia medida: 1 ação principal por tela, 50 alvos onde a lista é o trabalho | `auditoria` | `enviado (arquivo, auditoria)` |
| 17/11/2026 | As 26 rotas dinâmicas com prova — e uma tela sem título                  | `auditoria` | `enviado (arquivo, auditoria)` |
| 17/11/2026 | No tablet, o título de Pedidos tinha 0 px de largura                     | `auditoria` | `enviado (arquivo, auditoria)` |
| 17/11/2026 | Os dois formulários sem prova: renomear agente e criar token             | `auditoria` | `enviado (arquivo, auditoria)` |
| 17/11/2026 | Log sem dado pessoal — e o banco verde em 1.492 testes                    | `auditoria` | `enviado (arquivo, auditoria)` |
| 17/11/2026 | Pedido nasce em orçamento e fecha em Concluído, como no Mercos            | `sucesso`   | `enviado (arquivo, sucesso)`   |

## 3.6 Verificação de integridade do prompt (feita, não prometida)

O texto da Parte 1 foi comparado **linha a linha** com o prompt colado pelo usuário em
15/11/2026, normalizando apenas marcadores de heading, negrito e espaços — nunca palavras.
Resultado: **301 linhas de um lado, 301 do outro, zero diferenças de conteúdo** (a única
linha extra é o título estrutural `PARTE 1 — PROMPT ÍNTEGRO (VERBATIM)`, que não pertence ao
prompt).

O gate ficou gravado para não depender de memória:

```bash
pnpm exec tsx scripts/auditoria/verificar-prompt.ts
# ok: prompt íntegro (20a85563bcf88fb6…) — 301 linhas
```

Qualquer palavra, número, vírgula ou reordenação quebra o hash e o comando sai com erro.
Reformatar heading não quebra — é o único caso permitido. Regravar o hash só é legítimo
quando **o usuário** muda o prompt; regravar para "consertar" divergência é falsificar a lei.

## 3.8 Execução — frente de banco: migrations, schema e RLS (16/11/2026)

Pedido do usuário que abriu esta frente: provar as seis coisas, não afirmá-las.

| #   | Pergunta                                                                                 | Resultado medido                                                                                                                                                                                                                                                                      | Onde      |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | Reprodução em Postgres descartável, com versões, comando e saída                         | PostgreSQL **15.19**, `pgvector/pgvector:pg15` `sha256:47af0b65960b…`, `linux/arm64`; docker `29.8.2`; baseline `sha256:9a0afaec…`                                                                                                                                                    | §1        |
| 2   | Cada migration que falha: causa, e se é quebrada ou pré-requisito ausente                | **35 ok / 257 falham**; 246 tabela, 8 função, 3 tipo, **0 SQL inválido**; **257 de 257** citam objeto que existe no baseline; **71 objetos distintos** (81 nomes crus, 10 sem schema); causa raiz: 10 stubs `SELECT 1;`                                                               | §2        |
| 3   | Schema de migrations × `baseline.sql` (tabelas, funções, triggers, extensões, políticas) | A: 2 tabelas `public`, 18 funções, 0 trigger, 0 política. B: **179** tabelas, **92** funções, **104** triggers, **305** políticas. Só em A: **0**; só em B: **1.023**                                                                                                                 | §3        |
| 4   | Instalação **e** atualização de base existente                                           | instalação: exit 0 com `ON_ERROR_STOP=1`; update sobre 10 linhas semeadas: exit 0 e dados idênticos antes/depois                                                                                                                                                                      | §4        |
| 5   | As políticas **junto** do RLS + isolamento entre tenants                                 | **179 de 179** tabelas de `public` com RLS; 300 políticas em `public`; 5 tabelas de plataforma deny-all (nomeadas); **96 tabelas com prova comportamental**, 73 em dívida conhecida                                                                                                   | §5        |
| 6   | `db:migrate` não pode retornar sucesso sendo placeholder                                 | corrigido: aplica o baseline **e verifica**; sai 1 sem objeto ou sem conexão; gate `tests/unit/db-migrate-nao-e-placeholder.test.ts`. **`db:reset` também**: recria pelo baseline, com DEFAULT ACL antes e paridade de ACL medida; gate `tests/unit/db-reset-aplica-baseline.test.ts` | §6 e §6.1 |

Comandos, todos executados nesta árvore:

```console
$ bash scripts/auditoria/replay-migrations.sh      # 292 migrations × baseline, 2 bancos descartáveis
$ bash scripts/test-update-com-dados.sh           # install → semeia → update → dados iguais
$ pnpm test:db                                    # 159 arquivos · 1492 testes · 1 expected fail · 1 skipped
$ pnpm test:shell                                 # 395 ✓ · 0 ✗ · "todos os validadores passaram"
$ pnpm gov:verify                                 # typecheck + lint + 965 arquivos · 10.283 testes · 1 expected fail
$ SUPABASE_DB_URL=… pnpm db:verificar             # objetos exigidos presentes (179 300)
```

Achados abertos ao fim desta frente: **F-09** (cadeia não reproduz o schema — Fase 10),
**F-17** (73 tabelas tenant-aware sem prova comportamental). Corrigidos: **F-02/F-09a**
(`db:migrate` placeholder), **F-16** (contagem textual de RLS), **F-18** (`&& exit 0` sem gate),
**F-19** (`load_env` × bash 3.2 no gate do kit).
