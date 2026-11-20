/**
 * GET /api/v1/laya/saude — o motor de decisão está respondendo?
 *
 * Existe para o Radar e a Prospecção não confundirem "sem sugestão" com
 * "sugestão desligada porque o motor caiu". O estado vem do incidente que o
 * próprio cron grava (`laya.motor_indisponivel`), não de uma sonda nova: a
 * tela lê o mesmo fato que o log registra.
 *
 * `viewer` basta: é leitura de saúde operacional da própria organização, sem
 * dado de cliente. O `organization_id` vem do JWT, nunca da query.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { lerSaudeDoMotor } from "@/lib/laya/saude";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "laya_saude" });
  if (!authz.ok) return authz.response;

  try {
    const saude = await lerSaudeDoMotor(createAdminClient(), authz.org.orgId);
    return ok(saude, { requestId });
  } catch {
    // `lerSaudeDoMotor` já é fail-soft; isto é a rede da borda.
    return fail("internal_error", "Falha ao ler a saúde do motor.", 500, { requestId });
  }
}
