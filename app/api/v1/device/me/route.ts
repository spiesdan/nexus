/**
 * GET /api/v1/device/me — "este aparelho ainda está pareado?"
 *
 * É a chamada que o shell faz ao abrir e depois de colar o código. Ela não
 * devolve segredo nenhum: nome do aparelho, organização, pessoa, escopos e
 * prazo. Serve para a tela distinguir os quatro estados reais:
 *
 *   pareado      → 200
 *   expirado     → 401 token_expired
 *   revogado     → 401 token_revoked
 *   sem rede     → a chamada nem completa (o shell mostra o estado local)
 *
 * A autenticação passa por `autenticarDispositivo`, que já atualiza
 * `last_seen_at` — é assim que o dono vê "visto por último" na lista.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { autenticarDispositivo } from "@/lib/auth/device-token";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const auth = await autenticarDispositivo(req, null);
  if (!auth.ok) return fail(auth.code, auth.message, auth.status, { requestId });
  const d = auth.dispositivo;

  const admin = createAdminClient();
  // A organização vem do TOKEN do aparelho (fonte confiável), nunca do body —
  // e o nome fica explícito porque é ele que o service role está filtrando.
  const orgId = d.organizationId;
  const [{ data: org }, usuario] = await Promise.all([
    admin.from("organizations").select("display_name").eq("id", orgId).maybeSingle(),
    admin.auth.admin.getUserById(d.userId),
  ]);

  return ok(
    {
      id: d.id,
      nome: d.nome,
      organizacao: {
        id: orgId,
        nome: (org as { display_name?: string | null } | null)?.display_name ?? null,
      },
      usuario: {
        id: d.userId,
        nome:
          (usuario?.data?.user?.user_metadata?.full_name as string | undefined) ??
          usuario?.data?.user?.email ??
          null,
      },
      scopes: d.scopes,
      expires_at: d.expiresAt,
    },
    { requestId },
  );
}
