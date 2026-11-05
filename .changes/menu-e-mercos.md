---
impacto: nada_mudou
secao: corrigido
titulo: Importação do Mercos com o cliente certo, e abas em menu no celular
---

**O cliente do pedido importado voltava com o nome da própria empresa.** A tela
do pedido no Mercos tem dois blocos — `Cliente` e `Representada` — e o leitor
pegava o primeiro CNPJ da página. Quando o cliente era pessoa física (só CPF),
o único CNPJ era o da representada: o pedido nascia com o nome e o CNPJ da
empresa no lugar do cliente.

Agora o bloco do cliente termina na linha `Representada` e o documento aceita
**CPF e CNPJ**. Quando o Mercos não mostra o documento do cliente, o pedido vem
com o **nome certo e o documento vazio** — nunca mais com o CNPJ da empresa.
Os pedidos já importados foram relidos: 69 corrigidos, e os demais seguem
listados para ajuste.

Também nesta versão:

- **Abas em menu no celular**: as 13 subtelas do fiscal e as 7 de Notas deixam
  de ser uma faixa que rola para o lado; em tela estreita viram um seletor com
  a aba atual.
- **Tabelas largas** (produtos, indicadores, LGPD, sincronizações) escondem as
  colunas secundárias em tela estreita em vez de empurrar a tela.
