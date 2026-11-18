/**
 * POST /api/v1/invoices/[id]/reemitir — devolve uma nota à fila de emissão.
 *
 * Dois casos, ambos sem transmitir nada aqui:
 * - nota `erro` (dead-letter): re-enfileira com job novo;
 * - nota `em_emissao` TRAVADA: o job ficou `processando` porque o worker
 *   morreu no meio. Passado o teto de processamento, o MESMO job volta a
 *   `pendente` (CAS em status+updated_at); antes disso, 409 "aguarde".
 *
 * Idempotente: job já pendente devolve 200 `ja_na_fila`, e a corrida de dois
 * cliques no INSERT cai na unique de job aberto (23505) — também 200.
 * Notas terminais (autorizada/denegada/cancelada) recusam com 422.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  planejarRecuperacao,
  type JobAberto,
  type StatusDaNotaNaRecuperacao,
} from "@/lib/fiscal/recuperacao";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "invoices" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  const supabase = await createClient();
  const { data: nota } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const atual = nota as unknown as { id: string; status: StatusDaNotaNaRecuperacao } | null;
  if (!atual) return fail("not_found", "Nota não encontrada.", 404, { requestId });

  const { data: jobDb } = await supabase
    .from("fiscal_jobs")
    .select("id, status, updated_at")
    .eq("organization_id", authz.org.orgId)
    .eq("invoice_id", id)
    .in("status", ["pendente", "processando"])
    .maybeSingle();
  const job = jobDb as unknown as JobAberto | null;

  const plano = planejarRecuperacao(atual.status, job, new Date());
  if (plano.acao === "recusar") {
    return fail("validation_failed", plano.motivo, 422, { requestId });
  }
  if (plano.acao === "aguardar_processamento") {
    return fail(
      "conflict",
      "A nota está em processamento agora. Aguarde o fim desta tentativa antes de reenviar.",
      409,
      { requestId },
    );
  }

  const admin = createAdminClient();
  const agora = new Date().toISOString();

  if (plano.acao === "enfileirar" && plano.reabrirJob) {
    // CAS em status+updated_at: só reabre o job que estava travado quando foi
    // lido. Se o drain (ou outra requisição) já mexeu nele, não sobrescreve.
    const { data: reaberto, error } = await admin
      .from("fiscal_jobs")
      .update({
        status: "pendente",
        proxima_tentativa: agora,
        ultimo_erro: "recuperado de processamento travado",
        updated_at: agora,
      })
      .eq("organization_id", authz.org.orgId)
      .eq("id", plano.reabrirJob.id)
      .eq("status", "processando")
      .eq("updated_at", plano.reabrirJob.updated_at)
      .select("id");
    if (error) return fail("internal_error", "Erro ao reabrir o job fiscal.", 500, { requestId });
    if ((reaberto ?? []).length === 0) {
      return fail(
        "conflict",
        "Outra tentativa já moveu esta nota. Recarregue antes de reenviar.",
        409,
        { requestId },
      );
    }
  } else if (plano.acao === "enfileirar") {
    const { error: erroJob } = await supabase.from("fiscal_jobs").insert({
      organization_id: authz.org.orgId,
      invoice_id: id,
      tipo: "emitir",
      status: "pendente",
      created_by: authz.user.id,
    });
    if (erroJob && erroJob.code !== "23505") {
      return fail("internal_error", "Erro ao enfileirar.", 500, { requestId });
    }
  }

  const jaNaFila = plano.acao === "ja_na_fila";
  // CAS no status lido: se um cancelamento (ou o drain) mudou a nota entre a
  // leitura e a reabertura, não reabrimos um estado que já não existe.
  const { data: reaberta, error: erroNota } = await supabase
    .from("invoices")
    .update({ status: "em_emissao", erro: null })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .eq("status", atual.status)
    .select("id")
    .maybeSingle();
  if (erroNota) return fail("internal_error", "Erro ao reabrir a nota.", 500, { requestId });
  if (!reaberta) {
    return fail(
      "conflict",
      "O estado da nota mudou durante a reemissão. Recarregue e confira antes de tentar de novo.",
      409,
      { requestId },
    );
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "invoice.retry_requested",
    resourceType: "invoices",
    resourceId: id,
    requestId,
    metadata: {
      origem: jaNaFila
        ? "ja_na_fila"
        : plano.acao === "enfileirar" && plano.reabrirJob
          ? "job_travado_reaberto"
          : "novo_job",
    },
  });
  return ok(
    { id, status: "em_emissao", ...(jaNaFila ? { ja_na_fila: true } : {}) },
    { requestId, status: jaNaFila ? 200 : 201 },
  );
}
