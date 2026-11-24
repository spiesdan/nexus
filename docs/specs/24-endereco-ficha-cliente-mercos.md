# 24 — Endereço do cliente: da ficha do Mercos, sem sobrescrever cadastro

## Evidência medida (dono, 23/11/2026, pedido 19732)

O bloco do cliente **na página do pedido** traz nome, razão, CNPJ, telefone,
e-mail e cidade/UF — e **não traz** rua, número, bairro nem CEP (busca por
`rua|avenida|rodovia|cep|bairro|centro|nº`: zero ocorrências). O pedido só
linka a lista `/338282/clientes/`; não há link direto para a ficha do cliente.
O endereço existe na ficha, confirmada pelo dono.

## Caminho implementado

1. Busca em `/clientes/` pelo **documento** (a chave que o pedido já traz).
2. Abertura da ficha encontrada e leitura de `logradouro`, `numero_end`,
   `complemento`, `bairro`, `cep`, `cidade`, `uf`. Campo ausente na página é
   `null` — nunca inferido.
3. Cache por documento em `/data/mercos/enderecos-clientes.json`, validade
   de **30 dias**; teto de `MERCOS_MAX_ENDERECOS_POR_RODADA` (default 20) — o
   excedente volta na rodada seguinte porque o contato continua sem endereço.
4. RPC `fn_mercos_enriquecer_endereco` (0348) grava **somente campo vazio**
   (inclusive o token `NULL` do export antigo). Cadastro corrigido à mão não
   é sobrescrito.
5. Endereço é enriquecimento: se a busca/ficha falhar, o pedido entra igual.

Os seletores da busca e da ficha são configuráveis por
`MERCOS_SELETOR_BUSCA_CLIENTE`; o padrão é genérico e precisa ser validado num
dry-run com o HTML real.

## Não medido neste ambiente

Sem credenciais do Mercos aqui, **segundos por cliente e saldo de clientes sem
endereço após uma rodada não foram medidos**, e o caso real (antes/depois de um
contato) não foi executado. Isso exige o dry-run do coletor no container.
