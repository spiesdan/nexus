---
impacto: nada_mudou
secao: corrigido
titulo: Nome longo do cliente e número repetido deixam de travar a nota fiscal
---

Duas notas reais foram recusadas em 04/11/2026, por motivos diferentes — e os
dois eram nossos.

**Nome do cliente com mais de 60 caracteres.** A nota do cliente com razão
social longa foi recusada inteira, com uma mensagem sobre XML inválido:

> `xNome`: o valor tem 62 caracteres; o máximo é 60.

O limite é do leiaute da NF-e. Agora o nome é cortado no limite do campo (a
razão social completa continua no cadastro) — em vez de a nota não sair por
causa de um campo.

**Número da nota entregue duas vezes.** Uma nota foi **autorizada** pela SEFAZ e
continuou aparecendo como "Emitindo", sem número e sem chave. O número dela
tinha sido devolvido ao contador por uma nota anterior que falhou antes de
enviar — mas continuava presa naquela nota. A emissão seguinte tomou o mesmo
número, a SEFAZ autorizou, e a gravação aqui foi recusada por número repetido,
em silêncio.

Agora a numeração **nunca entrega um número que alguma nota já carrega**, e a
devolução de número desfaz as duas pontas (contador e nota) ou nenhuma. Se a
gravação da nota falhar depois de a SEFAZ responder, o erro aparece no
histórico da nota com a chave e o protocolo — o que permite reconstruí-la em vez
de reemitir e duplicar a faixa.

Quem já instalou: **não precisa fazer nada**.
