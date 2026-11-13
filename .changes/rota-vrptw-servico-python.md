---
impacto: capacidade_nova
secao: adicionado
titulo: Roteirização multi-veículo com Google OR-Tools (VRPTW)
---

A expedição ganha um otimizador de rotas de verdade: um serviço Python independente (FastAPI + Google OR-Tools, publicado pelo CI como imagem `nexus-rota`) recebe as entregas da carga e devolve a distribuição por veículo, com sequência, distância, duração e geometria rodoviária de cada rota.

O solver usa a matriz do OSRM (distância **e** duração pelas ruas) e aplica, como restrições de verdade:

- **capacidade de peso e de volume por veículo** — dimensões próprias (`AddDimensionWithVehicleCapacity`), alimentadas pelo peso bruto e pelas dimensões do produto no cadastro;
- **jornada por motorista**, quando informada;
- **janelas de entrega por parada**, quando o ponto as trouxer;
- **rota aberta ou com retorno à base**, conforme a carga.

O que não tem dado não é fingido: a resposta declara `restricoes_nao_aplicadas` (por exemplo, produto sem peso no cadastro). Quando não há solução viável, a rota responde com o motivo (capacidade de peso, volume, jornada) e a lista completa de entregas não alocadas — nenhuma parada desaparece em silêncio.

A rota `POST /api/v1/shipments/[id]/rota/otimizar/veiculos` lê a frota cadastrada (`fleet_vehicles`, migration 0306) quando o pedido não informa veículos, e devolve `503 upstream_unavailable` se o serviço não estiver no ar — a heurística antiga (vizinho mais próximo + 2-opt, veículo único) continua no caminho legado e nunca responde por este contrato.

Nesta versão a otimização multi-veículo é API + serviço: a tela de confirmar a distribuição por veículo e o cadastro de frota entram na próxima entrega.
