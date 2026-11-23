---
impacto: nada_mudou
secao: corrigido
titulo: Uma leitura de auth por request na lista do Inbox
---

A lista do Inbox lia a autenticação duas vezes na mesma request. Agora a
identidade é resolvida uma única vez e reaproveitada no caminho da rota — sem
mudar o que a pessoa vê nem as permissões aplicadas.
