---
impacto: nada_mudou
secao: corrigido
titulo: A campanha para sozinha quando o WhatsApp restringe o número para abrir conversa
---

Em 30/10/2026 a campanha mandou duas mensagens, o WhatsApp gravou
`RESTRICT_ALL_COMPANIONS` com prazo de seis horas e, **três segundos depois**,
removeu o aparelho vinculado (`401 conflict/device_removed`). A restrição vinha
no payload da sessão desde o primeiro instante (`me.reachoutTimelock`) e o
produto não a lia: `grep -r reachoutTimelock` não achava nada. O resultado era o
pior ciclo possível — o número reconectava, o tick voltava a mandar, e mandar
durante a restrição é exatamente o que faz o WhatsApp derrubar de novo. O
operador via "a conexão caiu", sem causa e sem prazo.

Agora o motor lê o timelock antes de cada disparo e se cala enquanto ele vale,
com o prazo no fuso da organização na mensagem da campanha — e volta sozinho
quando expira, sem recriar, reagendar ou reconectar nada. O "Enviar agora" da
tela de Empresas recusa com `409 whatsapp_restrito` e a mesma frase, em vez de
falhar em silêncio.

A restrição é de **abrir conversa** (`reachout`), não de mensagem: só o disparo
frio (`publico: "prospects"`) é atingido. Recuperação de quem já conversa com a
empresa (`publico: "contatos"`) continua enviando — parar as duas tiraria do
operador uma operação que o WhatsApp não restringiu.

Se o transporte não responder, a campanha segue: o envio em si já falha quando
o número está fora, e transformar oscilação de rede em campanha parada
congelaria a operação inteira.
