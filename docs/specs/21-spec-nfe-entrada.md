# Spec 21 — Módulo de Notas Fiscais (NF-e de entrada)

> **Status:** prompt do dono preservado VERBATIM abaixo; módulo implementado em
> 02/11/2026. Estado de execução: [`21-plano-tecnico-nfe-entrada.md`](21-plano-tecnico-nfe-entrada.md)
> §13. Entrega da seção 25: [`21-entrega-nfe-entrada.md`](21-entrega-nfe-entrada.md).
> A comunicação real com a SEFAZ segue **bloqueada por credenciais** (Etapa 0) —
> não está declarada como validada.
> **Regra deste arquivo:** o prompt abaixo é a fonte. Não resumir, não "melhorar" a
> redação, não apagar seção. O que for medido no repo entra **depois**, no Anexo A,
> marcado como `CONFIRMADO`, e nunca dentro do texto do dono.

---

## Prompt original (verbatim)

### 1. MISSÃO

Você é um arquiteto de software sênior, especialista em Java, sistemas ERP, integração fiscal brasileira, SEFAZ, UX/UI e desenvolvimento de sistemas corporativos.

Sua missão é desenvolver e integrar ao Nexus CRM (crm.billhigiene.tech) um módulo completo de NOTAS FISCAIS ELETRÔNICAS DE ENTRADA.

O sistema deverá buscar automaticamente as notas fiscais emitidas contra um único CNPJ configurado, utilizando certificado digital A1 e o serviço oficial de distribuição de documentos fiscais da SEFAZ.

Quero uma implementação real, funcional, integrada ao CRM existente.

Não quero uma landing page demonstrativa, protótipo ou telas sem funcionamento.

Quero um módulo de gestão fiscal completo, com banco de dados, integração, automação, telas, filtros, relatórios e controle de documentos.

### 2. PRIMEIRA ETAPA — ANALISAR A ARQUITETURA EXISTENTE

Antes de qualquer alteração:

- Analise toda a estrutura do Nexus CRM.
- Identifique a linguagem e o framework do backend.
- Verifique se utiliza Java, Spring Boot ou outra tecnologia.
- Identifique o framework frontend.
- Identifique o banco de dados.
- Analise o sistema de autenticação.
- Identifique o padrão visual atual.
- Analise os menus, componentes, tabelas e formulários existentes.
- Verifique como são implementadas as permissões.
- Identifique onde integrar o novo módulo sem quebrar funcionalidades existentes.

IMPORTANTE:

- Não presuma que o sistema utiliza Java.
- Se o backend for Java, avalie a biblioteca WMIX NFe.
- Se utilizar outra tecnologia, avalie a compatibilidade antes de escolher a estratégia de integração.
- Não migre o sistema inteiro de tecnologia.
- Preserve o código, a arquitetura e as funcionalidades existentes.

### 3. BIBLIOTECA FISCAL — WMIX NFE

Avalie e, caso compatível, integre:

https://github.com/wmixvideo/nfe

Objetivo: aproveitar a implementação existente de comunicação com a SEFAZ.

Analise especialmente:

- Distribuição DF-e.
- NFeDistribuicaoDFe.
- Consulta por último NSU.
- Consulta por NSU específico.
- Consulta por chave de acesso.
- Download e processamento de XML.
- Certificado digital A1.
- Manifestação do destinatário.
- Eventos fiscais.

Leia o código-fonte e a documentação antes de desenvolver.

Não invente nomes de métodos.

Utilize as classes e assinaturas realmente disponíveis na versão escolhida.

Não reimplemente funcionalidades já existentes na biblioteca sem necessidade.

Crie uma camada de serviço própria do Nexus para encapsular a biblioteca.

### 4. ESTRUTURA VISUAL DO MÓDULO NFE

Criar um módulo principal no menu lateral do Nexus chamado:

NOTAS FISCAIS

Ao clicar, abrir uma área de trabalho própria, com navegação por subtelas.

