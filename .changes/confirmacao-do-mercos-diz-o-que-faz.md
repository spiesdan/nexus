---
impacto: nada_mudou
secao: corrigido
titulo: A confirmação do Mercos deixa de prometer que nenhum pedido existente é sobrescrito
---

A janela que abre no botão **Importar pedidos Mercos** dizia que "pedidos já importados são ignorados; nenhum pedido existente é sobrescrito". Isso deixou de ser verdade na 1.42.0: a sincronização passou a **atualizar** o pedido já importado quando o vendedor externo muda cliente, endereço ou itens no ERP.

O texto agora descreve o que o botão faz — cria os novos, revisa os recentes em aberto, atualiza o que mudou e marca a carga para reconferir — e diz o que continua intocável: pedido com **nota emitida**, **entregue** ou **cancelado**. O aviso de fim da sincronização também passou a contar quantos pedidos existentes foram atualizados; antes ele só falava em pedidos novos e o operador não tinha como saber que um pedido dele mudou.
