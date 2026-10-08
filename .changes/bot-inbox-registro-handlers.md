---
impacto: nada_mudou
secao: corrigido
titulo: O assistente do inbox volta a responder mensagens
---

O assistente automático estava ligado, mas não processava nada desde o dia em
que a instalação foi mudada para a própria máquina. A tela continuava mostrando
o robô como ativo e nenhuma mensagem era respondida.

O motivo era um gerador de documentos: o trecho do sistema que monta o arquivo
de dados do titular era carregado junto com o registro dos processadores
automáticos, e esse arquivo não abria nesse ambiente. Quando o registro inteiro
caía, caíam juntos o assistente do inbox, os retornos programados e as
automações. As conversas que estavam em processamento ficaram travadas.

Agora o documento só é carregado quando alguém pede a exportação, e o registro
dos processadores sobe de pé — o assistente do inbox, os retornos e as
automações voltam a processar. As conversas presas foram liberadas.