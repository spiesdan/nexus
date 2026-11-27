# syntax=docker/dockerfile:1
#
# maps-scraper — descoberta de negócios por Google Maps em modo HTTP, sem
# Places API, sem chave e sem conta.
#
# ── Contexto deste build ───────────────────────────────────────────────────
#
# O contexto é o CHECKOUT DO UPSTREAM no commit fixo (3176636 = v1.21.0), não o
# repositório do Nexus: quem clona o gosom no SHA e aponta `-f maps-scraper/
# Dockerfile` é o CI. Por isso este arquivo não faz `COPY` de nada do Nexus —
# o probe de healthcheck é compilado a partir do fonte embutido abaixo, para
# não depender de arquivo que não está no contexto.
#
# ── Por que compilar e não usar a imagem oficial ───────────────────────────
#
# A imagem oficial `gosom/google-maps-scraper` tem 2,0 GiB porque carrega o
# Chromium do Playwright. O modo que usamos (`-fast-mode`) faz requisições HTTP
# e NUNCA abre navegador — medido: 10 buscas seguidas em Joinville/SC com pico
# de 28,3 MB de RAM e 2,1 a 3,0 s por busca, zero CAPTCHA/403. O binário é Go
# estático: rodou em `distroless/static` sem lib de tela (X11/GTK/ALSA), como
# non-root, em arm64 e amd64. O modo navegador existe no mesmo binário, mas
# custou 1,03 GB e 35 s para 16 negócios — não é caminho.
#
# Compilar do fonte no SHA fixo é o que amarra este binário ao commit auditável;
# baixar o release traria o mesmo resultado, mas sem a garantia de que o fonte
# e o artefato são o mesmo ponto do histórico.

ARG GO_VERSION=1.27

# ── binário principal ──────────────────────────────────────────────────────
FROM golang:${GO_VERSION}-alpine AS build
WORKDIR /src
# Camada de módulos separada: o CI reconstrói a cada commit nosso, mas o
# `go mod download` só muda quando o upstream muda — e ele está pinado.
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/google-maps-scraper .

# ── probe de healthcheck ───────────────────────────────────────────────────
# Distroless não tem shell, curl nem wget para o `test:` do compose, então o
# probe é um segundo binário Go estático (~1,5 MB) compilado no mesmo build.
# O fonte fica AQUI, e não num arquivo do Nexus, porque o contexto é o checkout
# do upstream — um `COPY` de arquivo nosso falharia.
FROM golang:${GO_VERSION}-alpine AS probe
RUN mkdir -p /probe && cat > /probe/main.go <<'GO'
// Probe de saúde do sidecar: GET no endpoint de jobs e sai 0 se responder 2xx.
// É a rota que o runner usa — um probe que passa aqui prova que a API que
// interessa está no ar, e não só que a porta abriu.
package main

import (
	"fmt"
	"net/http"
	"os"
	"time"
)

func main() {
	url := os.Getenv("MAPS_SCRAPER_HEALTH_URL")
	if url == "" {
		url = "http://127.0.0.1:8080/api/v1/jobs"
	}
	resp, err := (&http.Client{Timeout: 3 * time.Second}).Get(url)
	if err != nil {
		fmt.Fprintf(os.Stderr, "healthcheck: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		fmt.Fprintf(os.Stderr, "healthcheck: HTTP %d\n", resp.StatusCode)
		os.Exit(1)
	}
}
GO
RUN cd /probe && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /healthcheck main.go

# ── imagem final ───────────────────────────────────────────────────────────
# `static-debian12` já traz CA certificates (HTTPS para o Google) e /etc/passwd
# para o usuário `nonroot`. Nada de shell, nada de Chromium.
FROM gcr.io/distroless/static-debian12:nonroot

ARG VERSION=1.21.0
ARG COMMIT=3176636
LABEL org.opencontainers.image.title="Nexus maps-scraper" \
      org.opencontainers.image.description="Descoberta de negócios por Google Maps em modo HTTP, sem Places API. Binário de terceiro (MIT), sem navegador." \
      org.opencontainers.image.source="https://github.com/gosom/google-maps-scraper" \
      org.opencontainers.image.revision="${COMMIT}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.licenses="MIT"

# Telemetria desligada NA IMAGEM, não só no compose: se alguém subir o binário
# à mão, o default continua não mandando dado para o upstream.
ENV DISABLE_TELEMETRY=1

COPY --from=build /out/google-maps-scraper /usr/bin/google-maps-scraper
COPY --from=probe /healthcheck /usr/local/bin/healthcheck
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/usr/bin/google-maps-scraper"]
