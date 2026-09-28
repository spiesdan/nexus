---
impacto: nada_mudou
secao: corrigido
titulo: A limpeza das autorizações de agenda usadas volta a rodar
---

A limpeza diária das autorizações de agenda já usadas e vencidas — a que impede que uma autorização capturada seja reaproveitada — falhava todos os dias e não apagava nada, e a tabela só crescia. A causa era um nome: a rotina pedia a limpeza por `p_retencao_dias`/`p_limite`, como faz com as outras podas, e a função do banco tinha sido criada com outro nome de parâmetro, então o banco não encontrava a função e devolvia erro antes de apagar. De quebra, a rodada inteira de limpeza era registrada como falha no histórico, escondendo as contagens do que já tinha sido apagado logo antes. Agora os dois lados falam a mesma língua, e a instalação que já existe recebe o conserto na atualização — não só as novas. Nada muda na tela e ninguém precisa fazer nada: o que passa a acontecer é a limpeza que a instalação já tinha contratado.
