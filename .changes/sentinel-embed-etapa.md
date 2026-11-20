---
impacto: nada_mudou
secao: corrigido
titulo: Sentinel volta a avaliar lead duplicado (embed de etapa com hint)
---

Na 1.62.0 o select de leads do Sentinel passou a trazer `crm_stages(name)` sem
hint de FK. Em instalação com duas relações entre `crm_leads` e `crm_stages`, o
PostgREST recusou o embed, a coleta `leads_abertos` inteira virou falha e
`operacao.lead_duplicado` deixou de ser avaliada — detector cego, sem encerrar
nada por engano. O select agora vive em `lib/sentinel/selects.ts` com
`crm_stages!crm_leads_stage_id_fkey(name)` e
`contatos:contacts!crm_leads_contact_id_fkey(...)`; o alias também faz a
evidência de contato chegar (antes caía no fallback de id). Testes simulam a
ambiguidade e provam que a coleta volta a devolver etapa e contato.
