# 52 — Rota da carga: diagnóstico e primeira fatia

> **Numeração:** o despacho pedia `49-rotas-design.md`; o `49` já é do passe do
> Sentinel (`49-sentinel-design.md`). Este é o **52**.

**Data:** 20/11/2026 · **Base:** `nexus/main` · **Tela:** `/app/expedicao/<id>/rota`
(`_roteirizador.tsx`, `_mapa-rota.tsx`).

## O que cada ação faz hoje (confirmado no código)

| Botão                                          | Rota chamada                                                | O que faz                                                                               | Grava?                                               |
| ---------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Calcular a ordem** → “Ordenar por distância” | `POST /shipments/:id/rota/otimizar` com `modo: "distancia"` | ordena as paradas **desta carga** por distância                                         | **não**: devolve `PropostaRota`; salvar é outro POST |
| **Otimizar por ruas**                          | idem, `modo: "tsp"`                                         | mesma coisa, trajeto pelas ruas (OSRM)                                                  | **não**                                              |
| **Distribuir com OR-Tools**                    | `POST /shipments/:id/rota/otimizar/veiculos`                | distribui as paradas **entre os veículos selecionados**, respeitando capacidade/jornada | **não**: devolve `PropostaMulti`, exige confirmação  |
| **Reotimizar**                                 | os mesmos endpoints, quando já há ordem                     | recalcula sobre o que existe                                                            | **não**                                              |

Ou seja: **as duas “otimizações” são propostas, não gravação** — e a diferença
entre elas é _uma carga_ × _vários veículos_. A tela trata as duas como irmãs de
mesmo peso, e é aí que o operador trava.

## Diagnóstico confirmado na tela (não só no código)

Captura `capturas/rota-antes-light-1440.png` (carga 010, 3 paradas):

1. **O mapa ocupava a primeira dobra inteira** (`min(58vh, 640px)` + faixa de 5
   métricas): “Ordem de entrega”, “Planejamento” e “Endereços” começavam abaixo
   de 1.000 px de altura. Quem despacha abre a tela e vê **mapa**, não a lista.
2. **Selo de algoritmo no lugar de estado**: “Sem rota calculada” / “Ordem
   aproximada” / “Pelas ruas” — o operador precisa saber se a rota está
   **publicada**, não qual solver rodou.
3. **Três cartões de peso igual** (Ordem de entrega · Planejamento · Endereços),
   sem dizer por onde começar. O “Planejamento” já tem passos numerados (1
   origem, 2 cálculo) — a numeração existe, mas está escondida no terceiro
   cartão, abaixo do mapa.

## Benchmark (fontes citadas, não inventadas)

- **Routific** (help.routific.com — _timeline, list and map_ / _optimize and
  schedule_): mapa, lista e timeline **sincronizados**; arrastar parada entre
  rotas; “Schedule/Plan” como ação única; **pedidos que não couberam ficam numa
  lista de sobra** com o motivo; selo de alterações não publicadas; ETA por
  parada.
- **Onfleet** (support.onfleet.com — _map & sidebar_): barra lateral com as
  **não atribuídas** no topo; motoristas com as tarefas na ordem; pinos no mapa;
  ordenação por janela.
- **Padrão comum das três**: número da parada no mapa **e** na lista; a sequência
  é a informação mais importante; ação primária única; estado por parada.

## O que mudou nesta fatia (1 de 3)

- **O mapa desce até o piso**: altura `min(58vh, 640px)` → `min(50vh, 520px)`.
  O primeiro corte foi `min(42vh, 460px)`, e o gate
  `expedicao-pagina-de-rota-layout` reprovou: abaixo de **50vh** o mapa deixa de
  ser o motivo da tela. O piso venceu — e está certo: encolher o mapa não é como
  se traz a lista para a primeira dobra. Com 50vh a “Ordem de entrega” começa em
  ~940 px num viewport de 900, ou seja, **logo abaixo da dobra**; trazê-la para
  dentro é a fatia 2 (ação primária única e ordem sincronizada), não um mapa
  menor.
- **Um selo, um estado**: `Proposta` · `Publicada` · `Em andamento` ·
  `Concluída`, derivado de `ordemMudou`/`ordemSalva` e do status da carga.
- **Jargão fora da vista**: “OSRM”, “OR-Tools”, “ordem aproximada” e “sem rota
  calculada” saíram da linha de título para um **“Detalhes do cálculo”**
  recolhido (`<details>`).

## Números

| Medida                                  | Resultado                                                             |
| --------------------------------------- | --------------------------------------------------------------------- |
| Contraste AA (escuro)                   | **0 de 123** textos abaixo do mínimo                                  |
| Contraste AA (claro)                    | **0 de 123**                                                          |
| Overflow horizontal                     | **0** em 1440 e 390                                                   |
| Console                                 | **0**                                                                 |
| Texto de algoritmo na superfície        | **0** (era 3 rótulos)                                                 |
| Lista de paradas na 1ª dobra (1440×900) | **não** com 50vh (topo em ~940 px) · **73 px** com 42vh (topo em 828) |
| Lista de paradas na 1ª dobra (1280×800) | **0 px nos dois** (topo em ~970 com 58vh, ~842 com 42vh)              |

Capturas: `capturas/rota-antes-*-1440.png` e `capturas/rota-depois-*-1440.png`.

## O que NÃO entrou (fatias 2 e 3 — declarado, não omitido)

