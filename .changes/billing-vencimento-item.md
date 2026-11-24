---
impacto: nada_mudou
secao: corrigido
titulo: Vencimento da assinatura deixa de ser apagado quando o Stripe muda o campo de lugar
---

O período da assinatura passou a ser lido do topo ou, nas versões novas da API, do primeiro item — o mesmo leitor serve para a tela e para a reconciliação. Quando o Stripe não devolve o vencimento em nenhum dos dois lugares, a reconciliação mantém o valor local em vez de gravar NULL. A resposta do cron agora lista o que impediu uma divergência de ser corrigida.
