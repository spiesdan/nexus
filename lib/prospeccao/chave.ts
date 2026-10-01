/**
 * Resolução ÚNICA da chave do Google e do kill-switch da instalação.
 *
 * Antes, a mesma lógica existia em 3 lugares (motor, rota de busca e fan-out
 * de campanha) e divergia — o fan-out exigia chave mesmo com OSM ativo e
 * instanciava o provider Google direto (B4/B5 da spec 19). Toda chamada paga
 * passa por aqui.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

export interface ChaveResolvida {
  chave: string | null;
  origem: "tenant" | "instalacao" | "nenhuma";
}

/** Tenant cifrada → env da instalação → nenhuma (nunca lança). */
export async function resolverChaveGoogle(admin: SupabaseClient, orgId: string): Promise<ChaveResolvida> {
  const { data } = await admin
    .from("prospecting_settings")
    .select("google_api_key_encrypted")
    .eq("organization_id", orgId)
    .maybeSingle();
  const enc = (data as unknown as { google_api_key_encrypted: string | null } | null)
    ?.google_api_key_encrypted;
  if (enc) {
    const chave = await decryptWebhookSecret(admin, enc);
    if (chave) return { chave, origem: "tenant" };
  }
  const envKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (envKey) return { chave: envKey, origem: "instalacao" };
  return { chave: null, origem: "nenhuma" };
}

/** GOOGLE_PLACES_ENABLED=false derruba só o Google; OSM segue normal. */
export function googlePlacesHabilitado(): boolean {
  return process.env.GOOGLE_PLACES_ENABLED !== "false";
}
