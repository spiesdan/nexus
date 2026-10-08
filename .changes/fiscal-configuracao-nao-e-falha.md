---
impacto: nada_mudou
secao: corrigido
titulo: Importar notas da SEFAZ deixa de aparecer como falha do sistema
---

Ao pedir para importar notas da SEFAZ, aparecia um erro vermelho na tela.

A instalação não transmite notas para a SEFAZ — as notas são emitidas apenas
dentro do sistema — e a mensagem estava certa: não havia o que importar. O que
estava errado era o aviso: uma situação de configuração da instalação era
mostrada com a cor de algo que quebrou, e o motivo ficava escondido.

Agora a situação é mostrada na cor de aviso, com a explicação de que a SEFAZ não
está configurada. Falhas reais da SEFAZ continuam aparecendo em vermelho, para
não se confundirem com a configuração.

Esta distinção vale também para as outras duas operações fiscais que passavam
pelo mesmo caminho: exportar os XMLs e cancelar uma nota.
