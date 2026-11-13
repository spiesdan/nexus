# Serviço de roteirização (F5) — FastAPI + Google OR-Tools.
#
# Serviço separado do app de propósito:
#   - OR-Tools é C++/Python; o app é Node. Juntar os dois numa imagem só faria
#     a imagem do app crescer por uma dependência usada em uma rota;
#   - o solver tem teto de CPU/memória próprio: uma carga grande não pode
#     derrubar o processo que atende o browser do operador;
#   - o contrato é HTTP nosso (`POST /rota/otimizar`), validado dos dois lados.
#
# A imagem é publicada pelo CI (`.github/workflows/publish-image.yml`) e o
# compose de produção aponta para a tag publicada; o `build:` do compose é o
# escape de quem quer compilar. Doutrina: docs/doctrine/packaging.md.
FROM python:3.12-slim

LABEL org.opencontainers.image.source="https://github.com/spiesdan/nexus" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.title="Nexus Rota (VRPTW)"

# A versão vem do CI no build. É o que o `/healthz` devolve.
ARG ROTA_VERSAO=local
ENV ROTA_VERSAO=$ROTA_VERSAO

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# O OR-Tools é fixo em requirements.txt: o motor é upstream e o contrato é
# nosso. Um `pip install ortools` sem versão muda o resultado do solver entre
# dois builds da MESMA tag.
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Mesmo uid do app e dos outros serviços — o solver não precisa de root.
RUN useradd --uid 1001 --no-create-home --shell /usr/sbin/nologin rota
USER 1001

EXPOSE 8791

# Um worker só: o solver é CPU-bound e o compose limita a memória; paralelizar
# dentro de um contêiner pequeno só troca fila por thrashing.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8791/healthz', timeout=3)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8791", "--workers", "1"]
