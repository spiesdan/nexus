/**
 * GET/POST /api/v1/suppliers — fornecedores da org (NEXUS §47).
 *
 * Leitura viewer+, escrita agent+, auditoria em criação.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ApiError } from "@/lib/api/types";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLUNAS = "id, nome, cnpj, email, telefone, observacoes, ativo, created_at, updated_at";

const supplierSchema = z.object({
  nome: z.string().trim().min(2).max(200),
  cnpj: z.string().trim().max(20).optional(),
  email: z.string().email().max(200).optional(),
  telefone: z.string().trim().max(30).optional(),
  observacoes: z.string().trim().max(2000).optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "suppliers" });
  if (!authz.ok) return authz.response;

  const ativos = req.nextUrl.searchParams.get("ativos") ?? "";
  const busca = req.nextUrl.searchParams.get("busca")?.trim() ?? "";
  const supabase = await createClient();
  let q = supabase
    .from("suppliers")
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .order("nome", { ascending: true })
    .limit(500);
  if (ativos === "1") q = q.eq("ativo", true);
  if (busca) q = q.ilike("nome", `%${busca.replace(/[%_]/g, "")}%`);
  const { data, error } = await q;
  if (error) return fail("internal_error", "Erro ao listar fornecedores.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "suppliers" });
  if (!authz.ok) return authz.response;

  let input;
  try {
    input = await validateRequest(supplierSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({ organization_id: authz.org.orgId, ...input })
    .select(COLUNAS)
    .single();
  if (error || !data) return fail("internal_error", "Erro ao criar fornecedor.", 500, { requestId });

  await audit({
    action: "supplier.created",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "supplier",
    resourceId: (data as unknown as { id: string }).id,
    requestId,
  });
  return ok(data, { requestId, status: 201 });
}
