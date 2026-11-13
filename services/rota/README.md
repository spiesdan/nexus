# Serviço Python — Rota (F5: VRPTW multi-veículo)

Serviço independente (FastAPI + Google OR-Tools) que faz o otimizador de rotas
do NEXUS. Fronteira tipada via Pydantic (`app/contract.py`): o serviço não vê o
schema do banco, e o backend não monta o modelo OR-Tools.

Por que serviço separado: OR-Tools é C++/Python e o app é Node. Colocar o motor
na imagem do app faria a imagem crescer por uma dependência usada em uma tela,
e uma carga patológica derrubaria o processo que atende o browser do operador.

## Contrato

`POST /rota/otimizar` com `SolverRequest`:

- `origem` (base) — opcional; sem ela o serviço usa a **primeira entrega** como
  base virtual (mesma coordenada) e a mantém como entrega. Nenhuma parada
  desaparece.
- `pontos[]` — `node_id`, coordenadas e, quando existirem, `peso_kg`,
  `volume_m3`, `tempo_servico_min` e janela (`janela_inicio_min`/`janela_fim_min`,
  em minutos desde a saída da base).
- `veiculos[]` — `veiculo_id`, `motorista_id`, `capacidade_kg`, `capacidade_m3`,
  `tempo_jornada_min`.
- `retornar_origem` — `false` = rota aberta (termina na última entrega);
  `true` = volta para a base.
- `tempo_parada_min`, `max_veiculos`, `limite_busca_s` (busca do OR-Tools).

Resposta `SolverResponse`:

- `status`: `otimizado` | `sem_solucao`.
- `veiculos[]`: `veiculo_id`, `motorista_id`, `paradas` (ordem real),
  `distancia_m`, `duracao_s`, `duracao_com_paradas_s`, `carga_kg`, `carga_m3`,
  `geometria` (base → entregas → base quando retorna).
- `entregas_nao_alocadas`, `motivo` (`capacidade_peso`, `capacidade_volume`,
  `jornada`, `nenhuma_solucao_viavel`), `restricoes_nao_aplicadas`,
  `tempo_execucao_ms`, `versao_algoritmo`, `matriz_provedor`.

`GET /healthz` devolve `{status, versao}` — é o probe do compose e do deploy.

## O que o solver aplica

| Restrição | Como | Quando não há dado |
|---|---|---|
| Distância/tempo | Matriz OSRM Table (`distance,duration`) | falha fechado — não há fallback euclidiano |
| Capacidade de peso | dimensão própria em gramas, `AddDimensionWithVehicleCapacity` | `capacidade_peso_sem_dados` |
| Capacidade de volume | dimensão própria em litros | `capacidade_volume_sem_dados` |
| Jornada | dimensão de tempo (duração + atendimento) por veículo | `jornada_sem_dados` |
| Janelas de entrega | `CumulVar.SetRange` por parada | `janelas_de_entrega_sem_dados` |
| Rota aberta/fechada | nó final virtual de custo zero | — |

Nada é ignorado em silêncio: restrição sem dado sai em
`restricoes_nao_aplicadas`; inviabilidade sai com `motivo` e a lista completa de
`entregas_nao_alocadas` (nunca "sumiu uma parada").

## Como rodar (dev)

```bash
python -m pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8791
```

O app aponta para `http://127.0.0.1:8791` por padrão no dev; no compose de
produção o endereço é `http://rota:8791` (`ROTA_SOLVER_URL`).

## Implantação (self-host)

- A imagem é publicada pelo CI (`nexus-rota`, `publish-image.yml`) — o serviço
  **não** é construído na VPS de quem instala. O `build:` do compose existe só
  como escape.
- O compose de produção sobe `rota` na rede interna, sem portas publicadas.
- Variáveis:
  - `ROTA_IMAGE` / `ROTA_PULL_POLICY` — pino da versão no `.env` do kit;
  - `ROTA_SOLVER_URL` — endereço que o app usa (default `http://rota:8791`);
  - `ROTA_SOLVER_TIMEOUT_MS` — teto de espera do app (default 30 s);
  - `OSRM_URL` — instância OSRM usada pelo solver.
- Sem o serviço no ar, `POST /api/v1/shipments/[id]/rota/otimizar/veiculos`
  responde `503 upstream_unavailable`. O resto da expedição continua funcionando.

## Manutenção dos dados geográficos

- Produção deve usar **instância própria do OSRM** com extrato do
  OpenStreetMap do estado/região atendida, atualizado periodicamente; o demo
  público (`router.project-osrm.org`) não tem SLA e pode mudar de perfil.
- Atualizar o extrato é trocar o arquivo `.osrm` e reiniciar o OSRM; o solver
  não guarda matriz em cache (cada chamada pede a matriz daquela carga).
- A versão do OR-Tools é fixa em `requirements.txt` (`ortools==9.15.6755`);
  mudar o motor é mudança de release, não de ambiente.

## Limitações conhecidas

- **Janelas por parada**: o contrato aceita, mas o schema atual (pedido/contato)
  não tem horário permitido de entrega — o backend não envia janelas e a
  resposta declara `janelas_de_entrega_sem_dados`.
- **Veículos/motoristas persistidos**: `fleet_vehicles`/`fleet_drivers` já
  existem (migration 0306) e a rota lê a frota quando o body não manda veículos;
  ainda não há tela de cadastro de frota.
- **Uma entrega por parada**: coleta-e-entrega no mesmo destino (dependência
  pick-up/delivery) não é modelada.
- **Peso/volume**: vêm de `catalog_products.peso_bruto_kg` e das três dimensões
  do produto. Produto sem esses campos não entra na conta de capacidade, e a
  resposta diz isso.
