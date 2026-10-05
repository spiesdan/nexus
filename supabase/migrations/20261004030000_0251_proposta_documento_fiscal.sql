-- 0251_proposta_documento_fiscal - identificacao do cliente no WhatsApp
--
-- A fila de confirmacao de dado nasceu na 0123 com email/name/phone. O fluxo
-- pedido pelo dono do bot ("pedir CPF ou CNPJ, pesquisar se ja tem cadastro,
-- se nao tiver cadastrar") entra pelo MESMO caminho: a IA PROPOE, o humano
-- CONFIRMA na tela, e quem grava e o patchContactHandler - que ja sabe fazer
-- hash+cifra do CPF (lib/contacts/cpf.ts) e gravar o CNPJ em claro (cnpj e
-- publico). Nada disso muda com esta migration: so o CHECK de campo e alargado.
--
-- A busca de duplicidade e a tool nova (crm_find_contact_by_document) sao
-- codigo de aplicacao; aqui muda so o vocabulario permitido da fila.
alter table public.contact_field_proposals
  drop constraint if exists contact_field_proposals_campo_check;

alter table public.contact_field_proposals
  add constraint contact_field_proposals_campo_check check (
    campo = any (array['email', 'name', 'phone_number', 'cpf', 'cnpj']::text[])
  );
