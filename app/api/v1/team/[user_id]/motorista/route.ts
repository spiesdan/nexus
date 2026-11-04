/**
 * PATCH /api/v1/team/[user_id]/motorista — liga/desliga o modo entregador.
 *
 * O entregador entra com o role normal (as policies de `shipments` continuam
 * mandando) e a flag só muda a EXPERIÊNCIA: casca sem menu, home na expedição
 * e lista só com as cargas em rota. Corpo: `{ motorista: boolean }`.
 */
import type { NextRequest } from "next/server";

import { changeMemberMotorista } from "../_shared";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ user_id: string }> },
): Promise<Response> {
  return changeMemberMotorista(req, ctx);
}
