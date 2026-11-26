---
impacto: nada_mudou
secao: corrigido
titulo: Expedição deixa de subcontar a fila, de esconder pino ausente e de aceitar carga parada
---

Três defeitos medidos na instalação: (1) a faixa "Aguardando embarque" calculava sobre um array limitado a 200 e mostrava 200 quando havia 482 pedidos — contagem e valor agora vêm de `fn_expedicao_fila` (security invoker, RLS do usuário preservada); (2) 27 de 28 paradas ativas sem coordenada e a exceção "Sem localização" não tinha ação — cada carga ganhou "3 sem coordenada" e o botão Resolver, que abre a rota já geocodificando uma vez; (3) carga 34 estava em montagem há 388 h sem aparecer em exceção — nova família `montagem_parada` (> 24 h) com a idade na linha da carga.