1. **Ação primária única** (“Otimizar rota” com frota / “Ordenar paradas” sem):
   exige decidir onde o botão mora e o que acontece com a proposta pendente —
   é a próxima fatia, com a regra já confirmada acima.
2. **Mapa e lista sincronizados** (clicar na lista destaca o pino e vice-versa,
   numeração 1..N nos dois): `_mapa-rota.tsx` não recebe `onSelecionar` hoje.
3. **“Não atribuídas” com motivo** (sem coordenada / capacidade / sem veículo)
   num bloco próprio.
4. **Linha da parada enxuta** e arrastar para reordenar (`dnd-kit` **não** está
   no `package.json` — sem dependência nova sem autorização).
5. **Tarefa medida de 12 paradas em 2 veículos**: a carga local tem 3 paradas e
   nenhum veículo selecionado; a fixture de 12/2 ainda não existe. Não inventei
   o número.

## Fora do escopo

Nenhuma regra de capacidade, janela, prioridade ou arredondamento foi tocada.

### Por que o mapa ficou em 50vh (decisão medida)

| Altura do mapa             | 1440×900                                     | 1280×800                            |
| -------------------------- | -------------------------------------------- | ----------------------------------- |
| `min(58vh, 640px)`         | mapa 522 · painel em 972 · **0 px visível**  | mapa 464 · painel em 970 · **0 px** |
| `min(42vh, 460px)`         | mapa 378 · painel em 828 · **73 px visível** | mapa 336 · painel em 842 · **0 px** |
| `min(50vh, 520px)` (atual) | mapa 450 · painel em 900 · **0 px**          | mapa 400 · painel em 906 · **0 px** |

Os 42vh ganham **73 px** de painel num tamanho e **nada** no outro — e custam
42 px de mapa na tela em que o despachante trabalha. Não é troca que se pague:
o que falta para a lista entrar na dobra são os ~90 px da faixa de cinco
métricas, e isso é a **fatia 2** — encolher o mapa é o jeito caro de resolver.
O gate `expedicao-pagina-de-rota-layout` (piso de 50vh) fica como está; o
número agora tem a medição ao lado.

## Fatia 2/3 — estado de falha (#685, mergeada)

O aviso de parada sem pino e o mapa vazio deixaram de ser texto de 11 px em
cantos opostos da página. A captura desta fatia registrou o **antes** da tela
com o Supabase local, 20/11/2026:

| Combinação            | Overflow | Aviso de falha | Mapa vazio  | axe (crít./sério) | Console |
| --------------------- | -------- | -------------- | ----------- | ----------------- | ------- |
| claro 1440 · parcial  | 0 px     | não existia    | não existia | 0/1               | 0       |
| claro 1440 · vazio    | 0 px     | não existia    | não existia | 0/1               | 0       |
| claro 390 · vazio     | 0 px     | não existia    | não existia | 0/0               | **5**   |
| escuro 1440 · parcial | 0 px     | não existia    | não existia | 0/1               | **5**   |
| escuro 1440 · vazio   | 0 px     | não existia    | não existia | 0/1               | **5**   |
| escuro 390 · parcial  | 0 px     | não existia    | não existia | 0/0               | **5**   |

Duas leituras:

- o `0/1` em 1440 é o seletor de empresa do **shell** (`tenant-switcher`), o
  mesmo em toda tela do produto;
- os **5 erros de console** nos temas escuros são o defeito do `<details>`
  dentro de `<p>` — corrigido no **#692**, com gate em
  `tests/unit/expedicao-pagina-de-rota-layout.test.ts` (mutação inclusa).

O "depois" desta fatia e do #692 fica pendente de **janela** para a captura: o
instrumento está versionado (`tests/captura-rota-falha.ts`).

## Fatia 3/3 — publicar/enviar (#694)

O gesto que manda a rota para a rua morava na tela vizinha, como botão de
status ("Iniciar rota"). Quem termina de ordenar em `/expedicao/<id>/rota` — a
tela onde a ordem é decidida — tinha de sair dela para publicar, e ali só havia
"Salvar ordem".

A decisão do que mostrar virou tabela testável (`lib/rotas/publicacao.ts`),
porque é ela que impede o botão de prometer o que a rota recusa:

| Estado                       | Quando                       | Ação na tela                           |
| ---------------------------- | ---------------------------- | -------------------------------------- |
| `publicar`                   | carga `montando`, com parada | "Publicar rota" (primária)             |
| `publicar` + `precisaSalvar` | idem, com proposta na tela   | publica **salvando antes**             |
| `publicada`                  | `em_rota`                    | "Abrir no modo entregador"             |
| `encerrada`                  | `concluida`                  | nenhuma                                |
| `vazia`                      | sem parada                   | nenhuma (o servidor recusaria com 422) |

A ordem das regras é a regra: `concluida` vence `em_rota` e `vazia` vence
`publicar`. Sem elas, o botão apareceria em carga concluída e prometeria envio
de rota vazia.

A confirmação diz as **duas** consequências juntas — a carga sai de `montando`
e passa a existir no aparelho do entregador; os clientes são avisados por
WhatsApp — porque nenhuma delas é reversível pelo botão. Antes, só a de clientes
era dita, e em outra tela.

Sem regra nova: `PATCH /rota/ordem` e `POST /rota/iniciar` já existiam, e o
aviso ao cliente é o do servidor. A prova visual (estados, contraste, overflow,
console, matriz 41) usa `tests/captura-rota-publicar.ts` e depende de janela.
