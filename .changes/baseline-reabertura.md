---
impacto: nada_mudou
secao: corrigido
titulo: A correção da reabertura chega à instalação que já existe
---

Correção de um erro de entrega: a correção pronta na versão anterior só existia
na pasta de migrações, que o atualizador da instalação não executa — ele
reaplica o esquema base. Por isso a coluna nova nunca chegava e a correção não
funcionava.

O acréscimo ao esquema base leva a mesma correção para quem já está em
produção: fechar um aviso que continua valendo reabre o mesmo registro em vez
de criar outro a cada verificação.