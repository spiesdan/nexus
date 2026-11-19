# Runbook — catálogo do Mercos e o pareamento dos itens

> **Para quê:** trazer o catálogo de produtos do Mercos para `catalog_products` e
> ligar os itens de pedido históricos ao produto certo — **por código, nunca por
> nome**.
>
> **Não é deploy.** Tudo aqui roda contra o banco do ambiente em que você está:
> primeiro em dry-run, depois com `--aplicar`.

## O problema que isto fecha

Medido em produção em 18/11/2026:

| Fato | Número |
| --- | --- |
| itens de pedido com `product_id IS NULL` | **616** |
| códigos distintos entre eles | **72** |
| itens que casariam por nome normalizado | **3** — e de forma ambígua |
| produtos com o mesmo nome ("ESPONJA COM 4 UN") | **2** (códigos 806 e 8147) |

O worker só lia `/pedidos/`. Produto que nunca apareceu num pedido nunca entrava
no catálogo — e o item dele ficava sem vínculo, sem NCM, sem CFPE/unidade na
emissão. O código `411` **existe** no Mercos (`TOALHINHA 5KG`, 2010 itens); o que
faltava era ler `/produtos/`.

## Ordem de execução

```bash
# 0. ambiente: Supabase + credenciais do Mercos no processo
export MERCOS_EMAIL=... MERCOS_SENHA=... MERCOS_EMPRESA=338282
export NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...

# 1. COLETA — grava /tmp/mercos/produtos.jsonl (retomável, não escreve no banco)
node workers/mercos/produtos.mjs --saida /tmp/mercos/produtos.jsonl

# 1b. MEDIÇÃO ativos × inativos — mesma coleta, as duas visões da grade.
#     Cada linha sai com `ativo: true|false`; o banco não é tocado.
node workers/mercos/produtos.mjs --todos --saida /tmp/mercos/produtos-todos.jsonl

# 2. RELATÓRIO — dry-run é o padrão; nada é gravado
node workers/mercos/catalogo.mjs --org <uuid> --arquivo /tmp/mercos/produtos.jsonl

# 3. leia o relatório (/tmp/mercos/catalogo-relatorio.json) e então aplique
node workers/mercos/catalogo.mjs --org <uuid> --arquivo /tmp/mercos/produtos.jsonl --aplicar

# 4. PAREAMENTO dos itens históricos — dry-run
node workers/mercos/parear-itens.mjs --org <uuid>

# 5. leia /tmp/mercos/pareamento-relatorio.json e aplique só o que é por código
node workers/mercos/parear-itens.mjs --org <uuid> --aplicar
```

`catalogo.mjs --coletar` roda o passo 1 antes do 2, se você quiser um comando só.

## O que cada número do relatório significa

**`catalogo-relatorio.json`**

| Campo | O que é | O que fazer |
| --- | --- | --- |
| `criados` | código que não existia no catálogo | nada — é o objetivo |
| `atualizados` | código que já existia | nada — preço/unidade/foto atualizados |
| `divergentes` | linha ilegível (sem nome, preço ilegível, código repetido) **ou** nome diferente do banco | leia `detalhe.nomes_divergentes`: o **nome do banco é preservado** e o do ERP aparece ao lado |
| `sem_codigo` | linha do ERP sem código | a coleta lista `detalhe.sem_codigo_unicos`; produto sem código não entra no catálogo |
| `status` | o que a importação fez com `ativo`: `novos_ativos`, `novos_inativos`, `preservados_ativos`, `preservados_inativos`, `rebaixamentos_bloqueados`, `promocoes_bloqueadas` | `rebaixamentos_bloqueados` são produtos **ativos no banco** que o ERP hoje lista como inativos: o import **não desativa**. Decida um a um; não force pelo importador |

**`pareamento-relatorio.json`**

| Campo | Aplicado? | O que é |
| --- | --- | --- |
| `pareados_por_codigo` | **sim** (com `--aplicar`) | `produto_codigo` igual ao `codigo` do catálogo |
| `candidatos_por_zero` | **não** | casa só tirando zeros à esquerda (`411` × `0411`) |
| `candidatos_por_nome` | **não** | nome normalizado igual ao de **um** produto |
| `ambiguos` | **não** | nome igual ao de **vários** — o caso 806 × 8147 |
| `codigos_sem_produto` | — | a lista de compras: rode a coleta e o catálogo de novo |

