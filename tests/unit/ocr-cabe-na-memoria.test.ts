import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O OCR cabe no teto de memória que o compose lhe dá.
 *
 * ── O defeito que este gate existe para impedir ────────────────────────────
 *
 * Medido na VPS em 2026-10-24, com o serviço já no ar e saudável:
 *
 *     docker inspect crm-ocr-1  →  Up, health: healthy, 426 MiB / 900 MiB
 *     POST /ocr (foto real)     →  Exited with code 137
 *     dmesg                     →  Memory cgroup out of memory: Killed
 *                                   process … (uvicorn) anon-rss:906420kB
 *
 * O serviço não estava quebrado: ele estava usando o modelo DEFAULT da
 * biblioteca. `PaddleOCR(lang="pt")` no 3.7.0 resolve para
 * `PP-OCRv6_medium_det` + `PP-OCRv6_medium_rec`, e o `predict` passa de
 * 900 MiB. O cgroup mata o processo, o container reinicia, e o app — que já
 * tinha recebido `/healthz` 200 — vê `fetch failed` e cai na IA, que era
 * exatamente o custo que o OCR veio evitar.
 *
 * O healthcheck não pegava: ele bate em `/healthz`, que responde antes de
 * qualquer imagem ser processada. Um serviço "healthy" que morre na primeira
 * foto é o pior estado possível — o painel diz que está tudo bem.
 *
 * ── Por que virou teste ────────────────────────────────────────────────────
 *
 * A causa não foi um bug nosso, foi o default de uma dependência: um
 * `pip install paddleocr==3.7.0` num build futuro traz o mesmo comportamento,
 * e nada no código diria por quê. Fixar os modelos e o teto é a correção;
 * este arquivo é o que impede a correção de ser desfeita em silêncio.
 *
 * As medições (foto `evidence/mercos-ia/pedido-manuscrito.png`, 2 vCPU):
 *
 *     lado   pico     tempo    leitura
 *      960   716 MiB   2,1 s    6/6 linhas, 0,902–0,991
 *     1280   900 MiB   2,3 s    6/6, "1X" virou "IX"
 *     1600  1071 MiB   3,0 s    6/6
 *     2000  1418 MiB   4,3 s    6/6
 */

const RAIZ = process.cwd();
const APP = fs.readFileSync(path.join(RAIZ, "ocr/app.py"), "utf8");
const DOCKERFILE = fs.readFileSync(path.join(RAIZ, "ocr/Dockerfile"), "utf8");
const COMPOSE = fs.readFileSync(path.join(RAIZ, "docker-compose.prod.yml"), "utf8");

/**
 * O bloco de um serviço do compose, por indentação.
 *
 * Escrito à mão (sem dependência de YAML) porque o repo já tem esse padrão em
 * `packaging-artefato-do-cliente.test.ts`: um parser que não enxerga o serviço
 * falha alto no primeiro `expect`, não passa vazio.
 */
function blocoDoServico(nome: string): string {
  const linhas = COMPOSE.split("\n");
  const inicio = linhas.findIndex((linha) => linha === `  ${nome}:`);
  if (inicio === -1) return "";
  const bloco: string[] = [];
  for (const linha of linhas.slice(inicio + 1)) {
    // Outro serviço (2 espaços) ou o fim da seção (coluna 0) encerram.
    if (/^\S/.test(linha) && linha.trim() !== "") break;
    if (/^ {2}[a-z0-9_-]+:\s*$/i.test(linha)) break;
    bloco.push(linha);
  }
  return bloco.join("\n");
}

/** `mem_limit: 1024m` → 1024. Aceita `m` e `g`. */
function memLimitEmMiB(valor: string): number | null {
  const casou = valor.trim().match(/^(\d+)([mg])$/i);
  if (!casou) return null;
  const numero = Number(casou[1]);
  return casou[2]!.toLowerCase() === "g" ? numero * 1024 : numero;
}

const ocr = blocoDoServico("ocr");

describe("OCR — o modelo e o teto de memória andam juntos", () => {
  it("o parser enxerga o serviço ocr — senão o resto passaria vazio", () => {
    expect(ocr, "serviço 'ocr' sumiu do docker-compose.prod.yml").not.toBe("");
    expect(ocr).toContain("image:");
  });

  it("os modelos são NOMEADOS no construtor, nunca herdados do default", () => {
    // O default do 3.7.0 é o v6 medium — o que estourou a memória.
    expect(APP).toMatch(/^MODELO_DETECCAO\s*=\s*"PP-OCRv5_mobile_det"$/m);
    expect(APP).toMatch(/^MODELO_RECONHECIMENTO\s*=\s*"latin_PP-OCRv5_mobile_rec"$/m);

    // E os nomes precisam CHEGAR ao construtor: declarar a constante e chamar
    // `PaddleOCR()` sem ela passaria no teste acima e continuaria com o medium.
    expect(APP).toContain("text_detection_model_name=MODELO_DETECCAO");
    expect(APP).toContain("text_recognition_model_name=MODELO_RECONHECIMENTO");
  });

  it("a resolução de entrada é a que foi medida — 960 px", () => {
    // Subir isto não melhora a leitura (o detector já trabalha em 960) e
    // quadruplica o pico de memória. Ver a tabela no topo do arquivo.
    expect(APP).toMatch(/^MAX_LADO_PX\s*=\s*960$/m);
  });

  it("o teto do serviço comporta o pico medido, com folga", () => {
    const casou = ocr.match(/^\s{4}mem_limit:\s*(\S+)/m);
    expect(casou, "o serviço 'ocr' não declara mem_limit — sem teto ele pode " +
      "levar a VPS inteira junto, e com teto baixo ele morre no primeiro pedido").not.toBeNull();

    const mib = memLimitEmMiB(casou![1]!);
    expect(mib, `mem_limit '${casou![1]}' não é um tamanho que este teste saiba ler`).not.toBeNull();

    // 716 MiB é o pico da foto de referência a 960 px. Abaixo de 1024m a folga
    // fica menor que 20%, e uma foto quadrada (960×960 tem 33% mais pixels)
    // volta a encostar no limite.
    expect(mib!).toBeGreaterThanOrEqual(1024);
  });

  it("o build baixa o modelo — o erro aparece no CI, não na VPS do cliente", () => {
    // Sem esta linha o download acontece no primeiro pedido: a VPS sem saída
    // para a internet falha na hora de atender, e o healthcheck já disse 200.
    expect(DOCKERFILE).toContain("carregar_motor()");
  });
});
