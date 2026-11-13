---
impacto: nada_mudou
secao: corrigido
titulo: Contagens do inbox param de estourar o tempo do banco (500 na Inbox)
---
A faixa de contadores do inbox (fila, automático, minhas, todas) disparava **quatro** consultas em paralelo. Cada uma varria a tabela de conversas inteira, e a regra de visibilidade por linha multiplica esse custo — medido na VPS: ~1,2 s por consulta e pico de **7.991 ms** contra o limite de 8 s do banco. O resultado era `500` no inbox, e a lista de conversas junto.

Agora as quatro contagens saem de **uma única varredura** da tabela: a mesma regra de visibilidade continua valendo (a checagem de permissão não foi desligada), mas o banco deixa de fazer quatro vezes o mesmo trabalho. Medido: 799 ms. A faixa volta a carregar e a lista com ela.