NÃO colocar todas as informações em uma única página.

NÃO criar uma landing page gigante com todos os indicadores, configurações e tabelas juntos.

Utilizar uma interface administrativa profissional, moderna, organizada e intuitiva.

Estrutura do menu interno

NOTAS FISCAIS

- Visão Geral
- Todas as Notas
- Pendentes de Conferência
- XML Recebidos
- Resumos de Notas
- Manifestação do Destinatário
- Fornecedores
- Produtos das Notas
- Cancelamentos e Eventos
- Relatórios
- Histórico de Sincronização
- Configurações Fiscais

Cada opção deve abrir uma subtela própria.

Utilizar navegação por sidebar interna, tabs ou menu secundário, respeitando o padrão visual já existente no Nexus.

A navegação deve ser rápida, sem recarregamentos desnecessários.

### 5. DESIGN — IDENTIDADE VISUAL

O design deve transmitir um sistema ERP empresarial.

Características:

- Visual limpo e profissional.
- Interface moderna.
- Hierarquia visual bem definida.
- Espaçamento consistente.
- Tipografia legível.
- Tabelas profissionais.
- Cards discretos.
- Ícones consistentes.
- Responsividade.
- Excelente experiência em desktop.
- Adaptação para tablets e celulares.

Respeitar a identidade visual existente do Nexus.

Não inventar uma identidade completamente diferente.

Não utilizar excesso de cores. Não utilizar gradientes exagerados. Não utilizar animações desnecessárias. Não criar cards gigantes. Não transformar o sistema em uma página de marketing.

Utilizar cores de status de forma consistente:

- Verde: importada, concluída, autorizada.
- Amarelo: pendente, aguardando XML, em processamento.
- Vermelho: erro, rejeitada, cancelada.
- Azul: informativa, em consulta.
- Cinza: inativa ou não processada.

Criar estados visuais para:

- Carregamento.
- Nenhum resultado.
- Erros.
- Sucesso.
- Processamento.
- Sincronização em andamento.

### 6. SUBTELA — VISÃO GERAL

Criar um dashboard fiscal com:

Indicadores:

- Total de notas recebidas.
- Notas importadas.
- Notas pendentes.
- Notas aguardando XML completo.
- Notas canceladas.
- Valor total recebido.
- Quantidade de fornecedores.
- Última sincronização.

Adicionar gráficos:

- Notas recebidas por mês.
- Valor das notas por mês.
- Quantidade de notas por fornecedor.
- Situação das notas.

Adicionar seção de atividades recentes.

Adicionar botão destacado:

SINCRONIZAR AGORA.

Mostrar o status da comunicação com a SEFAZ.

Os indicadores devem usar dados reais do banco de dados.

### 7. SUBTELA — TODAS AS NOTAS

Criar tabela profissional com:

- Data de emissão.
- Número.
- Série.
- Chave de acesso.
- Fornecedor.
- CNPJ do fornecedor.
- Valor total.
- Status da importação.
- Situação fiscal.
- Ações.

Funcionalidades:

- Pesquisa por fornecedor.
- Pesquisa por número.
- Pesquisa por chave de acesso.
- Filtro por período.
- Filtro por situação.
- Filtro por valor.
- Ordenação por coluna.
- Paginação.
- Visualização detalhada.
- Download do XML.
- Visualização do DANFE quando disponível.

Ao clicar em uma nota, abrir uma página ou painel de detalhes próprio.

Não colocar todos os dados da nota diretamente na tabela.

### 8. SUBTELA — DETALHES DA NOTA

Criar uma tela individual para cada NF-e.

Organizar em abas:

ABA 1 — DADOS GERAIS

- Número.
- Série.
- Chave de acesso.
- Data de emissão.
- Data de entrada.
- Natureza da operação.
- Protocolo.
- Situação fiscal.

ABA 2 — FORNECEDOR

