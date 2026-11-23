---
impacto: capacidade_nova
secao: adicionado
titulo: Empresa pode entrar em varias campanhas ao mesmo tempo
---

A reserva exclusiva da 0277 impedia que uma empresa já em outra campanha
entrasse na nova. Agora a relacao e de membresia: `prospecting_campaign_prospects`
guarda o vinculo, unico por campanha e prospect.

Continuam proibidos o segundo envio para o mesmo prospect na mesma campanha e
o disparo de duas campanhas ativas para o mesmo numero no mesmo dia — as duas
protecoes ja existem e nao foram alteradas. Contatos de recuperacao seguem
exclusivos.

Nada a fazer na VPS.
