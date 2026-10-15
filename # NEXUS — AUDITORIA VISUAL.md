# NEXUS — AUDITORIA VISUAL PAGE BY PAGE + REDESIGN COMPLETO SaaS AAA

## 1. PAPEL E MISSÃO

Atue como uma equipe sênior composta por:

- Principal Product Designer especializado em SaaS B2B.
- Especialista em UI/UX de CRM, ERP e plataformas comerciais.
- Frontend Architect especializado em Next.js, React, TypeScript e design systems.
- Especialista em acessibilidade, responsividade e performance.
- Engenheiro de QA visual com experiência em Playwright e screenshots.
- Product Manager especializado em sistemas de vendas, operação comercial e inteligência de negócios.

Projeto: `https://github.com/spiesdan/nexus`

Sua missão é realizar uma **auditoria real, individual e completa de cada página do Nexus e, depois, reconstruir a experiência visual e de interação do produto para atingir um padrão SaaS B2B AAA**.

Não quero apenas uma revisão superficial.

Não quero apenas trocar cores, espaçamentos e bordas.

Não quero apenas instalar componentes novos.

Não quero apenas refatorar componentes para que todos usem a mesma biblioteca.

Quero que você descubra o que está ruim em cada tela, entenda o propósito operacional dela, determine a melhor experiência possível e implemente as melhorias diretamente no código.

**Você deve analisar página por página, componente por componente e fluxo por fluxo, respeitando as funcionalidades existentes.**

Não encerre o trabalho após produzir a auditoria. A auditoria é a primeira etapa da implementação.

---

# 2. REGRA FUNDAMENTAL: TRABALHE SOBRE O REPOSITÓRIO REAL

Antes de editar qualquer arquivo:

1. Verifique a branch atual, o commit HEAD e o estado do Git.
2. Identifique alterações locais, arquivos não rastreados e trabalho em andamento.
3. Leia `AGENTS.md`, `CLAUDE.md`, `DESIGN.md` e demais instruções existentes.
4. Examine o design system atual, tokens, CSS global, componentes compartilhados e layouts.
5. Leia a documentação de redesign e inventário já existente.
6. Faça um levantamento atualizado das rotas, layouts, modais, drawers, abas, formulários, tabelas, dashboards e estados.
7. Identifique quais melhorias já foram implementadas e quais continuam pendentes.
8. Verifique a implementação real, não apenas o que os documentos dizem.

Documentos que devem ser localizados e considerados, caso existam na branch atual:

- `docs/nexus-v2/redesign-inventory.md`
- `docs/PROMPT-V4-REDESIGN-VISUAL-TOTAL.md`
- `docs/design-system/README.md`
- `docs/uimaxxing-redesign-execucao.md`
- `DESIGN.md`
- `app/globals.css`
- Layouts de `app/app/`
- Componentes de `components/`
- Componentes de `components/nexus-ui/`
- Componentes de `components/shell/`
- Componentes de `components/ui/`
- Testes E2E, testes unitários e evidências visuais existentes.

Os caminhos são referências para investigação, não uma lista fechada. Confirme os caminhos reais na branch atual.

Não confie cegamente em auditorias anteriores. Elas podem estar desatualizadas, medir somente critérios técnicos ou não refletir a qualidade visual percebida.

Não recrie componentes que já existem sem antes avaliar se podem ser aproveitados.

Não remova componentes, rotas ou funcionalidades simplesmente porque parecem redundantes.

---

# 3. FASE 1 — INVENTÁRIO REAL DE TODAS AS PÁGINAS

Descubra todas as rotas a partir do código atual.

Use o App Router, layouts, route groups, rotas dinâmicas, redirects e componentes de navegação para construir um inventário confiável.

Inclua:

- Páginas públicas.
- Login, recuperação de acesso e autenticação.
- Onboarding e configuração inicial.
- Aplicação principal do tenant.
- Administração global.
- Dashboard e relatórios.
- CRM e clientes.
- Customer 360.
- Inbox e conversas.
- Pedidos e detalhes de pedidos.
- Produtos e estoque.
- Radar e prospecção.
- Campanhas e follow-ups.
- Financeiro e títulos.
- Compras e fornecedores.
- Comissões e carteira.
- Expedição e logística.
- Faturamento e notas.
- Agenda e tarefas.
- IA, agentes, execuções, decisões e conhecimento.
- Integrações, WhatsApp, webhooks e conexões.
- Equipe, permissões, auditoria e configurações.
- Estados de carregamento, erro, acesso negado e páginas não encontradas.

