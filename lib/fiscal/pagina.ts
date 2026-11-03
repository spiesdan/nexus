import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";

/**
 * O contexto que toda tela de `/app/fiscal` precisa: quem é, de qual
 * organização, e se pode gerir (conferir/importar/configurar).
 *
 * Existe para as doze telas não repetirem o mesmo par `requireAuth` +
 * `resolveActiveOrg` + comparação de papel — e, principalmente, para não haver
 * uma tela que esqueça o `redirect` de quem não tem organização ativa.
 */
export async function contextoFiscal() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");
  const podeGerir = user.is_platform_admin || ROLE_RANK[org.role] >= ROLE_RANK.manager;
  const podeOperar = podeGerir || ROLE_RANK[org.role] >= ROLE_RANK.agent;
  return { user, org, podeGerir, podeOperar };
}
