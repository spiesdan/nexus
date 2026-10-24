# OCR do pedido — PaddleOCR 3.x, CPU, português.
#
# Serviço separado do app de propósito:
#   - PaddleOCR é Python; o app é Node. Juntar os dois numa imagem só faria
#     a imagem do app crescer ~2 GB por uma dependência usada em UMA rota.
#   - o teto de memória é do OCR, não do app. Um pedido grande não pode
#     derrubar o processo que atende o browser do vendedor.
#
# A imagem é publicada pelo CI (`.github/workflows/publish-image.yml`) e o
# compose de produção aponta para a tag publicada; o `build:` do compose é o
# escape de quem quer compilar. Doutrina: docs/doctrine/packaging.md.
FROM python:3.12-slim

# Procedência (doutrina de packaging, invariante 2). Sem estes rótulos a imagem
# publicada não diz de onde veio — e o `docker image inspect` da VPS não
# distingue uma imagem do CI de uma construída à mão no mesmo host.
LABEL org.opencontainers.image.source="https://github.com/spiesdan/nexus" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.title="Nexus OCR"

# A versão vem do CI no build (`publish-image.yml` passa `--build-arg`). É o
# que faz /healthz responder "que código está rodando aqui?".
ARG OCR_VERSAO=local
ENV OCR_VERSAO=$OCR_VERSAO

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # O PaddleX confere a origem dos modelos a cada boot; num serviço offline
    # isso vira latência (e falha, se a rede estiver bloqueada).
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True \
    HF_HUB_DISABLE_TELEMETRY=1

# libgomp1: OpenMP do PaddlePaddle. libgl1/libglib2.0-0: OpenCV (paddlex).
# Sem eles o import morre em "libgomp.so.1: cannot open shared object file".
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libgomp1 \
      libgl1 \
      libglib2.0-0 \
      libsm6 \
      libxext6 \
      libxrender1 \
 && rm -rf /var/lib/apt/lists/*

# Versões fixas: o serviço é um contrato HTTP nosso, mas o motor é upstream.
# Um `pip install paddleocr` sem versão muda o modelo entre dois builds da
# MESMA tag — exatamente o que a doutrina de packaging proíbe.
RUN pip install --no-cache-dir \
      paddlepaddle==3.3.1 \
      paddleocr==3.7.0 \
      fastapi==0.121.2 \
      uvicorn==0.38.0 \
      pillow==12.0.0

WORKDIR /app
COPY app.py ./

# Baixa os modelos NO BUILD, não no primeiro pedido. Duas consequências:
#   - o primeiro "Adicionar com IA" não espera ~100 MB de download;
#   - o container sobe sem depender de rede de saída (VPS com firewall).
# O cache fica em ~/.paddlex e viaja na camada da imagem.
#
# Quais modelos: os que o `carregar_motor` NOMEIA (v5 mobile det + latin
# mobile rec). Se um dia essa chamada deixar de nomear, o default da
# biblioteca entra no lugar — e no 3.7.0 ele é o v6 medium, que não cabe no
# teto de memória do serviço. É por isso que o build baixa daqui em vez de
# deixar para o primeiro pedido: o erro aparece no CI, não na VPS do cliente.
RUN python -c "from app import carregar_motor; carregar_motor()"

EXPOSE 8790

# Um worker só: o PaddleOCR não é thread-safe para carregar dois modelos, e
# 2 vCPUs não sustentam concorrência real. O app serializa as chamadas.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8790", "--workers", "1"]