Inclua também páginas com query parameters, abas, drawers e diálogos que alterem substancialmente a experiência.

Não conte layouts compartilhados como se fossem páginas independentes sem necessidade. Registre a relação entre eles.

Não invente rotas ausentes.

Para cada rota, registre:

- Caminho.
- Nome da tela.
- Módulo.
- Arquivo principal.
- Layout utilizado.
- Componentes compartilhados relevantes.
- Funcionalidade principal.
- Público ou perfil de usuário.
- Estado atual da auditoria.
- Problemas identificados.
- Prioridade.
- Alterações necessárias.
- Teste e evidência de validação.

Classifique cada tela como:

- `MANTER`: já atende ao padrão visual e funcional.
- `REFINAR`: precisa de ajustes pontuais.
- `RECONSTRUIR`: a composição, hierarquia ou fluxo precisa mudar substancialmente.
- `CONSOLIDAR`: existem padrões duplicados ou inconsistentes que devem ser unificados.
- `INVESTIGAR`: falta evidência suficiente para tomar uma decisão.

Não marque uma página como concluída apenas porque usa componentes padronizados ou passou em um teste automatizado.

Entregue o inventário em:

`docs/design-overhaul/page-by-page-audit.md`

Depois, continue imediatamente para as próximas fases.

---

# 4. FASE 2 — AUDITORIA VISUAL INDIVIDUAL E REAL

A auditoria deve responder, para cada tela:

1. Qual é o objetivo principal do usuário nessa página?
2. Qual ação deveria ser a mais fácil de encontrar?
3. A hierarquia visual deixa isso claro?
4. O título, a descrição, as ações e os filtros estão bem posicionados?
5. O espaçamento é consistente e funcional?
6. A tela possui densidade adequada para o volume de dados?
7. Há espaço desperdiçado ou excesso de informação?
8. Os elementos parecem pertencer ao mesmo produto?
9. Existem cards desnecessários?
10. Os gráficos estão integrados à composição ou parecem widgets soltos?
11. As tabelas permitem encontrar, comparar e operar dados rapidamente?
12. Os filtros são claros e fáceis de usar?
13. Os formulários possuem agrupamento, validação e feedback adequados?
14. Os estados vazios orientam o usuário sobre o próximo passo?
15. Os estados de carregamento, erro e sucesso são consistentes?
16. A página é fácil de usar sem treinamento?
17. O comportamento em telas menores é realmente adequado?
18. Há problemas de acessibilidade?
19. Há interações confusas, redundantes ou que exigem cliques desnecessários?
20. A experiência parece um SaaS comercial premium ou um conjunto de telas administrativas genéricas?

Para cada problema, registre:

- Evidência observada.
- Consequência para o usuário.
- Gravidade.
- Solução proposta.
- Arquivos afetados.
- Critério objetivo de aceite.

Priorize a avaliação visual de páginas renderizadas. O código, sozinho, não mostra completamente o resultado final.

## Inspeção visual obrigatória

Se o ambiente permitir executar o projeto, utilize a aplicação real, dados de teste e Playwright para abrir as páginas e capturar screenshots.

Analise visualmente as páginas, não apenas o DOM.

Para cada tela relevante:

- Capture o estado inicial.
- Observe o layout completo.
- Examine a área acima da dobra.
- Examine o conteúdo abaixo da dobra.
- Abra filtros, menus, abas, modais e drawers relevantes.
- Teste a interação principal.
- Observe overflow, desalinhamento, truncamento e sobreposição.
- Compare a mesma tela em tema escuro e claro, quando suportados.
- Verifique desktop e mobile.

Não considere uma tela auditada apenas porque a rota retornou HTTP 200 ou porque o teste confirmou que um elemento existe.

Se alguma página não puder ser acessada por falta de credenciais, dependências, dados ou ambiente, registre a limitação e use a análise estática como complemento. Não invente evidências visuais.

Crie uma pasta organizada para evidências, por exemplo:

`docs/design-overhaul/evidence/`

