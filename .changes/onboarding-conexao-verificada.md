---
impacto: nada_mudou
secao: corrigido
titulo: O onboarding só marca conexão quando o backend confirma
---
Dois botões do assistente de primeiros passos davam o passo por cumprido sem
verificar nada: "Já conectei" na Nuvemshop gravava a data de conexão com a loja
desconectada, e "Conectei em outro lugar" no WhatsApp marcava o número sem
sessão pareada. O assistente avançava, o catálogo e as mensagens não vinham, e a
causa não aparecia em lugar nenhum.

Agora o servidor confirma: a Nuvemshop precisa da integração registrada pelo
retorno do OAuth, e o WhatsApp precisa da sessão conectada no transporte. Sem
isso, a tela explica o que falta em vez de seguir.
