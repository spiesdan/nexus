# Runbook — dados geográficos (Nominatim + OSRM)

> **Decisão de stack:** [ADR-0002](../adr/0002-stack-geografica-osm.md). Leaflet + OpenStreetMap +
> Nominatim + OSRM, tudo autohospedável, sem licença paga.
>
> **Regra curta:** o default do produto é a instância **pública**. Ela serve para avaliação e
> instalação pequena; para operação com volume, suba a instância própria e aponte o `.env`.

## 1. O que roda onde

| Peça | Papel | Endereço que o app usa |
|---|---|---|
| Nominatim | endereço → latitude/longitude | `GEOCODER_URL` |
| OSRM | geometria pelas ruas e matriz de distância/duração | `OSRM_URL` |
| PostgreSQL (do produto) | cache de coordenadas e versões de rota | interno |

O app **não** fala com o OSM diretamente: fala com essas duas instâncias. Rodá-las numa máquina
separada (a "máquina geográfica") é o caminho recomendado — importar o Brasil consome disco e
RAM que não devem competir com o app, o WAHA e o Postgres do cliente.

## 2. Variáveis de ambiente

| Variável | Default | O que faz |
|---|---|---|
| `GEOCODER_URL` | `https://nominatim.openstreetmap.org/search` | endpoint `/search` do Nominatim |
| `GEOCODER_MIN_INTERVALO_MS` | `1100` | espera mínima entre chamadas, por processo. `0` = instância própria |
| `GEOCODER_UA` | `Nexus-Rotas/1.0` | User-Agent; a política do Nominatim exige identificação |
| `OSRM_URL` | `https://router.project-osrm.org` | base do OSRM (usada pelo app e pelo serviço `rota`) |

Nada disso exige release: é configuração de ambiente. No kit de instalação as três primeiras são
gravadas pelo `install.sh` a partir do valor que estiver no ambiente — quem já tem a instância
própria exporta ou edita o `.env` e roda `update.sh`.

## 3. Subir o Nominatim próprio

O caminho suportado upstream é a imagem `mediagis/nominatim` (Nominatim + Postgres no mesmo
contêiner, import no primeiro start). **Fixe a tag** — `latest` pode mudar o schema de import.

```bash
# Exemplo. Troque a tag pela versão que você validou.
docker run -d --name nominatim \
  -p 8080:8080 \
  -v nominatim-data:/var/lib/postgresql/14/main \
  -e PBF_URL=https://download.geofabrik.de/south-america/brazil-latest.osm.pbf \
  -e REPLICATION_URL=https://download.geofabrik.de/south-america/brazil-updates/ \
  -e NOMINATIM_PASSWORD=troque-esta-senha \
  mediagis/nominatim:4.4
```

- O primeiro start **importa o extrato inteiro** e demora (horas, dependendo do disco). Acompanhe
  com `docker logs -f nominatim`.
- **Dimensione medindo, não por estimativa:** o espaço e a RAM dependem do extrato e do estilo de
  import. Depois do import, `du -sh` no volume e `docker stats` dizem o número real desta
  instalação. Registre o medido no changelog da máquina.
- Verificação:

```bash
curl -s 'http://127.0.0.1:8080/search?q=Rua+das+Flores+100,+Canoinhas,+SC,+Brasil&format=json&limit=1'
```

Se voltar lista vazia para um endereço que existe, o problema é o extrato/import — não o app.

### Atualizar os dados do Nominatim

Dados do OSM envelhecem. Duas rotas:

1. **Replicação** (com `REPLICATION_URL`, como acima): a instância acompanha as atualizações.
   Configuração e agendamento são do upstream; não invente um cron próprio.
2. **Reimportação periódica**: baixar o extrato novo e refazer o import. É mais simples e mais
   previsível; custa uma janela de indisponibilidade.

Depois de atualizar os dados, o **cache de coordenadas do produto não é invalidado sozinho** —
de propósito: reimportar ruas não muda o endereço do cliente. Quando a mudança de malha viária
for material (obra que mudou o acesso), force a revisão dos contatos afetados:

```sql
-- Exemplo por organização. Zera o cache para a próxima geocodificação resolver de novo.
update public.contacts
   set latitude = null, longitude = null,
       geo_status = 'pendente', geo_fonte = null, geo_em = now()
 where organization_id = '<org-id>'
   and geo_fonte like 'nominatim%';   -- pino manual (geo_fonte='manual') NÃO se desfaz
```