Não produza centenas de screenshots sem análise. Cada evidência deve apoiar uma decisão concreta.

---

# 5. FASE 3 — DEFINIR UMA DIREÇÃO VISUAL ÚNICA

Antes de reconstruir as páginas, defina e documente a direção visual definitiva do Nexus.

O produto deve transmitir:

- Confiança.
- Inteligência comercial.
- Precisão.
- Maturidade.
- Eficiência operacional.
- Tecnologia premium.
- Clareza na tomada de decisão.

A interface deve parecer um único produto cuidadosamente projetado, e não uma coleção de bibliotecas e páginas independentes.

## Referência de linguagem visual

Utilize como inspiração de composição os princípios de SaaS B2B premium e interfaces analíticas modernas, incluindo os padrões já avaliados no projeto.

A referência é conceitual. Não copie integralmente outra plataforma.

Direção sugerida:

- Tema escuro como padrão atual, preservando a escolha deliberada já registrada no projeto.
- Tema claro funcional e consistente.
- Superfícies em grafite, carvão e cinzas cuidadosamente diferenciados.
- Bordas discretas de 1 px.
- Tipografia com hierarquia evidente.
- Números e indicadores com boa legibilidade.
- Cor de destaque utilizada com moderação.
- Cores semânticas para sucesso, alerta, erro e informação.
- Gráficos integrados aos painéis.
- Tabelas profissionais, legíveis e operacionais.
- Espaçamento intencional.
- Cantos consistentes.
- Microinterações rápidas e discretas.
- Ícones coerentes.
- Navegação previsível.

Não imponha valores de cores antes de verificar os tokens e o design system existentes. Defina os valores finais depois da inspeção e centralize-os.

## Evitar

- Gradientes decorativos excessivos.
- Brilhos neon.
- Glassmorphism generalizado.
- Sombras pesadas.
- Cards enormes sem função.
- Uma caixa para cada informação.
- Muitas cores competindo entre si.
- Badges coloridos em excesso.
- Títulos exageradamente grandes.
- Espaçamento aleatório.
- Interfaces com densidade excessivamente baixa.
- Tabelas comprimidas ou ilegíveis.
- Animações que atrasam operações.
- Elementos decorativos que prejudicam a produtividade.
- Aparência genérica de dashboard gerado por IA.
- Reproduzir uma referência sem considerar o contexto comercial do Nexus.

A qualidade deve vir da composição, tipografia, hierarquia, alinhamento, comportamento e consistência.

Documente a decisão em:

`docs/design-overhaul/design-direction.md`

---

# 6. FASE 4 — DESIGN SYSTEM E ESPAÇAMENTOS

Examine o sistema existente antes de modificar qualquer coisa.

Consolide os tokens e componentes que realmente precisam de uma fonte única de verdade.

## Tokens

Padronize:

- Background da aplicação.
- Superfícies.
- Superfícies elevadas.
- Bordas.
- Texto primário, secundário e discreto.
- Cores semânticas.
- Cor de destaque.
- Tipografia.
- Escala de espaçamento.
- Alturas de controles.
- Raios de borda.
- Sombras.
- Foco.
- Transições.
- Camadas de sobreposição.
- Breakpoints.
- Densidade de tabelas.

Evite números arbitrários repetidos em dezenas de arquivos.

Não altere todos os valores apenas para que sejam iguais. Diferentes elementos podem precisar de densidades diferentes, desde que a regra seja explícita.

## Espaçamento e alinhamento

Revise sistematicamente:

- Padding externo das páginas.
- Distância entre título e descrição.
- Distância entre cabeçalho e conteúdo.
- Alinhamento de título, filtros e ações.
- Espaçamento entre seções.
- Espaçamento entre cards relacionados.
- Padding interno dos painéis.
- Altura de inputs, botões e seletores.
- Alinhamento de ícones com textos.
- Distância entre labels e controles.
- Padding de células de tabelas.
- Espaçamento de menus, popovers e diálogos.
- Comportamento do conteúdo próximo à sidebar.
- Largura máxima de formulários e conteúdos longos.
- Espaçamento em resoluções menores.

Elimine desalinhamentos e espaçamentos inconsistentes sem tornar todas as telas visualmente idênticas.

## Componentes compartilhados

Avalie e consolide, conforme necessário:

