import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

import { lerConfiguracaoBilling } from "./config";
import { deveBloquearPorCobranca, BILLING_GATE_ALLOWLIST } from "./gate";

/** Caminho da requisição, injetado pelo proxy (`x-pathname`). */
export async function caminhoDaRequisicao(): Promise<string> {
  try {
    return (await headers()).get("x-pathname") ?? "/desconhecido";
  } catch {
    return "/desconhecido";
  }
}

/**
 * Gate backend de suspensão por cobrança. Fail-closed: ausência de resposta da
 * RPC não bloqueia (Stripe/estado é verificado pelo job), mas também nunca é
 * tratada como "pago". A allowlist é exata e o kill-switch não escreve dado.
 */
export async function bloqueioPorCobranca(
  orgId: string,
  caminho?: string,
): Promise<boolean> {
  const cfg = lerConfiguracaoBilling();
  if (!cfg.killSwitchGate) return false;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_billing_gate_bloqueia", { p_org: orgId });
  if (error) return false;

  return deveBloquearPorCobranca({
    path: caminho ?? (await caminhoDaRequisicao()),
    suspensoPorBilling: Boolean(data),
    plataforma: false,
    killSwitchAtivo: cfg.killSwitchGate,
    allowlist: BILLING_GATE_ALLOWLIST,
  });
}
