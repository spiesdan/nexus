# Subtelas — abas, modais e gavetas por tela

> **Gerado por comando**: `pnpm exec tsx scripts/auditoria/subtelas.ts`.
> Fonte: segmento de rota (`page.tsx` + arquivos locais + imports relativos),
> com comentários removidos. Não editar à mão.

**159 telas** medidas; **52** têm ao menos uma subtela.
Total: **88 abas**, **74 modais**, **12 gavetas**.

> **O que este número é.** Inventário **estático** com nome e arquivo — o que abrir.
> **O que não é.** Prova de que a subtela abre, renderiza ou está correta: isso exige
> execução e é o que a Fase 2 faz tela a tela. Aba construída em laço
> (`items.map(...)`) aparece uma vez com o literal do template, não com os N nomes reais.

**Modais sem título de acessibilidade: 0.** Todo `<Dialog>`/`<Sheet>` do produto declara `<DialogTitle>`/`<SheetTitle>`.

| Tela | Abas | Modais | Gavetas |
|---|---|---|---|
| `/admin` | — | — | Menu de navegação `components/admin/AdminShell.tsx:49` |
| `/admin/inbox` | (rótulo dinâmico) `app/admin/(protected)/inbox/_components/InboxList.tsx:176` | — | — |
| `/admin/tenants/[id]` | em breve `app/admin/(protected)/tenants/[id]/_tab-nav.tsx:39` | — | — |
| `/app/agenda` | — | — | Remarcar agendamento / Novo agendamento `app/app/agenda/_client.tsx:375`<br>Cancelar agendamento `app/app/agenda/_client.tsx:501` |
| `/app/ai/agents` | — | Renomear agent `app/app/ai/agents/_components/RenameAgentDialog.tsx:55` | — |
| `/app/ai/agents/[id]` | (rótulo dinâmico) `app/app/ai/agents/[id]/_components/AgentForm.tsx:527`<br>Configuração `app/app/ai/agents/[id]/_components/AgentTabs.tsx:55`<br>Teste `app/app/ai/agents/[id]/_components/AgentTabs.tsx:56`<br>Capacidades `app/app/ai/agents/[id]/_components/AgentTabs.tsx:59`<br>Execuções `app/app/ai/agents/[id]/_components/AgentTabs.tsx:60`<br>Histórico `app/app/ai/agents/[id]/_components/AgentTabs.tsx:61`<br>Propostas `app/app/ai/agents/[id]/_components/AgentTabs.tsx:62`<br>Geral `components/ai/AgentEditor.tsx:196`<br>Modelo `components/ai/AgentEditor.tsx:197`<br>RAG `components/ai/AgentEditor.tsx:198`<br>Guardrails `components/ai/AgentEditor.tsx:199` | Diff `app/app/ai/agents/[id]/_components/VersionHistory.tsx:158` | Execução `app/app/ai/agents/[id]/_components/RunDetailDrawer.tsx:54` |
| `/app/ai/agents/new` | (rótulo dinâmico) `app/app/ai/agents/[id]/_components/AgentForm.tsx:527` | — | — |
| `/app/ai/cases` | Contato sem nome `app/app/ai/cases/_components/CaseList.tsx:91` | — | — |
| `/app/ai/credentials` | — | Adicionar credencial `app/app/ai/credentials/_components/AddCredentialDialog.tsx:141` | — |
| `/app/ai/followups` | Fluxos `app/app/ai/followups/page.tsx:47`<br>Fila `app/app/ai/followups/page.tsx:48` | Novo fluxo de follow-up `app/app/ai/followups/_components/NewFlowDialog.tsx:67` | — |
| `/app/ai/followups/[id]` | — | — | Adicionar nó `app/app/ai/followups/[id]/_components/FlowCanvas.tsx:263` |
| `/app/ai/followups/enrollments/[id]` | — | Adiar o próximo passo `app/app/ai/followups/enrollments/[id]/_components/DossieDoFollowup.tsx:350`<br>Por onde seguir? `app/app/ai/followups/enrollments/[id]/_components/DossieDoFollowup.tsx:404` | — |
| `/app/ai/knowledge/sources` | — | Ensinar algo novo ao agente `components/ai/NovoMaterialDialog.tsx:129` | — |
| `/app/ai/memory` | — | Versão `app/app/ai/memory/_client.tsx:328` | — |
| `/app/ai/routers` | (rótulo dinâmico) `app/app/ai/agents/[id]/_components/AgentForm.tsx:527` | Novo roteador `app/app/ai/routers/_client.tsx:156` | — |
| `/app/ai/routers/[id]` | (rótulo dinâmico) `app/app/ai/agents/[id]/_components/AgentForm.tsx:527` | — | — |
| `/app/ai/usage` | — | Orçamento de IA `components/ai/BudgetCard.tsx:331` | — |
| `/app/campanhas` | Campanha `app/app/campanhas/_client.tsx:47`<br>Prospecção `app/app/campanhas/_client.tsx:48`<br>(rótulo dinâmico) `app/app/prospeccao/_client.tsx:299`<br>(rótulo dinâmico) `app/app/prospeccao/_client.tsx:300`<br>(rótulo dinâmico) `app/app/prospeccao/_client.tsx:307`<br>(rótulo dinâmico) `app/app/prospeccao/_client.tsx:316`<br>(rótulo dinâmico) `app/app/prospeccao/_client.tsx:325`<br>(rótulo dinâmico) `app/app/prospeccao/_client.tsx:335` | Campanha por região `app/app/campanhas/_criar-regiao.tsx:257`<br>Enviar mensagem para   empresas `app/app/prospeccao/_disparo.tsx:398`<br>Importar arquivo `app/app/prospeccao/_importar-arquivo.tsx:95` | (rótulo dinâmico) `components/shell/ContextualDrawer.tsx:37` |
| `/app/compras` | Pedidos `app/app/compras/_client.tsx:121`<br>Fornecedores `app/app/compras/_client.tsx:129` | Nova compra `app/app/compras/_client.tsx:523`<br>Novo fornecedor `app/app/compras/_client.tsx:702` | — |
| `/app/compras/[id]` | — | (rótulo dinâmico) `app/app/compras/[id]/_client.tsx:457` | — |
| `/app/connections` | Números por QR `components/connections/ConexoesShell.tsx:39`<br>API Oficial (Meta) `components/connections/ConexoesShell.tsx:40`<br>Provedor parceiro `components/connections/ConexoesShell.tsx:42`<br>Conexão `components/connections/ConexoesShell.tsx:53`<br>Modelos do parceiro `components/connections/ConexoesShell.tsx:54`<br>Conexão `components/connections/ConexoesShell.tsx:68`<br>Templates da Meta `components/connections/ConexoesShell.tsx:70` | — | — |
| `/app/contacts` | Pessoa jurídica `components/contacts/NewContactDialog.tsx:126`<br>Pessoa física `components/contacts/NewContactDialog.tsx:127` | Importar clientes de planilha `components/contacts/ImportContactsDialog.tsx:64`<br>Novo cliente `components/contacts/NewContactDialog.tsx:119` | — |
| `/app/contacts/[id]` | Visão geral `app/app/contacts/[id]/_client.tsx:107`<br>Pedidos `app/app/contacts/[id]/_client.tsx:108`<br>Produtos `app/app/contacts/[id]/_client.tsx:111`<br>Financeiro `app/app/contacts/[id]/_client.tsx:114`<br>WhatsApp `app/app/contacts/[id]/_client.tsx:115`<br>Histórico `app/app/contacts/[id]/_client.tsx:116`<br>Oportunidades `app/app/contacts/[id]/_client.tsx:117`<br>Inteligência `app/app/contacts/[id]/_client.tsx:120`<br>LGPD `app/app/contacts/[id]/_client.tsx:121`<br>Pessoa jurídica `components/contacts/EditContactDialog.tsx:147`<br>Pessoa física `components/contacts/EditContactDialog.tsx:148` | Anonimizar cliente (LGPD) `components/contacts/AnonymizeDialog.tsx:67`<br>Editar cliente `components/contacts/EditContactDialog.tsx:142` | — |
| `/app/estoque` | (rótulo dinâmico) `app/app/estoque/_client.tsx:146` | Novo movimento `app/app/estoque/_client.tsx:688` | — |
| `/app/expedicao/[id]` | — | Adicionar pedido à carga `app/app/expedicao/[id]/_client.tsx:1384`<br>Veículo e motorista `app/app/expedicao/[id]/_client.tsx:1473`<br>(rótulo dinâmico) `app/app/expedicao/[id]/_motorista.tsx:598`<br>Trocar carga `app/app/expedicao/[id]/_motorista.tsx:1399` | — |
| `/app/expedicao/[id]/fechamento` | — | Adicionar pedido à carga `app/app/expedicao/[id]/_client.tsx:1384`<br>Veículo e motorista `app/app/expedicao/[id]/_client.tsx:1473`<br>(rótulo dinâmico) `app/app/expedicao/[id]/_motorista.tsx:598`<br>Trocar carga `app/app/expedicao/[id]/_motorista.tsx:1399` | — |
| `/app/expedicao/[id]/motorista` | — | Adicionar pedido à carga `app/app/expedicao/[id]/_client.tsx:1384`<br>Veículo e motorista `app/app/expedicao/[id]/_client.tsx:1473`<br>(rótulo dinâmico) `app/app/expedicao/[id]/_motorista.tsx:598`<br>Trocar carga `app/app/expedicao/[id]/_motorista.tsx:1399` | — |
| `/app/expedicao/[id]/rota` | — | Adicionar pedido à carga `app/app/expedicao/[id]/_client.tsx:1384`<br>Veículo e motorista `app/app/expedicao/[id]/_client.tsx:1473`<br>(rótulo dinâmico) `app/app/expedicao/[id]/_motorista.tsx:598`<br>Trocar carga `app/app/expedicao/[id]/_motorista.tsx:1399` | — |
| `/app/financeiro` | Contas a receber `app/app/financeiro/_client.tsx:281`<br>Contas a pagar `app/app/financeiro/_client.tsx:282`<br>Cobranças `app/app/financeiro/_client.tsx:283`<br>Conciliação `app/app/financeiro/_client.tsx:284`<br>Fluxo de caixa `app/app/financeiro/_client.tsx:285`<br>Títulos `app/app/financeiro/_client.tsx:286` | — | — |
| `/app/fiscal` | — | Associar item ao catálogo `app/app/fiscal/_components/AssociarProduto.tsx:145` | — |
| `/app/fiscal/notas/[id]` | — | Associar item ao catálogo `app/app/fiscal/_components/AssociarProduto.tsx:145` | — |
| `/app/frota` | Veículos `app/app/frota/_client.tsx:43`<br>Motoristas `app/app/frota/_client.tsx:44` | — | — |
| `/app/inbox` | — | — | Ficha do contato `components/inbox/InboxLayout.tsx:359`<br>Ficha do contato `components/inbox/InboxLayout.tsx:378` |
| `/app/kanban` | — | Importar leads de uma planilha `app/app/kanban/_components/ImportarLeads.tsx:82` | — |
| `/app/lgpd/requests/[id]` | — | Prévia de dados do titular `app/app/lgpd/requests/[id]/PreviewPanel.tsx:58` | — |
| `/app/notas` | (rótulo dinâmico) `app/app/notas/page.tsx:560` | Corrigir nota `app/app/notas/_components/CorrigirNota.tsx:412`<br>(rótulo dinâmico) `app/app/notas/_components/GradeNotas.tsx:880`<br>(rótulo dinâmico) `app/app/notas/_components/GradeNotas.tsx:926`<br>Associar item ao catálogo `app/app/notas/_components/ProdutoParaItem.tsx:64` | — |
| `/app/pedidos/[id]` | — | Foto do produto `components/fotos/LightboxDeFotos.tsx:31` | — |
| `/app/pedidos/novo` | Pessoa jurídica `components/contacts/NewContactDialog.tsx:126`<br>Pessoa física `components/contacts/NewContactDialog.tsx:127` | Prévia do pedido `app/app/pedidos/novo/_editor.tsx:1319`<br>(rótulo dinâmico) `app/app/pedidos/novo/_editor.tsx:1459`<br>Adicionar produtos com IA / Confira os produtos encontrados `app/app/pedidos/novo/_ia.tsx:442`<br>Trocar a tabela muda estes preços `app/app/pedidos/novo/_reprecificacao.tsx:37`<br>Novo cliente `components/contacts/NewContactDialog.tsx:119` | — |
| `/app/pipelines/[id]` | — | Excluir `components/kanban/BulkActionBar.tsx:199`<br>Novo Lead `components/kanban/NewLeadDialog.tsx:147` | — |
| `/app/products` | Produtos `app/app/products/_catalogo.tsx:127`<br>Promoções `app/app/products/_catalogo.tsx:131`<br>Destaques `app/app/products/_catalogo.tsx:135`<br>Configurações `app/app/products/_catalogo.tsx:139`<br>Categorias `app/app/products/_catalogo.tsx:172`<br>Tabelas de preço `app/app/products/_catalogo.tsx:173`<br>Produtos e tabelas `app/app/products/_client.tsx:929`<br>Importar fotos `app/app/products/_client.tsx:949`<br>(rótulo dinâmico) `app/app/products/_client.tsx:1240`<br>Tabelas de preço `app/app/products/_ficha.tsx:251`<br>Informações gerais / há um NCM sugerido `app/app/products/_ficha.tsx:252`<br>Variações `app/app/products/_ficha.tsx:261`<br>Peso e dimensões `app/app/products/_ficha.tsx:262` | Foto do produto `components/fotos/LightboxDeFotos.tsx:31` | — |
| `/app/prospeccao` | (rótulo dinâmico) `app/app/prospeccao/_client.tsx:299`<br>(rótulo dinâmico) `app/app/prospeccao/_client.tsx:300`<br>(rótulo dinâmico) `app/app/prospeccao/_client.tsx:307`<br>(rótulo dinâmico) `app/app/prospeccao/_client.tsx:316`<br>(rótulo dinâmico) `app/app/prospeccao/_client.tsx:325`<br>(rótulo dinâmico) `app/app/prospeccao/_client.tsx:335`<br>(rótulo dinâmico) `components/nexus-ui/forms/NexusSteps.tsx:28` | Enviar mensagem para   empresas `app/app/prospeccao/_disparo.tsx:398`<br>Importar arquivo `app/app/prospeccao/_importar-arquivo.tsx:95` | (rótulo dinâmico) `components/shell/ContextualDrawer.tsx:37` |
| `/app/prospeccao/campanhas/[id]` | — | Enviar mensagem para   empresas `app/app/prospeccao/_disparo.tsx:398` | — |
| `/app/prospeccao/nova` | (rótulo dinâmico) `components/nexus-ui/forms/NexusSteps.tsx:28` | — | — |
| `/app/radar` | — | Campanha de recuperação `app/app/radar/_components/CampanhaDeRecuperacao.tsx:129` | — |
| `/app/radar/recuperacao` | — | Campanha de recuperação `app/app/radar/_components/CampanhaDeRecuperacao.tsx:129` | — |
| `/app/sentinel` | — | Abrindo ocorrência `app/app/sentinel/_client.tsx:577`<br>(rótulo dinâmico) `app/app/sentinel/_client.tsx:591`<br>(rótulo dinâmico) `app/app/sentinel/_client.tsx:800`<br>Configurações do Sentinel `app/app/sentinel/_client.tsx:841` | — |
| `/app/settings/api-tokens` | — | Criar novo token `app/app/settings/api-tokens/_components/ApiTokensClient.tsx:219`<br>Token criado `app/app/settings/api-tokens/_components/ApiTokensClient.tsx:285` | — |
| `/app/settings/security` | — | Configure a verificação em duas etapas `components/auth/MfaEnrollModal.tsx:97`<br>Escaneie o QR code `components/auth/MfaEnrollModal.tsx:132`<br>Códigos de recuperação `components/auth/MfaEnrollModal.tsx:199` | — |
| `/app/team` | Membros `app/app/team/page.tsx:52`<br>Atendimento `app/app/team/page.tsx:53` | Horário de `app/app/team/_components/AttendantsClient.tsx:103`<br>Números que enxerga `app/app/team/_components/TeamMembersClient.tsx:287`<br>Revogar acesso `app/app/team/_components/TeamMembersClient.tsx:393` | — |
| `/app/templates` | — | Editar template / Novo template `app/app/templates/_components/TemplateFormDialog.tsx:109` | — |
| `/app/venda-automatica` | — | (rótulo dinâmico) `app/app/venda-automatica/_client.tsx:589` | — |
| `/app/webhooks` | Receber dados `app/app/webhooks/_components/WebhooksClient.tsx:40`<br>Leads recebidos `app/app/webhooks/_components/WebhooksClient.tsx:41`<br>Automações `app/app/webhooks/_components/WebhooksClient.tsx:42`<br>Atividade `app/app/webhooks/_components/WebhooksClient.tsx:43` | Nova fonte de captação `app/app/webhooks/_components/CreateSourceDialog.tsx:97` | Captação `app/app/webhooks/_components/CapturaDetail.tsx:71`<br>Editar automação / Nova automação `app/app/webhooks/_components/RuleEditor.tsx:193`<br>(rótulo dinâmico) `app/app/webhooks/_components/SourceDetail.tsx:127` |
