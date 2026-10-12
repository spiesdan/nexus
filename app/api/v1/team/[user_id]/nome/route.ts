/**
 * PATCH /api/v1/team/[user_id]/nome — define o nome de exibição do membro.
 *
 * O nome que a Equipe lista, o inbox mostra e a assinatura usa. Só `admin`,
 * só membro ativo da org. Corpo: `{ nome: string }` (2–80 letras).
 */
import type { NextRequest } from "next/server";

import { changeMemberNome } from "../_shared";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ user_id: string }> },
): Promise<Response> {
  return changeMemberNome(req, ctx);
}
