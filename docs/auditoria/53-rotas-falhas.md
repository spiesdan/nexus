# 53 — Rota, fatia 2: os estados de falha do mapa e do endereço

**Data:** 20/11/2026 · **Base:** `nexus/main` · **Tela:** `/app/expedicao/<id>/rota`

Depois da fatia 1 (#673: estado único + jargão recolhido), esta fatia trata os
três casos em que a rota **não pode** parecer quebrada nem mentir sucesso.

## O que mudou

1. **Erro de geocodificação deixa de ser toast.** `geocodificarTudo` estourava
   `showApiError` (4 s de toast) e a tela seguia igual: quem não estava olhando
   no segundo do clique não sabia que N endereços continuavam fora do mapa.
   Agora há um **banner `role="alert"`** acima dos painéis
   (`data-testid="erro-geocodificacao"`) com o texto do servidor e **Tentar de
   novo**; a lista de paradas não se move. Quando uma rodada dá resultado, o
   banner é limpo.
2. **Mapa vazio não é rota vazia.** O estado "Nenhuma parada no mapa" ganhou a
   linha **"A ordem da lista continua valendo sem o mapa."** — o operador não
   conclui que perdeu o trabalho; a lista abaixo segue com ordem e ações.
3. **Endereço sem número aparece na linha.** Esse estado já existia **no balão
   do mapa** (`p.semNumero`); agora a linha da parada diz `· sem número` em
   âmbar, ao lado do endereço — sem número é endereço **incompleto**, não
   endereço errado, e o motorista precisa saber antes de sair.

## O que NÃO foi tocado

- Nenhuma regra de geocodificação, capacidade, janela ou ordem.
- O motor do mapa (MapLibre) e o `semNumero` que vem do servidor.

## Lacuna declarada (não maquiada)

**As capturas desta fatia não saíram.** A tentativa de forçar o erro (interceptar
`POST /rota/geocodificar` com 500 e clicar em "Geocodificar") não disparou o
banner na página servida, e o Playwright passou a falhar depois do restart do
servidor (processo morre sem mensagem). Não anexei imagem de um estado que não
consegui reproduzir.

O que **está** verificado:

```console
$ pnpm typecheck
✓ 0 erros
$ npx eslint app/app/expedicao/[id]/_roteizador.tsx app/app/expedicao/[id]/_mapa-rota.tsx
✓ 0 erros (2 warnings pré-existentes)
```

E a fixture de "sem número" foi aplicada no banco local (`shipment_destinations`
com `numero = null`), mas a carga usada (`dd3e6cbf…`) não tem essa parada — daí
o rótulo não aparecer na tela medida.

## Próximo passo (fatia 3)

Publicar/enviar ao motorista: o que muda depois de publicado (selo, bloqueio de
edição, o que o motorista vê) e a tarefa medida de 12 paradas em 2 veículos —
que depende da fixture que ainda não existe.
