---
impacto: nada_mudou
secao: corrigido
titulo: Aviso no Discord posta por curl e confere o webhook antes de culpar o canal
---

Na `v2.0.3` o workflow rodou, montou a mensagem (467 bytes) e o Discord respondeu `403 Forbidden` — com `urllib` do Python. O mesmo webhook responde `204` de fora, e `403` sem corpo não se diagnostica. O POST passou a ser por `curl`, com User-Agent declarado, e resposta fora de 2xx imprime o corpo (token inválido, canal removido, rate limit) e falha em vermelho — aviso que falha calado foi o que custou três versões sem post.

O workflow também ganhou disparo manual com `postar=nao`: imprime a mensagem e confere o webhook com GET, provando conectividade sem cortar release nem poluir o canal.
