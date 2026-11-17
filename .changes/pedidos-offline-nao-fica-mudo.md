---
impacto: nada_mudou
secao: corrigido
titulo: Pedidos avisa quando está offline em vez de mostrar lista vazia
---

Fora da rede, a lista de Pedidos abria a casca do aplicativo e ficava vazia e
muda — indistinguível de "não há pedidos". Contatos, inbox e financeiro já
diziam o que aconteceu.

Agora Pedidos mostra "Sem conexão. A lista pode estar desatualizada…" com
**Tentar novamente**, e revalida sozinha quando a rede volta. Se a consulta do
servidor falhar, a tela diz "Não foi possível carregar os pedidos." em vez de
afirmar que o dado não existe.
