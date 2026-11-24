---
impacto: nada_mudou
secao: corrigido
titulo: Checkout reusa o cliente do Stripe e não cobra duas vezes
---

O checkout passa a enviar o `customer` já vinculado à organização, em vez de deixar o Stripe criar outro. Quando existe assinatura ativa, em trial ou em atraso, a rota devolve 409 e aponta o portal — nenhuma sessão é criada. A chave de idempotência passa a derivar de organização, preço e janela curta, então dois cliques seguidos devolvem a mesma sessão.
