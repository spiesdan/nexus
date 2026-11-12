---
impacto: nada_mudou
secao: corrigido
titulo: Endereço alterado na revisão não reusa a coordenada anterior
---

Ao trocar o endereço de entrega de um pedido embarcado (ou criar a carga a
partir dele), o cache de geocodificação do contato mantinha a latitude,
longitude e status da coordenada antiga.

Com isso, a rota podia nascer com o destino errado sem nenhuma nova
consulta — o cache precisava ser limpo quando o corpo da alteração trouxa
`endereco_entrega`.
