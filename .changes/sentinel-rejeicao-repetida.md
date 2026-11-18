---
impacto: capacidade_nova
secao: adicionado
titulo: Sentinel enxerga o padrão de rejeição da SEFAZ, não só a nota uma a uma
---

Quando o mesmo código de rejeição da SEFAZ (cStat) se repete na mesma série no
mesmo dia, o problema costuma estar no cadastro ou na configuração do emitente —
não em azar. O Sentinel agora abre **uma ocorrência por grupo** (organização +
cStat + série + dia), com a contagem, os primeiros/últimos números de nota, a
mensagem do cStat e o limiar usado.

O limiar é declarado: **3 notas na janela de 24h**. Com 2, não abre. CStat de
sucesso (100/101/135/150/151) não entra. Reexecutar no mesmo dia atualiza a
mesma ocorrência e o histórico mostra a contagem crescendo; não duplica.

É observação pura: o Sentinel não reemite, não cancela e não escreve em notas.
