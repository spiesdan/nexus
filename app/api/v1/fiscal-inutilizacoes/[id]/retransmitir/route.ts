/**
 * POST /api/v1/fiscal-inutilizacoes/[id]/retransmitir — manda a faixa registrada ao SEFAZ.
 *
 * Repete o mesmo caminho do POST de criação (mesmo helper, mesma resposta):
 * "registrada" vira "transmitida" com protocolo, ou "erro" com o cStat que a
 * SEFAZ devolveu. Faixa já transmitida não retransmite (inutilização não se
 * refaz) — e nada aqui inventa protocolo quando o sidecar não responde.
 *
 * Sem coluna de ano/modelo na tabela, a retransmissão vai com o padrão do
 * sidecar (ano atual, modelo 55) — ver `inutilizacaoSchema`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { transmitirInutilizacaoRegistrada, type InutilizacaoLinha } from "@/lib/fiscal/transmissao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "fiscal-inutilizacoes" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const admin = createAdminClient();
  const { data: linha } = await admin
    .from("fiscal_inutilizacoes")
    .select("id, serie, numero_inicial, numero_final, motivo, status")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const atual = linha as Pick<InutilizacaoLinha, "id" | "serie" | "numero_inicial" | "numero_final" | "motivo" | "status"> | null;
  if (!atual) return fail("not_found", "Inutilização não encontrada.", 404, { requestId });
  if (atual.status === "transmitida") {
    return fail("state_conflict", "Faixa já transmitida à SEFAZ — não se retransmite.", 409, { requestId });
  }

  const { linha: final, motivo } = await transmitirInutilizacaoRegistrada(authz.org.orgId, atual.id, {
    serie: atual.serie,
    numero_inicial: atual.numero_inicial,
    numero_final: atual.numero_final,
    justificativa: atual.motivo,
    ano: null,
    modelo: null,
  });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fiscal.inutilizacao_retransmitida",
    resourceType: "fiscal_inutilizacoes",
    resourceId: atual.id,
    requestId,
  });

  if (!final) return fail("internal_error", "Erro ao gravar o retorno da SEFAZ.", 500, { requestId });
  return ok({ ...final, ...(motivo ? { motivo_transmissao: motivo } : {}) }, { requestId });
}
