---
impacto: nada_mudou
secao: corrigido
titulo: O agendamento diz qual empresa perdeu a reserva
---

Quando duas execuções do agendamento disputavam a mesma empresa, a campanha
era pulada sem dizer por quê: o resumo só contava "uma pulada" e o operador não
tinha como achar a empresa nem entender que outra execução já a tinha
reservado. Agora o log do agendamento nomeia a campanha e a empresa na hora da
disputa, uma vez por ocorrência.