- CNPJ.
- Razão social.
- Nome fantasia.
- Inscrição estadual.
- Endereço.

ABA 3 — PRODUTOS

- Código.
- Descrição.
- NCM.
- CFOP.
- Unidade.
- Quantidade.
- Valor unitário.
- Valor total.

ABA 4 — IMPOSTOS

- ICMS.
- IPI.
- PIS.
- COFINS.
- Outros tributos.
- Total de impostos.

ABA 5 — TOTAIS

- Produtos.
- Frete.
- Seguro.
- Desconto.
- Outras despesas.
- Valor total da NF-e.

ABA 6 — XML E EVENTOS

- Visualização do XML.
- Download do XML.
- Eventos relacionados.
- Cancelamento.
- Carta de correção.
- Histórico de processamento.

### 9. SUBTELA — PENDENTES DE CONFERÊNCIA

Criar uma tela específica para notas que chegaram, mas ainda precisam ser conferidas.

Mostrar:

- Fornecedor.
- Número da nota.
- Valor.
- Data.
- Quantidade de produtos.
- Status da conferência.

Permitir:

- Abrir nota.
- Conferir produtos.
- Associar produtos aos cadastros existentes.
- Associar fornecedor.
- Aprovar conferência.
- Marcar como pendente.
- Registrar observações.

Não movimentar estoque automaticamente sem verificar as regras existentes do Nexus e obter a aprovação necessária.

### 10. SUBTELA — XML RECEBIDOS

Criar uma biblioteca de XMLs fiscais.

Mostrar:

- Arquivo.
- Número da nota.
- Chave.
- Fornecedor.
- Data de recebimento.
- Tipo de documento.
- Situação do processamento.

Permitir:

- Download.
- Visualização.
- Pesquisa.
- Filtro.
- Identificação de XMLs duplicados.
- Identificação de documentos incompletos.

Preservar os XMLs originais.

### 11. SUBTELA — RESUMOS DE NOTAS

Criar uma área exclusiva para documentos resumidos disponibilizados pela SEFAZ.

Mostrar:

- Chave de acesso.
- Fornecedor.
- Número da nota, quando disponível.
- Data.
- NSU.
- Situação.

Diferenciar claramente:

- Resumo de NF-e.
- XML completo de NF-e.
- Eventos fiscais.

Não considerar um resumo como se fosse o XML completo.

Quando necessário, orientar o usuário sobre a manifestação do destinatário para obter o documento completo, conforme as regras fiscais.

### 12. SUBTELA — MANIFESTAÇÃO DO DESTINATÁRIO

Implementar os eventos:

- Ciência da Emissão.
- Confirmação da Operação.
- Desconhecimento da Operação.
- Operação não Realizada.

Mostrar:

- Nota.
- Fornecedor.
- Evento.
- Data.
- Usuário responsável.
- Protocolo.
- Resultado.

Exigir confirmação explícita antes de transmitir qualquer manifestação.

Registrar auditoria.

Respeitar prazos, regras fiscais e sequência permitida de eventos.

Não manifestar automaticamente sem autorização.

### 13. SUBTELA — FORNECEDORES

Criar uma área para consultar fornecedores identificados nas notas.

Mostrar:

- Razão social.
- CNPJ.
- Inscrição estadual.
- Quantidade de notas.
- Valor total comprado.
- Última nota recebida.

Permitir abrir o histórico fiscal de cada fornecedor.

Integrar com o cadastro de fornecedores existente.

Evitar duplicidade por CNPJ.

### 14. SUBTELA — PRODUTOS DAS NOTAS

Criar área para visualizar os produtos identificados nos XMLs.

Mostrar:

- Código.
- Descrição.
- NCM.
- Unidade.
- Fornecedor.
- Quantidade recebida.
- Valor unitário.
- Valor total.

Permitir associar itens da nota aos produtos cadastrados no Nexus.

Não criar produtos duplicados automaticamente.

Não alterar preços ou estoque sem regras e permissões definidas.

