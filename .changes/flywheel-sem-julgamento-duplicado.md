---
impacto: nada_mudou
secao: corrigido
titulo: Flywheel não paga duas vezes o mesmo julgamento
---

Quando mais de uma réplica do worker está no ar, as duas pegavam os mesmos
turnos recentes e chamavam o modelo para julgar cada um — só uma conseguia
gravar o veredito, mas as duas pagavam a chamada de IA.

O lote agora ignora turnos que já têm veredito e cada turno é reservado por
uma réplica antes do julgamento; a outra pula sem gastar token. Se a réplica
cair no meio, a reserva é liberada com a conexão.
