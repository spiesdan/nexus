"""
Serviço de OCR do pedido — PaddleOCR 3.x, CPU, português.

═══ O que ele é, e o que ele NÃO é ═══════════════════════════════════════════

Ele transforma uma FOTO em LINHAS de texto com confiança. Ele não sabe o que é
um produto, não escolhe item e não monta pedido. Quem faz isso é o app, com o
catálogo da organização (`lib/comercial/pedido-ocr.ts`): a mesma busca relaxada
que o agente usa no WhatsApp casa o texto do OCR com o produto certo.

A separação é deliberada. O catálogo muda a cada cadastro; o modelo de OCR não.
Se o catálogo fosse "treinado" dentro do modelo, cada produto novo exigiria um
retreino — e o OCR passaria a errar o que não está no catálogo.

═══ Por que PaddleOCR ═════════════════════════════════════════════════════════

PP-OCRv5 tem modelo latino oficial (português incluso), roda em CPU, é Apache
2.0 e não exige GPU.

Os modelos são NOMEADOS, nunca herdados do default. Medido em 2026-10-24: o
`PaddleOCR(lang="pt")` do 3.7.0 resolve para `PP-OCRv6_medium_det` +
`PP-OCRv6_medium_rec`, e o `predict` passa de 900 MiB — o cgroup matava o
`uvicorn` no meio do pedido (`Memory cgroup out of memory`, dmesg da VPS). Com
`PP-OCRv5_mobile_det` + `latin_PP-OCRv5_mobile_rec` o pico é 716 MiB na foto de
referência, a leitura sai melhor (6/6 linhas, 0,896–0,995, `ÁLCOOL` correto) e
o tempo cai de 7,9 s para 2,1 s.

`lang` não entra no construtor: com modelo nomeado o PaddleOCR o ignora (e
avisa). `OCR_LANG` continua sendo o idioma DECLARADO em `/healthz` — o modelo
latino cobre pt/es/fr/de, então ele não escolhe modelo.

═══ Contrato ═════════════════════════════════════════════════════════════════

POST /ocr
  {"imagem_base64": "...", "mime": "image/png"}
  -> {"linhas": [{"texto": "...", "confianca": 0.98, "caixa": [[x,y],...]}],
      "texto": "...", "motor": "paddleocr", "lang": "pt", "duracao_ms": 1234}

GET /healthz
  -> {"status": "ok", "motor": "paddleocr", "lang": "pt", "carregado": true}

O serviço NUNCA decide se a leitura é boa. Ele devolve confiança por linha; o
app decide se usa o resultado ou cai na IA (ver `lerPedidoComOcr`).
"""

from __future__ import annotations

import base64
import io
import os
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from PIL import Image, ImageOps
from pydantic import BaseModel, Field

# Teto do corpo. É o mesmo teto da rota do app (20 MB): recusar aqui também
# evita que um upload grande vire memória do processo de OCR.
MAX_BYTES = 20 * 1024 * 1024

# Acima disso o modelo não ganha precisão e só gasta RAM e tempo. O detector
# do PP-OCRv5 trabalha com o lado maior em 960 px; subir a foto além disso
# aumenta o pico de memória sem melhorar a leitura. Medido na foto de
# referência (2026-10-24), com os modelos mobile:
#
#   lado   pico     tempo    leitura
#    960   716 MiB   2,1 s    6/6 linhas, 0,902–0,991
#   1280   900 MiB   2,3 s    6/6, mas "1X" virou "IX"
#   1600  1071 MiB   3,0 s    6/6, mesmo "IX"
#   2000  1418 MiB   4,3 s    6/6
#
# 960 é o ponto em que a leitura é melhor E o pico cabe no teto do serviço.
MAX_LADO_PX = 960

LANG = os.getenv("OCR_LANG", "pt")
CPU_THREADS = int(os.getenv("OCR_CPU_THREADS", "2"))
VERSAO = os.getenv("OCR_VERSAO", "local")

# Modelos FIXOS, não o default da biblioteca. O comentário do topo tem a
# medição: o default do 3.7.0 é o v6 medium, que estoura o teto de memória.
MODELO_DETECCAO = "PP-OCRv5_mobile_det"
MODELO_RECONHECIMENTO = "latin_PP-OCRv5_mobile_rec"

_motor: Any = None
_trava = threading.Lock()


