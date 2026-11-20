# Pendências de regra — criador de pedidos

> Seis comportamentos estão **declarados, não resolvidos**: o código mantém o que existe
> hoje e cada item abaixo diz o que muda se o dono escolher a recomendação. Nenhuma regra
> foi inventada; todas nasceram de defeito medido ou de lacuna encontrada em auditoria.

## 1. Baixa de estoque atômica
**Hoje:** o pedido é gravado e a baixa vem depois; se a baixa falha, só fica no log.
**Risco:** pedido confirmado sem estoque baixado.
**Recomendação:** baixa na mesma transação do pedido; falha = pedido não nasce.
**Impacto:** erro de estoque passa a bloquear venda (com mensagem clara), em vez de gerar inconsistência silenciosa.

## 2. Troca de tabela de preço com itens já lançados
**Hoje:** a linha já lançada mantém o preço antigo; o servidor recusa preço fora da tabela (422) e não reprecifica sozinho.
**Recomendação:** reprecificar e mostrar “o que mudou” em cada linha.
**Impacto:** o vendedor vê a diferença antes de gerar; nada muda sem confirmação.

## 3. `ignorar_estoque` / `ignorar_credito` na interface
**Hoje:** existe só na API.
**Recomendação:** liberar para **gerente**, com aviso do que está sendo ignorado e auditoria.
**Impacto:** deixa de existir poder invisível (só quem chama API consegue).

## 4. Quantidade fracionária / granel / múltiplo
**Hoje:** quantidade é inteira; `unidade` e `multiplo` são informativos.
**Recomendação:** manter múltiplo informativo e **não bloquear**; fração só com regra escrita.
**Impacto:** nenhum hoje; o campo `multiplo` continua sem efeito.

## 5. Fallback de rascunho
**Hoje:** se `localStorage` falha, avisa e mantém em memória.
**Recomendação:** tentar `sessionStorage` como segunda chance, antes de avisar.
**Impacto:** menos perda em navegador com armazenamento bloqueado.

## 6. Custo no recebimento e no faturamento
**Hoje:** o resumo dessas telas não mostra custo/margem — o recebimento mostra unidades e o faturamento, valor + quantidade. O formulário de compras tem campo de custo por item, mas ele não aparece no resumo.
**Recomendação:** mostrar quantidade **e** valor; **não** recalcular o preço do pedido.
**Impacto:** o operador vê o que entrou e quanto custou, sem alterar o pedido.
