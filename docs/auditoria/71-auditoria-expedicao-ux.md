# Auditoria de UX — Expedição (workbench de 1.65.2)

> Medição feita em **2026-11-23**, sobre o que está em produção (1.65.2), lendo
> as capturas de `docs/auditoria/capturas/depois-workbench-real/` e o código de
> `app/app/expedicao/[id]/`. O dono abriu a tela e disse: *"está confusa, ruim,
> péssima para o usuário final"*. Este documento é a tentativa de dizer **onde
> exatamente** isso acontece, com evidência de linha — não de gosto.

## O diagnóstico em uma frase

**A mesma página tenta servir dois trabalhos diferentes** — montar uma carga e
rodar uma rota — e por isso nenhum dos dois fica claro. Quem abre uma carga em
montagem quer responder "o que já está aqui e o que falta?"; quem abre uma carga
em rota quer responder "onde eu vou agora e o que falta entregar?". Hoje os dois
recebem a mesma tela, com os mesmos quatro rótulos e a mesma ordem de blocos.

## P0 — o que faz a tela parecer quebrada

### P0-1. Quatro etapas, três destinos

As âncoras `2 Mapa` e `3 Publicar` apontam para posições praticamente iguais:

- `#etapa-publicar` é o `div` que **envolve** `<Roteirizador>` (`_client.tsx:1387`);
- `#etapa-mapa` é a coluna do mapa **dentro** do mesmo `<Roteirizador>` (`_roteirizador.tsx:1615`).

Clicar em "2" ou em "3" rola para o mesmo bloco. O usuário clica, a tela quase
não muda, e a conclusão natural é "não funciona".

### P0-2. "Etapa 1" escrito duas vezes

- Seção: `Etapa 1 / Pedidos e paradas` (`_client.tsx:893-897`);
- Cartão logo abaixo: `Etapa 1 / Pedidos disponíveis` (`_painel-pedidos.tsx`).

Numeração repetida em níveis diferentes anula a própria ideia de etapa: se dois
blocos são "1", a sequência não existe.

### P0-3. O primeiro conteúdo de uma carga é a busca de outras cargas

Em carga `montando`, a ordem real é:

1. cabeçalho;
2. **painel "Pedidos disponíveis" com 141 pedidos** (`_client.tsx:899-905`);
3. faixa de KPIs;
4. lista de paradas.

O operador abriu **esta** carga e a primeira coisa que vê é um buscador de
pedidos que **não estão** nela. A pergunta dele ("o que já está nesta carga?")
está abaixo da dobra.

### P0-4. Cabeçalho sem hierarquia, e ação duplicada

Em carga `montando`, o cabeçalho mostra: `Adicionar pedido` (outline), `Veículo`
(ghost), `Romaneio (PDF)` (outline), `Imprimir pedidos` (ghost), `Excluir`
(ghost). Em 390 px isso quebra em duas linhas (`_client.tsx:789-843`).

E `Adicionar pedido` no topo **só rola até o painel** que faz a mesma coisa
(`onClick={() => irParaEtapa("etapa-pedidos")}`). Dois caminhos, mesma ação, um
deles sem efeito visível.

## P1 — o que faz a tela ser lenta de entender

### P1-5. Duas rotas, uma tela

`/app/expedicao/<id>?aba=rota` renderiza o mesmo workbench (o breadcrumb diz
"Rota"; o conteúdo é idêntico). O breadcrumb afirma uma navegação que não
existe mais.

### P1-6. Dinheiro no topo, trabalho embaixo

A faixa de KPIs é: `Paradas concluídas`, `A separar`, **`A cobrar na entrega`**,
**`Total em mercadorias`**. Metade dela é dinheiro — que não é a pergunta de quem
separa nem de quem dirige. E há uma contradição visível: carga **concluída** com
`A cobrar R$ 49,90` e, abaixo, `nada recebido ainda`.

### P1-7. Selos flutuantes cobrem conteúdo

`14 na fila` e `Nova versão · 1.1.0` ficam fixos no canto inferior esquerdo e
passam por cima das linhas da lista ao rolar. O `pb-24` protege o **fim** do
conteúdo, não o meio.

### P1-8. Aviso sem ação

`Sem endereço no cadastro — corrija antes de incluir` é texto. Não há link para
corrigir o cadastro; o operador precisa sair da tela e voltar.

## P2 — o que o prompt pedia e não está

- **Mapa grande na mesma dobra da lista** (PROMPT-EXPEDICAO §5). Hoje o mapa
  começa depois da lista inteira.
- **"Selecionar resultados filtrados" com alcance explícito** — existe e está
  correto ("o alcance é o filtro atual: 141 de 141"). ✔
- **Sequência manual × sugerida** — existe. ✔
- **Descartar proposta** — existe. ✔

## Proposta: dois modos, não quatro etapas

O workbench deve ter **duas telas** que correspondem aos dois trabalhos, e o
status da carga decide qual delas abre:

### Modo MONTAGEM (`status = montando`)

```
1. O que já está na carga   ← primeiro, sempre: paradas, o que falta separar
2. Adicionar pedidos        ← o painel, abaixo, recolhido por padrão
3. Fechar e sair            ← uma ação primária
```

### Modo OPERAÇÃO (`em_rota` / concluída)

```
1. Próxima parada           ← a pergunta do motorista, no topo
2. Mapa + ordem             ← juntos, na mesma dobra
3. Fechamento               ← só quando fizer sentido
```

Regras que caem por consequência:

- **some a numeração duplicada** — cada bloco tem um nome, não um número;
- **some a ação duplicada** do cabeçalho — `Adicionar pedido` deixa de existir
  como botão de topo;
- **o cabeçalho fica com no máximo 2 ações visíveis** + menu "…" para o resto;
- **`?aba=rota` deixa de mentir**: ou vira âncora real dentro de Operação, ou
  redireciona;
- **KPIs**: no máximo 2 de trabalho (`paradas`, `a separar`) na montagem; os de
  dinheiro só em Operação/Fechamento.

## O que NÃO mudar

- Backend de rota (transação, 409, versão confirmada) — está correto e testado.
- O painel de pedidos em si (busca, filtros, seleção, "já em outra rota") — está
  correto; o problema é **onde** ele aparece.
- Modo motorista — é outra tela, com outro dono de uso.
