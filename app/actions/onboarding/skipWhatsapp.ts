"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { getWahaClient } from "@/lib/waha/client";
import { requireOnboardingCtx, patchOnboardingState, OnboardingError } from "./_shared";

/** O passo NÃO foi concluído — e a tela precisa dizer por quê. */
export type ResultadoDoPasso = { ok: true } | { ok: false; error: string };

export async function skipWhatsapp(): Promise<void> {
  const ctx = await requireOnboardingCtx();
  await patchOnboardingState(ctx.orgId, {
    whatsapp: { status: "skipped", skipped: true },
  });
  await audit({
    action: "onboarding.whatsapp_skipped",
    actorUserId: ctx.userId,
    organizationId: ctx.orgId,
  });
  // O roteador do wizard decide o próximo step (Nuvemshop só existe com
  // NUVEMSHOP_ENABLED) — hardcodar aqui mandava o usuário pra um step oculto.
  redirect("/onboarding");
}

export async function markWhatsappConfigured(
  sessionName: string,
  _status: string,
): Promise<ResultadoDoPasso> {
  const ctx = await requireOnboardingCtx();

  // "Conectei em outro lugar" GRAVAVA `status: "configured"` sem perguntar a
  // ninguém — o passo era dado por cumprido e o agente começava a atender num
  // número que nunca foi pareado. Quem responde se a sessão existe é o
  // transporte, não o clique: o status vem do WAHA agora.
  const waha = getWahaClient();
  if (!waha) {
    return { ok: false, error: "WhatsApp não está configurado neste servidor." };
  }
  let statusReal: string;
  try {
    const sessao = await waha.getSessionQr(sessionName);
    statusReal = sessao.status;
  } catch {
    return { ok: false, error: "Não consegui confirmar a conexão com o WhatsApp." };
  }
  if (statusReal !== "WORKING") {
    return {
      ok: false,
      error: `A sessão ainda não está conectada (status: ${statusReal}). Leia o QR Code ou finalize o pareamento.`,
    };
  }

  await patchOnboardingState(ctx.orgId, {
    whatsapp: { session_name: sessionName, status: statusReal },
  });
  // resource_id column in api_audit_log is uuid — sessionName is a text
  // identifier (e.g. "org_988371bf"), not a uuid. Pass it via metadata.
  await audit({
    action: "onboarding.whatsapp_configured",
    actorUserId: ctx.userId,
    organizationId: ctx.orgId,
    resourceType: "channel_session",
    metadata: { session_name: sessionName, status: statusReal },
  });
  redirect("/onboarding");
}

export async function skipNuvemshop(): Promise<void> {
  const ctx = await requireOnboardingCtx();
  await patchOnboardingState(ctx.orgId, {
    nuvemshop: { skipped: true },
  });
  await audit({
    action: "onboarding.nuvemshop_skipped",
    actorUserId: ctx.userId,
    organizationId: ctx.orgId,
  });
  redirect("/onboarding");
}

export async function markNuvemshopConfigured(): Promise<ResultadoDoPasso> {
  const ctx = await requireOnboardingCtx();

  // O botão "Já conectei" gravava `connected_at` sem verificar NADA: o wizard
  // avançava com a loja desconectada, e o catálogo/pedidos simplesmente não
  // vinham. A linha de `tenant_integrations` é escrita só pelo callback do
  // OAuth — é ela, e não o clique, que diz se a loja está conectada.
  const supabase = await createClient();
  const { data: integracao, error } = await supabase
    .from("tenant_integrations")
    .select("status, store_metadata")
    .eq("organization_id", ctx.orgId)
    .eq("provider", "nuvemshop")
    .maybeSingle();
  if (error) {
    return { ok: false, error: "Não consegui verificar a conexão com a Nuvemshop." };
  }
  const status = (integracao as { status?: string } | null)?.status;
  if (!integracao || status !== "healthy") {
    return {
      ok: false,
      error:
        "A Nuvemshop ainda não aparece conectada. Use \"Conectar\" para autorizar a loja — ou pule por enquanto.",
    };
  }

  const storeIdBruto = (
    integracao as { store_metadata?: { store_id?: string | number } | null }
  ).store_metadata?.store_id;
  await patchOnboardingState(ctx.orgId, {
    nuvemshop: {
      connected_at: new Date().toISOString(),
      // O formato do estado é texto; o callback grava número.
      ...(storeIdBruto != null ? { store_id: String(storeIdBruto) } : {}),
    },
  });
  await audit({
    action: "onboarding.nuvemshop_configured",
    actorUserId: ctx.userId,
    organizationId: ctx.orgId,
  });
  redirect("/onboarding");
}

export { OnboardingError };
