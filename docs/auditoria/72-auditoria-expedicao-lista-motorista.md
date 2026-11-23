# Auditoria de UX — Expedição: Lista e Modo motorista

> Medição feita em **23/11/2026**, sobre `nexus/main@250b2d916`, lendo o código de
> `app/app/expedicao/_client.tsx`, `app/app/expedicao/page.tsx`,
> `app/app/expedicao/[id]/_client.tsx`, `_motorista.tsx` e `_mapa-rota.tsx`, e as
> capturas de `capturas/auditoria-lista-motorista/`. Mesma régua da auditoria
> `71`: **P0 = parece quebrado, P1 = lento de entender, P2 = o que o pedido
> pedia e não está**. Este documento é diagnóstico — **nada foi consertado**.
>
> (O número `72` segue instrução do dono; o `72-expedicao-dois-modos.md` já
> existente é o registro do conserto da ficha. São documentos diferentes.)

## Como foi medido

- Dado real do banco e2e: carga **031** (`ad90f4b3…`), `em_rota`, 1 parada sem
  desfecho e **sem endereço geocodificado**; lista com 54 cargas, 69 itens,
  14 avisos na fila.
- 390×844 e 1440×900, claro e escuro, sessão de operador. Para a **cabine do
  entregador** (a que o dono usa na rua), o flag `user_organizations.motorista`
  foi ligado **só localmente durante a captura** e desligado no mesmo comando —
  nenhuma migration, nenhum dado de produção.
- Âncoras, fontes, contraste e alvos lidos do DOM; axe + varredura própria em
  `capturas/medicao-lista-motorista/varredura.json`.

### Duas telas com a mesma URL — importante para quem for aprovar

`/app/expedicao/<id>/motorista` renderiza **duas coisas diferentes** conforme o
flag da organização:

- `motorista=false` → `_client.tsx:693-720`, breadcrumb "Painel da carga", mapa
  no topo, cartões abaixo, dock no rodapé. É o que um operador vê.
- `motorista=true` → `_client.tsx:668-690`, `imersivo`, mapa cheio e folha. É a
  **cabine do entregador** — a que a régua "uma mão, na rua" deve julgar.

As duas foram capturadas. Onde o achado vale só para uma, está dito.

## O que está BOM — medido, não presumido

- **Alvos de toque:** nenhum controle da Expedição ficou abaixo de 44 px nas duas
  telas, nos dois temas e nas duas larguras. `ALVOS_DE_TOQUE` (`_client.tsx:135`)
  está aplicado nas três casas certas (`:464`, `:672`, `:695`). O que a
  varredura aponta como "pequeno" é casca global (`Abrir navegação` 42×44,
  devtools do TanStack 40×40) ou atribuição do OpenStreetMap — não controle
  nosso.
- **Cabeçalho da lista:** duas ações ("Frota" outline, "Nova carga" preenchido)
  em **uma linha em 390** (`_client.tsx:470-488`, captura
  `app_expedicao_light_390.png`).
- **Aviso com ação inline:** os "14 avisos de saída esperando o número de
  expedição voltar" trazem "Ver conexões" no próprio aviso
  (`_client.tsx:498-515`). É exatamente o que a regra pede — o aviso não é texto
  morto.
- **Cabine do entregador:** a ação primária **"Entregue" está na primeira dobra**
  (`y=736`, `h=48`, dock escondido); "Trocar carga" e "Centralizar em mim" são
  44×44; `h1` existe (`sr-only`); controles de natureza diferente (Roteiro,
  câmera, centralizar), não duplicatas. Ver `cabine-light_390.png` /
  `cabine-dark_390.png`.
- **Sem numeração duplicada** em nenhuma das duas telas — o defeito do `71` não
  reapareceu aqui.
- **console 0, overflow 0, axe 0 sério/crítico** nas 8 combinações
  (2 rotas × 2 temas × 2 larguras).

## P0 — o que faz a tela parecer quebrada

### P0-1. A faixa de situação da Lista erra em duas células

A faixa é a primeira coisa depois do aviso e do cabeçalho, e cada célula é
também um filtro (`_client.tsx:518-635`). Duas delas não descrevem o que dizem:

1. **`Concluídas 13 · 1 parada na rua`** (`_client.tsx:614-625`). O subtítulo vem
   de `paradasNaRua`, calculado sobre **`porStatus.emRota`**
   (`_client.tsx:205`) — ou seja, é a contagem de paradas das cargas **na rua**,
   posta dentro do cartão das **concluídas**. O mesmo número aparece na célula
   "Na rua" (`_client.tsx:541-544`) e reaparece aqui com outro significado.
   Para quem despacha, a célula de concluídas anuncia um trabalho em aberto que
   não pertence a ela.

