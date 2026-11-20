---
impacto: nada_mudou
secao: corrigido
titulo: Rota avisa quando o provedor de mapa cai — e mostra o que mudou depois de publicada
---

O provedor de geocodificação podia cair e a rota respondia
**HTTP 200 com erro por parada**: o `catch` do cliente nunca disparava e o banner de falha nunca
aparecia — a pessoa achava que a rota tinha otimizado.

Agora a tela separa “o provedor não respondeu” de “o endereço não deu
resultado”, e a publicação mostra **o que mudou**: quantas paradas moveram,
quantas entraram e quantas saíram.

**Nada a fazer na VPS.** A correção é de tela; nenhuma configuração nova.
