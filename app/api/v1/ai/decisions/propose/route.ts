/**
 * POST /api/v1/ai/decisions/propose — Orchestrator propone, humano dispõe (FASE 10).
 *
 * Varredura limitada dos pedidos → Brain → decisões no nível pedido
 * (`nivel` 0–3; acima disso, 422 — execução autônoma exige a UI de
 * aprovação da parte 2). Cada decisão vira auditoria `ai.action.proposed`
 * (quem/agente/dados/ferramentas/políticas no metadata); o Decision Log
 * se lê em `GET /api/v1/audit?action=ai.action`. Disparo humano (agent+),
 * nunca cron silencioso.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ApiError } from "@/lib/api/types";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { validateRequest } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { brainDoLote } from "@/lib/ai/sales-brain/batch";
import { proporAcoes, type DecisaoProposta } from "@/lib/ai/orchestrator/run";
import type { NivelAutonomia } from "@/lib/ai/orchestrator/decide";
import type { PedidoParaRadar } from "@/lib/comercial/radar-compras";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  nivel: z.number().int().min(0).max(6).default(1),
  limit: z.number().int().min(1).max(50).default(20),
});

const TETO_LINHAS = 25000;

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "ai_decisions" });
  if (!authz.ok) return authz.response;

  let input;
  try {
    input = await validateRequest(corpoSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }
  // Propor ≠ executar: nível de execução (4+) sem UI de aprovação não sai daqui.
  if (input.nivel > 3) {
    return fail("validation_failed", "Execução autônoma (nível 4+) exige a UI de aprovação.", 422, { requestId });
  }
  const nivel = input.nivel as NivelAutonomia;

  const supabase = createAdminClient();
  const orgId = authz.org.orgId;
  const hoje = new Date().toISOString().slice(0, 10);

  const { count, error: erroContagem } = await supabase
    .from("commercial_orders")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if (erroContagem) return fail("internal_error", "Erro ao ler os pedidos.", 500, { requestId });
  const total = Math.min(count ?? 0, TETO_LINHAS);
  const faixas: [number, number][] = [];
  for (let de = 0; de < total; de += 1000) faixas.push([de, Math.min(de + 999, total - 1)]);
  const paginas = await Promise.all(
    faixas.map(([de, ate]) =>
      supabase
        .from("commercial_orders")
        .select("id, contact_id, total_cents, status, origem, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true })
        .range(de, ate),
    ),
  );
  const pedidos: PedidoParaRadar[] = [];
  for (const pg of paginas) {
    if (pg.error) return fail("internal_error", "Erro ao ler os pedidos.", 500, { requestId });
    for (const p of (pg.data ?? []) as unknown as {
      id: string;
      contact_id: string | null;
      total_cents: number;
      status: string;
      origem: string;
      created_at: string;
    }[]) {
      pedidos.push({
        id: p.id,
        contact_id: p.contact_id,
        total_cents: p.total_cents,
        status: p.status,
        origem: p.origem,
        dia: p.created_at.slice(0, 10),
      });
    }
  }

  const recs = brainDoLote(pedidos, hoje).filter((r) => r !== null).slice(0, input.limit);
  const decisoes: DecisaoProposta[] = proporAcoes(recs, nivel);

  for (const d of decisoes) {
    await audit({
      action: "ai.action.proposed",
      actorUserId: authz.user.id,
      organizationId: orgId,
      resourceType: "contact",
      resourceId: d.contact_id,
      requestId,
      metadata: {
        agente: "sales-orchestrator",
        evento: d.evento,
        intencao: d.intencao,
        ferramenta: d.ferramenta,
        acao: d.acao,
        requer_aprovacao: d.requer_aprovacao,
        nivel: d.nivel_usado,
        prioridade: d.prioridade,
        dados_utilizados: d.governanca.dados_utilizados,
        politica_aplicada: d.governanca.politica_aplicada,
      },
    });
  }

  return ok({ decisoes, amostra_parcial: (count ?? 0) >= TETO_LINHAS }, { requestId });
}
