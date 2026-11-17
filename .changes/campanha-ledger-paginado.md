---
impacto: nada_mudou
secao: corrigido
titulo: A campanha não para mais no milésimo envio
---
O motor de campanha lia o registro de envios numa única consulta. A partir do
milésimo contato que já tinha recebido, a leitura deixava de enxergar o registro
inteiro e a campanha passava a considerar todo mundo inelegível — em silêncio,
com a tela mostrando a audiência cheia e ninguém recebendo.

Agora a leitura é paginada (1.000 por página, teto de 50 mil) e, quando o
registro não pode ser lido, o envio para em vez de arriscar mensagem repetida.
Quem já recebeu não recebe de novo; a fila continua de onde parou.
