/**
 * POST /api/v1/fiscal-inutilizacoes/lacunas — inutiliza os buracos da numeração.
 *
 * ─── Por que existe ─────────────────────────────────────────────────────────
 *
 * O dreno passou a inutilizar sozinho o número que uma rejeição da SEFAZ
 * queimou (ver `lib/fiscal/inutilizacao-automatica.ts`). Esta rota é o outro
 * lado: os buracos que JÁ existem — anteriores à automação, ou de uma
 * inutilização que não chegou à SEFAZ — e que a pessoa quer fechar de uma vez.
 *
 * A conta é a mesma do relatório "Numerações puladas": número entre o primeiro e
 * o último emitido da série que não pertence a nota nenhuma e não está coberto
 * por faixa inutilizada. Números contíguos viram UMA faixa.
 *
 * Inutilização é ato fiscal irreversível: a rota exige agent+ e a tela pede
 * confirmação. Lacuna nenhuma = 200 com resumo vazio (não é erro).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { inutilizarLacunasDaNumeracao } from "@/lib/fiscal/inutilizacao-automatica";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "fiscal-inutilizacoes" });
  if (!authz.ok) return authz.response;

  try {
    const resumo = await inutilizarLacunasDaNumeracao(createAdminClient(), authz.org.orgId);
    return ok(resumo, { requestId });
  } catch (erro) {
    return fail(
      "internal_error",
      erro instanceof Error ? erro.message.slice(0, 200) : "Erro ao inutilizar as lacunas.",
      500,
      { requestId },
    );
  }
}
