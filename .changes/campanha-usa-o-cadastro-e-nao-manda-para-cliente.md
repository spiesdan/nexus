---
impacto: capacidade_nova
secao: adicionado
titulo: Campanha usa o cadastro que você já tem, e não manda para cliente próprio
---

A aba Campanhas ganhou a opção de tirar o público de onde ele já está, sem
gastar API: escolha "Base já coletada" na hora de criar a campanha, e ela passa
a usar as empresas que você já tem nas mesmas cidades e categorias. Na card, o
botão passa a dizer "Ver público" e mostra a lista pronta.

**O que sai da fila, e por quê** (a tela mostra, não esconde):
- **Empresas que a loja já atende** — nome comparado por semelhança, não por
  igualdade, porque cadastro tem letra trocada ("Salomon" por "Salomón",
  "Mecânica" por "Mecanica", "X Ltda" e "X"). Medido nesta instalação: 103
  empresas da base já eram clientes. Mandar proposta comercial para cliente
  próprio não aparece como erro em lugar nenhum — é por isso que a checagem
  acontece antes, e não depois.
- **Duplicatas** — a mesma empresa cadastrada duas vezes (933 grupos nesta
  base). A segunda ocorrência sai: duas mensagens para a mesma empresa é o
  erro que o cliente vê.
- **Nomes parecidos** (entre 0.80 e 0.90 de semelhança) ficam na fila marcados
  para você decidir, porque essa decisão é sua.

Nada disso envia mensagem: o público é apenas preparado, e o envio continua
saindo pelo Disparo, que começa em simulação.
