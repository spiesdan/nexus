/**
 * POST /api/v1/invoices/[id]/cancel — cancela uma nota.
 *
 * Pendente/erro cancela direto (nada foi ao fisco). Autorizada é ato formal:
 * o cancelamento é TRANSMITIDO ao SEFAZ (evento 110111, cStat 135) antes de a
 * nota virar "cancelada" — se a SEFAZ recusar ou o sidecar não estiver
 * disponível, a nota continua autorizada e o erro volta na resposta. Nada aqui
 * marca "cancelada" sem protocolo do fisco. Denegada/cancelada não mudam:
 * história fiscal não se reescreve.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { carregarContextoSped, motivoDeNaoTransmitir, transmitirCancelamento } from "@/lib/fiscal/eventos";
import { COLUNAS_DA_NOTA } from "@/lib/schemas/fiscal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  motivo: z.string().trim().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "invoices" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, { requestId });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: nota } = await supabase
    .from("invoices")
    .select("id, status, chave_acesso, protocolo")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const atual = nota as unknown as { id: string; status: string; chave_acesso: string | null; protocolo: string | null } | null;
  if (!atual) return fail("not_found", "Nota não encontrada.", 404, { requestId });

  if (atual.status === "cancelada" || atual.status === "denegada") {
    return fail("validation_failed", "Nota encerrada não pode ser cancelada.", 422, { requestId });
  }
  const justificativa = parsed.data.motivo?.trim() || null;
  if (atual.status === "autorizada" && !justificativa) {
    return fail("validation_failed", "Cancelar nota autorizada exige motivo.", 422, { requestId });
  }

  // Nota autorizada: o fisco decide antes do banco. Transmitir primeiro — se
  // falhar, a nota segue autorizada e a resposta diz por quê.
  let protocoloCancelamento: string | null = null;
  if (atual.status === "autorizada") {
    if (justificativa && justificativa.length < 15) {
      return fail("validation_failed", "Justificativa do cancelamento: mínimo de 15 caracteres.", 422, { requestId });
    }
    const contexto = await carregarContextoSped(authz.org.orgId);
    const bloqueio = contexto ? motivoDeNaoTransmitir(contexto) : "Sem configuração fiscal para a organização.";
    if (bloqueio) {
      return fail("upstream_unavailable", `Cancelamento não transmitido: ${bloqueio}`, 502, { requestId });
    }
    if (!atual.chave_acesso || !atual.protocolo) {
      return fail("validation_failed", "Nota autorizada sem chave de acesso ou protocolo.", 422, { requestId });
    }
    const r = await transmitirCancelamento(contexto!, {
      chave: atual.chave_acesso,
      protocolo: atual.protocolo,
      justificativa: justificativa!,
    });
    if (!r.ok) {
      const detalhe = r.cstat ? `cStat ${r.cstat}: ${r.xmotivo ?? "sem motivo"}` : (r.xmotivo ?? "falha sem motivo");
      if (r.retentavel) {
        return fail("upstream_unavailable", `Sidecar fiscal indisponível — cancelamento não transmitido (${detalhe}).`, 502, { requestId });
      }
      return fail("validation_failed", `SEFAZ recusou o cancelamento (${detalhe}).`, 422, { requestId });
    }
    protocoloCancelamento = r.protocolo;
  }

  // Cancela também o job aberto: sem isso o drain emitiria uma nota que o
  // usuário acabou de cancelar (o claim condicional já protege a corrida —
  // quem chegar primeiro vence, o outro encontra o estado final).
  const admin = createAdminClient();
  await admin
    .from("fiscal_jobs")
    .update({ status: "concluido", ultimo_erro: "nota cancelada", updated_at: new Date().toISOString() })
    .eq("organization_id", authz.org.orgId)
    .eq("invoice_id", id)
    .in("status", ["pendente", "processando"]);

  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "cancelada", erro: justificativa })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select(COLUNAS_DA_NOTA)
    .single();

  if (error || !data) {
    return fail("internal_error", "Erro ao cancelar a nota.", 500, { requestId });
  }

  await admin.from("fiscal_events").insert({
    organization_id: authz.org.orgId,
    invoice_id: id,
    tipo: "cancelada",
    status: "cancelada",
    protocolo: protocoloCancelamento,
    mensagem: justificativa,
  });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "invoice.cancelled",
    resourceType: "invoices",
    resourceId: id,
    requestId,
  });

  return ok(data, { requestId });
}
