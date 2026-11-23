/**
 * GET/POST /api/v1/payment-methods — formas e prazos da organização.
 *
 * O `organization_id` vem SEMPRE do cookie resolvido pelo `requireRole`, nunca
 * do corpo: é a regra de toda rota tenant-aware do repo. A leitura é de
 * `agent`; escrever é ato de gestão (`manager`). A RLS da 0334 é a segunda
 * camada — o filtro explícito abaixo é a primeira.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { FORMAS_DE_PAGAMENTO } from "@/lib/schemas/fiscal";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const metodoSchema = z
  .object({
    tipo: z.enum(["forma", "prazo"]),
    codigo: z.string().trim().min(2).max(60),
    nome: z.string().trim().min(2).max(120),
    /** tPag oficial (NT 2020.006). Vazio = pendência declarada, nunca chute. */
    tpag: z.enum(FORMAS_DE_PAGAMENTO).nullable().optional(),
    dias_prazo: z.number().int().min(0).max(365).nullable().optional(),
    ativo: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === "forma" && v.dias_prazo != null) {
      ctx.addIssue({ code: "custom", path: ["dias_prazo"], message: "Forma não tem prazo." });
    }
    if (v.tipo === "prazo" && v.tpag != null) {
      ctx.addIssue({ code: "custom", path: ["tpag"], message: "Prazo não tem tPag." });
    }
    if (v.tipo === "prazo" && v.dias_prazo == null) {
      ctx.addIssue({ code: "custom", path: ["dias_prazo"], message: "Informe os dias do prazo." });
    }
  });

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? undefined;
  const autorizado = await requireRole("agent", { requestId, resource: "payment_methods" });
  if (!autorizado.ok) return autorizado.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commercial_payment_methods")
    .select("id, tipo, codigo, nome, tpag, dias_prazo, ativo")
    .eq("organization_id", autorizado.org.orgId)
    .order("tipo")
    .order("nome");
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok({ payment_methods: data ?? [] }, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  const autorizado = await requireRole("manager", { requestId, resource: "payment_methods" });
  if (!autorizado.ok) return autorizado.response;

  const lido = metodoSchema.safeParse(await req.json().catch(() => null));
  if (!lido.success) {
    return fail("validation_failed", "Dados inválidos.", 422, { requestId });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commercial_payment_methods")
    .insert({ ...lido.data, organization_id: autorizado.org.orgId })
    .select("id, tipo, codigo, nome, tpag, dias_prazo, ativo")
    .single();
  if (error) {
    return fail("conflict", "Não foi possível criar: código duplicado ou dado inválido.", 409, {
      requestId,
    });
  }

  void audit({
    action: "settings.payment_method.created",
    actorUserId: autorizado.user.id,
    organizationId: autorizado.org.orgId,
    requestId,
    resourceId: data.id,
    metadata: { codigo: data.codigo, tipo: data.tipo, tpag: data.tpag },
  });
  return ok({ payment_method: data }, { requestId });
}
