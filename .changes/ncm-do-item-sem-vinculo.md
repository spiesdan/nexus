---
impacto: nada_mudou
secao: corrigido
titulo: Nota não para mais por falta de NCM quando o item do pedido veio do texto livre
---

Uma nota parou com "Falta NCM do produto" mesmo com o NCM preenchido no cadastro do produto. O motivo: o item do pedido é texto livre e, quando ele não estava ligado ao produto do catálogo, a emissão não procurava o NCM em lugar nenhum — ia sem NCM para a SEFAZ e voltava com a rejeição.

Agora a emissão resolve o produto do item pelo vínculo salvo e, quando ele não existe, pelo código e depois pelo nome, exatamente como o cadastro está escrito. Se houver mais de um produto com o mesmo código ou nome, só aceita quando todos têm o mesmo NCM; NCMs diferentes continuam sem resolução de propósito, porque escolher um no chute seria erro fiscal.

A pré-validação do pedido, a tela de correção da nota e o imposto aproximado usam a mesma regra, então o que eles mostram é o que o documento vai levar. A rejeição também deixa de acontecer para os itens antigos, sem precisar reeditar pedido nenhum.
