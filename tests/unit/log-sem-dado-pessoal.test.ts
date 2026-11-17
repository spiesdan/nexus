/**
 * LOG NÃO LEVA DADO PESSOAL NEM SEGREDO.
 *
 * ─── O QUE FOI MEDIDO (17/11/2026) ────────────────────────────────────────
 *
 * `console.log` fora de `lib/logger.ts` e de comentário: **0**. As 5 chamadas de
 * `logger.*` cujo texto casa "telefone/email/token" foram lidas uma a uma — todas
 * registram **id**, booleano, hash ou mensagem de erro, nenhuma registra o valor:
 *
 *   - `cron/contact-phones`: `contactId` + `err.message`;
 *   - `cron/agenda-google-push`: id do agendamento + `temToken: boolean`;
 *   - `webhooks/secrets`: `error.message`, sem o plaintext;
 *   - `lgpd-export-worker`: `request_id` + `sha256(detail)` — o e-mail que falhou
 *     não entra, só o hash.
 *
 * ─── A REGRA ──────────────────────────────────────────────────────────────
 *
 * Nenhuma chamada de log pode ter, no objeto de contexto, uma CHAVE de dado
 * pessoal ou segredo (`phone`, `email`, `cpf`, `token`, `senha`…). O valor de
 * uma variável com esse nome no payload é o caminho mais curto para o dado
 * vazar para o agregador de logs.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { semComentarios } from "../../scripts/auditoria/segmento-de-rota";

const RAIZ = process.cwd();
/** Chave de contexto que não pode existir num log. */
const CHAVE_PROIBIDA =
  /[{,]\s*(phone|phone_number|telefone|celular|email|e_mail|cpf|cnpj|documento|token|access_token|refresh_token|secret|senha|password)\s*:/;

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(join(RAIZ, dir))) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const rel = join(dir, nome);
    if (statSync(join(RAIZ, rel)).isDirectory()) saida.push(...arquivos(rel));
    else if (/\.(ts|tsx)$/.test(nome) && !nome.includes(".test.")) saida.push(rel);
  }
  return saida;
}

const TODOS = ["app", "lib", "workers", "components"].flatMap((d) => arquivos(d));

describe("log sem dado pessoal", () => {
  it("nenhum `console.log` fora do logger", () => {
    const culpados = TODOS.filter((arquivo) => {
      if (arquivo === join("lib", "logger.ts")) return false;
      const codigo = semComentarios(readFileSync(join(RAIZ, arquivo), "utf8"));
      return /console\.log\(/.test(codigo);
    });
    expect(culpados).toEqual([]);
  });

  it.each(TODOS)("%s", (arquivo) => {
    const codigo = semComentarios(readFileSync(join(RAIZ, arquivo), "utf8"));
    const chamadas = [...codigo.matchAll(/logger\.(?:info|warn|error|debug)\(([\s\S]{0,600}?)\);/g)].map(
      (m) => m[1] ?? "",
    );
    const comPii = chamadas.filter((c) => CHAVE_PROIBIDA.test(c));
    expect(comPii, `${arquivo}: log com chave de dado pessoal/segredo`).toEqual([]);
  });
});
