/**
 * GET /api/v1/ai/controle/resumo — Erros, Conversas e Pedidos da IA (§56).
 *
 * Contagens exatas (head:true, sem linhas): conversas no comando
 * automático, chamadas LLM em erro (7d) e pedidos de origem ia (30d).
 * Leitura pura via RLS de sessão, `organization_id` explícito.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ai_usage" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const orgId = authz.org.orgId;
  const ha7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const ha30d = new Date(Date.now() - 30 * 86400000).toISOString();

  const [conversas, erros, ultimoErro, pedidos] = await Promise.all([
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("comando_da_conversa", "automatico"),
    supabase
      .from("llm_calls")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "erro")
      .gte("created_at", ha7d),
    supabase
      .from("llm_calls")
      .select("error_code, created_at")
      .eq("organization_id", orgId)
      .eq("status", "erro")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("commercial_orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("origem", "ia")
      .gte("created_at", ha30d),
  ]);
  if (conversas.error || erros.error || ultimoErro.error || pedidos.error) {
    return fail("internal_error", "Erro ao ler o controle.", 500, { requestId });
  }
  const ultimo = ultimoErro.data as unknown as { error_code: string | null; created_at: string } | null;
  return ok(
    {
      conversas_automatico: conversas.count ?? 0,
      erros_7d: erros.count ?? 0,
      ultimo_erro: ultimo ? { codigo: ultimo.error_code, em: ultimo.created_at } : null,
      pedidos_ia_30d: pedidos.count ?? 0,
    },
    { requestId },
  );
}