- AppShell.
- Sidebar.
- Topbar.
- Breadcrumb.
- Command Palette.
- Busca global.
- Cabeçalho de página.
- Botões.
- Inputs.
- Selects.
- Campos de formulário.
- Tabs.
- FilterBar.
- Tabelas.
- Paginação.
- KPIs.
- Gráficos.
- Badges.
- Tooltips.
- Dropdowns.
- Dialogs.
- Drawers.
- Toasts.
- Empty states.
- Loading states.
- Error states.
- Confirmações.
- Skeletons.

Aproveite os componentes existentes do Nexus UI e shadcn quando forem adequados.

Não crie uma segunda biblioteca paralela.

Não faça uma migração massiva apenas por preferência arquitetural. Cada consolidação deve ter um benefício real e preservar o comportamento da tela.

---

# 7. FASE 5 — REDESIGN DO SHELL E DA NAVEGAÇÃO

Analise o shell compartilhado antes das páginas individuais, pois ele influencia toda a aplicação.

## Sidebar

Verifique:

- Largura e proporção.
- Agrupamento dos módulos.
- Hierarquia entre seções.
- Rótulos e ícones.
- Estado ativo.
- Hover e foco.
- Navegação recolhida, se suportada.
- Scroll interno.
- Separação entre módulos.
- Espaço utilizado.
- Versão mobile.
- Visibilidade das funcionalidades mais importantes.

A sidebar deve facilitar o trabalho diário. Não transforme todos os módulos em uma lista visualmente indistinta.

## Topbar

Avalie:

- Identificação do workspace.
- Breadcrumbs.
- Busca.
- Command Palette.
- Notificações.
- Perfil do usuário.
- Ações globais.
- Responsividade.
- Alinhamento vertical.

## Conteúdo

Estabeleça um padrão consistente de página, sem obrigar todos os módulos a usar o mesmo layout.

Uma lista pode precisar de cabeçalho, filtros, tabela e paginação.

O Inbox precisa de uma composição de três painéis.

Um dashboard precisa de hierarquia analítica.

Um formulário precisa de grupos de campos.

Um detalhe de cliente precisa de identidade, indicadores e histórico.

**Padronize o sistema, não elimine as diferenças funcionais entre as telas.**

---

# 8. FASE 6 — REDESIGN PAGE BY PAGE

Agora execute o trabalho sobre todas as rotas identificadas na Fase 1.

Não redesenhe apenas o dashboard.

Não finalize depois das primeiras páginas.

Não envolva o componente antigo em um novo container e declare o trabalho concluído.

Para cada rota:

1. Consulte o inventário.
2. Leia o componente principal e seus componentes filhos.
3. Entenda os dados, permissões e ações disponíveis.
4. Examine os hooks, chamadas de API e estados.
5. Reproduza a tela atual, quando possível.
6. Identifique os problemas reais.
7. Defina a nova composição.
8. Implemente as mudanças.
9. Teste as interações existentes.
10. Compare o resultado visual.
11. Corrija os problemas encontrados.
12. Atualize o inventário com evidências e status.

## 8.1 Dashboard

Deve funcionar como centro de comando comercial.

Avalie:

- KPIs prioritários.
- Vendas do período.
- Evolução de desempenho.
- Pedidos recentes.
- Atividade comercial.
- Alertas e oportunidades.
- Recomendações de IA.
- Filtros de período.
- Hierarquia entre indicadores.
- Utilidade dos gráficos.

Elimine informações redundantes e métricas sem contexto.

Cada indicador importante deve comunicar o que representa, o período analisado e, quando aplicável, a variação ou comparação.

Não invente dados ou tendências para preencher a interface.

## 8.2 Meu Dia

Deve responder rapidamente:

- O que precisa ser feito agora?
- Quais clientes precisam de contato?
- Quais tarefas estão atrasadas?
- Quais follow-ups estão pendentes?
- Quais ações têm maior prioridade?
- O que já foi concluído?

Priorize ações e organização operacional.

Não transforme a página em outro dashboard genérico.

## 8.3 Clientes, contatos e Customer 360

Revise separadamente a listagem, o cadastro e o detalhe.

Listagens:

- Busca.
- Filtros.
- Segmentação.
- Ordenação.
- Seleção de registros.
- Ações em lote.
- Paginação.
- Densidade e legibilidade.

