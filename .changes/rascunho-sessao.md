---
impacto: nada_mudou
secao: corrigido
titulo: Rascunho do pedido tenta a sessão antes de avisar que não salvou
---

Quando o navegador recusa gravar o rascunho do pedido no armazenamento local
(modo privado, cota cheia, política do navegador), a tela avisava "não foi
possível salvar" e a venda ficava só na memória — perdida no primeiro recarregar.

Agora o autosave tenta o armazenamento da **aba** como segunda chance, antes de
avisar: o rascunho sobrevive a recarregar (não a fechar a aba). O aviso só
aparece quando os dois recusam. Na restauração, vence o rascunho mais novo entre
disco e sessão — um rascunho antigo no disco não pode ganhar do fresco na sessão.

Nada a fazer na VPS.
