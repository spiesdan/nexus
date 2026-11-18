---
impacto: nada_mudou
secao: corrigido
titulo: Painel de uso e contagens do inbox consultam a janela de mensagens pelo índice
---

Contar as mensagens de uma organização num período — o que o painel de uso e as
contagens do inbox fazem — percorria a tabela inteira, porque o único índice
por organização em mensagens era parcial (só as pendentes e falhas) e não
cobria a janela.

Uma migração cria o índice da janela por organização e data. Medido com 200 mil
mensagens: a contagem caiu de 25–54 ms para 6–19 ms. Instalações grandes devem
aplicar a atualização em janela de manutenção.