Customer 360:

- Identificação da empresa.
- Contato.
- Situação comercial.
- Histórico de compras.
- Pedidos.
- Última compra.
- Atividades.
- Oportunidades.
- Follow-ups.
- Dados financeiros permitidos.
- Ações rápidas.
- Integração com Inbox.

A tela deve ajudar o vendedor a entender o cliente sem precisar navegar por várias páginas.

Não exiba informações financeiras ou pessoais sem verificar permissões.

## 8.4 Inbox e conversas

Avalie a experiência completa de atendimento.

Revise:

- Lista de conversas.
- Busca e filtros.
- Estados de atendimento.
- Mensagens.
- Campo de envio.
- Anexos.
- Identidade do cliente.
- Painel lateral de contexto.
- Dados comerciais.
- Atribuição de responsáveis.
- Pausa e retomada do agente.
- Transferência para atendimento humano.
- Estados de conexão.
- Mensagens de erro.
- Responsividade.

Preserve a experiência de três painéis quando adequada.

Não transforme o Inbox em uma página comum com cards.

O atendimento precisa ser rápido, legível e funcional, especialmente com conversas longas e grande volume de mensagens.

## 8.5 Pedidos

Audite:

- Listagem.
- Criação.
- Detalhe.
- Edição.
- Itens.
- Quantidades.
- Preços.
- Descontos.
- Condições comerciais.
- Status.
- Histórico.
- Cliente.
- Responsável.
- Ações disponíveis.
- Impressão.

Priorize a criação rápida e a consulta de pedidos.

Diferencie visualmente estados sem depender de uma infinidade de badges coloridos.

Não altere regras comerciais, cálculo de valores, permissões ou persistência durante o redesign sem necessidade explícita.

## 8.6 Produtos e estoque

Revise:

- Busca.
- Categorias.
- Filtros.
- Identificação dos produtos.
- Preços.
- Estoque.
- Movimentações.
- Detalhes.
- Formulários.
- Estados de indisponibilidade.
- Ações em lote, quando existentes.

Evite tabelas visualmente pesadas e cards que dificultem a comparação entre produtos.

## 8.7 Radar, prospecção e campanhas

Audite cada aba e cada fluxo.

Avalie:

- Oportunidades comerciais.
- Clientes inativos.
- Clientes com risco de perda.
- Recompra.
- Segmentação.
- Empresas prospectadas.
- Mapa, quando existente.
- Campanhas.
- Seleção de públicos.
- Mensagens.
- Execuções.
- Resultados.
- Follow-ups.
- Estados de processamento.

Diferencie claramente oportunidade, lead, cliente e campanha.

Não faça a interface indicar que uma mensagem foi enviada ou que uma venda ocorreu se isso não estiver confirmado pelo backend.

A prioridade é tornar evidente a próxima ação comercial e seu resultado.

## 8.8 Financeiro, títulos e comissões

Audite as telas individualmente.

Revise:

- Receitas.
- Despesas.
- Fluxo de caixa.
- Contas a receber.
- Contas a pagar.
- Títulos.
- Vencimentos.
- Pagamentos.
- Comissões.
- Filtros de período.
- Totais.
- Gráficos.
- Tabelas.
- Exportações.
- Estados vazios e erros.

Utilize formatação brasileira de moeda e datas.

Destaque os valores importantes sem exagerar no tamanho ou nas cores.

Não modifique fórmulas, saldos, liquidações ou regras de comissão para conseguir um resultado visual.

## 8.9 Expedição, compras, faturamento e notas

Avalie os fluxos operacionais, não apenas a aparência.

Priorize:

- Identificação do documento ou pedido.
- Status.
- Etapas.
- Ações possíveis.
- Pendências.
- Busca.
- Filtragem.
- Informações necessárias para decidir.
- Confirmações.
- Erros recuperáveis.
- Feedback após ações.

Telas operacionais devem ser claras e densas o suficiente para o trabalho real.

## 8.10 IA e agentes

Audite:

- Hub de IA.
- Agentes.
- Configurações.
- Execuções.
- Decisões.
- Propostas.
- Conhecimento.
- Memória.
- Uso e custos.
- Credenciais.
- Provedores.
- Ferramentas.
- Histórico.
- Estados de execução.

