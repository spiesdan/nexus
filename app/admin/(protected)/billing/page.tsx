import { requirePlatformAdmin, escopoPermiteEscrita } from "@/lib/auth/requirePlatformAdmin";
import { carregarVisaoBilling } from "@/lib/billing/visao-plataforma-servidor";
import { createAdminClient } from "@/lib/supabase/admin";

import { BillingPlataforma } from "./_client";

export const metadata = { title: "Cobrança — Admin Plataforma" };
export const dynamic = "force-dynamic";

/**
 * `/admin/billing` — a lista que o dono da instalação não tinha.
 *
 * A guarda autoritativa já está no layout de `(protected)`, mas ela é chamada
 * de novo aqui por um motivo específico: o ESCOPO (`support_readonly`) decide
 * se as ações aparecem, e essa informação não atravessa o layout. A leitura é
 * feita com service role porque a tela cruza organizações; `requirePlatformAdmin`
 * é o que autoriza o bypass, e toda tabela `billing_*` é filtrada por
 * `organization_id` na montagem (nunca por parâmetro de URL).
 */
export default async function AdminBillingPage() {
  const adminCtx = await requirePlatformAdmin();
  const visao = await carregarVisaoBilling(createAdminClient());
  return (
    <BillingPlataforma
      visao={visao}
      podeEscrever={escopoPermiteEscrita(adminCtx.platformAdmin.scope)}
    />
  );
}