Pino marcado à mão (`geo_fonte = 'manual'`) é decisão do operador: geocodificação nunca o
sobrescreve.

## 4. Subir o OSRM próprio

Procedimento oficial (`osrm/osrm-backend`), perfil `car` para frota de rua:

```bash
PBF=https://download.geofabrik.de/south-america/brazil-latest.osm.pbf
curl -LO "$PBF"

docker run -t -v "$PWD:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/brazil-latest.osm.pbf
docker run -t -v "$PWD:/data" osrm/osrm-backend osrm-partition /data/brazil-latest.osrm
docker run -t -v "$PWD:/data" osrm/osrm-backend osrm-customize /data/brazil-latest.osrm

docker run -d --name osrm -p 5000:5000 \
  -v "$PWD:/data" osrm/osrm-backend \
  osrm-routed --algorithm mld /data/brazil-latest.osrm
```

Verificação:

```bash
curl -s 'http://127.0.0.1:5000/route/v1/driving/-50.39,-26.17;-50.40,-26.18?overview=false'
```

O JSON tem de vir com `"code":"Ok"`. `NoRoute` significa que o extrato não cobre o trecho (ou as
coordenadas estão fora da área importada).

### Atualizar os dados do OSRM

Repita extract → partition → customize com o extrato novo e reinicie o contêiner. O `osrm-routed`
não recarrega o grafo em quente. Anote a data do extrato no changelog: a matriz de uma rota
calculada guarda o resultado, não a versão dos dados — se a malha mudou, o número antigo continua
válido como histórico.

### Perfil de veículo

`car.lua` é o perfil padrão. Caminhão com restrição de altura/peso exige perfil próprio — é
trabalho separado, com dado de restrição que o OSM pode não ter. Não troque o perfil sem medir a
diferença nas rotas reais.

## 5. Apontar o produto para as instâncias próprias

No `.env` da instalação (ou exportando antes de rodar o `install.sh`/`update.sh`):

```env
GEOCODER_URL=http://<ip-ou-host-da-maquina-geografica>:8080/search
GEOCODER_MIN_INTERVALO_MS=0
OSRM_URL=http://<ip-ou-host-da-maquina-geografica>:5000
```

Depois, recrie o app (e o serviço `rota`, que também lê `OSRM_URL`):

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml --env-file .env up -d app rota
```

- A "máquina geográfica" precisa estar na mesma rede alcançável pelo host do app. Se estiver em
  outro host, publique as portas **só na rede privada** (VPN/rede interna) e nunca na internet.
- `GEOCODER_MIN_INTERVALO_MS=0` é seguro **apenas** porque a instância é sua. Em endpoint público,
  mantenha `1100`.

## 6. Voltar para a instância pública (rollback)

```env
GEOCODER_URL=https://nominatim.openstreetmap.org/search
GEOCODER_MIN_INTERVALO_MS=1100
OSRM_URL=https://router.project-osrm.org
```

Recrie `app` e `rota`. Nenhum dado é perdido: o cache em `contacts` e as versões de rota em
`shipment_route_versions` continuam no Postgres.

## 7. Sintomas e causa provável

| Sintoma | Causa provável | O que conferir |
|---|---|---|
| Geocodificação lenta em carga grande | `GEOCODER_MIN_INTERVALO_MS=1100` com instância própria | zerar o intervalo |
| Muitos `nao_encontrado` | extrato não cobre a região / endereço sem número | testar a mesma consulta por `curl` no Nominatim |
| `429` / bloqueio | uso da instância pública em massa | subir instância própria; o ritmo padrão é piso, não salva volume |
| Otimização responde 503 | `ROTA_SOLVER_URL`/`OSRM_URL` errados ou serviço fora | `docker compose ps`, `curl /healthz` do solver e `/route/v1/...` do OSRM |
| Rota em linha reta | OSRM fora do ar — o app cai no cálculo aproximado e **declara** `ruas=false` | logs do app + `curl` do OSRM |

## 8. O que este runbook não cobre

- **Coordenada por destino**: hoje o cache mora em `contacts`; a evolução por endereço de entrega
  está registrada no handoff da remodelação (§10.5) e ainda não foi implementada.
- **Atualização automática da malha viária** dentro do produto: não existe. É operação da máquina
  geográfica.
- **Perfil de caminhão** com restrições de altura/peso: não implementado.
