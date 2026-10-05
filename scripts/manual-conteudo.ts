export interface TelaManual {
  /** Rota como aparece na URL. */
  rota: string;
  /** Título curto da tela (como o menu a chama). */
  titulo: string;
  /** Um parágrafo curto: o que a tela é e pra que serve. */
  resumo: string;
  /** 3 a 6 bullets: o que o usuário FAZ nesta tela (campos, ações, botões reais da tela). */
  itens: string[];
}

export const TELAS_MANUAL: TelaManual[] = [
  {
    rota: "/app",
    titulo: "Dashboard",
    resumo:
      "A tela que abre depois do login: o resumo do mês, com o que já vendeu, quanto falta para a meta e o que precisa da sua atenção agora.",
    itens: [
      "Leia a saudação (Bom dia, Boa tarde ou Boa noite) com seu primeiro nome e o mês que está na tela.",
      "Confira os quatro indicadores do topo: Vendido hoje, Vendido no mês (com ticket médio), Meta do mês (com o percentual e quanto falta por dia útil) e Previsão de fechamento (com os dias úteis restantes).",
      "No gráfico Evolução de Vendas, troque o mês com as setas “Mês anterior” e “Próximo mês”, escolha o intervalo (1D, 1W, 1M, Tudo) e ligue “Comparar” para ver Mês passado e Ano passado.",
      "Passe pelas seções Clientes para agir, Sales roadmap, Sales radar e Recomendações — cada uma com atalho para abrir a tela completa.",
      "Use “Acesso rápido” para ir direto ao Inbox, Radar, Indicadores, Financeiro, Pedidos e Clientes, e veja a Atividade recente no fim da página.",
    ],
  },
  {
    rota: "/app/meu-dia",
    titulo: "Meu Dia",
    resumo:
      "Sua linha do tempo de hoje: o que está atrasado, o que cai hoje e o que vem depois, com as mensagens e os follow-ups do dia do lado.",
    itens: [
      "Leia a saudação com a data por extenso e o resumo (quantas tarefas atrasadas, hoje e amanhã).",
      "Percorra a linha do tempo agrupada em Atrasado, Hoje, Amanhã e Mais tarde — tarefas suas e compromissos da agenda no mesmo lugar.",
      "Em cada tarefa, use “Concluir” para fechar e “Amanhã” para adiar para o dia seguinte.",
      "Na coluna de contexto, abra as Mensagens não lidas (“Abrir inbox”), os Follow-ups ativos (“Ver fila”) e as Recomendações (“Ver cliente”).",
      "Use os atalhos Pedidos hoje, Tarefas (“Ver todas”) e Agenda (“Ver semana”).",
      "Quando não há nada pendente, a tela mostra “Dia limpo”.",
    ],
  },
  {
    rota: "/app/radar",
    titulo: "Radar",
    resumo:
      "Uma página só com o que corre risco ou merece atenção hoje: recompra, demandas paradas, clientes que sumiram e os prospects novos.",
    itens: [
      "Use os botões do topo (Visão geral, Recompra, Risco de demandas, Recuperação, Prospecção) para rolar até a seção — todo o conteúdo já nasce visível.",
      "Na visão geral, filtre por cliente, vendedor, cidade, “Sem compra há até”, nível, dias parados e ticket mínimo, e clique em “Atualizar” ou “Limpar filtros”.",
      "Acompanhe os cartões de clientes monitorados, em risco, oportunidades de recompra e receita em risco, além de Ações recomendadas hoje e Saúde da carteira.",
      "Em “Todos os alertas de recompra”, filtre por situação e abra o cliente com “Ver pedidos”; em “Radar de risco”, assuma a demanda com “Assumir”.",
      "Em Recuperação de clientes, ajuste “Sem compra há ao menos (dias)” e aja com “Chamar no WhatsApp”, “Ficha” ou “Novo pedido”.",
      "Em Novos prospects, use “Abrir”, “Iniciar conversa” ou “Adicionar à fila” — essas três ações pedem papel de atendente ou superior.",
    ],
  },
  {
    rota: "/app/inbox",
    titulo: "Inbox",
    resumo:
      "As conversas de WhatsApp em uma tela: a lista à esquerda, a conversa no meio e a ficha do cliente à direita, com você e a IA atendendo lado a lado.",
    itens: [
      "Escolha a aba da lista: Fila, Minhas, Todas, Fechadas ou Automático.",
      "Filtre por nome, telefone ou mensagem, por número de WhatsApp e por assunto (Venda Automática, Radar, Interessados, Sem resposta, Oportunidades), e marque “Apenas não lidos”.",
      "Na conversa, use os botões do cabeçalho: Assumir, Liberar, Pausar o automático, Devolver ao automático, Transferir, Fechar e Ver contato — e adie com “Em 1 hora”, “Em 3 horas” ou “Em 24 horas”.",
      "Escreva a resposta no campo de mensagem; quando a janela de 24h fecha, só modelo aprovado é aceito.",
      "Edite as tags da conversa e do contato pela ficha lateral, que também mostra os dados do cliente.",
      "Atalhos: j e k trocam de conversa, r foca a resposta, a assume, e abre a lista de atalhos.",
    ],
  },
  {
    rota: "/app/ai/followups",
    titulo: "Follow-ups",
    resumo:
      "Os fluxos automáticos que retomam uma conversa em silêncio para ela não morrer, e a fila do que está agendado agora.",
    itens: [
      "Na aba Fluxos, veja cada fluxo com status, versão e política de handoff, e clique nele para abrir o editor visual.",
      "Crie um fluxo com “Novo fluxo”: ele nasce como rascunho e você monta as etapas em seguida (criar e apagar é de gerente para cima).",
      "Na aba Fila, busque pelo contato e filtre por status e por fluxo.",
      "Na tabela, acompanhe Contato, Fluxo/Promessa, Nº atual/Motivo, Próximo disparo e Status.",
      "Cancele o que não deve mais disparar com o botão “Cancelar” da linha.",
    ],
  },
  {
    rota: "/app/pedidos",
    titulo: "Pedidos",
    resumo:
      "Todos os pedidos da loja, do rascunho à entrega, com a origem de cada um (IA, vendedor, WhatsApp, B2B) e o status do ciclo comercial.",
    itens: [
      "Busque por pedido, cliente ou representada e filtre por status, vendedor, origem, envio, período, valor e condição de pagamento.",
      "Troque a visualização entre Cartões, Tabela e Quadro.",
      "Marque pedidos e aja em massa: Avançar, Aprovar, Cancelar, Excluir, Exportar CSV ou Imprimir.",
      "Crie um pedido com “Criar pedido / orçamento” e reimprima com “Imprimir pedidos” — criar exige papel de atendente ou superior, excluir de gerente para cima.",
      "Salve um recorte com “Salvar filtro” e reabra depois em “Filtros salvos”; “Duplicar” gera um pedido novo a partir de um existente.",
      "Clique em “Detalhe” na linha para abrir o pedido completo.",
    ],
  },
  {
    rota: "/app/contacts",
    titulo: "Clientes",
    resumo: "A lista dos seus clientes — busca, filtros e a ficha completa de cada um.",
    itens: [
      "Busque por nome, e-mail ou telefone e filtre por etiqueta e por origem; “Por página” muda quantos clientes carregam por vez.",
      "Ordene pelas colunas Nome, E-mail, Telefone e Última atividade.",
      "Abra a ficha do cliente pelo nome na linha; o ícone de conversa leva direto para aquela conversa na Inbox.",
      "Marque clientes com o checkbox e aplique etiquetas em massa com “Adicionar” ou “Remover” e “Aplicar”.",
      "Cadastre um cliente com “Novo cliente” e traga uma lista com “Importar CSV”.",
      "Carregue mais resultados com “Carregar mais”.",
    ],
  },
  {
    rota: "/app/products",
    titulo: "Produtos",
    resumo:
      "O catálogo da loja: é daqui que o atendente de IA tira o preço quando alguém pergunta pelo produto.",
    itens: [
      "Alterne entre as abas Produtos, Categorias e Tabelas de preço.",
      "Na aba Produtos, busque por nome, código ou marca e filtre pelas abas Produtos, Promoções e Destaques.",
      "Cadastre com “Novo produto” (código, nome, marca, categoria, preço, NCM, unidade, custo e controle de estoque) e mexa no que já existe com “Editar”.",
      "Marque “Destacar”/“Tirar destaque” e “Desativar”/“Reativar” no próprio item da lista.",
      "Importe em massa com “Importar planilha”: aparece o resumo de criados, atualizados e das linhas que não entraram.",
      "Nas abas Categorias e Tabelas de preço, crie categorias com subcategorias e tabelas com desconto, clicando no preço para sobrescrever. Cadastrar e alterar exige papel de gerente.",
    ],
  },
  {
    rota: "/app/kanban",
    titulo: "Funis",
    resumo: "A lista dos seus funis de venda — de aqui você abre o quadro de clientes de cada um.",
    itens: [
      "Clique num funil para abrir o quadro dele.",
      "Crie com “Novo funil” informando o nome (ex.: Consultas, Obras, Matrículas).",
      "Reordene com as setas “Subir” e “Descer” e marque um como “Padrão”.",
      "No menu de cada funil use “Renomear”, “Tornar padrão” e “Arquivar” (que também pode “Excluir de vez”).",
      "Importe leads com “Importar planilha”, escolhendo o funil de destino e baixando a planilha modelo.",
      "Ler e abrir é de qualquer papel; criar, renomear, reordenar e arquivar é de gerente para cima, e importar planilha é de atendente para cima.",
    ],
  },
  {
    rota: "/app/prospeccao",
    titulo: "Prospecção",
    resumo: "Encontre empresas por cidade, UF e categoria e leve as que interessam para o CRM.",
    itens: [
      "Na aba “Encontrar empresas”, digite onde você quer vender (Cidade, UF, Raio em km, Máximo de empresas), que tipo de empresa e o que encontrar (novas, com telefone, com WhatsApp, que ainda não são clientes).",
      "Acompanhe o progresso com Encontradas, Novas, Duplicadas, Erros e Custo estimado, e use “Pausar”, “Continuar” ou “Cancelar”.",
      "Na aba “Pesquisas”, veja as buscas já feitas e abra os resultados com “Ver empresas”.",
      "Na aba “Empresas”, filtre e aje as empresas encontradas com “Adicionar ao CRM”, “Adicionar à fila”, “Criar rota” e “Criar venda automática”.",
      "Na aba “Mercado”, veja o potencial por cidade e por categoria; na aba “Campanhas”, acompanhe Encontrados, Contatados, Respostas, Oportunidades, Pedidos e Faturamento.",
      "A aba “Configuração” (provedor, limites e consumo) só aparece para gerente; criar busca exige papel de atendente ou superior.",
    ],
  },
  {
    rota: "/app/estoque",
    titulo: "Estoque",
    resumo:
      "O saldo dos produtos, o razão de tudo que entrou e saiu, e o que precisa ser recomposto.",
    itens: [
      "Alterne entre as abas Saldos, Movimentos e Sugestões.",
      "Em Saldos, busque produto pelo nome ou código e veja a tabela Código, Produto e Saldo, do menor saldo para o maior.",
      "Registre um lançamento com “Novo movimento” ou com o botão “Movimento” da linha: escolha o produto, o tipo (Entrada, Saída ou Ajuste), a quantidade e uma observação.",
      "Em Movimentos, filtre por tipo e leia Data, Produto, Tipo, Quantidade e Observação de cada lançamento.",
      "Em Sugestões, veja saldo, média por dia, cobertura, quantidade sugerida e valor, e clique em “Criar compra” para abrir a compra já preenchida.",
      "Escrever no estoque exige papel de atendente ou superior; quem só consulta vê tudo normalmente.",
    ],
  },
  {
    rota: "/app/expedicao",
    titulo: "Expedição",
    resumo: "As cargas do transporte próprio e os pedidos esperando para serem embarcados.",
    itens: [
      "Na seção Cargas, veja o número da carga com o status, a placa, o veículo e o motorista.",
      "Abra a carga pelo número e veja o romaneio com “Romaneio + fechamento”.",
      "Em Nova carga, preencha Placa, Veículo e Motorista.",
      "Marque na lista “Aguardando embarque” os pedidos que vão na carga — só aparecem pedidos aprovados ou faturados.",
      "Conclua com “Criar carga”; a carga nasce e o pedido sai da fila de embarque.",
      "Criar carga exige papel de atendente ou superior.",
    ],
  },
  {
    rota: "/app/financeiro",
    titulo: "Contas a Receber",
    resumo:
      "O financeiro inteiro numa tela só (o cabeçalho dela se chama Financeiro): receber, pagar, cobranças, conciliação, fluxo de caixa e títulos em abas.",
    itens: [
      "Escolha a aba: Contas a receber, Contas a pagar, Cobranças, Conciliação, Fluxo de caixa ou Títulos.",
      "Em Contas a receber, leia os indicadores A receber, Vencido, Vence hoje / 7 dias e Recebido (período), e filtre por cliente, status, vencimento de/até ou pelos atalhos Hoje, Vencidos, Próximos 7 dias e Próximos 30 dias.",
      "Abra “Detalhe” numa linha para registrar o recebimento ou estornar — essa ação é de gerente para cima.",
      "Em Cobranças, veja o total vencido, a quantidade de títulos e o maior atraso, e siga para Títulos com “Abrir em Títulos”.",
      "Em Fluxo de caixa, escolha o horizonte (30, 60, 90 ou 180 dias) e leia dia a dia o que é a receber, a pagar, o líquido e a posição acumulada.",
      "Em Conciliação, veja as divergências entre pedido, NF e financeiro, cada uma com “Ver pedido”.",
    ],
  },
  {
    rota: "/app/titulos",
    titulo: "Títulos",
    resumo:
      "Contas a receber por vencimento, derivadas dos pedidos faturados. Esta rota leva direto para a aba Títulos do Financeiro.",
    itens: [
      "Ao abrir a rota, você é levado para /app/financeiro na aba Títulos, mantendo o termo buscado se houver.",
      "Na aba Títulos, leia os indicadores Em aberto, Vencido, Pago e quantidade de Títulos.",
      "Busque por cliente ou número do pedido e filtre por situação (Todas, Vencidos, A vencer).",
      "Na tabela, veja Vencimento, Cliente, Pedido, Parcela, Valor e Situação de cada título.",
      "Registre o recebimento com “Dar baixa” e desfaça com “Estornar” — as duas ações aparecem para gerente.",
      "Use o botão de exportar da barra de filtros para levar a lista para fora do sistema.",
    ],
  },
  {
    rota: "/app/notas",
    titulo: "Notas fiscais",
    resumo:
      "A área fiscal: emitir a NF-e a partir do pedido faturado, acompanhar o status na SEFAZ e cuidar das entradas e do SPED.",
    itens: [
      "Escolha a aba: Notas, Entradas, Emitir nota, Ações fiscais, SPED Fiscal ou Configuração fiscal.",
      "Em Notas, leia os totais (Total, Autorizadas, Pendentes, Com erro), busque a nota e filtre por período (Este ano, Este mês, Últimos 30 dias, Todo o período).",
      "No detalhe da nota, use Cancelar nota, Tentar de novo, Baixar XML, Ver DANFE e Ver pedido, e confira o Histórico fiscal.",
      "Em Emitir nota, escolha o pedido faturado e gere a NF-e; se faltar configuração, a tela diz o que falta.",
      "Em Entradas, use “Buscar na SEFAZ”, “Manifestar”, “Importar (estoque + pagar)” e “Ignorar”.",
      "Em Ações fiscais, faça inutilização de numeração e Carta de Correção; em SPED Fiscal, monte os CFOPs equivalentes e gere o arquivo. Emitir é de atendente para cima, configurar é de gerente.",
    ],
  },
  {
    rota: "/app/ai",
    titulo: "Agente de IA",
    resumo:
      "O hub da área de IA (o link no menu se chama “Ver tudo em IA”): todas as telas do agente juntas, na jornada de quem opera um agente.",
    itens: [
      "Percorra as três seções: Montar o agente, Ensinar o agente e Acompanhar o agente.",
      "Em Montar o agente, abra Agentes, Roteadores, Credenciais e Provedores.",
      "Em Ensinar o agente, abra Conhecimento, Memória e Skills.",
      "Em Acompanhar o agente, abra Casos, Alertas, Propostas, Decisões, Execuções, Uso e orçamento, Controle de IA, Evolução da IA e Inteligência.",
      "Clique num card para ir direto à tela — cada card mostra o que aquela tela faz.",
      "As telas que exigem papel de gerente não aparecem para quem tem papel menor.",
    ],
  },
  {
    rota: "/app/team",
    titulo: "Equipe",
    resumo: "Quem trabalha aqui, com qual papel, e os horários e a distribuição do atendimento.",
    itens: [
      "Escolha a aba Membros ou Atendimento (a URL ?aba= leva direto naquela aba).",
      "Em Membros, veja a tabela com Membro, Role, Status (Aceito ou Pendente) e Última atividade.",
      "Mude o papel de alguém pelo seletor da linha Role e remova o acesso com “Revogar acesso” — as duas ações são de administrador.",
      "Convide gente com o botão “Convidar membros” (só para administrador).",
      "Em Atendimento, configure o Modo de roteamento (Manual ou Rodízio), Tentativas máx. e Backoff (s).",
      "Na lista “Atendentes e horários de atendimento”, abra “Editar horário” ao lado do nome para publicar fuso e janelas de cada dia, e ligue ou desligue a disponibilidade da pessoa.",
    ],
  },
  {
    rota: "/app/settings",
    titulo: "Configurações",
    resumo:
      "O hub de configurações: sua conta, os dados da empresa e quem tem acesso ao quê, tudo em cards agrupados por seção.",
    itens: [
      "Percorra as seções: Sua conta, Sua empresa, Dados e acesso e Canais e integrações.",
      "Em Sua conta, abra Perfil, Segurança e Notificações.",
      "Em Sua empresa, abra Tipos de agendamento, Etapas do funil, Distribuição de atendimento, Organização, Marca e Billing.",
      "Em Dados e acesso, abra LGPD e API Tokens; em Canais e integrações, Conexões, Nuvemshop e Webhooks.",
      "Clique num card para ir direto à tela de configuração.",
      "Cada card só aparece se o seu papel alcança aquela tela.",
    ],
  },
  {
    rota: "/app/settings/tenant",
    titulo: "Organização",
    resumo:
      "Os dados da empresa, a retenção de mídia e o encarregado de LGPD. Esta tela é só para administrador.",
    itens: [
      "Preencha Nome de exibição, Razão social, CNPJ, Telefone e DPO e-mail.",
      "Escolha o Fuso horário, o Idioma e a Retenção de mídia (dias), e informe a URL da política de privacidade.",
      "Na seção Endereço da empresa, preencha Logradouro, Número, Complemento, Bairro, CEP, Cidade e UF — é o endereço impresso no cabeçalho do pedido.",
      "Acrescente Motivos de perda extras, separados por vírgula, ao lado dos motivos que já existem.",
      "Salve tudo com o botão “Salvar” e confira o aviso de confirmação.",
      "Quem não é administrador é levado para a tela de acesso negado ao abrir esta rota.",
    ],
  },
];