def carregar_motor() -> Any:
    """
    Carrega o PaddleOCR uma vez por processo.

    O `Dockerfile` chama esta função no build para baixar os modelos; no boot
    ela só lê do disco. Se o `cpu_threads` não existir na versão instalada, o
    construtor cai no padrão em vez de derrubar o serviço — o parâmetro é
    ajuste de desempenho, não requisito.
    """
    global _motor
    if _motor is not None:
        return _motor
    with _trava:
        if _motor is not None:
            return _motor
        from paddleocr import PaddleOCR

        base: dict[str, Any] = {
            # Nenhum dos três é necessário para uma foto de papel apoiada:
            # orientação de documento e unwarping custam tempo e RAM, e a
            # orientação de linha confunde manuscrito em bloco.
            "use_doc_orientation_classify": False,
            "use_doc_unwarping": False,
            "use_textline_orientation": False,
            # MKLDNN (oneDNN) ACELERA em CPU moderno, mas nesta VPS o
            # PaddlePaddle 3.3.1 morre no primeiro predict com
            # "ConvertPirAttribute2RuntimeAttribute not support
            # [pir::ArrayAttribute<pir::DoubleAttribute>]" — medido em
            # 2026-10-24, imagem nexus-ocr:local-test. Sem ele o OCR roda;
            # com ele, toda foto vira 500. Desempenho é ajuste; ler o pedido
            # não é.
            "enable_mkldnn": False,
        }
        try:
            _motor = PaddleOCR(
                **base,
                text_detection_model_name=MODELO_DETECCAO,
                text_recognition_model_name=MODELO_RECONHECIMENTO,
                cpu_threads=CPU_THREADS,
            )
        except TypeError:
            # Só o parâmetro de DESEMPENHO é opcional. Se `cpu_threads` sumir
            # numa versão futura, o serviço segue com o padrão da biblioteca.
            #
            # Não há fallback para "sem nome de modelo": ele carregaria o
            # default (v6 medium no 3.7.0) e voltaria a morrer de OOM no
            # primeiro pedido — falha silenciosa, por requisição, em vez de
            # falha alta no build e no boot. Modelo errado não é degradação
            # aceitável; é o defeito que este arquivo existe para impedir.
            _motor = PaddleOCR(
                **base,
                text_detection_model_name=MODELO_DETECCAO,
                text_recognition_model_name=MODELO_RECONHECIMENTO,
            )
        return _motor


def _preparar_imagem(conteudo: bytes) -> Image.Image:
    """
    Decodifica, corrige orientação EXIF e limita o lado maior.

    `ImageOps.exif_transpose` importa: foto de celular costuma vir girada por
    EXIF, e o OCR lê a imagem crua — sem isso, um pedido vertical chega
    deitado e vira lixo.
    """
    imagem = Image.open(io.BytesIO(conteudo))
    imagem = ImageOps.exif_transpose(imagem)
    if imagem.mode not in ("RGB", "L"):
        imagem = imagem.convert("RGB")
    maior = max(imagem.size)
    if maior > MAX_LADO_PX:
        escala = MAX_LADO_PX / float(maior)
        imagem = imagem.resize(
            (max(1, int(imagem.width * escala)), max(1, int(imagem.height * escala))),
            Image.LANCZOS,
        )
    return imagem


def _campo(resultado: Any, nome: str) -> Any:
    """Lê um campo do resultado do PaddleOCR sem depender da classe interna."""
    try:
        valor = resultado[nome]
        if valor is not None:
            return valor
    except Exception:
        pass
    return getattr(resultado, nome, None)


def _poligono(bruto: Any) -> list[list[float]]:
    try:
        return [[float(p[0]), float(p[1])] for p in bruto]
    except Exception:
        return []


def _extrair_linhas(resultados: Any) -> list[dict[str, Any]]:
    """
    Normaliza a saída do PaddleOCR para uma lista plana.

    A saída muda entre 3.x menores (ora `res["rec_texts"]`, ora `res.json`),
    então os dois caminhos são tentados. O que importa para o app é texto,
    confiança e posição — não a forma do objeto do motor.
    """
    linhas: list[dict[str, Any]] = []
    for resultado in resultados or []:
        textos = _campo(resultado, "rec_texts")
        scores = _campo(resultado, "rec_scores")
        polys = _campo(resultado, "rec_polys") or _campo(resultado, "dt_polys")
        if textos is None:
            continue
        for indice, texto in enumerate(textos):
            limpo = str(texto).strip()
            if limpo == "":
                continue
            try:
                confianca = float(scores[indice])
            except Exception:
                confianca = 0.0
            poly = _poligono(polys[indice]) if polys is not None and indice < len(polys) else []
            if poly:
                xs = [p[0] for p in poly]
                ys = [p[1] for p in poly]
                cx = sum(xs) / len(xs)
                cy = sum(ys) / len(ys)
                altura = max(ys) - min(ys)
            else:
                cx, cy, altura = 0.0, 0.0, 0.0
            linhas.append(
                {
                    "texto": limpo,
                    "confianca": max(0.0, min(1.0, confianca)),
                    "poly": poly,
                    "cx": cx,
                    "cy": cy,
                    "altura": altura,
                }
            )
    return linhas


