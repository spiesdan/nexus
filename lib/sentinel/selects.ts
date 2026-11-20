/**
 * OS SELECTS COM EMBED DO SENTINEL — e o hint de FK que impede ambiguidade.
 *
 * Em 20/11/2026 a 1.62.0 quebrou a coleta `leads_abertos` em produção:
 *
 *   Could not embed because more than one relationship was found
 *   for 'crm_leads' and 'crm_stages'
 *
 * O `crm_stages(name)` sem hint depende de existir **uma** FK entre as duas
 * tabelas. No banco que nasceu da linhagem antiga existem duas (a canônica
 * `stage_id` e uma de histórico), e o PostgREST se recusa a escolher. A coleta
 * inteira ia para `falhas`, `operacao.lead_duplicado` deixava de ser avaliada e
 * o detector ficava cego — pior que antes do embed, porque antes ele rodava.
 *
 * O hint pelo NOME DA CONSTRAINT (`!crm_leads_stage_id_fkey`) resolve nos dois
 * bancos: no fresco (uma FK) e no que tem drift (duas). Nome e não coluna porque
 * o PostgREST documenta a constraint como hint estável; a constraint canônica
 * nasce no schema inicial e não muda de nome.
 *
 * Mesmo tratamento no contato (`!crm_leads_contact_id_fkey`): hoje só há uma FK
 * `crm_leads → contacts`, mas a regra é a mesma — embed sem hint é aposta, e a
 * aposta já custou uma rodada cega.
 */

/** Linhas de `crm_leads` abertos, com etapa e contato legíveis. */
export const SELECT_LEAD_ABERTO =
  "id, pipeline_id, stage_id, contact_id, created_at, " +
  "crm_stages!crm_leads_stage_id_fkey(name), " +
  // ALIAS `contatos:` — o tipo (`LeadAberto.contatos`) e a regra de lead
  // duplicado leem `lead.contatos`. Sem o alias o PostgREST devolve `contacts`
  // e a evidência caía no fallback de id; ninguém percebia porque o fallback
  // existe justamente para não quebrar.
  "contatos:contacts!crm_leads_contact_id_fkey(name, display_name, phone_number, email_normalized)";
