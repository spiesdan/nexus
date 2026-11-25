/**
 * 6.3 — handler com service role precisa dizer de qual organização fala.
 *
 * POR QUE ESTE GATE EXISTE
 *
 * `createAdminClient()` usa a service role, que **bypassa RLS**. Um handler que
 * lê ou escreve com ele sem filtrar `organization_id` devolve dados de outro
 * tenant — e nenhum teste de RLS pega isso, porque o RLS não foi consultado.
 * Medido no catálogo da auditoria (`docs/auditoria/06-apis.md`): **210 dos 418**
 * handlers de `app/api/**` citam service role no próprio arquivo.
 *
 * O que este gate faz — e o que ele NÃO faz
 *
 * Ele é uma **catraca estática**: um handler novo com service role e sem
 * nenhuma menção a `organization_id`/`orgId` reprova, e a lista de exceções
 * nomeadas (superfícies que operam por desenho fora de uma organização) não
 * pode crescer em silêncio. Ele **não prova** que o filtro está correto: uma
 * menção pode estar num comentário. Prova de verdade é teste de rota com dois
 * tenants (o que a suíte de invariantes faz nas tabelas).
 *
 * Por que 14 exceções são legítimas: os crons e o `system/*` varrem TODAS as
 * organizações de propósito (podar retenção, drenar fila, sincronizar catálogo);
 * `admin/tenants` e `admin/platform-admins` são telas de plataforma, cujo
 * escopo é a lista de organizações. Nenhum deles recebe `organization_id` de
 * request — e é justamente por isso que eles precisam estar nomeados aqui, e
 * não misturados com um handler de tenant esquecido.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const API = path.join(RAIZ, "app/api");

/**
 * Superfícies que operam fora de UMA organização. Cada entrada diz POR QUÊ.
 * Acrescentar handler de tenant aqui é o erro que o gate existe para impedir.
 */
const FORA_DE_UMA_ORGANIZACAO: Readonly<Record<string, string>> = {
  "app/api/v1/admin/platform-admins/route.ts":
    "lista administradores de plataforma — escopo é a plataforma, não um tenant",
  "app/api/v1/admin/tenants/route.ts":
    "lista/cria organizações — a própria tela de plataforma",
  "app/api/v1/admin/billing/route.ts":
    "lista a cobrança de TODAS as organizações — é a pergunta do dono da instalação; a leitura é agregação por organização dentro do carregador (lib/billing/visao-plataforma-servidor.ts), que filtra por organization_id em cada tabela billing_*",
  "app/api/v1/cron/attendant-heartbeat/route.ts": "cron: varre todas as organizações por desenho",
  "app/api/v1/cron/automatic-sales/route.ts": "cron: varre todas as organizações por desenho",
  "app/api/v1/cron/data-retention/route.ts": "cron: poda por política, em todas as organizações",
  "app/api/v1/cron/event-log-drain/route.ts": "cron: drena a fila global de event_log",
  "app/api/v1/cron/expedition-notices/route.ts": "cron: varre todas as organizações por desenho",
  "app/api/v1/cron/prospecting-drain/route.ts": "cron: varre todas as organizações por desenho",
  "app/api/v1/cron/prospecting-send/route.ts": "cron: varre todas as organizações por desenho",
  "app/api/v1/cron/sync-model-catalog/route.ts": "cron: catálogo de modelos é global",
  "app/api/v1/cron/webhook-log-retention/route.ts": "cron: poda global de log de webhook",
  "app/api/v1/system/agent/route.ts": "atualizador da VPS: lê a versão da instalação",
  "app/api/v1/system/update/route.ts": "atualizador da VPS: opera a instalação, não um tenant",
  "app/api/v1/system/version/route.ts": "atualizador da VPS: versão é da instalação",
};

/** Só estes prefixos podem entrar na lista acima. */
const PREFIXOS_PERMITIDOS = ["app/api/v1/cron/", "app/api/v1/system/", "app/api/v1/admin/"];

function handlers(dir: string): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = path.join(dir, entrada);
    if (statSync(caminho).isDirectory()) saida.push(...handlers(caminho));
    else if (entrada === "route.ts") saida.push(caminho);
  }
  return saida;
}

const HANDLERS = handlers(API).map((c) => ({
  relativo: path.relative(RAIZ, c).split(path.sep).join("/"),
  corpo: readFileSync(c, "utf8"),
}));

const COM_SERVICE_ROLE = HANDLERS.filter((h) =>
  /createAdminClient\s*\(|SUPABASE_SERVICE_ROLE/.test(h.corpo),
);

const SEM_MENCAO_A_ORG = COM_SERVICE_ROLE.filter(
  (h) => !/organization_id|orgId/.test(h.corpo),
).map((h) => h.relativo);

describe("6.3 — catraca do service role por handler", () => {
  it("o scanner acha os handlers (guarda de vacuidade)", () => {
    // 210 medidos em 17/11/2026. O piso é de ordem de grandeza: se o scanner
    // quebrar (pasta renomeada, regex morta), este caso reprova em vez de o
    // gate passar medindo zero arquivo.
    expect(COM_SERVICE_ROLE.length).toBeGreaterThanOrEqual(200);
    expect(HANDLERS.length).toBeGreaterThanOrEqual(400);
  });

  it("todo handler com service role fora da lista nomeada menciona a organização", () => {
    const inesperados = SEM_MENCAO_A_ORG.filter((r) => !(r in FORA_DE_UMA_ORGANIZACAO));
    expect(
      inesperados,
      "Handler usa service role (bypassa RLS) e não menciona organization_id/orgId em " +
        "lugar nenhum. Filtre explicitamente a organização resolvida de fonte confiável " +
        "(cookie/JWT/path token/webhook secret) — nunca do body. Se a rota opera fora de " +
        "UM tenant (cron/system/admin de plataforma), acrescente em FORA_DE_UMA_ORGANIZACAO " +
        "com o motivo escrito.",
    ).toEqual([]);
  });

  it("a lista de exceções é exata: nada de entrada podre nem handler de tenant disfarçado", () => {
    const nomeados = Object.keys(FORA_DE_UMA_ORGANIZACAO).sort();
    expect(SEM_MENCAO_A_ORG.slice().sort()).toEqual(nomeados);

    for (const rota of nomeados) {
      expect(
        PREFIXOS_PERMITIDOS.some((p) => rota.startsWith(p)),
        `${rota} está na lista de "fora de uma organização", mas não é cron/system/admin de plataforma`,
      ).toBe(true);
      expect(
        FORA_DE_UMA_ORGANIZACAO[rota]?.trim().length ?? 0,
        `${rota} precisa de motivo escrito na lista`,
      ).toBeGreaterThan(10);
    }
  });
});
