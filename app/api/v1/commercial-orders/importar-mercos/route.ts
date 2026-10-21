/**
 * GET  /api/v1/commercial-orders/importar-mercos — última execução / status.
 * POST /api/v1/commercial-orders/importar-mercos — enfileira a importação.
 *
 * O POST NÃO roda o navegador: ele grava uma linha em `mercos_import_runs`.
 * O worker dedicado (`workers/mercos`) reivindica e executa. Isso mantém a
 * credencial do Mercos fora do app e faz o botão responder mesmo quando o
 * scrape leva minutos.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  enfileirarImportacaoMercos,
  execucaoMercosPorId,
  ultimaExecucaoMercos,
} from "@/lib/mercos/importacao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "commercial_orders" });
  if (!authz.ok) return authz.response;

  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  const admin = createAdminClient();
  try {
    const execucao = id
      ? await execucaoMercosPorId(admin, authz.org.orgId, id)
      : await ultimaExecucaoMercos(admin, authz.org.orgId);
    return ok({ execucao }, { requestId });
  } catch (err) {
    return fail("internal_error", err instanceof Error ? err.message : String(err), 500, {
      requestId,
    });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "commercial_orders" });
  if (!authz.ok) return authz.response;

  try {
    const resultado = await enfileirarImportacaoMercos(createAdminClient(), {
      organizationId: authz.org.orgId,
      requestedBy: authz.user.id,
      origem: "manual",
    });

    void audit({
      action: "commercial_orders.mercos_import.enqueue",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "mercos_import_run",
      resourceId: resultado.execucao.id,
      requestId,
      metadata: { ja_estava_rodando: resultado.jaEstavaRodando },
    });

    return ok(resultado, { requestId });
  } catch (err) {
    return fail("internal_error", err instanceof Error ? err.message : String(err), 500, {
      requestId,
    });
  }
}
