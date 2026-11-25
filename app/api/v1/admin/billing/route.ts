/**
 * GET /api/v1/admin/billing — a lista "quem está pagando e quem não está".
 *
 * Leitura pura do banco local: esta rota NÃO chama o Stripe. Quem sincroniza é
 * o `billing-reconcile`; a resposta carrega `sincronizado_em`, para a tela
 * dizer "sincronizado há X" em vez de fingir tempo real. O teste
 * `tests/unit/admin-billing-nao-chama-stripe.test.ts` conta as chamadas (0).
 *
 * Sem Stripe configurado a rota continua respondendo 200 com `stripe.configurado
 * = false`: a instalação inteira existe sem cobrança, e a tela precisa abrir.
 */

import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { carregarVisaoBilling } from "@/lib/billing/visao-plataforma-servidor";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  let adminCtx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    adminCtx = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }

  const admin = createAdminClient();
  const visao = await carregarVisaoBilling(admin);

  void audit({
    action: "platform_admin.billing_listed",
    actorUserId: adminCtx.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    requestId,
    metadata: {
      total_organizacoes: visao.total_organizacoes,
      contagens: visao.resumo.contagens,
      stripe_configurado: visao.stripe.configurado,
    },
  });

  return ok(visao, { requestId });
}