**Regra dura:** só `pareados_por_codigo` é escrito. Os outros três exigem
confirmação humana, com o `itemId` e os `candidatos` no relatório. Aplicar nome
automaticamente escolheria o NCM de um produto no lugar do outro — erro fiscal.

## Segurança e reversão

- `--aplicar` do pareamento usa `.is("product_id", null)`: **nunca sobrescreve**
  vínculo existente (nem o manual).
- O relatório grava `detalhe.pareados` (item → produto), então desfazer é
  `update ... set product_id = null where id in (...)` — com a lista em mãos.
- Produtos criados nascem com `origem = 'mercos'`; para desfazer a importação
  inteira, `delete from catalog_products where organization_id = ... and origem
  = 'mercos'` — **depois** de conferir que nenhuma nota depende deles.
- O coletor não escreve no banco; se ele falhar no meio, o JSONL é reescrito na
  próxima execução.

## Divergências conhecidas

- **Cabeçalho ilegível:** se a grade do Mercos não tiver `<thead>` reconhecível,
  o coletor cai nas posições do extrator legado (`2/3/7`) e marca cada linha com
  `cabecalho_lido: false`. O relatório mostra `faltando_no_cabecalho`.
- **Foto:** o ERP só preenche `imagem_url` quando o produto **não tem** foto. Foto
  curada não é sobrescrita.
- **Produto inativo no ERP:** a grade padrão é `?status=1` (ativos); inativos
  são `?status=2`; `?status=0` mistura os dois. **`?situacao=inativos` não
  filtra nada** — medido em 19/11/2026, devolve a mesma grade de ativos. Por
  isso a medição usa `--todos`, que percorre as duas visões e grava
  `ativo: true|false` em cada linha.
- **`ativo` de produto existente nunca é sobrescrito pelo importador:** linha
  inativa não rebaixa produto ativo; linha ativa não promove produto inativo.
  Produto **novo** nasce com o status da coleta (o modo `--todos` cria inativo
  já desligado). A regra está em `resolverAtivoNoUpsert` e é provada em
  `tests/unit/mercos-catalogo.test.ts`.

## A coleta de 18/11/2026 — rota errada, coleta zero, exit 0

O primeiro dry-run em produção voltou **zero** e o log dizia sucesso:

```json
{"evento":"login","ok":true}
{"evento":"cabecalho_incompleto","cabecalho":[],"faltando":["codigo","nome"],"plano_b":{...}}
{"evento":"fim","produtos_lidos":0,"paginas":0,"cabecalho_lido":false}
```

Duas causas, as duas medidas dentro do `crm-mercos-1`:

1. **A rota não é `/<empresa>/produtos/`.** Ela responde **HTTP 404** — e o
   `goto` do Playwright **não lança** em 404: a página de erro tem `<h1>` e
   texto, o `querySelector("table")` devolve `null`, e o laço termina na primeira
   página sem linha. A rota real desta instalação é
   **`/industria/<empresa>/produtos/`**, que é para onde o link "Produtos" do
   menu autenticado aponta (`/distribuidor/…` em outras contas — por isso ela é
   **descoberta no menu**, não chutada).
2. **Zero não era falha.** `produtos_lidos: 0` saía com **exit 0**.

### O que mudou

- `rotasDoCatalogo()` (em `catalogo-logica.mjs`): a primeira candidata é a rota
  do menu; as fixas ficam como rede. Cada tentativa vira o evento
  `rota_tentada` com **HTTP e número de linhas**.
- `motivoDoVazio()`: `paginas === 0` → `"nenhuma pagina lida"`; página lida com
  zero linha → `"pagina lida, nenhuma linha utilizavel"`. Os dois imprimem
  `sem_catalogo` e saem com **exit 1** (o motivo é separado porque a ação de quem
  lê o log é diferente).

### A coleta real (mesma instalação, 18/11/2026)

```console
$ docker exec -w /app/_mercos-fix/workers/mercos crm-mercos-1 node produtos.mjs
{"evento":"rota_tentada","url":"https://app.mercos.com/industria/338282/produtos/","http":200,"linhas":15}
{"evento":"fim","produtos_lidos":601,"paginas":41,"cabecalho_lido":true,"faltando_no_cabecalho":[],"ok":true}
EXIT=0
```

**601 produtos em 41 páginas** (15 por página, a última com 1 — paginação sem
sobreposição, conferida), cabeçalho lido por inteiro (`Código`, `Nome`, `IPI`,
`Unidade`, `Comissão`, `Preço de Tabela`). Classificação pelo `classificarLinhas`:

