---
impacto: nada_mudou
secao: corrigido
titulo: O filtro de Vendedor traz os vendedores do Mercos
---

A tela de pedidos tinha filtro de vendedor, mas só conseguia recortar quem tem
usuário no CRM: os pedidos importados do Mercos gravam o emissor no próprio
pedido (`vendedor_nome`, ex.: "VENDEDOR JB") com UUID nulo quando quem emitiu não
é usuário do CRM — e só quem tinha UUID aparecia no filtro.

A lista do filtro passa a incluir todos os vendedores do Mercos que emitiram
pedidos na organização, de qualquer período (a varredura é paginada; o banco
devolve no máximo 1000 linhas por consulta), com o nome cru do canal. O recorte
passa a usar `vendedor_nome` para eles; membros da organização continuam
filtrando por `vendedor_user_id`. O rótulo do vendedor selecionado mostra o nome,
nunca o pedaço do UUID.
