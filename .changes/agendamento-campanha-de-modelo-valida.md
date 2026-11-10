---
impacto: nada_mudou
secao: corrigido
titulo: A agenda de uma campanha com modelo aprovado volta a salvar
---

Quem agendava uma campanha com modelo aprovado — "Agendar envio (241)" — e confirmava o horário recebia "Validation failed" sem dizer qual campo. A tela manda a lista de mensagens vazia, porque numa campanha de modelo aprovado não há texto livre para preencher: o conteúdo é o modelo salvo.

O schema de agendamento (compartilhado por create e patch da campanha) ainda exigia `.min(1)` na lista de mensagens, então o PATCH que grava o relógio morria na validação antes de chegar ao handler que já sabia o tipo da campanha. O schema de disparo tinha recebido esse tratamento no PR #367; o de agendamento não.

Agora a lista vazia é aceita e quem decide se é legítima é a regra que conhece o tipo da campanha.
