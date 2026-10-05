-- 0255 - DADOS DA EMPRESA NO CABECALHO DO PEDIDO IMPRESSO
--
-- O cabecalho do PDF do pedido (lib/comercial/pedido-pdf.tsx) mostrava so
-- razao social + CNPJ. O modelo do Mercos (Imprimir pedidos 12.pdf) traz
-- telefone e endereco da emitente, e o usuario tem de edita-los em
-- Configuracoes (/app/settings/tenant) - nao existe hoje nenhum campo de
-- endereco ou telefone em `organizations`.
--
-- Os NOMES espelham `contacts` de proposito, nao por preguica:
-- `enderecoEmLinha()` (lib/contacts/endereco-em-linha.ts) e o formatador
-- unico de endereco estruturado do repo ("Rua Antônio Liller, 585 - Centro,
-- Canoinhas/SC, 89460-000"), ja usado pelo proprio `endereco_entrega` do
-- pedido. Com os mesmos nomes, o MESMO formatador serve ao contato do pedido
-- e a empresa sem nenhum adaptador.
--
-- `phone` e texto LIVRE, nao E.164: telefone de empresa e IMPRESSO, nao
-- discado - normalizar para +55551... guardaria o dado num formato que a
-- propria tela de Configuracoes nao mostraria de volta. Nulo = nao
-- informado, e o cabecalho entao omite a linha inteira (nao imprime rotulo
-- sem valor).

alter table public.organizations add column if not exists phone text;
alter table public.organizations add column if not exists logradouro text;
alter table public.organizations add column if not exists numero_end text;
alter table public.organizations add column if not exists complemento text;
alter table public.organizations add column if not exists bairro text;
alter table public.organizations add column if not exists cidade text;
alter table public.organizations add column if not exists uf text;
alter table public.organizations add column if not exists cep text;

comment on column public.organizations.phone is
  'Telefone da empresa, no cabecalho do pedido impresso. Texto livre (e impresso) - nao E.164.';
comment on column public.organizations.logradouro is
  'Endereco da empresa. Os sete campos usam os MESMOS nomes de contacts para reusar enderecoEmLinha() sem adaptador.';
comment on column public.organizations.numero_end is
  'Numero do endereco da empresa (espelho de contacts.numero_end).';
comment on column public.organizations.cidade is
  'Cidade do endereco da empresa (espelho de contacts.cidade).';
comment on column public.organizations.uf is
  'UF do endereco da empresa, 2 letras (espelho de contacts.uf).';
