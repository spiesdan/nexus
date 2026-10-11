-- 0266_membro_setor — o ramal do atendente: quem responde, de onde.
--
-- ┌── Por que `setor` mora em `user_organizations` ───────────────────────
--
-- Setor é do VÍNCULO, não da pessoa: a mesma conta pode ser "Vendas" numa
-- org e "Suporte" noutra. E é o setor + nome que compõe a assinatura que o
-- cliente vê ("Bill Higiene e Limpeza - Faturamento Ana").
--
-- ─── Por que texto livre e não tabela ────────────────────────────────────
--
-- "Faturamento", "Vendas", "Expedição", "Suporte" — cada empresa divide
-- diferente, e normalizar departamento é projeto de RH, não de inbox. Texto
-- livre com teto de 60 caracteres; a UI sugere os já usados na org.
--
-- ─── NULL = sem ramal ────────────────────────────────────────────────────
--
-- Membro sem setor não assina (a assinatura precisa das 3 partes). NULL, e
-- não string vazia: vazio seria "tem setor e é nada", que assinaria errado.

alter table user_organizations
  add column if not exists setor text;

comment on column user_organizations.setor is
  'Ramal do atendente (0266): "Faturamento", "Vendas"... Compõe a assinatura '
  'que o cliente vê. NULL = sem ramal, sem assinatura.';

alter table user_organizations
  drop constraint if exists user_organizations_setor_tamanho;

alter table user_organizations
  add constraint user_organizations_setor_tamanho
  check (setor is null or (char_length(setor) >= 2 and char_length(setor) <= 60));
