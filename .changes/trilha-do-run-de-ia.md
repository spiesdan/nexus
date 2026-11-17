---
impacto: capacidade_nova
secao: adicionado
titulo: A execução da IA passa a guardar o que entrou e o que saiu
---

Até agora o registro de cada chamada de IA dizia quanto custou e se falhou —
nunca o que o modelo leu nem o que ele respondeu. Quando o agente respondia
errado, "por que ele disse isso?" não tinha resposta em lugar nenhum.

Cada turno passa a guardar o prompt efetivo, as mensagens que o modelo viu
(histórico e entrada), o texto final, as ferramentas chamadas com o retorno de
cada uma — que é a trilha das fontes consultadas — e as citações do provedor.
Linha antiga continua sem trilha: o campo é nulo, não vazio.

A trilha é uma cópia da conversa, então a anonimização LGPD passou a apagá-la
junto com o contato: quem pediu para ser esquecido não fica no prompt.