| | quantos | o que significa |
| --- | --- | --- |
| válidos | **433** | código + nome + preço legível |
| sem código | **162** (27%) | a célula é `<td><span></span></td>` — o produto existe no ERP e não tem código |
| divergentes | **6** | código repetido no lote (ex.: `480` em dois produtos diferentes; vale a última, como o relatório declara) |

O **cabeçalho real** (`Código/Nome/IPI/Unidade/Comissão/Preço de Tabela`) casa
exatamente com o plano B do legado (`2/3/4/5/6/7`) — o que confirma que a
posição antiga estava certa **para esta tela**; o que quebrou foi a rota.

### Dry-run do catálogo (read-only, `aplicado: false`)

```json
{"lidos":601,"validos":433,"criados":0,"atualizados":433,"divergentes":13,"sem_codigo":162,"gravados":0}
```

Nenhum produto novo: os 433 códigos já existiam no catálogo (vieram dos itens de
pedido). O que a coleta passa a trazer é **preço, unidade, comissão e foto** —
7 dos 433 têm nome diferente do banco e o **nome do banco é preservado**.

## Ativos × inativos — medição de 19/11/2026 (`--todos`)

Executado dentro do `crm-mercos-1`, sem `--aplicar`: o coletor só grava JSONL.

| | ativos (`status=1`) | inativos (`status=2`) |
| --- | ---: | ---: |
| linhas | **601** | **246** |
| páginas | 41 | 17 |
| com código | 439 | 198 |
| sem código | 162 | 48 |
| códigos distintos | 433 | 197 |

- **8 códigos aparecem nas duas visões**: o ERP guarda dois registros com o
  mesmo código (um ativo e um inativo — ex.: `875`). O `classificarLinhas`
  resolve a duplicata pelo registro **ativo**, que é o canônico: o inativo não
  sobrescreve preço/nome do produto da grade padrão. Os 8 são `origem=mercos`.
- Dry-run (`catalogo.mjs`, sem `--aplicar`): **55 criados** (todos inativos),
  **567 atualizados**, `preservados_ativos: 433`,
  `rebaixamentos_bloqueados: 134`, `promocoes_bloqueadas: 0`, `gravados: 0`.
- Dos **134 rebaixamentos bloqueados**, 109 casam com produto
  `origem=odivix` e 25 com `origem=mercos`. São produtos que o ERP hoje lista
  **só** como inativos e que continuam ativos no nosso catálogo até decisão
  humana — é exatamente o que a regra promete.
- **Nenhum produto novo nasceu ativo** (`novos_ativos: 0`). Antes, o upsert
  gravava `ativo: true` para todo criado, inclusive para o inativo do ERP.

### O que continua aberto (medido em 19/11/2026)

O pareamento segue com **616 itens sem produto**, em **72 valores distintos** de
`produto_codigo`. A fila citava 69; a medição de agora dá 72 e **nenhum** dos 72
casa exatamente com `catalog_products`. O comando abaixo é a autoridade — o
número envelhece quando o catálogo muda.

Dos 72 valores:

- **31 são códigos numéricos** (234 itens). O `--todos` traz **22** deles —
  **194 dos 616 itens** — e **todos vêm da visão de inativos**. O modo default
  (só ativos) trazia **zero** destes.
- **9 códigos numéricos** (40 itens) não existem em nenhuma das duas visões:
  `08, 80, 98, 374, 509, 603, 674, 711, 712`. Ou foram excluídos no ERP, ou o
  `produto_codigo` do item histórico está errado.
- **41 valores são nomes de produto** (382 itens), não códigos — ex.:
  `LAVA ROUPAS COM BICARBONATO 5L LOURO` (157 itens), `BILLCAP R2 50 LT` (39).
  Não há identidade por código; preencher `produto_codigo` no ERP/planilha é o
  caminho. Casar por nome escolheria o NCM errado (o caso 806 × 8147).

**Decisão do dono:** criar os 55 inativos (inclui os 22 códigos históricos) e
rodar `parear-itens.mjs`. O pareamento lê o catálogo **sem filtrar `ativo`**,
então produto inativo pareia igual — e o importador não reativa nem desativa
produto existente.

Os **210 sem código** da coleta (162 ativos + 48 inativos) são a mesma família:
sem código não há identidade (`(organization_id, codigo)` é o índice único),
então eles aparecem no relatório por nome e **não** entram no catálogo.
Preencher o código no ERP é o caminho; inventar identidade no importador, não.
