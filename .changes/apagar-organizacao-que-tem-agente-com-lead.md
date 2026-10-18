---
impacto: nada_mudou
secao: corrigido
titulo: Dá para apagar uma organização que tem agente com lead atribuído
---

Se você tinha um agente de IA atendendo um lead e apagava a empresa inteira, o
sistema recusava a exclusão com um erro de banco de dados, sem dizer o que
aconteceria. A causa era o registro automático do evento "lead sem dono": ele
tentava gravar o histórico depois que a empresa já tinha sido removida, e a
gravação era barrada.

Resolvido: o registro automático agora reconhece que a empresa já não existe mais
e deixa passar, exatamente como a auditoria já fazia. Nada no seu dado muda — é
só a exclusão de uma empresa inteira que deixa de travar no meio do caminho.