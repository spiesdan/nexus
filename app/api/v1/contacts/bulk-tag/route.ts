/**
 * POST /api/v1/contacts/bulk-tag — etiqueta em massa (§22 ações em massa).
 *
 * Aplica (ou remove) tags em até 50 contatos. Reutiliza o
 * `patchContactHandler` por item: mesma guarda LGPD, mesmos eventos
 * (`contact.tag_added`), mesma auditoria — nenhuma regra duplicada.
 * Itens com problema não abortam o lote (retorno por item).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

import { patchContactHandler } from "../_handler";

export const dynamic = "force-dynamic";

const bulkTagSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  tags: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
  modo: z.enum(["add", "remove"]).default("add"),
});

export type BulkTagResult = {
  atualizados: string[];
  ignorados_anonimizados: string[];
  nao_encontrados: string[];
};

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;
  const user = authz.user;
  const activeOrg = authz.org;

  let input;
  try {
    input = await validateRequest(bulkTagSchema, req);
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
  const ctx = {
    organization_id: activeOrg.orgId,
    actor: { type: "user" as const, id: user.id },
    requestId,
  };
  const resultado: BulkTagResult = { atualizados: [], ignorados_anonimizados: [], nao_encontrados: [] };

  for (const id of input.ids) {
    try {
      // Estado atual para mesclar (o handler aplica e audita).
      const { data: atual } = await supabase
        .from("contacts")
        .select("id, tags")
        .eq("organization_id", activeOrg.orgId)
        .eq("id", id)
        .maybeSingle();
      if (!atual) {
        resultado.nao_encontrados.push(id);
        continue;
      }
      const prev: string[] = (atual as { tags?: string[] }).tags ?? [];
      const next =
        input.modo === "add"
          ? [...prev, ...input.tags.filter((t) => !prev.includes(t))]
          : prev.filter((t) => !input.tags.includes(t));
      await patchContactHandler(supabase, ctx, id, { tags: next });
      resultado.atualizados.push(id);
    } catch (err) {
      if (err instanceof ApiError && err.code === "lgpd_anonymization_irreversible") {
        resultado.ignorados_anonimizados.push(id);
        continue;
      }
      if (err instanceof ApiError && err.code === "not_found") {
        resultado.nao_encontrados.push(id);
        continue;
      }
      throw err;
    }
  }

  return ok(resultado, { requestId });
}
