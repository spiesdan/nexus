/**
 * POST /api/v1/contacts/duplicados/descartar — "não é a mesma pessoa".
 *
 * Grava a chave estável do grupo em `contact_duplicate_dismissals` (0355). A
 * chave é `nome_normalizado|cidade_normalizada`; o grupo sai da fila e não
 * volta na próxima varredura. Renomear a ficha cria outra chave e o grupo pode
 * reaparecer — o que é correto: virou outra pergunta.
 *
 * Escreve com o cliente da SESSÃO (não service role) de propósito: a policy da
 * tabela exige manager, e a RLS é a segunda camada depois do guard da rota.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

import { comMetricas } from "@/lib/observabilidade/rotas";

export const dynamic = "force-dynamic";

const descartarSchema = z.object({
  chave: z.string().trim().min(3).max(300),
  motivo: z.string().trim().min(3).max(500),
});

async function post(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;

  let input: z.infer<typeof descartarSchema>;
  try {
    input = await validateRequest(descartarSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    return fail("internal_error", "Erro interno.", 500, { requestId });
  }

  const supabase = await createClient();
  // Upsert idempotente: descartar o mesmo grupo duas vezes (duplo clique, POST
  // repetido) atualiza o motivo em vez de estourar o unique(org, chave).
  const { error } = await supabase
    .from("contact_duplicate_dismissals")
    .upsert(
      {
        organization_id: authz.org.orgId,
        chave: input.chave,
        motivo: input.motivo,
        created_by: authz.user.id,
      },
      { onConflict: "organization_id,chave" },
    );

  if (error) {
    return fail("internal_error", "Não foi possível descartar este grupo.", 500, { requestId });
  }

  await audit({
    action: "contact.duplicate_dismissed",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "contact_duplicate_dismissals",
    // `api_audit_log.resource_id` é uuid; a chave do grupo é texto
    // (`nome_normalizado|cidade_normalizada`). Ela vive no metadata.
    resourceId: null,
    requestId,
    metadata: { chave: input.chave, motivo: input.motivo },
  });

  return ok({ chave: input.chave, descartado: true }, { requestId });
}

export const POST = comMetricas("/api/v1/contacts/duplicados/descartar", post);
