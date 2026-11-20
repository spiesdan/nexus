# Decisões de regra — criador de pedidos

> **DECIDIDAS pelo dono em 2026-11-20** (delegação “decida da melhor forma”).
> Cada item traz a decisão, a justificativa e a reversão. Nada aqui é pendente.

> Seis comportamentos estavam declarados; agora estão **decididos**. Nenhuma regra
> foi inventada: todas nasceram de defeito medido ou de lacuna de auditoria.

## 1. Baixa de estoque atômica
**Hoje:** o pedido é gravado e a baixa vem depois; se a baixa falha, só fica no log.
**Risco:** pedido confirmado sem estoque baixado.
**DECISÃO (2026-11-20):** baixa na mesma transação do pedido; falha = pedido não nasce, **salvo override explícito de gerente** (item 3), com motivo e auditoria. **Reversão:** voltar a baixar fora da transação (comportamento atual).

## 2. Troca de tabela de preço com itens já lançados
**Hoje:** a linha já lançada mantém o preço antigo; o servidor recusa preço fora da tabela (422) e não reprecifica sozinho.
**DECISÃO (2026-11-20):** reprecificar **com confirmação**, mostrando linha a linha o que mudou. **Reversão:** manter o preço antigo e recusar com 422 (comportamento atual).

## 3. `ignorar_estoque` / `ignorar_credito` na interface
**Hoje:** existe só na API.
**DECISÃO (2026-11-20):** liberar **só para gerente**, com **motivo obrigatório** e auditoria; nunca invisível. **Reversão:** remover o controle da tela (API continua).

## 4. Quantidade fracionária / granel / múltiplo
**Hoje:** quantidade é inteira; `unidade` e `multiplo` são informativos.
**DECISÃO (2026-11-20):** **mantém inteiro**; `multiplo` segue informativo e **não bloqueia**. Fração só entra se o dono escrever a regra. **Reversão:** n/a (sem mudança de código).

## 5. Fallback de rascunho
**Hoje:** se `localStorage` falha, avisa e mantém em memória.
**DECISÃO (2026-11-20):** tentar **`sessionStorage`** como segunda chance; avisar **só** quando as duas falharem. **Reversão:** voltar ao aviso direto no erro do `localStorage`.

## 6. Custo no recebimento e no faturamento
**Hoje:** o resumo dessas telas não mostra custo/margem — o recebimento mostra unidades e o faturamento, valor + quantidade. O formulário de compras tem campo de custo por item, mas ele não aparece no resumo.
**DECISÃO (2026-11-20):** mostrar **quantidade e valor**; **não** recalcular o preço do pedido. **Reversão:** voltar ao resumo atual.