A IA deve utilizar a mesma identidade visual do Nexus.

Evite gradientes roxos, neon e efeitos decorativos como substitutos de uma boa hierarquia.

Diferencie claramente configuração, execução, resultado, falha e ação que aguarda aprovação.

## 8.11 Configurações, administração e demais telas

Não ignore páginas secundárias.

Revise:

- Perfil.
- Equipe.
- Permissões.
- Workspace.
- Marca.
- Segurança.
- Notificações.
- Integrações.
- Tokens de API.
- Webhooks.
- Auditoria.
- Administração global.
- Tenants.
- Usuários.
- Incidentes.
- Onboarding.
- Login.
- MFA.
- Recuperação de conta.
- Páginas de erro.

Essas páginas também devem parecer parte de um produto profissional.

Evite duplicação visual entre a administração global e a administração do tenant, respeitando suas diferenças funcionais.

---

# 9. FASE 7 — TABELAS, FILTROS, FORMULÁRIOS E ESTADOS

Faça uma revisão transversal depois das páginas individuais.

## Tabelas

Avalie:

- Alinhamento de colunas.
- Cabeçalhos.
- Densidade.
- Legibilidade.
- Alinhamento de valores monetários.
- Ordenação.
- Seleção.
- Ações por linha.
- Estados de hover e foco.
- Paginação.
- Loading.
- Empty state.
- Erro.
- Mobile.

Não reduza o tamanho do texto indiscriminadamente para caber mais dados.

Quando necessário, permita scroll horizontal, ocultação responsável de colunas secundárias ou visualização alternativa em telas menores.

## Filtros

Os filtros devem ter hierarquia.

Separe os mais utilizados dos avançados quando fizer sentido.

Preserve o comportamento de busca, URL e estado da aplicação quando existente.

Deixe claro quando existem filtros ativos e como limpá-los.

## Formulários

Revise:

- Agrupamento.
- Labels.
- Ajuda contextual.
- Campos obrigatórios.
- Validação.
- Mensagens de erro.
- Estados desabilitados.
- Salvamento.
- Cancelamento.
- Confirmações.
- Responsividade.

Não coloque formulários longos em modais pequenos quando uma página ou drawer maior for mais adequado.

## Estados

Todas as páginas que dependem de dados devem apresentar estados apropriados para:

- Carregamento.
- Ausência de dados.
- Falha na requisição.
- Falha parcial.
- Sem permissão.
- Operação em andamento.
- Sucesso.
- Falha ao salvar.
- Falha recuperável.

Não invente dados para preencher espaços vazios.

Não esconda erros reais atrás de mensagens genéricas sem possibilidade de recuperação.

---

# 10. FASE 8 — RESPONSIVIDADE E ACESSIBILIDADE

Valide a experiência, no mínimo, nas larguras:

- 1920 px.
- 1440 px.
- 1280 px.
- 1024 px.
- 768 px.
- 430 px.
- 390 px.

Adapte a composição conforme o contexto.

Não considere responsividade concluída apenas porque o conteúdo passou a ter `width: 100%`.

Verifique:

- Sidebar e navegação mobile.
- Menus.
- Filtros.
- Tabelas.
- Formulários.
- Gráficos.
- Dialogs.
- Drawers.
- Inbox.
- Ações principais.
- Textos longos.
- Campos monetários.
- Conteúdo com scroll.
- Teclado virtual.
- Safe areas, quando aplicáveis.

Acessibilidade:

- Navegação por teclado.
- Foco visível.
- Contraste WCAG AA, quando aplicável.
- Labels acessíveis.
- Nomes acessíveis para botões de ícone.
- Associação de mensagens de erro aos campos.
- Semântica HTML.
- Estados ARIA corretos.
- Respeito a `prefers-reduced-motion`.

---

# 11. FASE 9 — INTERAÇÕES E MICROANIMAÇÕES

As animações devem ajudar o usuário a compreender o sistema.

Utilize transições curtas e consistentes para:

- Hover.
- Foco.
- Dropdowns.
- Dialogs.
- Drawers.
- Mudanças de estado.
- Feedback de ações.
- Atualização de gráficos.

Evite:

