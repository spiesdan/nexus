# maps-scraper — descoberta por Google Maps (modo HTTP)

Lista negócios de uma região sem Places API, sem chave e sem conta: o binário
[google-maps-scraper](https://github.com/gosom/google-maps-scraper) (MIT) em
**modo HTTP** (`-fast_mode`), sem navegador.

- Imagem: `ghcr.io/spiesdan/nexus-maps-scraper`
- Serviço no compose: `maps-scraper`, `profiles: ["maps"]` — **desligado por padrão**
- Variável: `MAPS_SCRAPER_IMAGE`

## Números medidos (27/11/2026, macOS arm64)

| | modo rápido | modo navegador |
|---|---:|---:|
| 10 buscas seguidas em Joinville/SC | 10/10, zero CAPTCHA/403 | — |
| tempo por busca | 2,1–3,0 s | 35 s (1 busca, 16 negócios) |
| pico de RAM | **28,3 MB** | 1,03 GB |
| negócios por busca (`-depth 2`) | 35–40 | — |
| campos preenchidos (de 13) | 12,4–12,8 por registro | — |

Site é o campo mais fraco: 81% em Joinville, 45% em Canoinhas/SC. E-mail não
existe em modo rápido. Imagem: distroless + binário, ~90 MB em disco e ~28 MB
comprimida (a oficial tem 2,0 GiB por causa do Chromium).

## Como o build funciona

O contexto é o **checkout do upstream no commit fixo** (`3176636` = v1.21.0), não
o repositório do Nexus:

```bash
git clone https://github.com/gosom/google-maps-scraper upstream
git -C upstream checkout 3176636
docker build -f maps-scraper/Dockerfile -t nexus-maps-scraper:local upstream
```

O Dockerfile compila o binário (`CGO_ENABLED=0`, Go 1.27) e um **segundo binário
Go** que serve de healthcheck — distroless não tem shell, curl nem wget. Nenhum
navegador entra na imagem.

O compose usa:

```yaml
healthcheck:
  test: ["CMD", "/usr/local/bin/healthcheck"]
```

## Como ligar

```bash
# baixa e sobe só ele, com a versão pinada no .env
docker compose --profile maps up -d maps-scraper

# testar a API de dentro da rede interna (o nome da rede é <projeto>_internal;
# confira com `docker network ls | grep internal`)
docker run --rm --network nexus_internal \
  -v "$PWD/maps-scraper:/r:ro" node:22-alpine \
  node /r/runner.mjs --base http://maps-scraper:8080 \
  --termo "restaurante" --lat -26.3045 --lon -48.8487
```

Sem `ports:`: só a rede interna. Nenhum proxy, nenhuma conta, nenhum resolvedor
de CAPTCHA. Se o Google bloquear, a resposta é parar e registrar.

## API do sidecar (contrato real, v1.21.0)

| rota | o quê |
|---|---|
| `POST /api/v1/jobs` | cria job; corpo com `keywords: []`, `lat`/`lon` **string**, `zoom`, `radius` em **metros**, `depth`, `fast_mode: true`, `max_time` em segundos |
| `GET /api/v1/jobs/{id}` | `Status` em `{pending, working, ok, failed}` (campos com maiúscula); `Data.fast_mode` confirma o modo |
| `GET /api/v1/jobs/{id}/download` | CSV do resultado |

Quem consome CSV: o site vem em **`website`**; no JSON do CLI o mesmo dado se
chama **`web_site`**. `complete_address` é string no CSV e objeto no JSON.
`cid` é string de 19 dígitos — não converter para número.

`runner.mjs` converte o CSV para o JSONL que
`scripts/importar-prospecao-maps-scraper.ts` já importa (com `web_site`).

## Limites conhecidos

- `/data` deve ser `tmpfs`: job e resultado somem se o contêiner reiniciar.
  Volume persistente exigiria um init que ajustasse o dono do diretório (a
  imagem é non-root e distroless).
- Uma busca por vez é o uso previsto. Concorrência acima de 2 e carga
  sustentada não foram medidas.
- Sem e-mail e sem avaliações individuais em modo rápido.
- A medição na VPS é do dono do ambiente, não deste repositório.

## Manutenção

A versão fica em `ARG VERSION`/`COMMIT` no Dockerfile; o commit pinado é o que o
CI clona. Para subir de versão: troque o SHA no workflow e os ARGs, depois rode
`./smoke.sh` na imagem nova.
