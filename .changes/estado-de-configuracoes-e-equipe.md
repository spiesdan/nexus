---
impacto: nada_mudou
secao: corrigido
titulo: Erro de configuração diz qual campo; convite vencido tem estado próprio
---

- **Salvar em Configurações → Empresa/Perfil** agora mostra o **campo** e a
  mensagem (ex.: “Nome de exibição: informe ao menos 2 caracteres”), em vez de
  “Dados inválidos.” quando o Zod recusa. Vale para a validação da tela e para a
  resposta da Server Action.
- **Equipe → Membros** passa a ser visível só para gerentes e administradores;
  quem é viewer/agent vê uma frase explicando, em vez de um erro de carregamento
  (403) na lista. A aba Atendimento continua com a mensagem de permissão que já
  existia.
- **Convite vencido** deixa de parecer “Pendente”: a tabela distingue
  **Aceito, Pendente e Expirado** usando a mesma janela de 24h do token, sem
  inventar um segundo prazo.
- **Detalhe LGPD** com erro de leitura ganha “Tentar novamente”, em vez de uma
  faixa vermelha sem saída.

Nenhuma regra de negócio, RLS, fiscal ou financeiro foi alterada; é estado/UX.
