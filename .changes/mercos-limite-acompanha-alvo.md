---
impacto: nada_mudou
secao: corrigido
titulo: Coleta do Mercos dimensiona o tempo pelo tamanho do alvo e diz o que fazer no estouro
---

O timeout do coletor era um número fixo (30 min) e não sabia quantos pedidos ia reler. Medido no backfill de jan–fev: censo de ~13 min mais 311 pedidos a 4 s cada, e o processo morreu com `coletor excedeu 1800s` depois de importar zero — sem dizer o tamanho do alvo nem o que fazer. Agora o limite é o maior entre o configurado e um piso que cobre censo (15 min) + detalhe (espera por pedido × 2, folga para o recuo de 429) + margem (5 min), com log `limite_do_coletor_ampliado`; e a mensagem de estouro nomeia o alvo, o tempo só de detalhe e a variável a aumentar.
