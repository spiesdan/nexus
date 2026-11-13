---
impacto: capacidade_nova
secao: adicionado
titulo: Roteirização multi-veículo com Google OR-Tools (VRPTW)
---

A expedição ganha um otimizador de rotas de verdade: um serviço Python independente (FastAPI + Google OR-Tools, publicado pelo CI como imagem `nexus-rota`) recebe as entregas da carga e devolve a distribuição por veículo, com sequência, distância, duração, **horário de chegada em cada parada** e geometria rodoviária de cada rota.

O solver usa a matriz do OSRM (distância **e** duração pelas ruas) e aplica, como restrições de verdade:

- **capacidade de peso e de volume por veículo** — dimensões próprias (`AddDimensionWithVehicleCapacity`), alimentadas pelo peso bruto e pelas dimensões do produto no cadastro;
- **jornada por motorista**, quando informada;
- **janelas de entrega por parada** — a hora combinada com o cliente é convertida em minutos desde a saída prevista da carga; sem hora de saída a janela **não é aplicada** e a resposta declara, em vez de inventar uma partida;
- **rota aberta ou com retorno à base**, conforme a carga.

O que não tem dado não é fingido: a resposta declara `restricoes_nao_aplicadas` (produto sem peso no cadastro, veículo sem capacidade, janela sem hora de saída). Quando não há solução viável, a rota responde com o motivo (capacidade de peso, volume, jornada) e a lista completa de entregas não alocadas — nenhuma parada desaparece em silêncio.

**A tela fecha o laço.** O planejador ganhou o painel de distribuição por veículo: escolher quem participa, definir a hora de saída, ver a sequência de cada caminhão com ETA, mover parada entre veículos e confirmar. O mapa desenha **uma linha por veículo**, na cor da legenda, em vez de uma linha única que mentia sobre quem passa onde. A fila da expedição filtra por veículo, motorista e situação, e a linha da carga mostra os veículos da distribuição (não só a placa legada).

**A frota tem cadastro próprio** (`/app/frota`): veículos com placa única por organização, capacidade de peso e volume; motoristas com jornada. A capacidade que o otimizador respeita vem do banco, nunca do corpo da requisição — a tela escolhe *quem* participa, o cadastro diz *o que cabe*.

**A distribuição é versionada.** Confirmar grava um snapshot imutável em `shipment_route_versions` (versão ativa), a atribuição por pedido (`veiculo_id`, `motorista_id`, `sequencia_veiculo`) e a hora de saída. A confirmação revalida no servidor a cobertura total, a capacidade e a jornada, e usa lock otimista (`versao_base` + update condicional): duas telas não sobrescrevem a rota uma da outra — a segunda recebe 409 e recarrega. O histórico das últimas versões aparece no próprio painel.

**O destino da entrega passa a ser o endereço, não o cliente.** Antes, dois pedidos do mesmo cliente para endereços diferentes viravam duas paradas na lista mas dividiam o mesmo pino no mapa — corrigir um movia o outro, e mexer no cadastro do cliente movia entregas já planejadas. Agora cada pedido guarda um snapshot do endereço efetivo quando entra na carga (`shipment_destinations`), com coordenada, fonte e precisão da geocodificação próprias. Mudar o endereço de um pedido já embarcado cria um destino novo; a parada antiga continua onde estava. Carga anterior a esta versão segue lendo o cadastro como antes — nada é reescrito no histórico.

A stack geográfica é livre e autohospedável: **Leaflet + OpenStreetMap + Nominatim + OSRM**, sem licença paga. As URLs da geocodificação e do roteamento são variáveis de ambiente (`GEOCODER_URL`, `OSRM_URL`), então quem sobe as instâncias próprias aponta o produto para elas sem depender de release — o default continua sendo a instância pública, para avaliação. O procedimento está em `docs/runbooks/geodados.md` e a decisão em `docs/adr/0002-stack-geografica-osm.md`.

**O romaneio em PDF não muda**: a folha que o motorista leva continua a mesma, com o veículo e o motorista da carga. A distribuição por veículo vive na tela e no mapa; o papel continua sendo o que a operação já confere.

A rota `POST /api/v1/shipments/[id]/rota/otimizar/veiculos` lê a frota cadastrada quando o pedido informa veículos (capacidade e jornada vêm do banco) ou usa a frota ativa inteira quando não informa, e devolve `503 upstream_unavailable` se o serviço não estiver no ar — a heurística antiga (vizinho mais próximo + 2-opt, veículo único) continua no caminho legado e nunca responde por este contrato.
