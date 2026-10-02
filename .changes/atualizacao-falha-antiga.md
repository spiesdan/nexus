---
impacto: nada_mudou
secao: corrigido
titulo: Tela de atualização — falha antiga não esconde mais o estado atual
---

A **Atualização do sistema** deixou de ser sequestrada por uma falha antiga.
Quando uma tentativa de atualização falha, a tela passa a mostrar o erro — e
fica assim enquanto o sistema continua onde a tentativa o deixou. Mas se a
instalação foi adiante por conta própria (um update rodado direto no servidor,
por exemplo), aquela tela de falha não descreve mais nada: ela ficava no caminho
do botão de atualizar, escondendo o estado real da sua versão.

**O que muda:** a falha que já não descreve a instalação desce para um aviso
dentro da tela normal — a tentativa antiga, o log e o comando de saída seguem
à mão, mas o estado atual ("você está na versão X", "versão Y disponível") volta
a mandar na tela, com o botão de atualizar de volta. A falha que AINDA descreve
o host continua com a mesma tela de saída de sempre.
