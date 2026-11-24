import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Stripe fora ≠ pago e ≠ suspensão. A falha vira VERIFICAÇÃO PENDENTE com
 * retry; o estado financeiro local fica como estava até a reconciliação.
 */
export async function registrarVerificacao(
  admin: SupabaseClient,
  organizationId: string,
  kind: string,
  referenciaId: string | null,
  erro: string,
  tentativas = 1,
): Promise<void> {
  const { data: anterior } = await admin
    .from("billing_verifications")
    .select("id, tentativas")
    .eq("organization_id", organizationId)
    .eq("kind", kind)
    .is("resolvido_em", null)
    .maybeSingle();

  const prox = new Date(Date.now() + Math.min(60, 5 * 2 ** Math.min(tentativas, 4)) * 60_000);
  if (anterior) {
    await admin
      .from("billing_verifications")
      .update({
        tentativas: (anterior.tentativas ?? 0) + tentativas,
        ultimo_erro: erro.slice(0, 500),
        proxima_tentativa: prox.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", anterior.id);
    return;
  }
  await admin.from("billing_verifications").insert({
    organization_id: organizationId,
    kind,
    referencia_id: referenciaId,
    tentativas,
    ultimo_erro: erro.slice(0, 500),
    proxima_tentativa: prox.toISOString(),
  });
}

export async function resolverVerificacao(
  admin: SupabaseClient,
  organizationId: string,
  kind: string,
  referenciaId: string | null,
): Promise<void> {
  let query = admin
    .from("billing_verifications")
    .update({ resolvido_em: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("kind", kind)
    .is("resolvido_em", null);
  if (referenciaId) query = query.eq("referencia_id", referenciaId);
  await query;
}
