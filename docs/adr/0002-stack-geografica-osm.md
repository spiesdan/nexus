# ADR-0002 — Stack geográfica: Leaflet + OpenStreetMap + Nominatim + OSRM

- **Status:** aceito
- **Data:** 2026-11-13
- **Decisão de produto:** manter a stack livre, autohospedável, com custo de licença zero
- **Runbook:** [`docs/runbooks/geodados.md`](../runbooks/geodados.md)
- **Mapa:** [`docs/architecture/expedicao-vrptw.architecture.json`](../architecture/expedicao-vrptw.architecture.json)

---

## Contexto

O prompt de remodelação da expedição (`docs/PROMPT-V5-EXPEDICAO-ROTEIRIZACAO.md`, §1) sugeria
MapLibre GL JS, Photon ou Pelias e OSRM. A auditoria do repositório mostrou que a expedição já
tinha um caminho funcionando com **Leaflet** (já instalado), **OpenStreetMap** como fonte de
tiles, **Nominatim** para geocodificação e **OSRM** para ruas e matrizes. O custo de trocar de
biblioteca de mapa não era só o pacote: eram todos os comportamentos já medidos e pagos com
defeito real — enquadramento que não briga com o dedo do motorista, popup com ação de entrega,
pino arrastável, GPS ao vivo e o modo cabine.

A prioridade declarada pelo dono do produto é **custo zero de licenciamento, independência de
fornecedor pago e controle da infraestrutura**. A stack que já está no código atende isso; o que
faltava era (a) a decisão escrita e (b) os pontos de configuração para apontar cada peça para a
instância própria.

## Decisão

| Peça | Escolha | Papel |
|---|---|---|
| Mapa | **Leaflet** | desenhar mapa, pinos dos destinos, rota por veículo, trajeto do motorista |
| Cartografia | **OpenStreetMap** (tiles) | dados de ruas e lugares |
| Geocodificação | **Nominatim** | endereço → latitude/longitude |
| Roteamento | **OSRM** | `route` (geometria pelas ruas) e `table` (matriz de distância e duração) |
| Armazenamento | **PostgreSQL** | latitude, longitude, fonte/precisão da geocodificação e versões da rota |

Nenhuma das quatro peças exige chave, assinatura ou licença paga. Todas rodam em contêiner.

### O que muda no código por causa desta decisão

- `GEOCODER_URL` escolhe a instância do Nominatim (default: pública).
- `GEOCODER_MIN_INTERVALO_MS` ajusta o ritmo: `1100` respeita a instância pública; `0` desliga a
  espera artificial quando o Nominatim é da casa.
- `GEOCODER_UA` identifica o cliente, como a política do Nominatim exige.
- `OSRM_URL` escolhe a instância do OSRM (default: demo pública).
- As três primeiras nasceram nesta decisão; `OSRM_URL` já existia. Todas são variável de
  ambiente, não edição de código — uma atualização do produto não apaga a configuração.

## Alternativas avaliadas e por que não

### MapLibre GL JS (sugerido no prompt)

- **A favor:** renderização vetorial, agrupamento de marcadores nativo, desempenho em bases
  grandes.
- **Contra:** exigiria reescrever o mapa inteiro (Leaflet está isolado em
  `_mapa-rota.tsx` justamente para permitir isso) e perder os comportamentos já medidos: o
  `ResizeObserver` que corrige o enquadramento em altura 0, o arrasto que desliga o "seguindo
  você", o popup com as ações de entrega. Nenhum desses é trivial e todos nasceram de defeito
  observado em operação.
- **Consequência aceita:** agrupamento de marcadores e seleção de pedido pelo mapa **não** estão
  implementados (ver §Pendências).

### Photon / Pelias (sugerido no prompt)

- **A favor:** feitos para autocomplete e busca tolerante; Photon é leve.
- **Contra:** o módulo já tem uma cadeia de fallback calibrada em endereço brasileiro de
  interior — abreviação, número colado no logradouro, CEP genérico, bairro antes de município —
  com testes que registram o motivo de cada fase. Trocar de provedor significa recalibrar tudo
  isso sem ganho de precisão comprovado no dado real desta operação.
- **Consequência aceita:** o contrato é o do Nominatim. Trocar exige escrever outro cliente; o
  resto do módulo não muda, porque consome `geocodificarComFallback` e não HTTP.

### Google Maps / Mapbox

- **Contra:** custo por requisição recorrente, chave em produção, dependência de fornecedor —
  exatamente o que a decisão de produto quer evitar.

## Consequências

### Positivas

- Licença zero: nenhuma peça cobra por requisição.
- Independência: qualquer provedor de VPS serve; a instância pode ir para uma máquina separada.
- Controle de dados: endereços consultados não saem para um terceiro pago.
- A configuração é por ambiente — trocar a instância não exige release.

### Negativas / custos que passam a existir

- **Operação**: subir e atualizar Nominatim e OSRM é trabalho de infraestrutura. O runbook
  cobre o procedimento; ninguém deve descobrir isso em produção.
- **A instância pública não é plano B de produção.** A política do Nominatim desencoraja uso em
  massa e não há SLA; o OSRM de demonstração tem limite de requisições. O default público serve
  para avaliação e instalação pequena, não para operação com volume.
- **Dimensionamento depende do extrato do OSM.** Não publicamos número de GB aqui porque ele
  envelhece: medir no extrato que for importado (§runbook).

## O que esta decisão NÃO resolve

Está registrado para não ser confundido com "feito":

- **Coordenada por destino**: hoje o cache de geocodificação mora em `contacts`. Dois pedidos do
  mesmo cliente em endereços diferentes já viram duas paradas na lista, mas compartilham o mesmo
  pino até o snapshot por destino existir (ver handoff da remodelação, §10.5).
- **Agrupamento de marcadores, seleção de pedido pelo mapa e filtros no mapa**: não
  implementados. A fila tem os filtros; o mapa ainda não.
- **Validação de "ponto perto de via roteável" (Nearest API)**: não usada.
