---
impacto: nada_mudou
secao: corrigido
titulo: Notas: a emissão não deixa mais nota presa e o B2B sem IE é explicado
---

A emissão gravava os vínculos dos pedidos com o **client da sessão**, mas a tabela de vínculos só permite leitura ao usuário — o INSERT era recusado, a nota já tinha nascido e ficava **"Emitindo" para sempre**, sem fila e sem evento. Agora a gravação usa o service role e, se qualquer passo da fila falhar, a nota é descartada em vez de ficar órfã. Duas notas reais (4580/4581) pararam assim em 05/11 e foram recuperadas.

Também corrigimos o `indFinal` do XML: venda para **não contribuinte** (CNPJ sem IE) passou a sair como consumidor final, o que a SEFAZ exige (rejeição 696). E a rejeição **232** agora diz o que fazer — preencher a IE no cadastro do contato —, que foi o caso da OUT SERVICE, cujo CNPJ tem Inscrição Estadual ativa no Paraná.
