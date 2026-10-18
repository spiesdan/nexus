---
impacto: nada_mudou
secao: corrigido
titulo: O aviso de pendência fiscal some da tela do Meu Dia
---

Se a sua configuração fiscal tivesse **uma única** pendência — o CNPJ preenchido
e o código do município faltando, por exemplo, que é como toda instalação começa
— o aviso do Meu Dia **não aparecia**. Não por Cosplay: a tela abria normal, sem
aquele bloco, como se não houvesse nada a fazer.

A causa era um erro de programação numa frase que monta o aviso: ela montava uma
lista com dois campos e, quando só havia um, tentava ler o segundo. O erro era
engolido de propósito — o alerta do dia é feito de várias partes independentes, e
uma parte com problema não pode derrubar as outras — e o efeito foi o aviso sumir
em silêncio. Quem olhasse o Meu Dia concluía que estava tudo em dia.

Agora o aviso aparece com o nome do que falta, seja uma pendência só ou várias.