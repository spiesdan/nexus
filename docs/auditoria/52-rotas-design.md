# 52 — Rota da carga: diagnóstico e primeira fatia

> **Numeração:** o despacho pedia `49-rotas-design.md`; o `49` já é do passe do
> Sentinel (`49-sentinel-design.md`). Este é o **52**.

**Data:** 20/11/2026 · **Base:** `nexus/main` · **Tela:** `/app/expedicao/<id>/rota`
(`_roteirizador.tsx`, `_mapa-rota.tsx`).

## O que cada ação faz hoje (confirmado no código)

| Botão | Rota chamada | O que faz | Grava? |
| --- | --- | --- | --- |
| **Calcular a ordem** → “Ordenar por distância” | `POST /shipments/:id/rota/otimizar` com `modo: "distancia"` | ordena as paradas **desta carga** por distância | **não**: devolve `PropostaRota`; salvar é outro POST |
| **Otimizar por ruas** | idem, `modo: "tsp"` | mesma coisa, trajeto pelas ruas (OSRM) | **não** |
| **Distribuir com OR-Tools** | `POST /shipments/:id/rota/otimizar/veiculos` | distribui as paradas **entre os veículos selecionados**, respeitando capacidade/jornada | **não**: devolve `PropostaMulti`, exige confirmação |
| **Reotimizar** | os mesmos endpoints, quando já há ordem | recalcula sobre o que existe | **não** |

Ou seja: **as duas “otimizações” são propostas, não gravação** — e a diferença
entre elas é *uma carga* × *vários veículos*. A tela trata as duas como irmãs de
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

- **Routific** (help.routific.com — *timeline, list and map* / *optimize and
  schedule*): mapa, lista e timeline **sincronizados**; arrastar parada entre
  rotas; “Schedule/Plan” como ação única; **pedidos que não couberam ficam numa
  lista de sobra** com o motivo; selo de alterações não publicadas; ETA por
  parada.
- **Onfleet** (support.onfleet.com — *map & sidebar*): barra lateral com as
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

| Medida | Resultado |
| --- | --- |
| Contraste AA (escuro) | **0 de 123** textos abaixo do mínimo |
| Contraste AA (claro) | **0 de 123** |
| Overflow horizontal | **0** em 1440 e 390 |
| Console | **0** |
| Texto de algoritmo na superfície | **0** (era 3 rótulos) |
| Lista de paradas na 1ª dobra (1440) | **não** — topo em ~940 px com o mapa no piso de 50vh; é a fatia 2 que a traz |

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
