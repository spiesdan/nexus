---
impacto: nada_mudou
secao: corrigido
titulo: Publicar rota deixa de habilitar o que o servidor recusaria
---

O botão “Publicar rota” agora aplica, no cliente, a mesma regra de separação de
`iniciar`: se algum pedido ainda não foi separado/conferido, ele fica desabilitado
e a tela diz quantos faltam. Antes o gesto era permitido e a API devolvia 422
depois de a pessoa já ter confirmado a publicação.
