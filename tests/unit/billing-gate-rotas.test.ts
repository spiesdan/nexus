/**
 * ENUMERAÇÃO DO GATE DE SUSPENSÃO — nenhuma rota nova nasce fora do gate.
 *
 * O dono mediu que 89 dos 169 handlers usam service role; um gate só em
 * `requireRole` deixaria boa parte das rotas abertas. Aqui cada `route.ts` de
 * `app/api/v1/**` tem de provar UMA porta: sessão/papel, segredo de cron, HMAC
 * de webhook ou allowlist EXATA da cobrança. Marcas em módulos locais
 * importados (`_handler`, `_transicao`, `_shared`) contam — é a origem real do
 * guard. Rota nova sem gate = teste vermelho.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BILLING_GATE_ALLOWLIST } from "@/lib/billing/gate";

const RAIZ = path.resolve(__dirname, "../..");
const API_V1 = path.join(RAIZ, "app/api/v1");

const GUARDAS: readonly RegExp[] = [
  /requireRole\s*\(/,
  /requirePlatformAdmin/,
  /requireAuth\s*\(/,
  /loadAuthUser\s*\(/,
  /resolveActiveOrg\s*\(/,
  /INTERNAL_SECRET|CRON_SECRET|INTERNAL_CRON_SECRET/,
  /timingSafeEqual|verifySignature|verifyInboundSignature/,
  /webhook_secret|WEBHOOK_SECRET|path_token|HMAC/i,
  /requiresScope|requireScope/,
  /autenticarDispositivo\s*\(/,
  /auth\.getUser\s*\(/,
  /verificarTokenRealtime|realtime.*token/i,
];

/** Exceções PREEXISTENTES com autenticação própria — não é a allowlist do gate. */
const AUTORIZACAO_PROPRIA: Readonly<Record<string, string>> = {
  "/v1/auth/realtime-token/route.ts": "token de Realtime assinado, verificado na própria rota",
  "/v1/public/orcamento/[token]/route.ts": "token opaco do orçamento público resolve um pedido",
  "/v1/webhooks/in/[token]/route.ts": "path_token + HMAC resolvem uma fonte",
};

function arquivos(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entrada of readdirSync(dir)) {
    const p = path.join(dir, entrada);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (entrada === "route.ts") out.push(p);
  }
  return out;
}

/** Texto da rota + módulos locais importados (um salto) — onde o guard mora. */
function fonteComImportados(arquivo: string): string {
  let texto = readFileSync(arquivo, "utf8");
  const relativos = [...texto.matchAll(/from\s+["'](\.[^"']+)["']/g)].map((m) => m[1]!);
  for (const rel of relativos) {
    const candidato = path.resolve(path.dirname(arquivo), rel);
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const p = candidato.endsWith(ext) ? candidato : candidato + ext;
      if (existsSync(p) && statSync(p).isFile()) texto += "\n" + readFileSync(p, "utf8");
    }
  }
  return texto;
}

const ROTAS = arquivos(API_V1).sort();

describe("gate de suspensão — enumeração de rotas", () => {
  it("a suíte realmente enumerou as rotas (guarda de vacuidade)", () => {
    expect(ROTAS.length).toBeGreaterThan(100);
  });

  it("allowlist é pequena e exata — sem prefixo amplo", () => {
    expect(BILLING_GATE_ALLOWLIST.length).toBeLessThanOrEqual(12);
    for (const p of BILLING_GATE_ALLOWLIST) {
      expect(p).toMatch(/^\/[a-z0-9\-/\[\]:]+$/);
      expect(p.endsWith("/*")).toBe(false);
      expect(p).not.toBe("/api/v1");
    }
  });

  it("toda rota tem guard reconhecível ou autorização própria declarada", () => {
    const semGate: string[] = [];
    for (const arquivo of ROTAS) {
      const rel = "/" + path.relative(API_V1, arquivo).replace(/\\/g, "/");
      const texto = fonteComImportados(arquivo);
      if (GUARDAS.some((re) => re.test(texto))) continue;
      if (AUTORIZACAO_PROPRIA["/v1" + rel]) continue;
      semGate.push("/v1" + rel);
    }
    expect(semGate).toEqual([]);
  });
});
