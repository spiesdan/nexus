/**
 * Contato, etiqueta e lead do caminho da Venda Automática (spec 18 §16/§17).
 *
 * O molde é o import de prospects (`app/api/v1/prospecting/prospects/import`):
 * mesmo destino no CRM (`funilDeEntrada` — o MESMO funil de entrada que a
 * conversa usa ao virar lead), mesma forma de contato (telefone canônico +
 * `source: "prospeccao"` + metadados). Reimplementar "primeiro funil por
 * created_at" aqui faria a VA mandar lead para um funil diferente do resto do
 * produto — mesma decisão, um só lugar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { funilDeEntrada } from "@/lib/leads/nascimento-do-lead";
import { logger } from "@/lib/logger";

export interface ProspectParaContato {
  prospectId: string;
  nome: string;
  telefone: string;
  categoria: string | null;
  cidade: string | null;
  campaignId: string;
}

/**
 * Acha o contato pelo telefone (unique parcial, merged fora) ou cria.
 * Corrida entre dois workers no mesmo número cai no 23505 → rebusca o vencedor.
 */
export async function encontrarOuCriarContato(
  admin: SupabaseClient,
  organizationId: string,
  p: ProspectParaContato,
): Promise<{ id: string; criado: boolean }> {
  const { data: existente } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone_number", p.telefone)
    .is("is_merged_into", null)
    .limit(1)
    .maybeSingle();
  if (existente) return { id: (existente as { id: string }).id, criado: false };

  const { data: criado, error } = await admin
    .from("contacts")
    .insert({
      organization_id: organizationId,
      display_name: p.nome,
      name: p.nome,
      phone_number: p.telefone,
      source: "prospeccao",
      source_metadata: {
        prospect_id: p.prospectId,
        categoria: p.categoria,
        cidade: p.cidade,
        origem: "venda_automatica",
        campaign_id: p.campaignId,
      },
      tags: [p.categoria, p.cidade].filter(Boolean) as string[],
    })
    .select("id")
    .single();

  if (criado) return { id: (criado as { id: string }).id, criado: true };

  if ((error as { code?: string } | null)?.code === "23505") {
    const { data: vencedor } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("phone_number", p.telefone)
      .is("is_merged_into", null)
      .limit(1)
      .maybeSingle();
    if (vencedor) return { id: (vencedor as { id: string }).id, criado: false };
  }
  throw new Error(error?.message ?? "contact_insert_failed");
}

/**
 * Uma leitura-da-conversa, depois escrita: `text[]` não tem append no
 * PostgREST, e a corrida aqui é rara (worker + humano no mesmo instante) — a
 * união de conjuntos não perde tag de ninguém, só sobrescreve a lista por uma
 * que contém as duas.
 */
export async function etiquetarConversa(
  admin: SupabaseClient,
  organizationId: string,
  conversationId: string,
  tags: readonly string[],
): Promise<void> {
  const { data } = await admin
    .from("conversations")
    .select("tags")
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  const atuais = ((data as { tags?: string[] | null } | null)?.tags ?? []) as string[];
  const uniao = [...new Set([...atuais, ...tags])];
  const { error } = await admin
    .from("conversations")
    .update({ tags: uniao, updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("organization_id", organizationId);
  if (error) {
    logger.warn("[venda-automatica] etiqueta da conversa não gravada", {
      organizationId,
      conversationId,
      causa: error.message,
    });
  }
}

export interface DadosDoLead {
  contactId: string;
  title: string;
  prospectId: string;
  categoria: string | null;
  cidade: string | null;
  campaignId: string;
  interestLevel: string;
  necessidade: string | null;
  responsavelUserId: string | null;
}

/**
 * Lead na primeira etapa do funil de entrada — devolve null quando a org não
 * tem funil configurado (a fila vira `qualified_lead` SEM lead; a tela mostra
 * a mensagem de "sem funil" no resumo da campanha). Falha de insert não derruba
 * a classificação: log e o evento já gravado conta a história.
 */
export async function criarLead(
  admin: SupabaseClient,
  organizationId: string,
  d: DadosDoLead,
): Promise<string | null> {
  const destino = await funilDeEntrada(admin, organizationId);
  if ("erro" in destino) {
    logger.warn("[venda-automatica] sem funil de entrada para o lead", {
      organizationId,
      causa: destino.erro,
    });
    return null;
  }

  const { data, error } = await admin
    .from("crm_leads")
    .insert({
      organization_id: organizationId,
      pipeline_id: destino.pipelineId,
      stage_id: destino.stageId,
      contact_id: d.contactId,
      title: d.title,
      source: "venda_automatica",
      source_metadata: {
        prospect_id: d.prospectId,
        campaign_id: d.campaignId,
        interesse: d.interestLevel,
        necessidade: d.necessidade,
        categoria: d.categoria,
        cidade: d.cidade,
      },
      tags: ["venda-automatica"],
      ...(d.responsavelUserId ? { owner_user_id: d.responsavelUserId } : {}),
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    logger.warn("[venda-automatica] lead não gravado", {
      organizationId,
      causa: error?.message ?? "sem retorno",
    });
    return null;
  }
  return (data as { id: string }).id;
}