### 15. SUBTELA — CANCELAMENTOS E EVENTOS

Criar uma tela específica para acompanhar:

- Notas canceladas.
- Cartas de correção.
- Eventos de manifestação.
- Outros eventos disponibilizados pela SEFAZ.

Mostrar o histórico completo por chave de acesso.

Atualizar a situação fiscal sem apagar o documento original.

### 16. SUBTELA — RELATÓRIOS

Criar relatórios com filtros:

- Por período.
- Por fornecedor.
- Por CNPJ.
- Por valor.
- Por situação.
- Por produto.

Relatórios:

- Total de compras por período.
- Compras por fornecedor.
- Notas recebidas por mês.
- Produtos mais comprados.
- Total de impostos destacados.
- Notas canceladas.
- Notas pendentes.

Permitir exportação para Excel e PDF.

Os valores devem ser calculados a partir dos documentos efetivamente armazenados.

### 17. SUBTELA — HISTÓRICO DE SINCRONIZAÇÃO

Criar uma tela para acompanhar as consultas à SEFAZ.

Mostrar:

- Data e hora.
- Início e fim.
- NSU inicial.
- NSU final.
- Quantidade de documentos encontrados.
- Quantidade importada.
- Quantidade com erro.
- Resultado.
- Mensagem de retorno.

Permitir abrir os detalhes de cada execução.

Criar botão de sincronização manual.

### 18. CONFIGURAÇÕES FISCAIS

Criar uma tela administrativa para configurar:

- CNPJ monitorado.
- Razão social.
- UF.
- Certificado digital A1.
- Senha do certificado.
- Ambiente de homologação ou produção.
- Ativação da integração.
- Frequência de consulta.
- Última sincronização.

O CNPJ monitorado será único.

Não permitir cadastrar vários CNPJs nesta primeira versão.

Proteger o certificado com criptografia.

Nunca enviar o certificado ou sua senha ao frontend.

Nunca expor credenciais em logs ou APIs.

### 19. INTEGRAÇÃO REAL COM A SEFAZ

Utilizar o serviço oficial:

NFeDistribuicaoDFe.

Implementar:

- Autenticação com certificado A1.
- Consulta por último NSU.
- Consulta de documentos destinados ao CNPJ.
- Processamento de docZip.
- Descompactação dos documentos.
- Identificação do tipo de documento.
- Armazenamento de resumos.
- Armazenamento de XMLs completos.
- Armazenamento de eventos.
- Atualização segura do NSU.
- Tratamento de indisponibilidade.
- Controle de concorrência.
- Tratamento de consumo indevido.

Respeitar as regras oficiais da SEFAZ, inclusive intervalos mínimos de consulta e bloqueios.

Não avançar NSU quando o processamento correspondente não tiver sido persistido com segurança.

Implementar sincronização incremental e recuperação de falhas.

Considerar que a distribuição não oferece histórico ilimitado.

### 20. AUTOMAÇÃO

Implementar serviço em segundo plano.

A rotina deverá:

- Executar automaticamente.
- Consultar documentos novos.
- Atualizar NSU.
- Processar XML.
- Importar notas.
- Registrar eventos.
- Evitar duplicidades.
- Registrar erros.
- Permitir nova tentativa quando apropriado.

Criar controle para impedir execuções simultâneas.

A sincronização manual deverá utilizar os mesmos controles da automática.

### 21. BANCO DE DADOS

Criar ou adaptar tabelas conforme o padrão existente:

- fiscal_configurations
- fiscal_certificates
- fiscal_documents
- fiscal_document_items
- fiscal_suppliers
- fiscal_events
- fiscal_manifestations
- fiscal_nsu_control
- fiscal_sync_logs

Criar migrations.

Criar índices.

Criar relacionamentos.

Utilizar transações.

Criar restrição de unicidade para chave de acesso.

Preservar documentos e históricos.

Não duplicar fornecedores nem produtos.

