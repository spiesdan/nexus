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

- **PaddleOCR 3.7.0** + **PaddlePaddle 3.3.1**, CPU.
- Modelos **nomeados**: `PP-OCRv5_mobile_det` + `latin_PP-OCRv5_mobile_rec`
  (latino, português incluso), Apache 2.0.
- Sem GPU, sem serviço externo, sem chave de API.
- Modelos baixados **no build** da imagem (o primeiro pedido não espera download).

### Por que os modelos são nomeados, e não o default

`PaddleOCR(lang="pt")` no 3.7.0 resolve para **PP-OCRv6 medium**, não para o
mobile. Medido na VPS em 2026-10-24: o `predict` passou de 900 MiB e o cgroup
matou o `uvicorn` (`Exited with code 137`, `Memory cgroup out of memory` no
dmesg). O container voltava saudável — o `/healthz` responde antes de qualquer
foto — e morria no primeiro pedido real.

### Medido nesta VPS (2 vCPU, sem GPU)

Foto de referência: `evidence/mercos-ia/pedido-manuscrito.png`.

| Lado maior | Tempo | Pico de RAM | Resultado |
|---|---|---|---|
| **960 px** | **2,1 s** | **716 MiB** | **6/6 linhas, confiança 0,902–0,991** |
| 1280 px | 2,3 s | 900 MiB | 6/6, mas `1X` virou `IX` |
| 1600 px | 3,0 s | 1071 MiB | 6/6, mesmo `IX` |
| 2000 px | 4,3 s | 1418 MiB | 6/6 |

960 px é o limite nativo do detector: acima disso a leitura não melhora e o
pico de memória quadruplica. O teto do serviço no compose é **1024m**, que deixa
~300 MiB de folga sobre o pior caso medido.

Com o modelo correto, a foto manuscrita sai inteira e sem o erro de antes:
`ÁLCOOL 46%` é lido como `ÁLCOOL`, e não mais `ÁLC00L`.

| Foto | Tempo | Pico | Resultado |
|---|---|---|---|
| a foto de referência acima | 2,1 s | 716 MiB | 6/6 linhas, 0,902–0,991 |
| pedido impresso de teste | ~2 s | — | 6/6 linhas, confiança ≥0,995 |

## Prova na tela

![Proposta montada só pelo OCR](evidence/mercos-ia/12-ocr-proposta.png)

Capturado em 2026-10-24, com o serviço rodando na VPS e o catálogo real da
instalação (1.000 produtos). O log da rota confirma a origem e o custo:

```
[importar-ia] pedido lido pelo OCR  linhas=6 itens=5 confianca_media=0.94 motor=paddleocr
llm_calls na janela: 0
```

A tela mostra os três desfechos do casamento, de propósito:

- **ÁGUA SANITÁRIA BILL 5L** — `Encontrado`, produto e quantidade já preenchidos;
- **ÁLCOOL 46% IL** — `Escolha o produto`: o OCR leu `1L` como `IL`, o número não
  casa e a busca **não** pré-seleciona um produto de outra medida;
- **AMACIANTE 5L** — `Confira`: três produtos empatados em 100%, e empate não
  escolhe sozinho.

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
  "duracao_ms": 2100
}
```

`lang` é o idioma **declarado** (env `OCR_LANG`), não um seletor de modelo: o
reconhecedor `latin_PP-OCRv5_mobile_rec` cobre pt/es/fr/de.

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
