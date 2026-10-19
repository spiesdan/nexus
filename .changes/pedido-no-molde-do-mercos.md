---
impacto: capacidade_nova
secao: alterado
titulo: Criar e ler um pedido ficou igual ao Mercos, campo a campo
---

A tela de pedido era um formulário em cinco passos que escondia o pedido: você
escolhia o cliente, avançava, escolhia produtos, avançava de novo, e só no fim
via o todo. Quem vende no balcão não trabalha assim — confere cliente, produto e
condição na mesma olhada, e volta para o campo que ficou errado sem perder o
lugar.

Agora é **uma página só**, com as quatro seções numeradas do Mercos:

1. **CLIENTE** — busca por nome, telefone ou e-mail, com "Cadastrar novo
   cliente" e "Listar todos os clientes" ao lado;
2. **REPRESENTADA** — a empresa que emite, com razão social, CNPJ e telefone;
3. **PRODUTOS** — busca, tabela de preço e a lista de itens com a faixa de
   totais (itens, quantidade, valor);
4. **DETALHES DO PEDIDO** — número, data da emissão, vendedor, condição de
   pagamento, valor do frete, transportadora, rastreamento, contato no cliente,
   endereço de entrega e informações adicionais.

No topo, o cartão com o número e a situação do pedido. Na barra de ações, os
mesmos botões de lá: **Gerar pedido**, **Visualizar** (uma prévia que não grava
nada), **Enviar por e-mail** e **Enviar por WhatsApp**. O envio grava o pedido
antes de abrir o canal — um pedido que não existe não tem o que enviar — e
depois leva você para a ficha dele.

A **ficha do pedido** seguiu a mesma ordem: cliente com "Trocar cliente",
representada completa, produtos com a tabela do Mercos (Preço Tab., Desc.
Acrés., Preço Líq., Subtotal) e os detalhes completos. "Imprimir",
"Duplicar" e "Excluir" saíram da fila de botões e foram para **Mais opções**,
para as ações do dia a dia ficarem na frente.

Dois campos que o Mercos mostra e nós não tínhamos onde guardar entraram no
banco: **rastreamento** e **contato no cliente**. O primeiro é o código que a
transportadora devolve; o segundo, quem pediu do lado do comprador. São
anotação, não cálculo — e são os dois que alguém procura quando o cliente liga
perguntando onde está a carga.

O que esta versão **não** copia, de propósito: os botões de inteligência
artificial do Mercos ("Adicionar com IA", "Resumir perfil", "Analisar pedido"),
"adicionar por planilha" e "Informar somente o valor total do pedido" — nenhum
deles existe do nosso lado, e um botão que não faz nada é pior que a ausência
dele. Os nomes de situação também continuam os nossos (Rascunho, Em análise,
Aprovado, Faturado, Expedido, Entregue, Cancelado), porque cada um carrega uma
regra de aprovação, estoque e financeiro atrás.
