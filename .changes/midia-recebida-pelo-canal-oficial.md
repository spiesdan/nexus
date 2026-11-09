---
impacto: nada_mudou
secao: corrigido
titulo: Áudio, imagem e documento recebidos pelo número oficial chegam ao inbox
---

Mensagens com anexo enviadas por clientes ao número conectado pela API oficial
da Meta entravam no inbox sem os bytes: o áudio não tocava, a imagem não
aparecia e o documento não abria.

O canal oficial agora baixa o arquivo da Meta e o guarda junto da mensagem, no
mesmo caminho usado pelo WhatsApp por QR — e o player volta a funcionar antes
mesmo de o download terminar. As mensagens que já estavam sem arquivo são
recuperadas no próximo deploy pelo mesmo mecanismo.