def _agrupar_em_linhas(itens: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Junta caixas que estão na MESMA linha visual.

    O detector devolve uma caixa por trecho, não por linha do papel: "2x" e
    "ÁGUA SANITÁRIA BILL 5L" podem vir separados. Sem agrupar, a quantidade
    fica órfã numa linha e o produto noutra — e o parser do app perde o "2x".

    A tolerância é relativa à altura mediana das caixas, não um pixel fixo:
    numa foto de longe as letras são menores e a distância entre centros
    também.
    """
    if not itens:
        return []
    alturas = sorted(i["altura"] for i in itens if i["altura"] > 0)
    altura_mediana = alturas[len(alturas) // 2] if alturas else 12.0
    tolerancia = max(8.0, altura_mediana * 0.6)

    ordenados = sorted(itens, key=lambda i: (i["cy"], i["cx"]))
    grupos: list[dict[str, Any]] = []
    for item in ordenados:
        if grupos and abs(item["cy"] - grupos[-1]["cy"]) <= tolerancia:
            grupo = grupos[-1]
            grupo["itens"].append(item)
            # Média simples mantém o grupo ancorado no meio das caixas.
            grupo["cy"] = sum(i["cy"] for i in grupo["itens"]) / len(grupo["itens"])
        else:
            grupos.append({"cy": item["cy"], "itens": [item]})

    saida: list[dict[str, Any]] = []
    for grupo in grupos:
        partes = sorted(grupo["itens"], key=lambda i: i["cx"])
        textos = [p["texto"] for p in partes]
        confiancas = [p["confianca"] for p in partes]
        caixas = [p["poly"] for p in partes if p["poly"]]
        if caixas:
            xs = [p[0] for caixa in caixas for p in caixa]
            ys = [p[1] for caixa in caixas for p in caixa]
            caixa = [[min(xs), min(ys)], [max(xs), min(ys)], [max(xs), max(ys)], [min(xs), max(ys)]]
        else:
            caixa = []
        saida.append(
            {
                "texto": " ".join(textos),
                "confianca": min(confiancas) if confiancas else 0.0,
                "caixa": caixa,
            }
        )
    return saida


class PedidoDeOcr(BaseModel):
    imagem_base64: str = Field(min_length=1)
    mime: str = "image/png"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Carrega antes de anunciar saúde: healthcheck verde = modelo pronto.
    carregar_motor()
    yield


app = FastAPI(title="Nexus OCR", version=VERSAO, lifespan=lifespan)


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {
        "status": "ok",
        "motor": "paddleocr",
        "lang": LANG,
        "versao": VERSAO,
        "carregado": _motor is not None,
    }


@app.post("/ocr")
def ocr(pedido: PedidoDeOcr) -> dict[str, Any]:
    inicio = time.monotonic()
    try:
        conteudo = base64.b64decode(pedido.imagem_base64, validate=False)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="imagem_base64 inválido") from exc
    if len(conteudo) == 0:
        raise HTTPException(status_code=422, detail="imagem vazia")
    if len(conteudo) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="imagem passa de 20 MB")

    try:
        imagem = _preparar_imagem(conteudo)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="não consegui abrir a imagem") from exc

    motor = carregar_motor()

    # Arquivo temporário em vez de array numpy: o PaddleX lê o caminho com o
    # mesmo pipeline do treino (OpenCV, BGR). Passar array trocaria a ordem de
    # canais sem aviso e degradaria a leitura de cor.
    with tempfile.NamedTemporaryFile(suffix=".png") as arquivo:
        imagem.save(arquivo.name, format="PNG")
        with _trava:
            resultados = motor.predict(input=arquivo.name)

    itens = _extrair_linhas(resultados)
    linhas = _agrupar_em_linhas(itens)

    return {
        "linhas": linhas,
        "texto": "\n".join(linha["texto"] for linha in linhas),
        "motor": "paddleocr",
        "lang": LANG,
        "duracao_ms": int((time.monotonic() - inicio) * 1000),
    }
