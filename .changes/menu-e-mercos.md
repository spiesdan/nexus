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

- **Navegação dentro do app**: o botão *Navegar* não abre mais o Google Maps.
  Ele calcula a rota da posição atual até a próxima parada (mesmo OSRM que
  planeja a carga), desenha em azul sobre o mapa e o mapa passa a seguir o GPS,
  com distância e tempo na tela.
- **O entregador escolhe a carga**: a lista mostra as cargas liberadas (montada
  e na rua) num seletor, em vez de só a que já saiu.
- **Sessão de 30 dias**: fechar o app não obriga a digitar a senha de novo.
- **Abre offline**: depois de visitar a cabine uma vez, o app abre sem sinal e
  a rota vem do aparelho; a baixa continua na fila e sobe quando o sinal volta.

- **Abas em menu no celular**: as 13 subtelas do fiscal e as 7 de Notas deixam
  de ser uma faixa que rola para o lado; em tela estreita viram um seletor com
  a aba atual.
- **Tabelas largas** (produtos, indicadores, LGPD, sincronizações) escondem as
  colunas secundárias em tela estreita em vez de empurrar a tela.
