---
impacto: nada_mudou
secao: corrigido
titulo: O cliente do pedido importado do Mercos não vem mais com pagamento e status colados no nome
---

Quando o cliente não tinha CNPJ/CPF no cadastro do Mercos, o importador não encontrava o nome no detalhe e caía no cartão da lista — que carrega o rótulo de pagamento ("event AVISTA"), o selo de status ("Concluído") e o ícone do Material. Foi assim que pedidos entraram como "R$ 0,00 - WISNIEVSKI AUTO PECAS" e "LOJA BILL HIGIENE - Concluído".

O bloco do cliente agora é lido pelo que ele é: o nome fica entre "Listar todos clientes" e "Representada", com ou sem documento, e o cartão da lista só entra como reserva depois de descartar status, ícone e pagamento. Pedido cadastrado no CNPJ da própria empresa (o caso "CLIENTE ONLINE" da loja virtual) passa a entrar como CONSUMIDOR FINAL, sem gravar o documento da representada como se fosse do comprador.

A leitura saiu do navegador e virou um módulo puro com os casos reais de produção em teste: 19442, 19472, 19473, 18685, 14048 e o bloco vazio dos pedidos cancelados.
