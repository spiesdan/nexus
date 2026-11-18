---
impacto: capacidade_nova
secao: adicionado
titulo: Cada execução da IA passa a ter trilha auditável, sem guardar a conversa
---

O registro de cada chamada de IA dizia quanto custou e se falhou — nunca o que o
modelo leu nem o que respondeu. Quando o agente respondia errado, "por que ele
disse isso?" não tinha resposta.

Cada turno passa a guardar a estrutura do que aconteceu: hash do prompt de
sistema usado, quantas mensagens de contexto e de que papéis, hash e tamanho da
resposta, quais ferramentas foram chamadas e o tamanho do que voltou, e os
domínios das fontes citadas.

O texto da conversa **não** é copiado para a telemetria: ele continua só em
mensagens, e o hash é o que correlaciona o turno à conversa. Quem pede remoção
de dados tem os vínculos apagados junto com o contato.
