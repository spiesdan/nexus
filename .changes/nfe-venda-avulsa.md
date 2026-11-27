---
impacto: capacidade_nova
secao: adicionado
titulo: Venda avulsa emite NF-e só com produto do catálogo
---

A emissão de NF-e de venda avulsa passa a usar o produto do catálogo: descrição
e NCM vêm do cadastro e o NCM deixa de ser digitável, então nota sem NCM não
emite. A nota sai na grade identificada como "Avulsa", sem pedido e sem
recebível, e um clique gera uma nota com chave de idempotência estável por
emissão. Texto livre e sugestão de NCM ficam fora desta versão; a prova é o
typecheck completo e o plano de teste do QA no CI.
