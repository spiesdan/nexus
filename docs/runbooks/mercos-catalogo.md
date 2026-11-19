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
- **Produto inativo no ERP:** a grade padrão é a que o operador vê. Produto
  desativado lá não é desativado aqui — `ativo` do banco é preservado.

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

### O que continua aberto (e não é do coletor)

O pareamento dos itens históricos (`parear-itens.mjs`, dry-run) segue com
**616 itens sem produto**, em **72 códigos**: **3** deles têm produto; **69 não**.
Esses 69 códigos **não estão na grade ativa do ERP** — e a tela só lista ativos
(o menu de exportação separa "apenas produtos ativos" de "todos os produtos",
então o ERP guarda inativos que a grade não mostra). **Decisão do dono do
catálogo**, com aceite: rodar a exportação "todos os produtos" e cruzar os 69;
se aparecerem, decidir se produto **inativo** entra no nosso catálogo (o upsert
preserva `ativo` do banco, então importar inativo não desativa nada aqui).

Os **162 sem código** são a mesma família: sem código não há identidade
(`(organization_id, codigo)` é o índice único), então eles aparecem no relatório
por nome e **não** entram no catálogo. Preencher o código no ERP é o caminho;
inventar identidade no importador, não.
