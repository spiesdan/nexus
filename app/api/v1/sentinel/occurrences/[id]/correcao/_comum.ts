import type { SupabaseClient } from "@supabase/supabase-js";

import { correcaoDeJobSuportada } from "@/lib/sentinel/correcao-constantes";
import type { JobCorrigivel } from "@/lib/sentinel/correcao";

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface OcorrenciaCorrecao {
  id: string;
  regra: string;
  entidade_tipo: string;
  entidade_id: string;
  estado: string;
}

export async function carregarOcorrencia(
  supabase: SupabaseClient,
  organizationId: string,
  id: string,
): Promise<{ ocorrencia: OcorrenciaCorrecao | null; erro: string | null }> {
  const { data, error } = await supabase
    .from("sentinel_occurrences")
    .select("id, regra, entidade_tipo, entidade_id, estado")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error) return { ocorrencia: null, erro: error.message };
  return { ocorrencia: (data as OcorrenciaCorrecao | null) ?? null, erro: null };
}

export async function carregarJob(
  supabase: SupabaseClient,
  organizationId: string,
  ocorrencia: OcorrenciaCorrecao,
): Promise<{ job: JobCorrigivel | null; erro: string | null }> {
  if (!correcaoDeJobSuportada(ocorrencia.regra, ocorrencia.entidade_tipo)) {
    return { job: null, erro: null };
  }
  if (!UUID.test(ocorrencia.entidade_id)) {
    return { job: null, erro: null };
  }

  const { data, error } = await supabase
    .from("job_queue")
    .select("id, organization_id, kind, status, run_after, attempts, max_attempts")
    .eq("organization_id", organizationId)
    .eq("id", ocorrencia.entidade_id)
    .maybeSingle();

  if (error) return { job: null, erro: error.message };
  return { job: (data as JobCorrigivel | null) ?? null, erro: null };
}
