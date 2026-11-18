import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConversaCorrigivel } from "@/lib/sentinel/correcao";
import { correcaoDeConversaSuportada } from "@/lib/sentinel/correcao-constantes";
import { UUID, type OcorrenciaCorrecao } from "../_comum";

export async function carregarConversa(
  supabase: SupabaseClient,
  organizationId: string,
  ocorrencia: OcorrenciaCorrecao,
): Promise<{ conversa: ConversaCorrigivel | null; erro: string | null }> {
  if (!correcaoDeConversaSuportada(ocorrencia.regra, ocorrencia.entidade_tipo)) {
    return { conversa: null, erro: null };
  }
  if (!UUID.test(ocorrencia.entidade_id)) return { conversa: null, erro: null };

  const { data, error } = await supabase
    .from("conversations")
    .select("id, organization_id, status, assigned_to_user_id, assigned_at, last_message_at")
    .eq("organization_id", organizationId)
    .eq("id", ocorrencia.entidade_id)
    .maybeSingle();

  if (error) return { conversa: null, erro: error.message };
  return { conversa: (data as ConversaCorrigivel | null) ?? null, erro: null };
}