2. **`Aguardando embarque 141 · R$ 37.755,10`** (`_client.tsx:584-603`). O rótulo
   vem de `page.tsx:206`, mas o número é `fila.total` = **pedidos disponíveis**
   (`page.tsx:179-192`) e o valor é a soma de `total_cents` desses pedidos. A
   célula diz "embarque" (carga) e conta pedido. Pior: ela é um
   `<Link href="/app/expedicao/nova">` — **o mesmo destino do botão "Nova carga"
   do cabeçalho** (`_client.tsx:480-487`). Dois nomes, uma ação; o número maior
   da tela é dinheiro, antes da fila de trabalho. Vale a regra já decidida:
   dinheiro só onde ele decide, e uma ação só em um lugar.

Evidência: `app_expedicao_light_1440.png`, `app_expedicao_light_390.png`,
`app_expedicao_dark_1440.png`.

### P0-2. Motorista: mapa vazio e sem endereço são texto morto, e "Entregue" segue sendo a única saída

Na cabine com dado real (carga 031, sem geocodificação):

- o overlay do mapa cobre o mapa inteiro com **"Nenhuma parada no mapa"**,
  **"Geocodifique os endereços ou marque a posição no mapa para desenhar a
  rota"** e **"A ordem da lista continua valendo sem o mapa."**
  (`_mapa-rota.tsx:790-808`). O contêiner é `pointer-events-none` — não há
  sequer um alvo. A instrução é escrita para quem **opera** o painel; quem está
  na rua não geocodifica nada.
- a folha repete **"Sem endereço cadastrado."** como texto
  (`_motorista.tsx:1334` na folha fechada, `:984` no detalhe) e o detalhe
  acrescenta **"Endereço sem número — o pino pode não ser a porta."**
  (`_motorista.tsx:996`, visível na captura). Nenhum dos dois tem link ou botão.
- ao mesmo tempo, **"Entregue" está habilitada** (`_motorista.tsx:1372-1381`),
  chamando `desfecho(order_id, "entregue")` direto. Não há "Navegar" (sem
  coordenadas), não há "Corrigir endereço", não há confirmação de chegada na
  folha fechada. O único caminho que o aparelho oferece é **dar o desfecho
  positivo sem saber onde fica a parada**.

É o caso mais claro de "parece quebrado": três avisos dizendo que falta
informação, zero ações para resolve-la, e uma ação de desfecho disponível.
Evidência: `cabine-light_390.png`, `cabine-dark_390.png`,
`cabine-detalhe-dark_390.png`.

## P1 — o que faz a tela ser lenta de entender

### P1-3. Lista: 4 filtros no código, 2 na tela com dado real

Os filtros de veículo e motorista são `select`s condicionais
(`_client.tsx:653-683`) alimentados por `opcoesDeVeiculo`/`opcoesDeMotorista`,
que vêm **só** de `shipment_orders.veiculo_id / motorista_id`
(`_client.tsx:250-264`; `page.tsx:159-167`). Nesta organização os 69 itens têm
`veiculo_id` e `motorista_id` nulos — e os dois `select`s **não existem no DOM**.
Medido em 390 e 1440: um único controle, `input[aria-label="Buscar carga"]`.
O nome do motorista está impresso em cada cartão (`_client.tsx:417-420`) e na
própria opção do `select` (`:377`), mas não há filtro para ele. Quem prometeu "4 filtros"
mediu o código, não a tela.

### P1-4. Modo motorista do operador: a ação primária nasce abaixo da dobra e atrás do dock

Na variante não-imersiva (`_client.tsx:693-720`), medido em 390×844:

- dock fixo `nav[aria-label="Navegação rápida"]` em **y=787**
  (`components/shell/MobileDock.tsx:49-52`);
- `main` com `clientHeight=788` e `scrollHeight=1356`;
- **"Cheguei" em y=890** (`_motorista.tsx:1042`) e **"Não entregue" em y=1006**
  (`_motorista.tsx:1070`) — os dois atrás do dock;
- só depois de `scrollTop=400` aparecem ("Cheguei" y=490, "Não entregue" y=606).

A captura `motorista_light_390.png` mostra o cartão "PRÓXIMA ENTREGA" cortado
pelo rodapé. Na cabine do entregador isso **não** acontece — lá "Entregue" está
em y=736 —, mas a URL é a mesma, e o operador que abre a tela no celular recebe
a versão ruim.

### P1-5. Motorista: uma ação, três nomes

O mesmo `desfecho(order_id, "entregue")` aparece como:

- **"Entregue"** na folha fechada (`_motorista.tsx:1380`);
- **"Marcar como entregue"** no detalhe da parada (`_motorista.tsx:793`) e de
  novo no outro caminho de detalhe (`_motorista.tsx:1061`);
- **"Cheguei"** (`_motorista.tsx:780`, `:1042`) é uma etapa anterior, mas mora
  lado a lado com o desfecho no mesmo cartão.

