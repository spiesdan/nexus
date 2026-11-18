/**
 * Todo handler que usa SERVICE ROLE tem de ter guard de autorização.
 *
 * POR QUE ESTE GATE EXISTE
 *
 * `createAdminClient()` bypassa RLS. A catraca irmã
 * (`handlers-service-role-filtram-organizacao.test.ts`) cobra que o handler
 * MENCIONE a organização — mas menção não é guarda: um handler pode citar
 * `organization_id` num comentário e não verificar quem está chamando. Aqui a
 * pergunta é outra e complementar: **qual é a porta de entrada?**
 *
 * As portas aceitas, e por que cada uma serve:
 *
 *   - `requireRole` / `requirePlatformAdmin` → sessão + papel + organização ativa;
 *   - `requireAuth` / `loadAuthUser` / `resolveActiveOrg` → sessão do Supabase;
 *   - `INTERNAL_CRON_SECRET` / `INTERNAL_SECRET` / `*_SECRET` + `timingSafeEqual`
 *     → superfície de cron e de atualizador, sem cookie, com segredo próprio;
 *   - `webhook_secret` / `verifyInboundSignature` / `path_token` / HMAC → webhook
 *     cujo segredo resolve UM tenant (o padrão do repo: token opaco por fonte);
 *   - `user.is_platform_admin` → tela de plataforma.
 *
 * O que reprova: handler com service role e **nenhuma** dessas marcas. É o
 * esquecimento de classe — a rota nova que lê dados de todos os tenants porque
 * ninguém parou para decidir quem pode chamá-la.
 *
 * LIMITE DECLARADO: é catraca estática. Ela não prova que o guard está correto
 * (um `if (false)` também tem a marca); prova que a decisão de autorização
 * existe no arquivo. A prova por comportamento está nos invariantes
 * (`mcp-nao-alcanca-outro-tenant`, `rls-*`) e nos testes de rota por papel.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const API = path.join(RAIZ, "app/api");

/** Portas de entrada aceitas. Cada padrão tem de aparecer no CORPO do handler. */
const GUARDAS: ReadonlyArray<readonly [string, RegExp]> = [
  ["sessão + papel (requireRole/requirePlatformAdmin)", /requireRole\s*\(|requirePlatformAdmin/],
  ["sessão (requireAuth/loadAuthUser/resolveActiveOrg)", /requireAuth\s*\(|loadAuthUser\s*\(|resolveActiveOrg\s*\(/],
  ["plataforma (is_platform_admin)", /is_platform_admin/],
  ["segredo de cron/interno", /INTERNAL_CRON_SECRET|INTERNAL_SECRET|CRON_SECRET|timingSafeEqual/],
  ["webhook com segredo/token próprio", /webhook_secret|WEBHOOK_SECRET|verifyInboundSignature|verifySignature|path_token|HMAC/i],
  ["escopo de token de API (MCP/API)", /requiresScope|requireScope/],
];

/**
 * Superfícies que PASSAM sem as marcas acima porque a autorização é o próprio
 * identificador opaco da URL — e que têm teste próprio. Cada entrada diz qual.
 */
const AUTORIZADAS_POR_TOKEN: Readonly<Record<string, string>> = {
  "app/api/v1/public/orcamento/[token]/route.ts":
    "link público de orçamento: o token da URL resolve UM pedido (lib/comercial/orcamento-publico.ts, com teste próprio em orcamento-publico.test.ts)",
  "app/api/v1/webhooks/in/[token]/route.ts":
    "webhook de captação: path_token + verifyInboundSignature (o token resolve UMA fonte/tenant)",
  "app/api/v1/webhooks/waha/[token]/route.ts":
    "webhook do WAHA por sessão: o token resolve UM channel_session",
  "app/api/v1/webhooks/meta/[token]/route.ts":
    "webhook da Meta por sessão: verifySignature com o segredo da própria conexão",
  "app/api/v1/webhooks/channel/[token]/route.ts":
    "webhook do canal por token: mesmo padrão de sessão única",
};

function handlers(dir: string): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = path.join(dir, entrada);
    if (statSync(caminho).isDirectory()) saida.push(...handlers(caminho));
    else if (entrada === "route.ts") saida.push(caminho);
  }
  return saida;
}

const COM_SERVICE_ROLE = handlers(API)
  .map((c) => ({ relativo: path.relative(RAIZ, c).split(path.sep).join("/"), corpo: readFileSync(c, "utf8") }))
  .filter((h) => /createAdminClient\s*\(|SUPABASE_SERVICE_ROLE/.test(h.corpo));

const SEM_GUARD = COM_SERVICE_ROLE.filter(
  (h) => !GUARDAS.some(([, re]) => re.test(h.corpo)) && !(h.relativo in AUTORIZADAS_POR_TOKEN),
).map((h) => h.relativo);

describe("service role — toda porta de entrada tem guard", () => {
  it("o scanner acha os handlers (guarda de vacuidade)", () => {
    // 172 medidos em 18/11/2026. Piso de ordem de grandeza: scanner quebrado
    // (pasta renomeada, regex morta) reprova em vez de passar medindo zero.
    expect(COM_SERVICE_ROLE.length).toBeGreaterThanOrEqual(150);
  });

  it("nenhum handler com service role fica sem guard reconhecível", () => {
    expect(
      SEM_GUARD,
      "Handler usa service role (bypassa RLS) e não tem guard de autorização reconhecível: " +
        "sem requireRole/requirePlatformAdmin, sem sessão (requireAuth/loadAuthUser), sem segredo " +
        "de cron/interno, sem segredo de webhook e sem escopo de token. Decida QUEM pode chamar " +
        "esta rota e escreva a decisão; se a autorização é o token opaco da URL, declare em " +
        "AUTORIZADAS_POR_TOKEN citando o teste que prova o escopo dele.",
    ).toEqual([]);
  });

  it("as exceções por token citam teste e continuam existindo", () => {
    for (const [rota, razao] of Object.entries(AUTORIZADAS_POR_TOKEN)) {
      expect(
        COM_SERVICE_ROLE.some((h) => h.relativo === rota),
        `${rota} está em AUTORIZADAS_POR_TOKEN mas não usa service role — remova a entrada`,
      ).toBe(true);
      expect(razao.length, `${rota} precisa da razão escrita`).toBeGreaterThan(40);
    }
  });
});