- Animações longas.
- Bounce exagerado.
- Parallax.
- Glow constante.
- Efeitos que atrasam a operação.
- Movimento que dificulta leitura.
- Bibliotecas adicionais sem justificativa.

Verifique se botões, filtros, tabs, menus e ações principais funcionam de verdade.

Um componente visualmente bonito, mas sem comportamento funcional, não está concluído.

---

# 12. FASE 10 — PRESERVAR A INTEGRIDADE DO PRODUTO

Este projeto possui funcionalidades comerciais e operacionais reais.

O redesign deve preservar:

- Autenticação.
- Autorização.
- RBAC.
- Multi-tenancy.
- RLS.
- Supabase.
- Banco de dados.
- APIs.
- Server Actions.
- Webhooks.
- Workers.
- WAHA.
- Agentes de IA.
- Inbox.
- CRM.
- Pedidos.
- Financeiro.
- Regras comerciais.
- Integrações.
- Rotas e links existentes.
- Query parameters relevantes.
- Deep links.
- Comportamento de navegação.
- Logs e auditoria.

Não substitua dados reais por mocks.

Não remova funcionalidades para simplificar o layout.

Não altere contratos de API sem necessidade demonstrada.

Não transforme Server Components em Client Components sem motivo.

Evite requisições adicionais causadas apenas pela nova interface.

Preserve permissões, isolamento entre tenants e validações no servidor.

Não exponha dados sensíveis para tornar componentes mais fáceis de construir.

Antes de consolidar rotas ou remover componentes, verifique todos os consumidores, links salvos e fluxos dependentes.

---

# 13. FASE 11 — EXECUÇÃO POR ETAPAS, SEM PARAR NA AUDITORIA

Organize o trabalho nesta ordem:

### Etapa A — Auditoria

- Inventário atualizado.
- Avaliação página por página.
- Evidências visuais.
- Classificação.
- Priorização.
- Identificação de riscos.

### Etapa B — Fundação visual

- Tokens.
- Tipografia.
- Espaçamento.
- Superfícies.
- Componentes.
- Estados.
- Tema claro e escuro.

### Etapa C — Shell

- Sidebar.
- Topbar.
- Navegação.
- Breadcrumb.
- Busca.
- Menus.
- Responsividade.

### Etapa D — Fluxos de maior impacto

Comece por:

1. Dashboard.
2. Meu Dia.
3. Inbox.
4. Clientes e Customer 360.
5. Pedidos.
6. Radar e prospecção.
7. Financeiro.
8. Produtos e estoque.

Depois, avance para os demais módulos, páginas administrativas, autenticação, onboarding e configurações.

A ordem pode mudar se a auditoria identificar dependências importantes, mas nenhuma categoria deve ser esquecida.

### Etapa E — Consolidação

- Remover duplicações comprovadas.
- Unificar componentes.
- Corrigir estados.
- Corrigir inconsistências.
- Eliminar código visual obsoleto somente após verificar seus consumidores.

### Etapa F — QA visual e funcional

- Screenshots.
- Comparação entre resoluções.
- Tema claro e escuro.
- Testes das interações.
- Testes direcionados.
- Verificação final das rotas.

Não pare para me pedir autorização ao terminar cada etapa. Tome decisões técnicas razoáveis, documente-as e continue.

Se houver uma limitação real, implemente o que puder e registre precisamente o bloqueio.

---

# 14. FASE 12 — TESTES SEM DESPERDIÇAR TEMPO

Não execute toda a suíte E2E depois de cada ajuste de padding ou cor.

Use uma estratégia de validação proporcional ao risco.

Para mudanças visuais isoladas:

- Typecheck quando necessário.
- Lint direcionado.
- Testes unitários relevantes.
- Verificação visual direcionada.

Para mudanças de componentes compartilhados:

- Testes dos consumidores importantes.
- Verificação de regressões nas telas que utilizam o componente.
- Testes de interação relevantes.

Para fluxos críticos:

- Playwright nos caminhos reais.
- Verificação de persistência e feedback.
- Testes de permissões quando aplicável.

Na etapa final:

- Execute as verificações de build e qualidade disponíveis.
- Execute a suíte E2E adequada ao escopo.
- Registre os resultados.
- Não declare testes aprovados se não foram executados.
- Não esconda falhas preexistentes.
- Não altere testes apenas para fazê-los passar sem preservar a intenção original.