### 22. SEGURANÇA

Implementar:

- Controle de acesso por usuário.
- Permissões administrativas.
- Proteção do certificado A1.
- Criptografia de credenciais.
- Validação de arquivos.
- Proteção de endpoints.
- Auditoria de ações.
- Logs sem dados sensíveis.
- Controle de manifestações.
- Validação de CNPJ.

### 23. EXPERIÊNCIA DO USUÁRIO

Todas as subtelas devem ter:

- Breadcrumb.
- Título claro.
- Descrição curta.
- Ações contextualizadas.
- Filtros organizados.
- Tabelas responsivas.
- Paginação.
- Feedback de sucesso e erro.
- Estados de carregamento.
- Estados vazios.

Criar componentes reutilizáveis.

Não duplicar código de interface.

Utilizar os componentes já existentes no Nexus sempre que possível.

### 24. TESTES E VALIDAÇÃO

Testar:

- Consulta de distribuição DF-e.
- Certificado A1.
- Autenticação.
- NSU.
- XML completo.
- Resumos.
- Eventos.
- Cancelamentos.
- Manifestação.
- Importação de produtos.
- Importação de fornecedores.
- Duplicidade.
- Sincronização automática.
- Permissões.
- Segurança.

Utilizar homologação sempre que disponível.

Não utilizar documentos fictícios como se fossem reais.

Não declarar integração concluída sem comunicação validada com a SEFAZ.

### 25. ENTREGA FINAL

Ao terminar, apresentar:

- Arquitetura implementada.
- Bibliotecas utilizadas.
- Arquivos criados e modificados.
- Banco de dados e migrations.
- Endpoints criados.
- Subtelas implementadas.
- Rotina automática.
- Configuração do certificado A1.
- Configuração do CNPJ.
- Testes realizados.
- Pendências de credenciais.
- Instruções para colocar em produção.

### REGRA FINAL

Quero que você desenvolva o módulo dentro do Nexus CRM existente.

Não crie outro sistema separado.

Não transforme tudo em uma única landing page.

Crie um módulo fiscal completo com menu próprio, subtelas independentes, navegação organizada, interface profissional e integração real com a SEFAZ.

Primeiro analise o projeto e apresente o plano técnico. Depois execute a implementação por etapas, validando cada etapa antes de avançar.

Não interrompa a implementação apenas por ter criado as telas. A integração, o banco, a automação e as funcionalidades devem funcionar de verdade.

O resultado final deve ter qualidade de um módulo fiscal de ERP profissional.

---

## Anexo A — `CONFIRMADO`: o que o repo já tem (medido em 02/11/2026)

> Este anexo **não** é texto do dono. É medição, para o plano técnico da seção 2
> partir do que existe em vez de presumir. Cada linha tem o comando/o arquivo que
> a prova. Onde não medi, está escrito `NÃO MEDIDO`.

### A.1 Stack real (a premissa "Java" da seção 1 não vale aqui)

| Pergunta da seção 2 | Resposta medida | Prova |
|---|---|---|
| Linguagem/framework do backend | TypeScript + Next.js 16 (App Router), route handlers em `app/api/**` | `package.json` |
| É Java/Spring Boot? | **Não.** Nenhum `pom.xml`, `build.gradle`, `.java` | `glob '**/*.java'` vazio |
| Frontend | React 19 + Tailwind 4 + shadcn/ui | `package.json` |
| Banco | Postgres (Supabase), RLS por `organization_id` | `supabase/baseline.sql`, `supabase/migrations/` |
| Auth | Supabase Auth; guard canônico `requireRole()` em `lib/auth/require-role.ts`; borda em `proxy.ts` | `lib/auth/` |
| Permissões | RBAC por papel + `organization_id` explícito em toda query | `lib/auth/require-role.ts` |
| Padrão visual | componentes em `components/nexus-ui/`, telas em `app/app/**` | `app/app/notas/`, `components/nexus-ui/` |
| Validação de input | Zod 4 em toda borda | `package.json`, route handlers |

