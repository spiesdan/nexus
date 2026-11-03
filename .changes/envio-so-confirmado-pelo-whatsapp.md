---
impacto: nada_mudou
secao: corrigido
titulo: A mensagem só aparece como enviada quando o WhatsApp confirma
---

O inbox dava a mensagem por enviada no instante em que o pedido saía do CRM.
No WhatsApp conectado por QR isso acontece antes da confirmação da plataforma —
e ela pode recusar depois, por exemplo quando o número está restrito. A tela
mostrava o tique verde para uma mensagem que nunca chegou ao celular do
cliente, e não havia como descobrir isso olhando o sistema.

Agora a bolha é honesta em cada degrau:

- **relógio** — saiu do CRM, o WhatsApp ainda não confirmou;
- **um tique** — a plataforma recebeu a mensagem;
- **dois tiques** — chegou ao aparelho;
- **dois tiques azuis** — foi lida;
- **falhou** — a plataforma recusou, com o motivo no tooltip.

O mesmo critério vale para o que já estava no histórico: mensagem antiga marcada
como enviada, mas sem confirmação, também passa a aparecer como pendente.

A campanha de prospecção usa a mesma régua. Antes ela somava como "enviadas"
todas as mensagens que o transporte aceitou; agora separa o que o WhatsApp
confirmou do que ainda está sem resposta — e o número que o dono lê na tela é o
que ele consegue conferir no celular.

Quem já instalou não precisa fazer nada.
