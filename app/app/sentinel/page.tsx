import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { roleAtLeast } from "@/lib/auth/types";
import { interpretarConfiguracao, sentinelLigadoNoAmbiente } from "@/lib/sentinel/config";
import { createClient } from "@/lib/supabase/server";

import { SentinelClient } from "./_client";
import type { ExecucaoSentinel, OcorrenciaSentinel } from "./_tipos";

export const dynamic = "force-dynamic";

/**
 * SENTINEL — a saúde do produto, em ocorrências.
 *
 * A tela lê no servidor (RLS + filtro explícito de org) e entrega ao cliente
 * uma lista limitada a 500. O detalhe e a mudança de estado vão por API, para
 * que a ação seja auditada e a transição validada no servidor.
 */
export default async function SentinelPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const supabase = (await createClient()) as unknown as SupabaseClient;

  const [{ data: ocorrencias }, { data: execucoes }, { data: configuracao }] = await Promise.all([
    supabase
      .from("sentinel_occurrences")
      .select(
        "id, regra, categoria, entidade_tipo, entidade_id, titulo, resumo, causa_provavel, " +
          "severidade, estado, evidencia, recomendacao, href, primeira_vista_em, ultima_vista_em, " +
          "vezes_vista, recorrencias, responsavel_user_id, ignorada_motivo, " +
          "motivo_encerramento, encerrada_em, created_at, updated_at",
      )
      .eq("organization_id", activeOrg.orgId)
      .order("ultima_vista_em", { ascending: false })
      .limit(500),
    supabase
      .from("sentinel_runs")
      .select(
        "id, origem, status, iniciado_em, finalizado_em, duracao_ms, achados, criadas, " +
          "reafirmadas, encerradas, erros, truncado, erro",
      )
      .eq("organization_id", activeOrg.orgId)
      .order("iniciado_em", { ascending: false })
      .limit(5),
    supabase
      .from("sentinel_settings")
      .select("ativo, intervalo_minutos, retencao_dias, limite_ocorrencias, ultima_execucao_em")
      .eq("organization_id", activeOrg.orgId)
      .maybeSingle(),
  ]);

  const papel = user.is_platform_admin
    ? { podeAgir: true, podeGerir: true }
    : {
        podeAgir: roleAtLeast(activeOrg.role, "agent"),
        podeGerir: roleAtLeast(activeOrg.role, "manager"),
      };

  return (
    <SentinelClient
      ocorrencias={(ocorrencias ?? []) as unknown as OcorrenciaSentinel[]}
      execucoes={(execucoes ?? []) as unknown as ExecucaoSentinel[]}
      configuracao={interpretarConfiguracao(
        configuracao as Parameters<typeof interpretarConfiguracao>[0],
      )}
      linhaDeConfiguracaoExiste={Boolean(configuracao)}
      ambienteLigado={sentinelLigadoNoAmbiente()}
      podeAgir={papel.podeAgir}
      podeGerir={papel.podeGerir}
    />
  );
}
