---
impacto: capacidade_nova
secao: adicionado
titulo: O pedido ganha o campo de Informações Fiscais
---
A tela de detalhes do pedido ganhou o campo dedicado "Informações Fiscais", e a emissão de nota passa a ler esse campo como a fonte do texto complementar da NF-e (infCpl / dados da DANFE).

Antes o texto que virava o infCpl era apenas o campo livre do pedido — a fonte mais frágil do fluxo. Com a coluna `informacoes_fiscais` o operador tem um campo próprio para colocar a ordem de compra ou qualquer dado complementar que a nota deve levar, e a emissão grava nesse campo no infCpl da nota. O texto legado (`observacoes`) continua como fallback para os pedidos antigos, sem re-escrita em massa.

Na venda avulsa (NF-e sem pedido) o destinatário que vem do cadastro do cliente já nasce preenchido pela tela de emissão — nome, documento e entrega vêm do próprio contato, sem digitação manual no formulário.
