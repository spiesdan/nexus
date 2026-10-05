# Fiscal sidecar — emissor de NF-e (sped-nfe)

Micro-serviço PHP que emite NF-e modelo 55 via
[nfephp-org/sped-nfe](https://github.com/nfephp-org/sped-nfe) (`^5.0`).
O app Next **nunca** fala com a SEFAZ direto: ele monta o payload, chama este
serviço na rede privada, e grava o retorno. Sem certificado ou sem este
serviço no ar, as notas ficam `pendente` (o stub honesto) — nunca "autorizada".

> ⚠️ **Validação pendente na VPS.** Este código foi escrito contra a API
> documentada do sped-nfe v5 e **não foi executado aqui** (sem PHP, sem
> certificado, sem SEFAZ nesta máquina). Antes da primeira nota real:
> `composer install` + os 3 passos de [Validação](#validação-na-vps).

## Subir

```bash
cd fiscal/sidecar
cp .env.example .env   # FISCAL_SIDECAR_SECRET=openssl rand -hex 32
docker build -t fiscal-sidecar .
docker run -d --name fiscal --network deskcomm-net \
  -e FISCAL_SIDECAR_SECRET=... \
  -v /srv/fiscal/certs:/certs:ro \
  -p 127.0.0.1:8080:8080 \
  fiscal-sidecar
curl -s http://127.0.0.1:8080/saude
# {"ok":true,"servico":"fiscal-sidecar","sped_nfe":"5.x.x"}
```

**Regras de operação (não negociáveis):**

1. **Nunca exponha a porta para fora.** O serviço escuta em `127.0.0.1` ou em
   rede Docker interna. Quem chama pode emitir nota em nome da empresa.
2. **O `.pfx` entra por SCP** em `/srv/fiscal/certs/` (só leitura). Nunca por
   upload web, nunca no repo, nunca no Storage público.
3. **Comece em homologação** (`ambiente: homologacao` na tela de configuração
   fiscal). Produção só depois de uma nota homologada lida no portal da SEFAZ.
4. **`composer update` com atenção:** NT nova do fisco pode exigir sped-nfe
   novo. Trave testando `/saude` + 1 emissão em homologação depois de cada
   update.

## Contrato

Todas as rotas (exceto `/saude`) exigem `X-Fiscal-Secret`.

### POST /emitir

```json
{
  "config": {
    "ambiente": "homologacao",
    "serie": "1",
    "cnpj": "12345678000190",
    "razao": "Bill Higiene LTDA",
    "ie": "123456789",
    "crt": "1",
    "natureza": "VENDA",
    "cfop": "5102",
    "logradouro": "Rua A", "numero_end": "100", "bairro": "Centro",
    "municipio": "São Paulo", "codigo_municipio": "3550308",
    "uf": "SP", "cep": "01001000"
  },
  "certificado_arquivo": "/certs/empresa.pfx",
  "certificado_senha": "segredo (só em memória, nunca gravado)",
  "pedido": {
    "numero_nota": 123,
    "nome": "Mercado Central",
    "documento": "12987654000100",
    "frete_cents": 0
  },
  "itens": [
    {
      "codigo": "AG-5L", "descricao": "Água Sanitária 5L",
      "ncm": "28289011", "cfop": "5102", "unidade": "UN",
      "quantidade": 2, "preco_cents": 5000, "desconto_pct": 10,
      "csosn": "102"
    }
  ],
  "extras": {
    "transporte": {
      "modalidade_frete": "9",
      "transportador": {
        "nome": "Transportes X", "documento": "12345678000190",
        "ie": "123456789", "endereco": "Rua B, 200",
        "municipio": "São Paulo", "uf": "SP"
      },
      "volumes": {
        "quantidade": 2, "especie": "CAIXAS", "marca": "", "numeracao": "",
        "peso_liquido_kg": 12.5, "peso_bruto_kg": 13
      }
    },
    "cobranca": {
      "forma_pagamento": "15", "descricao": "Boleto bancário",
      "parcelas": 3, "primeiro_vencimento": "2026-10-20", "dias_entre": 30
    },
    "adicionais": {
      "informacoes_complementares": "Pedido 456",
      "informacoes_fisco": ""
    },
    "entrega": {
      "logradouro": "Av. Central", "numero": "500", "complemento": "Fundos",
      "bairro": "Centro", "municipio": "São Paulo",
      "codigo_municipio": "3550308", "uf": "SP", "cep": "01001000"
    }
  }
}
```

- CRT 1 usa `csosn` (default `102`); CRT 2/3 exige por item `cst` + `aliquota_pct`
  — sem isso, 422 em vez de alíquota chutada.
- `pedido.nome` (2+ caracteres) e `pedido.documento` (11 ou 14 dígitos) são
  obrigatórios: `<dest>` é um `xs:choice` no XSD — sem CPF/CNPJ o XML não fecha.
- Resposta ok: `{ok, chave, protocolo, numero, serie, xml, cstat, xmotivo}`.
- Resposta erro: `{ok:false, codigo, mensagem[, recibo]}`. `LOTE_RECEBIDO`
  significa "lote aceito, recibo pendente" — consultar o recibo é fase futura.

#### `extras` (opcional)

Espelha o `extrasFiscaisSchema` de `lib/schemas/fiscal.ts` — mesmo vocabulário,
mesmos limites. Sem `extras` a nota sai com o que o pedido traz (como sempre).

| Grupo | O que vira no XML |
|---|---|
| `transporte` | `<transp>` (`modFrete`, default `9`), `<transp/transporta>` se houver transportador, `<transp/vol>` se houver volumes |
| `cobranca` | `<pag>` + `<pag/detPag>` (`tPag`, `indPag`, `vPag`) e, com `parcelas > 1`, `<cobr/dup>` |
| `adicionais` | `<infAdic>` — `infCpl` até 5000, `infAdFisco` até 2000 caracteres |
| `entrega` | `<entrega>` (TLocal) com o endereço de entrega e o CPF/CNPJ do destinatário |

Pontos de contrato que **não** estão no pedido e por isso são INFERIDO (marcados
assim no código):

- **Pagamento.** Sem `extras.cobranca`, o sidecar emite `tPag = 99` (outros) +
  `xPag = "Não informada"` em vez de recusar — o pedido não guarda forma de
  pagamento ainda, e travar a venda por isso seria pior. Com `parcelas > 1`,
  `indPag = 1` (a prazo); com 1 parcela, `0` (à vista). Grupo `<card>` /
  `tpIntegra` **não** é emitido (sem dados de terminal).
- **Duplicatas.** `vNF` dividido em N parcelas iguais com **o resto da divisão,
  em centavos, na última** — assim a soma de `vDup` bate exata com `vNF`. É a
  aritmética que o ERP antigo usava (INFERIDO: não há como conferir sem
  rodá-lo). `nDup` = 3 dígitos (`001`, `002`…), `dVenc` = 1º vencimento +
  (i × `dias_entre`), `vPag` = total da nota. **Não** emite `<fat>` (o XSD
  dispensa e o ERP antigo não emitia).
- **Sem formas de pagamento por pedido.** `parcelas`, `primeiro_vencimento`,
  `dias_entre`, `transportadora_nome` e `endereco_entrega` existem **no pedido**
  e poderiam pré-preencher esses extras — fora do escopo desta etapa, decisão
  pendente com o dono do produto.

Validações recusadas antes de abrir o certificado (`VALIDACAO`): forma de
pagamento fora do leiaute, `descricao` faltando com `tPag 99`, `parcelas` fora
de 1..120, `primeiro_vencimento` que não seja `AAAA-MM-DD` válido, `dias_entre`
0..365, transportador sem CPF/CNPJ de 11/14, `entrega` sem logradouro/ número/
bairro/ município/ UF/ código IBGE de 7 dígitos.

### O que acontece na transmissão

1. `make->montaNFe()` e depois `tools->signNFe($xml)` — assina **e** valida
   contra `schemes/PL_009_V4/nfe_v4.00.xsd`. Fora do leiaute vira
   `XML_INVALIDO` apontando o campo, antes de qualquer webservice.
2. Config usa **`schemes`** (plural, não `scheme`) = `PL_009_V4` — é ele que
   decide qual pasta de XSD o `signNFe` lê. `tpAmb` é **integer** no
   JSON-schema do sped-nfe.
3. Envio **síncrono**: 1 nota por lote (`indSinc = 1`), e o protocolo volta na
   mesma resposta (`cStat 104` + `protNFe`) — é o que o app grava.
4. A resposta da SEFAZ é **XML (SOAP)**, nunca JSON: o sidecar parseia com
   `DOMDocument` (o padrão de `ServicoEntrada`). `json_decode` nessa resposta
   é sempre `null`.
5. `cstat` de autorização: `100`/`120`/`150` = uso autorizado (a mesma lista
   que o `Complements::toAuthorize` aceita) → XML protocolado (`nfeProc`).
   Denegadas (`110`, `205`, `301`…) voltam como erro `SEFAZ_XXX`: o app ainda
   não tem status `denegada` no fluxo de emissão.

### POST /cancelar

`{config, certificado_arquivo, certificado_senha, chave, protocolo, justificativa}`
→ `{ok, protocolo_cancelamento}` ou `{ok:false, codigo, mensagem}`.

### POST /carta-correcao

`{config, certificado_arquivo, certificado_senha, chave, correcao, sequencia}`
→ `{ok, protocolo, sequencia, cstat, xmotivo}` ou `{ok:false, codigo, mensagem}`.

- Evento 110110; `sequencia` 1..20 (a ordem de chegada conta, a SEFAZ recusa a 21ª);
- `correcao` de 15 a 1000 caracteres; `cstat` 135 = registrado.
- Mesmo envelope de `/cancelar` (config + certificado no corpo).

### POST /inutilizar

`{config, certificado_arquivo, certificado_senha, serie, numero_inicial, numero_final, justificativa, ano?, modelo?}`
→ `{ok, protocolo, cstat, xmotivo}` ou `{ok:false, codigo, mensagem}`.

- Evento 110111: número que **nunca** virou nota. `justificativa` 15..255;
- `ano` com 2 dígitos (default = ano corrente), `modelo` `55`|`65` (default `55`);
- `cstat` 1002 = inutilização confirmada.
- A validação de colisão (faixa não pode cruzar nota viva nem outra
  inutilização) é do app, antes de chamar aqui.

### POST /danfe

`{xml}` → `{ok, pdf_base64}`. Exige `composer require nfephp-org/sped-da`;
sem ele, `DANFE_INDISPONIVEL` (o app mostra "DANFE indisponível" em vez de 500
mudo).

## Validação na VPS

1. `curl /saude` → `sped_nfe` 5.x.
2. Emitir em **homologação** com certificado de teste → conferir `chave` no
   [portal da NF-e](https://www.nfe.fazenda.gov.br/).
3. `POST /danfe` com o XML → abrir o PDF e conferir itens/totais.
4. Só então trocar `ambiente` para `producao` na tela.

## Ligação com o app

- `lib/fiscal/provedor-spednfe.ts` — cliente HTTP deste contrato.
- `FISCAL_SIDECAR_URL` + `FISCAL_SIDECAR_SECRET` no `.env` (ver `.env.example`).
- Sem URL configurada, o app usa o stub — e diz isso na tela, sem fingir.

### POST /distribuicao

`{config, certificado_arquivo, certificado_senha, ult_nsu}` → `{ok, ultNSU, maxNSU, cstat, xmotivo, aviso, documentos[]}`.

Cada chamada faz até 3 consultas à SEFAZ (até 50 docs cada); o app guarda o
`ultNSU` no banco (`fiscal_entrada_cursor`) e continua daqui no próximo
clique — nunca do zero. `aviso: AGUARDAR_1H` (cStat 137/656) = parar por
1h, senão a SEFAZ bloqueia o CNPJ.

Cada documento: `{nsu, tipo, chave, emitente_cnpj, emitente_nome,
emitente_ie, numero, serie, dh_emi, valor_cents, xml, itens[], cobranca[]}`.
`tipo: resumo` (só capa, sem XML — precisa manifestar) · `completa`
(XML + itens + duplicatas) · `evento` (cancelamento, CC-e… — só avança o
cursor, o app não importa evento).

### POST /manifestar

`{config, certificado_arquivo, certificado_senha, chave, evento,
justificativa?}` → `{ok, cstat, manifestacao}`. Eventos: `210200`
confirmação · `210210` ciência · `210220` desconhecimento · `210240`
operação não realizada (exige justificativa 15+). Sem o XML completo não
há itens — e sem itens não há entrada no estoque: manifestar é o passo
que libera a importação.
