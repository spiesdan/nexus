# P1-11 — `anon` com GRANT em tabelas públicas (investigação, sem revogação)

> Medido em 22/11/2026 no Postgres local do seed (pg15.19, mesmo piso do
> `test:db`), com `information_schema.role_table_grants`, `pg_policies` e
> `pg_class.relrowsecurity`. **Nada foi revogado.** O pedido do dono era
> investigar e listar tabela por tabela — não fazer "revoke em massa".

## O que foi medido

| Medida | Valor |
|---|---:|
| Tabelas `public` no banco | **186** |
| Tabelas com algum privilégio para `anon` | **62** |
| Dessas, com RLS ligado | **todas** |
| Dessas, com política explícita para `anon` | **0** |

O número medido no F-09 era **58/179** no baseline; o seed local já
evoluiu para **62/186** com as migrations novas — a direção é a mesma. O
`GRANT ALL ... TO anon` vem do `pg_dump` do Supabase no baseline (`ALTER
DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon`); é privilégio de catálogo,
não autorização de leitura. O controle real é RLS: toda tabela listada tem
`relrowsecurity = true` e nenhuma política concede algo a `anon`.

Prova de fail-closed: `set role anon; select count(*) from public.organizations`
devolve **`permission denied for function fn_user_org_ids`** — a política depende
do helper de membership, revogado de `anon`. A consulta não devolve linha nem
cega: falha antes de ler.

## Veredito por tabela

| Tabela | Privilégios no catálogo | Veredito |
|---|---|---|
| `agent_case_events` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `agent_cases` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `ai_agent_runs` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `ai_agent_versions` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `ai_agents` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `ai_budgets` | `REFERENCES,SELECT,TRIGGER,TRUNCATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `ai_invocations` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `ai_models` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `ai_pricing` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `ai_provider_credentials` | `DELETE,INSERT,REFERENCES,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `ai_purpose_bindings` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `api_audit_log` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `api_tokens` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `attendant_availability` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `automation_rule_runs` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `automation_rules` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `channel_session_warmup` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `channel_sessions` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `contacts` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `conversation_notes` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `conversations` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `crm_lead_activities` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `crm_lead_links` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `crm_lead_reactivations` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `crm_lead_risk_decisions` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `crm_lead_risk_states` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `crm_lead_scores` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `crm_leads` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `crm_pipelines` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `crm_stages` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `demanda_conversas` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `demandas` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `event_log` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `fleet_drivers` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `fleet_vehicles` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `followup_enrollment_events` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `followup_enrollments` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `followup_flow_pointers` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `followup_flow_versions` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `idempotency_keys` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `incidents` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `lab_avaliacoes` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `lgpd_requests` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `merge_queue` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `message_templates` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `messages` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `meta_templates` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `nuvemshop_products` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `operational_alerts` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `orders` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `organizations` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `platform_admins` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `prospecting_message_presets` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `storage_redaction_queue` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `system_update_runs` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `system_version` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `tenant_integrations` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `user_organizations` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `user_recovery_codes` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `webhook_events_log` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `webhook_lead_captures` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |
| `webhook_sources` | `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` | intencional como resíduo do dump; RLS vigente, 0 políticas anon — **não revogar nesta fatia** |

## Proposta (não executada)

1. **Manter o estado atual** até uma janela de schema: RLS é o controle e o
   `GRANT` sozinho não expõe linha; uma revogação em massa tem risco de quebrar
   `SECURITY DEFINER`, PostgREST e upgrades do Supabase sem ganho de sigilo.
2. Se o dono quiser reduzir a superfície, fazer **por tabela**, em migration
   aditiva com teste de comportamento antes do `revoke`, começando pelas
   sensíveis: `api_tokens`, `user_recovery_codes`, `ai_provider_credentials`,
   `platform_admins`, `webhook_sources`, `message_templates`, `api_audit_log`.
3. Nenhuma tabela da lista tem leitura pública intencional (0 políticas
   `anon`), então não há "leitura pública" a preservar — só o mecanismo de
   failed-closed a confirmar em cada revoke.

## Como reproduzir

```sql
select table_name, string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where grantee='anon' and table_schema='public' group by table_name order by 1;

select c.relname, c.relrowsecurity,
  (select count(*) from pg_policies p where p.tablename=c.relname and p.roles::text like '%anon%')
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by 1;
```
