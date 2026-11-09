---
impacto: nada_mudou
secao: corrigido
titulo: A simulação do disparo de uma campanha de modelo aprovado voltou a abrir
---

Quem abria o disparo de uma campanha com modelo aprovado e clicava em "Simular envio" recebia "Validation failed" — sem dizer qual campo. A tela manda a lista de mensagens vazia, porque numa campanha de modelo não há texto livre para preencher: o conteúdo é o modelo salvo. O contrato da rota, porém, recusava a lista vazia antes de olhar o tipo da campanha, e a simulação morria na validação.

Agora a lista vazia é tratada como "não há texto", e quem decide se isso é legítimo é a regra que já conhece a campanha: numa campanha de texto a ausência continua sendo erro; numa de modelo aprovado é o caso normal. A tela de Empresas, que simula sem campanha, continua exigindo mensagem.
