---
impacto: nada_mudou
secao: corrigido
titulo: Parada não cai mais no estado errado quando o mapa não conhece a rua
---
Quando a rua do endereço não existe no mapa, o sistema cai numa consulta de emergência pelo bairro — e o provedor de mapas não respeita a cidade da consulta. Um bairro chamado "centro" em Paula Freitas/PR foi respondido como **Avenida Brasil, Carapicuíba/SP**, e o pino da entrega foi para o outro estado, exibido como "rua aproximada". O mapa mostrava a parada a 600 km do cliente com cara de acerto.

Agora todo resultado passa por uma conferência de lugar: UF diferente é descartado, e município diferente só é aceito quando o CEP confirma (distrito do interior continua funcionando, porque o CEP do distrito é o do município). A busca segue para a próxima tentativa e, quando nada bate, a parada fica marcada como aproximada no município certo — nunca num ponto inventado em outro estado.

De quebra, o complemento do cadastro com dois-pontos ("SALA: 03") deixou de envenenar a consulta, e a UF passou a ser comparada pela sigla: o mapa devolve o nome do estado ("Paraná") e o cadastro guarda "PR", o que fazia a conferência de UF divergir sempre.
