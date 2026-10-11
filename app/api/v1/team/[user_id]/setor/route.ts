/**
 * PATCH /api/v1/team/[user_id]/setor — define ou limpa o ramal do membro.
 *
 * O ramal compõe a assinatura que o cliente vê ("… - Faturamento Ana").
 * Só `admin`, só membro ativo da org. O corpo é `{ setor: string|null }`.
 */
import type { NextRequest } from "next/server";

import { changeMemberSetor } from "../_shared";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ user_id: string }> },
): Promise<Response> {
  return changeMemberSetor(req, ctx);
}