**Consequência direta:** a biblioteca WMIX NFe (seção 3) é **Java** e não roda no
runtime deste repo (Node ≥22). Ela não pode ser "integrada" sem introduzir uma JVM.
A decisão de estratégia fica para o plano técnico — com a opção já existente no repo
descrita em A.2.

### A.2 Já existe emissão de NF-e — em PHP, não em Java

`fiscal/sidecar/` é um micro-serviço **PHP** que emite NF-e modelo 55 via
`nfephp-org/sped-nfe ^5.0`. O app Next **nunca** fala com a SEFAZ direto: monta o
payload, chama o sidecar na rede privada e grava o retorno.

- Prova: `fiscal/sidecar/README.md`, `fiscal/sidecar/composer.json`.
- Estado declarado pelo próprio README: **não executado/validado** nesta máquina
  (sem PHP, sem certificado, sem SEFAZ). Ou seja, hoje não há prova de comunicação
  validada com a SEFAZ — o que a seção 24 proíbe declarar como concluído.

### A.3 Já existe captação de NF-e de entrada (parcial)

| Superfície | O que é | Prova |
|---|---|---|
| `fiscal_entradas` | NF-e de entrada: `chave` (44 dígitos, **única por organização**), `nsu`, emitente, `xml`, `itens_json`, `manifestacao`, `status` | `supabase/baseline.sql:20279` |
| `fiscal_entrada_cursor` | `ult_nsu` do ciclo de entrada | `supabase/baseline.sql` |
| `fiscal_emitidas_cursor` | `ult_nsu` das emitidas | `supabase/baseline.sql` |
| `fiscal_events` | eventos fiscais já existentes | `supabase/baseline.sql` |
| `fiscal_inutilizacoes`, `fiscal_cfop_equivalentes`, `fiscal_ibpt` | tabelas fiscais já existentes | `supabase/baseline.sql` |
| `fiscal_settings`, `fiscal_jobs` | configuração e fila de emissão | `supabase/baseline.sql` |
| `/api/v1/fiscal-entradas`, `/api/v1/fiscal-entradas/[id]` | API de entrada já exposta | `app/api/v1/fiscal-entradas/` |
| `/api/v1/fiscal-events`, `/api/v1/fiscal-settings`, `/api/v1/fiscal-jobs`, `/api/v1/fiscal-inutilizacoes`, `/api/v1/fiscal-cfop-equivalentes`, `/api/v1/fiscal-ibpt` | demais rotas fiscais | `app/api/v1/` |
| `app/app/notas/` | UI "Notas" existente | `app/app/notas/page.tsx`, `app/app/notas/_components/textos.ts` |

**Consequência direta:** as tabelas pedidas na seção 21 (`fiscal_documents`,
`fiscal_document_items`, `fiscal_suppliers`, `fiscal_manifestations`,
`fiscal_nsu_control`, `fiscal_sync_logs`, `fiscal_configurations`,
`fiscal_certificates`) **não existem** com esses nomes. O plano técnico precisa
decidir, item a item, entre **adaptar** o que já existe (`fiscal_entradas`,
`fiscal_entrada_cursor`, `fiscal_events`, `fiscal_settings`) e **criar** o que falta
— sem duplicar a mesma informação em duas tabelas.

### A.4 O que este anexo NÃO afirma

- Não afirma que a captação atual funciona: não há execução contra a SEFAZ registrada.
- Não afirma regra de negócio fiscal (prazo de manifestação, sequência de eventos,
  intervalo mínimo entre consultas): a seção 24 e o `CLAUDE.md` proíbem inventar.
  Essas regras vêm da SEFAZ/nota técnica e serão citadas com fonte no plano.
- Não escolhe a estratégia de integração (sidecar PHP existente × novo serviço ×
  biblioteca JS): isso é decisão do plano técnico, com prós/contras medidos.
