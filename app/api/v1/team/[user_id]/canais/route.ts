/**
 * PATCH /api/v1/team/[user_id]/canais — números que o membro enxerga no inbox.
 *
 * Separa contas na mesma organização (0296): a administrativa vê só o número
 * de avisos de carga, a comercial vê os números de venda. Só `admin`, só membro
 * ativo da org. O corpo é `{ canais_permitidos: string[] | null }`, onde `null`
 * devolve "todos" e `[]` significa "nenhum".
 */
import type { NextRequest } from "next/server";

import { changeMemberCanais } from "../_shared";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ user_id: string }> },
): Promise<Response> {
  return changeMemberCanais(req, ctx);
}
