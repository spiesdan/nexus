---
impacto: nada_mudou
secao: corrigido
titulo: Pedido com nota cancelada volta a ter como emitir outra
---

O botão "Emitir NF-e" só aparecia quando o pedido tinha **zero** notas. Depois de cancelar a nota (caso real: o pedido 19733 ganhou item novo e a nota 4673 foi cancelada), a ficha mostrava a nota cancelada e **nenhuma ação** — o operador ficou sem próxima ação na tela, embora o backend sempre tenha aceitado (a trava de nota viva é `status <> 'cancelada'`). Agora, quando todas as notas do pedido estão canceladas ou denegadas, aparece "Emitir nova NF-e" com a explicação. Nota em `erro` não entra nessa lista: ela ainda pode ser reenviada, e criar outra duplicaria o documento.