Medido na cabine: folha fechada mostra **"Entregue"**; um toque no destino
abre **"Cheguei" / "Marcar como entregue" / "Não entregue"**
(`cabine-detalhe-dark_390.png`). É a mesma reclamação que o dono já fez na
ficha: dois rótulos para a mesma coisa obrigam o usuário a adivinhar qual é a
real. Aqui são dois para "entregue" e a regra "uma ação, um lugar" continua
valendo.

### P1-6. Dinheiro no cartão de quem dirige

`_motorista.tsx:1009-1015` mostra `PED-0083 — R$ 49,90` dentro da próxima
entrega, e `_motorista.tsx:749-754` faz o mesmo no popup do mapa. O motorista
não decide preço, cobrança nem desconto na rua — o valor é ruído no cartão que
deve dizer só **onde ir e o que fazer**. Captura
`cabine-detalhe-dark_390.png`.

### P1-7. "Ainda não sincronizou" é texto morto, pequeno e sem saída

`_motorista.tsx:892-898` imprime **"Ainda não sincronizou nesta instalação."**
em `text-xs text-text-muted`, sem timestamp e sem ação. O botão "Sincronizar"
só existe se `fila.length > 0` (`_motorista.tsx:900-918`); no estado medido não
existe fila, então o aviso fica sozinho. Sem sinal, a única informação é um
sufixo **"sem conexão — a fila segue no aparelho"** (`:897`) — que só aparece
quando já há fila. Quem está offline não é dito o que fazer, nem se o toque que
acabou de dar foi salvo.

Legibilidade ao sol: 9–11 px em pontos operacionais — "agora"
(`_motorista.tsx:1236`, 9 px), "Próxima entrega · parada 1 de 1" (`:1321`,
10 px), "A ordem da lista continua valendo sem o mapa"
(`_mapa-rota.tsx:803`, 11 px), % do placar (`:1452`, 11 px). Contraste medido
reprovado em claro: **"Marcar como entregue" 4,35:1**, mínimo 4,5:1
(`_motorista.tsx:786-794`, `bg-success text-accent-fg`), registrado em
`capturas/medicao-lista-motorista/varredura.json`.

### P1-8. "Qual carga você está entregando?" duplica a própria lista e vem antes dela

Na lista do entregador, um `<select>` full-width
(`_client.tsx:355-381`) faz `router.push('/app/expedicao/<id>/motorista')`.
Logo abaixo, **41 cartões** (`_client.tsx:383-455`, `data-testid=carga-linha-*`)
levam ao **mesmo URL**. Medido: 1 select + 41 cartões, todos com o mesmo
destino. O `select` exige dois toques (abrir, escolher) e aparece antes dos
cartões de 32 px que são justamente o alvo de uma mão. Capturas
`lista-entregador-{light,dark}_390.png`.

## P2 — o que o pedido pedia e não está

### P2-9. Selos flutuantes voltam a cobrir conteúdo operacional

Na cabine, o selo inferior direito cobre a ponta da linha **"Rastreio ligado —
só nesta rota"** (`_motorista.tsx:1389-1403`, capturas `cabine-*_390.png`), e na
lista da doca o primeiro cartão ("Abrir Carga 060", y=800–882) nasce atrás do
dock (y=787). O `pb-24` protege o fim do conteúdo, não o meio — mesmo defeito já
medido no `71`, agora nas outras duas telas.

### P2-10. Avisos de endereço continuam mortos no detalhe aberto

Além do P0-2, o detalhe da parada repete **"Sem endereço cadastrado."**
(`_motorista.tsx:984`) e **"Endereço sem número — o pino pode não ser a porta."**
(`_motorista.tsx:996`) como `<p>`. Nenhum leva a corrigir o pedido nem
a abrir navegação externa com o que existe. A regra "ação inline para todo aviso
que hoje é texto morto" segue sem ser aplicada nestas duas telas.

## Limites desta medição

- Não houve alteração de código, backend, migration, rota, flag de produção nem
  deploy. O flag `motorista` foi ligado e desligado no banco **local** dentro do
  mesmo comando de captura.
- Não foi medida a jornada completa com internet caindo no meio de uma entrega
  (a fila offline foi lida no código, não simulada ponta a ponta).
- Não foi medido o contraste de texto sobre o mapa em condição real de sol —
  o que está registrado é o contraste computado pelo instrumento.

## Índice de evidência

- Capturas: `capturas/auditoria-lista-motorista/`
  - Lista operador: `app_expedicao_{light,dark}_{390,1440}.png`
  - `/motorista` operador: `app_expedicao_ad90f4b3…_motorista_{light,dark}_{390,1440}.png`
  - Cabine do entregador: `cabine-{light,dark}_390.png`, `cabine-detalhe-dark_390.png`
  - Lista do entregador: `lista-entregador-{light,dark}_390.png`
  - Ação abaixo da dobra: `medicao-motorista-acao-390.png`
- Varredura: `capturas/medicao-lista-motorista/varredura.json`
