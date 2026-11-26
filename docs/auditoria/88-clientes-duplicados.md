# 88 — Revisão humana de clientes duplicados

O sistema não funde cadastro por nome. Duas "MARIA SILVA" em Canoinhas não são a
mesma pessoa, e fundir apaga histórico de uma cliente no cadastro de outra. Mas
também não havia onde um humano decidir: **117 grupos / 2.075 fichas** ficavam
num limbo — nem fundidos, nem julgados.

Esta frente entrega a superfície da decisão.

## O que a tela mostra, e por quê

As fichas ficam **lado a lado** (não em lista vertical) porque o que decide é a
comparação: telefone, e-mail, endereço, **nº de pedidos**, última compra e data
de criação. Empilhar esconde exatamente o dado que faz escolher.

`evidence/clientes-duplicados/duplicados-1440.png` — a fila em 1440.
`evidence/clientes-duplicados/duplicados-390.png` — a mesma tela em 390 (o
operador revisa pelo celular entre visitas).

## A confirmação diz o que vai acontecer

`evidence/clientes-duplicados/duplicados-1440-confirmacao.png`: antes do clique,
a tela informa **quantos pedidos e conversas passam** para a ficha escolhida.
Repontar pedido não volta com um botão — então o número aparece antes, não
depois.

## O que a RPC garante (0355)

- descobre as tabelas com `contact_id` **no catálogo**, não numa lista fixa —
  tabela nova entra sozinha (lista fixa envelhece em silêncio, lição da 0198);
- conversa 1:1 do mesmo canal/sessão é fundida sem perder mensagem; o que é
  decisão fica com o vencedor, o que é vigilância é encerrado no perdedor;
- `security definer`, `revoke` de public/anon/authenticated, `grant` só
  `service_role`;
- devolve quantas linhas repontou **por tabela** — é o que a tela mostra.

## "Não é a mesma pessoa" persiste

`contact_duplicate_dismissals`: sem isso o mesmo grupo volta na próxima
varredura e a decisão humana se repete toda semana, o que na prática é o mesmo
que não ter decidido.

## Quem pode fundir

**manager**, não agent. A leitura é para agent+ (quem atende precisa ver), mas
fundir repontar pedido de outra pessoa — e essa decisão tem dono.
