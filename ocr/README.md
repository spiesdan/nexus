# OCR do pedido (`ocr/`)

Serviço HTTP que transforma a foto de um pedido em **linhas de texto**, rodando
na VPS sem GPU. É o caminho barato do botão **Adicionar com IA**: o app tenta o
OCR primeiro e só gasta chamada de modelo quando a leitura não passa no portão
de confiança (`lib/comercial/pedido-ocr.ts`).

```
foto → ocr/ (PaddleOCR) → linhas + confiança → catálogo (busca relaxada) → proposta
                                                              ↑
                                              é aqui que o catálogo "treina"
```

## Motor

- **PaddleOCR 3.7.0** + **PaddlePaddle 3.3.1**, CPU, `lang="pt"`.
- Modelo latino do **PP-OCRv5** (`latin_PP-OCRv5_mobile_rec`), Apache 2.0.
- Sem GPU, sem serviço externo, sem chave de API.
- Modelos baixados **no build** da imagem (o primeiro pedido não espera download).

### Medido nesta VPS (2 vCPU, sem GPU)

| Foto | Tempo | RAM | Resultado |
|---|---|---|---|
| `evidence/mercos-ia/pedido-manuscrito.png` (1000×750) | 7,9 s | 543 MiB | 5/5 linhas, confiança 0,906–0,996 |
| pedido impresso de teste | 6,4 s | 543 MiB | 6/6 linhas, confiança ≥0,995 |

O único erro real na foto manuscrita foi `ÁLCOOL` → `ÁLC00L` (zero no lugar do
"o"). A busca do catálogo casou mesmo assim, como `média` — a tela pede
confirmação, que é o comportamento correto.

## "Treinar com os nossos produtos"

**O modelo não é retreinado.** Retreinar OCR exige centenas de fotos de pedidos
reais com cada linha transcrita à mão; com pouco dado o modelo fica pior que o
genérico. O que aprende o catálogo é a etapa seguinte, em Node:

- `casarItensComCatalogo` (`lib/comercial/importar-ia.ts`) usa a **mesma busca
  relaxada do agente no WhatsApp**;
- a busca tolera erro de digitação, acento, plural e número (`5 L` ≠ `2 L`);
- produto novo no catálogo vale na próxima leitura, **sem retreino**.

## Contrato

```http
POST /ocr
{"imagem_base64": "...", "mime": "image/png"}

200 {
  "linhas": [{"texto": "2X ÁGUA SANITÁRIA BILL 5L", "confianca": 0.96, "caixa": [[x,y],...]}],
  "texto": "...",
  "motor": "paddleocr",
  "lang": "pt",
  "duracao_ms": 7860
}
```

```http
GET /healthz
{"status":"ok","motor":"paddleocr","lang":"pt","versao":"1.34.0","carregado":true}
```

O serviço **não decide** se a leitura presta. Ele devolve confiança por linha; o
portão está no app.

## Como rodar

No compose de produção (já é o padrão):

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d ocr
```

Build local (escape, para quem quer compilar em vez de puxar a imagem):

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.build.yml \
  --env-file .env build ocr
```

Teste direto, sem o app:

```bash
curl -s http://127.0.0.1:8790/healthz
python3 - <<'PY'
import base64, json, urllib.request
b64 = base64.b64encode(open("pedido.png","rb").read()).decode()
req = urllib.request.Request("http://127.0.0.1:8790/ocr",
    data=json.dumps({"imagem_base64": b64, "mime": "image/png"}).encode(),
    headers={"content-type": "application/json"})
print(json.dumps(json.load(urllib.request.urlopen(req)), ensure_ascii=False, indent=1))
PY
```

## Limites conhecidos

- **Manuscrito cursivo** (letra emendada) ainda é o ponto fraco de qualquer OCR
  clássico. Nesse caso a confiança cai, o portão recusa e a IA lê — que é
  exatamente o desenho.
- **PDF não passa pelo OCR.** O modelo de IA lê PDF nativamente; converter PDF
  em imagem aqui só adicionaria dependência e tempo.
- **Uma leitura por vez.** O PaddleOCR não é thread-safe e 2 vCPUs não sustentam
  concorrência real; o serviço serializa com lock. Duas pessoas clicando ao
  mesmo tempo esperam alguns segundos, não falham.
- `enable_mkldnn=False` de propósito: nesta VPS o PaddlePaddle 3.3.1 morre no
  primeiro `predict` com oneDNN ligado. Desempenho é ajuste; ler o pedido não é.
