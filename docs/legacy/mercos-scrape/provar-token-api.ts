/**
 * Prova os tokens da API do Mercos **sem imprimir os valores**.
 *
 *   pnpm exec tsx docs/legacy/mercos-scrape/provar-token-api.ts
 *
 * De onde vêm os tokens (nesta ordem):
 *   1. `MERCOS_APPLICATION_TOKEN` e `MERCOS_COMPANY_TOKEN` no ambiente;
 *   2. arquivo `~/.config/nexus/mercos.env` (ou o caminho em `MERCOS_TOKEN_FILE`).
 *
 * ## São DOIS tokens, e por isso o 401 engana
 *
 * A API do Mercos autentica com dois headers — `ApplicationToken` (identifica a
 * aplicação, fornecido pela Mercos na homologação) e `CompanyToken` (identifica
 * a empresa, gerado em Minha Conta > Sistema > Integração). O Company Token
 * sozinho responde `401 Informe os tokens de acesso`, a MESMA mensagem de
 * quando não se manda header nenhum — ela não distingue "faltou" de "não vale".
 * Já custou uma tarde: a conclusão "o token é inválido" era falsa.
 *
 * ## Produção exige homologação
 *
 * O ambiente `app.mercos.com` só libera a aplicação depois do processo de
 * homologação no sandbox (`sandbox.mercos.com`). Sem homologação, nem o par
 * correto de tokens abre `/pedidos` em produção.
 *
 * A saída imprime só status HTTP, a mensagem curta da API e os NOMES dos campos
 * da resposta — nunca tokens, nunca valores de cliente.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = "https://app.mercos.com/api/v1";

function lerArquivo(): Record<string, string> {
  const caminho = process.env.MERCOS_TOKEN_FILE ?? join(homedir(), ".config", "nexus", "mercos.env");
  try {
    const linhas = readFileSync(caminho, "utf8").split("\n");
    const mapa: Record<string, string> = {};
    for (const l of linhas) {
      const i = l.indexOf("=");
      if (i <= 0) continue;
      const chave = l.slice(0, i).trim();
      const valor = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (valor) mapa[chave] = valor;
    }
    return mapa;
  } catch {
    return {};
  }
}

const arquivo = lerArquivo();
const applicationToken = process.env.MERCOS_APPLICATION_TOKEN?.trim() || arquivo.MERCOS_APPLICATION_TOKEN || "";
const companyToken = process.env.MERCOS_COMPANY_TOKEN?.trim() || arquivo.MERCOS_COMPANY_TOKEN || "";

if (!applicationToken || !companyToken) {
  process.stderr.write(
    "Faltam tokens.\n" +
      `  ApplicationToken: ${applicationToken ? "ok" : "AUSENTE (fornecido pela Mercos na homologação)"}\n` +
      `  CompanyToken:     ${companyToken ? "ok" : "AUSENTE (Minha Conta > Sistema > Integração)"}\n` +
      "Escreva os dois em ~/.config/nexus/mercos.env\n",
  );
  process.exit(2);
}

const headers = { Accept: "application/json", ApplicationToken: applicationToken, CompanyToken: companyToken };

function resumoDoCorpo(corpo: unknown): string {
  if (Array.isArray(corpo)) {
    return `array(${corpo.length})` + (corpo[0] ? ` campos: ${Object.keys(corpo[0] as object).join(", ")}` : "");
  }
  if (corpo && typeof corpo === "object") {
    return Object.entries(corpo as Record<string, unknown>)
      .map(([k, v]) => `${k}=${Array.isArray(v) ? `array(${v.length})` : typeof v}`)
      .join(", ")
      .slice(0, 400);
  }
  return typeof corpo;
}

async function chamar(caminho: string): Promise<{ status: number; texto: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(`${BASE}${caminho}`, { headers, signal: ctrl.signal });
    const tipo = res.headers.get("content-type") ?? "";
    const texto = tipo.includes("json")
      ? JSON.stringify(await res.json().catch(() => null))
      : (await res.text().catch(() => "")).slice(0, 200);
    return { status: res.status, texto: tipo.includes("json") ? texto : texto };
  } finally {
    clearTimeout(t);
  }
}

async function main(): Promise<void> {
  const status = await chamar("/token_auth_status");
  process.stderr.write(`${String(status.status).padEnd(4)} GET /token_auth_status  ${status.texto}\n`);

  if (status.status !== 200) {
    process.stderr.write(
      "\nOs dois tokens não abriram a API.\n" +
        "  401 'Informe os tokens de acesso' = falta o ApplicationToken, ele é inválido, ou a aplicação\n" +
        "  ainda não passou pela homologação (produção só abre depois dela).\n",
    );
    process.exitCode = 1;
    return;
  }

  const pedidos = await chamar("/pedidos?limit=1");
  process.stderr.write(`${String(pedidos.status).padEnd(4)} GET /pedidos?limit=1   ${resumoDoCorpo(JSON.parse(pedidos.texto))}\n`);
  if (pedidos.status !== 200) process.exitCode = 1;
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
