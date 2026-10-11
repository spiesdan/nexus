/**
 * POST /api/v1/prospecting/prospects/[id]/raio-x — analisa o site do prospect.
 *
 * ─── O que esta rota faz ────────────────────────────────────────────────────
 *
 * Lê o `website` do prospect, roda o Raio-X (SSRF-guardado), grava situação +
 * detalhes + carimbo, e devolve o resultado. NÃO reescreve o `score`: score é
 * calculado na leitura, e a próxima leitura já usa a situação nova.
 *
 * ─── Por que POST e não PATCH ───────────────────────────────────────────────
 *
 * PATCH edita o que o operador digitou; esta rota EXECUTA uma análise (efeito
 * colateral: requests para site de terceiro, 15s de timeout). Misturar os dois
 * faria um PATCH inocente disparar fetch externo — e o log de auditoria
 * diria "editou" para algo que "analisou".
 *
 * ─── Gate `agent` ───────────────────────────────────────────────────────────
 *
 * É ato de vendedor (gasta tempo e rede, escreve no prospect). `viewer` lê o
 * Raio-X pronto no GET do prospect; rodar um novo é trabalho.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { analisarSite, type DepsDoRaioX } from "@/lib/prospeccao/raio-x-site";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const TEMPO_LIMITE_MS = 15_000;

async function resolverDns(host: string): Promise<string[]> {
  const { promises } = await import("node:dns");
  try {
    const [a, aaaa] = await Promise.all([
      promises.resolve4(host).catch((): string[] => []),
      promises.resolve6(host).catch((): string[] => []),
    ]);
    return [...a, ...aaaa];
  } catch {
    return [];
  }
}

export async function POST(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("agent", { requestId, resource: "business_prospects" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: prospect, error: erroLeitura } = await supabase
    .from("business_prospects")
    .select("id, nome, website")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (erroLeitura || !prospect) {
    return fail("not_found", "Prospect não encontrado.", 404, { requestId });
  }

  const site = (prospect as unknown as { nome: string; website: string | null }).website;
  if (!site || !site.trim()) {
    // Sem site não há o que analisar — e gravar `sem_site` seria mentira:
    // `sem_site` diz "verifiquei e não há", e aqui ninguém verificou nada.
    // A distinção importa porque o score trata os dois diferente (0 vs 5).
    return fail("validation_failed", "Este prospect não tem site cadastrado.", 422, { requestId });
  }

  const buscar: DepsDoRaioX["buscar"] = async (url: string) => {
    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
    try {
      const res = await fetch(url, {
        redirect: "manual",
        signal: controle.signal,
        headers: { "user-agent": "NexusCRM-RaioX/1.0 (+contato comercial)" },
      });
        const cabecalhos: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        cabecalhos[k.toLowerCase()] = v;
      });
      return {
        status: res.status,
        cabecalhos,
        corpo: () => res.text(),
        urlFinal: res.url || undefined,
      };
    } finally {
      clearTimeout(limite);
    }
  };

  const resultado = await analisarSite(site, {
    buscar,
    resolver: resolverDns,
    agoraMs: () => Date.now(),
    tempoLimiteMs: TEMPO_LIMITE_MS,
  });

  const { error: erroGravacao } = await admin
    .from("business_prospects")
    .update({
      site_situacao: resultado.situacao,
      site_detalhes: {
        url_final: resultado.urlFinal,
        tempo_ms: resultado.tempoMs,
        status_http: resultado.statusHttp,
        achados: resultado.achados,
        ...(resultado.motivo ? { motivo: resultado.motivo } : {}),
      },
      site_verificado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id);
  if (erroGravacao) {
    return fail("internal_error", "Análise feita, mas não consegui gravar.", 500, { requestId });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "business_prospect.raio_x",
    resourceType: "business_prospects",
    resourceId: id,
    requestId,
    metadata: { situacao: resultado.situacao, tempo_ms: resultado.tempoMs },
  });

  return ok(
    {
      situacao: resultado.situacao,
      tempo_ms: resultado.tempoMs,
      status_http: resultado.statusHttp,
      achados: resultado.achados,
      ...(resultado.motivo ? { motivo: resultado.motivo } : {}),
    },
    { requestId },
  );
}