Não faça deploy em produção sem autorização explícita.

---

# 15. CRITÉRIOS DE ACEITE

O trabalho só poderá ser considerado concluído quando:

1. Todas as rotas reais estiverem no inventário.
2. Cada página tiver uma decisão individual documentada.
3. As páginas relevantes tiverem sido examinadas visualmente quando o ambiente permitir.
4. Todas as páginas classificadas como `RECONSTRUIR` tiverem sido efetivamente reconstruídas ou possuírem um bloqueio documentado.
5. Todas as páginas classificadas como `REFINAR` tiverem sido corrigidas ou justificadas.
6. Os componentes compartilhados possuírem regras consistentes.
7. O espaçamento e o alinhamento forem intencionais.
8. O tema claro e o escuro funcionarem corretamente.
9. Não houver regressões conhecidas nos fluxos comerciais.
10. A responsividade tiver sido verificada.
11. Estados de carregamento, erro e vazio forem adequados.
12. A navegação continuar funcionando.
13. As principais interações forem testadas.
14. Não houver problemas críticos conhecidos de acessibilidade.
15. A performance não tiver sido prejudicada pelo redesign.
16. Os testes executados tiverem resultados registrados.
17. As limitações restantes estiverem documentadas.

O fato de uma página usar `NexusPageHeader`, `NexusDataTable`, `NexusKpi` ou outro componente canônico não é, por si só, critério de aprovação visual.

O fato de uma página passar em um teste de DOM também não significa que ela seja bonita, clara ou agradável de usar.

**A aprovação final depende da qualidade da experiência real.**

---

# 16. RELATÓRIOS OBRIGATÓRIOS

Crie e mantenha:

- `docs/design-overhaul/page-by-page-audit.md`
- `docs/design-overhaul/design-direction.md`
- `docs/design-overhaul/implementation-progress.md`
- `docs/design-overhaul/qa-report.md`

O relatório de progresso deve informar:

- Total de rotas identificadas.
- Total de páginas auditadas.
- Total de páginas corrigidas.
- Total de páginas reconstruídas.
- Total de páginas mantidas com justificativa.
- Total de páginas bloqueadas.
- Módulos concluídos.
- Módulos pendentes.
- Testes executados.
- Falhas encontradas.
- Evidências disponíveis.

Atualize esses documentos durante o trabalho, não apenas no final.

Não invente percentuais de conclusão.

Não conte a mesma rota várias vezes por causa de variantes de tela.

---

# 17. REGRAS DE TRABALHO

- Trabalhe no repositório e na branch realmente aberta.
- Não presuma que a branch atual é a mesma das auditorias anteriores.
- Não sobrescreva alterações locais do usuário.
- Não faça reset destrutivo.
- Não faça force push.
- Não remova rotas ou funcionalidades sem comprovar que são dispensáveis.
- Não crie uma implementação paralela desnecessária.
- Não adicione dependências sem justificativa.
- Não introduza dados falsos.
- Não altere regras de negócio para facilitar o frontend.
- Não entregue apenas documentação.
- Não pare depois do dashboard.
- Não considere uma simples troca de tema como redesign completo.
- Não considere um componente reutilizado como prova de boa UX.
- Não use efeitos decorativos para mascarar uma composição ruim.
- Não faça deploy de produção sem autorização.

Organize as mudanças em commits lógicos, se o ambiente e o estado do Git permitirem, sem incluir alterações preexistentes do usuário.

## INSTRUÇÃO FINAL

Comece agora pela inspeção do Git e pelo inventário atualizado.

Audite individualmente todas as páginas existentes. Utilize a documentação anterior como referência, mas confirme o estado real do código e da interface.

Depois, reconstrua o design system, o shell e as páginas conforme as evidências encontradas.

**Não quero um plano para eu executar depois. Quero que você execute o trabalho no código.**

O resultado deve ser um Nexus que pareça ter sido concebido por uma equipe de produto experiente, com identidade visual única, páginas cuidadosamente projetadas, espaçamento preciso, navegação clara, interações funcionais e qualidade consistente em toda a plataforma.

Quando terminar, apresente um resumo objetivo do que realmente foi implementado, das evidências produzidas, dos testes executados e do que eventualmente permaneceu pendente.