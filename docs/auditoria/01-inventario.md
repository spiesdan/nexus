# Fase 1 — Inventário rastreável

> Regido por `docs/auditoria/PROMPT-MESTRE-AAA.md` (autoridade sobre qualquer `.md`).
> Medido em **15/11/2026** no checkout `docs/auditoria-aaa`. Todo número daqui sai de
> comando; se divergir do código, o comando está certo e este texto envelheceu.

## 1. Os artefatos desta fase — todos gerados

| Arquivo                                                  | O que mede                                                              | Comando                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| [`inventario-rotas.md`](inventario-rotas.md)             | telas, resolvers, APIs, layouts, estados, especiais                     | `pnpm exec tsx scripts/auditoria/inventario.ts`          |
| [`02-reconciliacao-rotas.md`](02-reconciliacao-rotas.md) | 156 rotas do prompt × código                                            | `pnpm exec tsx scripts/auditoria/reconciliar-rotas.ts`   |
| [`04-inventario-dados.md`](04-inventario-dados.md)       | tabelas, views, funções, RLS, políticas — em 3 fontes                   | `pnpm exec tsx scripts/auditoria/inventario-dados.ts`    |
| [`05-componentes.md`](05-componentes.md)                 | 242 componentes por diretório e tipo                                    | `pnpm exec tsx scripts/auditoria/inventario-completo.ts` |
| [`06-apis.md`](06-apis.md) · `06-apis.json`              | 418 handlers: métodos, guarda, validação, efeitos                       | idem                                                     |
| [`07-integracoes.md`](07-integracoes.md)                 | integrações, 16 workers, 30 crons, serviços, env                        | idem                                                     |
| [`08-mobile-offline.md`](08-mobile-offline.md)           | Capacitor, service worker, fila offline, SQLite                         | idem                                                     |
| [`09b-subtelas.md`](09b-subtelas.md)                     | Abas, modais e gavetas por tela — o que a matriz de rotas não vê (F-22) | `pnpm exec tsx scripts/auditoria/subtelas.ts`            |
| [`09-telas-estados.md`](09-telas-estados.md)             | 156 telas × 12 estados (sinal no código)                                | idem                                                     |
| [`10-cobertura-testes.md`](10-cobertura-testes.md)       | teste por rota                                                          | idem                                                     |

## 2. Medidas de cabeçalho

| Medida                              | Valor                                                                                                                                  | Fonte                                                                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telas (`page.tsx`)                  | **156**                                                                                                                                | `find app -name page.tsx`                                                                                                                                                             |
| Resolvers (redirecionam sem JSX)    | 13                                                                                                                                     | `inventario.ts`                                                                                                                                                                       |
| Handlers de API                     | **418** = 416 em `app/api` + 2 fora (`/auth/confirm`, `/icone-512`)                                                                    | `find app -name route.ts`                                                                                                                                                             |
| Layouts                             | 13                                                                                                                                     | `inventario.ts`                                                                                                                                                                       |
| Componentes                         | **242** (19 em `components/ui`)                                                                                                        | `inventario-completo.ts`                                                                                                                                                              |
| Workers                             | 16                                                                                                                                     | `workers/*.ts`                                                                                                                                                                        |
| Rotas de cron                       | 30                                                                                                                                     | `app/api/**/cron/**`                                                                                                                                                                  |
| Migrations                          | 292 (10 são stub)                                                                                                                      | `supabase/migrations`                                                                                                                                                                 |
| Tabelas criadas pelo `baseline.sql` | **180** (179 em `public` + `private.app_secrets`) · **RLS em 179 de 179** de `public` · **305 políticas** (300 `public` + 5 `storage`) | medido em Postgres descartável — [`12-migrations-e-rls.md`](12-migrations-e-rls.md). A linha antiga (`142 com RLS`) era contagem de TEXTO e subestimava: o baseline liga RLS por laço |
| Arquivos de teste                   | 1.121                                                                                                                                  | `git ls-files`                                                                                                                                                                        |

**156 `page.tsx` = 143 telas com JSX + 13 resolvers**, e o prompt lista **156 rotas**. Os 13
resolvers são caminhos que existem e redirecionam (`page.tsx` sem JSX) — a reconciliação os
separa em vez de contá-los como tela. Ver `02-reconciliacao-rotas.md`: **0 rotas do prompt
ausentes, 0 acréscimos**.

> **Isto prova cobertura de ROTAS, não auditoria de telas.** Que toda rota do prompt tenha
> arquivo não diz que cada subtela (aba, drawer, modal), cada estado (vazio, erro, permissão
> negada, salvando) e cada jornada foi vista funcionando. Em 2026-11-16, **37 de 156 telas** tinham
> captura em navegador (**57 arquivos**: 37 rotas em desktop + as mesmas 20 rotas em celular — 57 =
> 37 + 20, e as 20 são subconjunto das 37). A versão anterior dizia "42 telas", soma que não fecha
> com arquivo nenhum. A correção da alegação está em
> [`PROMPT-MESTRE-AAA.md`](PROMPT-MESTRE-AAA.md) § Fase 1.

## 3. Achados da Fase 1

### F-09 · P0 · A cadeia de migrations **não é reaplicável**

| Evidência                                                         | Valor                                                                                                                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrations aplicadas em ordem num Postgres limpo                  | **35 de 292** — schema parcial: **2 tabelas** em `public`, 0 políticas                                                                                                        |
| Migrations que falham                                             | **257 de 292** — **todas** por pré-requisito ausente; **0** por SQL inválido                                                                                                  |
| Falhas que citam um objeto que **existe** no `baseline.sql`       | **257 de 257** (prova cruzada objeto a objeto)                                                                                                                                |
| Objetos distintos ausentes                                        | **71** (os mesmos 71 derrubam 257 migrations em cadeia; o texto cru do erro dava 81 porque 10 nomes vinham sem schema e repetiam um objeto já citado qualificado)             |
| Objetos que só o `baseline.sql` cria                              | **1.023** (177 tabelas de `public` + `private.app_secrets`, 104 triggers, 74 funções de `public` + `private.fn_oauth_key()`, 305 políticas, 180 tipos, 2 views, 2 sequências) |
| Migrations que são stub (`SELECT 1;`, "applied via Supabase MCP") | **10** — `0001`–`0009` e `0013`                                                                                                                                               |

> O número já esteve **258** e acusava as migrations 0014/0017/0025 de quebradas. Não estavam:
> eram lacunas do preâmbulo do instrumento, e o relatório detalhado delas (com a correção) está
> em [`12-migrations-e-rls.md`](12-migrations-e-rls.md) § 1. Medida que muda quando o instrumento
> melhora tem de ser registrada com a mudança, não apagada.

Primeiro erro: `relation "public.contacts" does not exist`. As fundações
(`platform_base`, `event_log`, `customer_360`, `whatsapp_waha`, `ai_rag`, `nuvemshop_lgpd`,
`security_hardening`, `onboarding`, `messaging_constraints`, `ai_faq_items`) foram
aplicadas direto no projeto Supabase e **nunca entraram no repositório** — o arquivo
ficou com `SELECT 1;` para constar. Tudo que vem depois faz `alter table` em cima de
tabela que a migration anterior não cria.

**Consequência medida, no estado em que o achado foi aberto:** `package.json` declarava
`db:reset` = `supabase db reset`, e o `db:migrate` era um placeholder cujo próprio TODO dizia
_"wire supabase db push"_. Quem seguisse qualquer um dos dois recebia um banco que **parece**
migrado (as migrations existem, rodam, e a maioria falha em silêncio com `ON_ERROR_STOP=0`) e
não é. O caminho do self-host (`baseline.sql` via `install.sh`/`update.sh`) está correto — é o
único que está.

Reprodução: `bash scripts/auditoria/replay-migrations.sh` — versões, comandos e saída completa em
[`12-migrations-e-rls.md`](12-migrations-e-rls.md) e em `evidencias/replay-migrations/`.
Collateral desta frente, medido e corrigido: **F-09a** (`db:migrate` saía com sucesso sendo
placeholder), **F-16** (contagem textual de RLS errada), **F-17** (73 tabelas tenant-aware sem
prova de isolamento), **F-18** (`&& exit 0` sem gate).

**Feito nesta frente (F-09a):** `db:migrate` deixou de ser placeholder — aplica o
`baseline.sql` com `ON_ERROR_STOP=1` e verifica o resultado, saindo 1 quando o schema não está
lá (`scripts/db/aplicar-schema.sh`). O `scripts/deploy.sh` parou de chamá-lo com `|| true`.

**E `db:reset` deixou de aplicar a cadeia (16/11).** Agora é
`scripts/db/resetar-schema.sh`: derruba `public` e `private` (e as três extensões que vivem em
`public`), restabelece o DEFAULT ACL do Supabase **antes** de aplicar — senão as funções do corpo
do baseline nascem com grants diferentes do banco do cliente —, aplica o `baseline.sql` pelo mesmo
script do `db:migrate` e verifica. Medido em Postgres 15 descartável: 179 tabelas / 300 políticas
antes e depois, tabela de lixo apagada, ACL de funções **idêntica** ao install puro (288 funções,
diff vazio), duas execuções seguidas verdes, e recusa a host não-local sem `--forcar`. Gate:
`tests/unit/db-reset-aplica-baseline.test.ts`.

**Continua aberto (Fase 10, P0):** a cadeia de migrations em si não reproduz o schema — e é ela
que o `supabase db push` aplica. Duas saídas honestas: (a) escrever as 10 migrations fundacionais a
partir do `baseline.sql` com `create table if not exists` + RLS idempotentes, para que a cadeia
reproduza o schema; ou (b) declarar em `docs/` que migrations são **registro histórico**, não
caminho de instalação, e impedir o `db push`. O produto já não depende dela (`install.sh`/
`update.sh` e os scripts `db:*` usam o baseline); o diretório continua perigoso para quem seguir o
caminho "normal" do Supabase.

### F-10 · Alta · Marca de cliente embarcada no shell nativo

`capacitor.config.ts` declara `appName: "Bill Higiene"`. Esse é o nome que aparece
**debaixo do ícone no aparelho** — alcança o usuário final, que é exatamente o que
`AGENTS.md` proíbe. E nenhum gate vê: `tests/unit/branding.test.ts` varre
`app|components|lib|workers|hooks` com o padrão do **nome legado do produto**;
`capacitor.config.ts` está na **raiz** e o nome é de **revendedor**.

Não corrigido nesta fase (mudar `appId` quebraria a identidade de app já publicado;
mudar `appName` só é seguro com decisão de qual nome cada instalação deve mostrar).

### F-11 · Média · Documentação conta rotas erradas

`AGENTS.md` afirma **"166 route handlers REST — 169 contando `app/api/**`"**. Medido:
**416** em `app/api` e **418** no total. A afirmação está errada por ~2,5×, e o
`AGENTS.md` é o contrato que todo agente lê primeiro. Corrigido no mesmo commit deste
inventário, com o comando ao lado do número.

### F-12 · Média · `Idempotency-Key` em 2 de 418 handlers

O contrato promete idempotência nos POSTs de criação; o código entrega em **2**.
Duplicar pedido por retry de rede é o defeito que isso previne.

### F-13 · Baixa · "Pública" ≠ "sem guarda"

**0** handlers ficaram sem marcador de autenticação — mas isso não é elogio, é medida
fraca: o detector conta a **menção** a um mecanismo (`requireRole`, `loadAuthUser`,
`Bearer`, HMAC), não a correção dele. Rotas públicas de borda (`/api/v1/health`,
`/cron/*`, `/webhooks/*`, callbacks OAuth) aparecem como _"pública (auth na rota)"_
porque estão em `lib/auth/public-paths.ts` — três delas foram conferidas à mão
(Bearer + `timingSafeEqual`). A verificação de authz por rota é Fase 2.

### F-14 · Média · 97 de 156 telas sem nenhum sinal de teste

"Sem sinal" = nenhum teste na pasta e a rota não aparece como string em teste algum.
Não prova ausência de cobertura (pode haver teste de componente que não cita a rota),
mas é o teto do que se mede sem executar. Lista completa em `10-cobertura-testes.md`.

> Era **98** quando a Fase 1 fechou; virou **97** quando o V-01 acrescentou
> `tests/unit/titulos-de-rota.test.ts`, que lê o disco e toca todas as telas. O número cai
> porque o instrumento mudou, não porque alguém cobriu uma tela — vale registrar a diferença em
> vez de reescrever o passado.

### F-15 · Corrigido · O offline da Fase 0 estava errado

A Fase 0 registrou que o service worker "não existe". Existe: `public/sw.js`, 109 linhas,
registrado em `app/app/_components/RegistrarServiceWorker.tsx`. Registro dentro de
`00-linha-de-base.md` §5, com a correção datada.

### F-19 · Corrigido · `pnpm test:shell` vermelho no macOS por `load_env` incompatível com bash 3.2

`pnpm test:shell` terminava vermelho: **245 ✓ e 1 ✗** em `hostgator-setup-kit/test-validators.sh`:

```
✗ nome antigo com apóstrofo  esperava [Sant'Ana Odontologia] obteve [Sant"'"Ana Odontologia]
```

**A primeira leitura foi errada, e fica registrada porque o mecanismo do erro é reutilizável:**
como a mesma asserção, reproduzida "isolada", devolvia o valor certo, concluí que fosse
contaminação de estado entre seções da suíte. Não era — e a reprodução isolada mentia por um
motivo medido depois: ela rodava no **zsh** (o shell desta ferramenta), não no bash. Mesmo
`_common.sh` **antigo**, mesmo fixture, trocando só o interpretador:

| Interpretador                                   | `load_env` devolve                                  |
| ----------------------------------------------- | --------------------------------------------------- |
| `zsh`                                           | `Sant'Ana Odontologia` — certo, por acidente do zsh |
| `bash 3.2.57` (é o que o `pnpm test:shell` usa) | `Sant"'"Ana Odontologia` — **errado**               |

Um instrumento que roda em outro interpretador mede outro universo — o mesmo defeito de método que
produziu o falso achado das migrations 0014/0017 (F-09a). Rodando a suíte de verdade, com `bash -x`,
e lendo o `val=` dentro do `load_env`, o defeito aparece em uma linha: a troca que desfaz o escape
antigo terminava com `Sant"'"Ana` — os três caracteres `"'"` no lugar de uma aspa.

A causa é a linha do `load_env` que pedia a troca de `'\\''` por `'` **com o replacement entre
aspas** (`${val//"'\\''"/"'"}`). O **bash 3.2 — o `/bin/bash` do macOS — não remove as aspas do
replacement** em `${var//padrão/replacement}` e insere os três caracteres `"'"`; o bash 5 (Linux,
a VPS do cliente) remove e faz o certo. Medido lado a lado, mesma entrada, mesmo script:

| Bash                                            | `load_env` **antigo**                             | `load_env` **corrigido**         |
| ----------------------------------------------- | ------------------------------------------------- | -------------------------------- |
| 3.2.57 (macOS — é este gate rodando localmente) | `Sant"'"Ana` / `se"'"nha com espaço` — **errado** | `Sant'Ana` / `se'nha com espaço` |
| 5.x (`docker run bash:5` — a VPS do cliente)    | `Sant'Ana` / `se'nha com espaço`                  | `Sant'Ana` / `se'nha com espaço` |

As quatro células foram executadas com o `load_env` **real** (`. ./_common.sh` + `load_env`
apontando para o fixture do teste), não com uma reescrita do trecho: `bash -c` para o 3.2 e
`docker run --rm bash:5` para o 5. A linha que estava errada é a do macOS **com o código antigo** —
por isso o gate local reprovava e a VPS nunca viu o defeito.

**Correção** (`hostgator-setup-kit/_common.sh`, ramo de aspas simples do `load_env`): padrão e
replacement passam a vir de variáveis, com o replacement **sem aspas** — forma em que os dois bash
concordam:

```bash
local aspa_legada="'\\''"
local aspa_nova="'"
val="${val//"$aspa_legada"/$aspa_nova}"
```

Provas executadas: `bash -n` limpo no bash 3.2; `load_env` devolve `Sant'Ana Odontologia` e
`se'nha com espaço` nos **dois** bash; e `pnpm test:shell` fecha **395 ✓, 0 ✗, "todos os
validadores passaram"**, exit 0.

Por que importa: é o **único gate** do kit de instalação (`AGENTS.md` § Packaging), e o defeito
que ele vigia — apóstrofo no nome da loja quebrando todo comando `docker compose` — é real
(`install.sh:510-516`). Aqui o gate estava **certo**; a leitura do defeito é que estava errada.

### F-20 · Corrigido · A matriz de telas × estados media o `page.tsx`, não a tela

`09-telas-estados.md` saiu com **156 linhas e as 12 colunas de estado em `—`** em quase todas —
e `error.tsx = ✓` em **156 de 156**. Lido como produto, dizia "nenhuma tela trata carregamento,
vazio, erro, permissão, formulário, filtro ou tabela". Eram três defeitos do instrumento, todos
mecânicos:

| Defeito                                                                | Medida                                                                          | Efeito                                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| O texto vinha só do `page.tsx`                                         | **89 das 156** telas delegam a UI a `_client.tsx`/`_components/` na mesma pasta | `/app/pedidos` tem filtro, tabela e confirmação no `_client.tsx` e saía `—` nas três                         |
| `loading.tsx`/`error.tsx` eram procurados no segmento **ou em `app/`** | existe **um** `app/error.tsx` global                                            | as 156 linhas ganhavam ✓ pelo mesmo arquivo; a coluna dizia "o app tem fallback", não "esta tela trata erro" |
| O regex rodava **dentro dos comentários**                              | este repo escreve parágrafos citando "erro", "vazio", "nenhum"                  | `vazio` 137/156, `gráfico` 67/156, `filtros` 118/156 — inflados por prosa, não por código                    |

**Correção** (`scripts/auditoria/segmento-de-rota.ts` + `inventario-completo.ts`):

1. o texto vem do **segmento de rota** — `page.tsx` + irmãos + subpastas **sem** `page.tsx` próprio
   (`pedidos/[id]`, `novo` e `imprimir` são outras telas e ficam de fora);
2. segue **imports relativos** até 5 níveis: `/app/radar/risco` é `return <RiscoDoRadar/>`, e o
   componente mora em `../_components/secoes/Risco` — sem seguir, a tela não tinha estado nenhum;
3. imports `@/…` entram **um salto, sem recursão**: o formulário compartilhado aparece, o botão
   base que ele usa não contamina as outras telas;
4. comentários são removidos antes da busca — **string e JSX ficam**, porque "Nenhum pedido
   encontrado" é sinal real;
5. `loading`/`error` distinguem **`próprio`** de **`herdado`** de **`—`**.

Medido depois, mesmo commit:

| Coluna             | Antes                            | Depois                                                                           |
| ------------------ | -------------------------------- | -------------------------------------------------------------------------------- |
| telas com ≥1 sinal | 0 de 143 (todas em `—`)          | **143 de 143**                                                                   |
| `filtros`          | 118/156 (inflado por comentário) | **69/156**                                                                       |
| `gráfico`          | 67/156                           | **7/156**                                                                        |
| `vazio`            | 137/156                          | **95/156**                                                                       |
| `error`            | ✓ em 156 (arquivo global)        | `herdado` em 156 — o dado correto: existe fallback global, nenhuma rota fica sem |

Gate: `tests/unit/matriz-telas-le-segmento.test.ts` (11 casos) usa fatos reais do repo — que
`/app/pedidos` inclui `_client.tsx` e exclui `[id]`/`novo`/`imprimir`, que `/app/radar/risco`
alcança o componente de `_components`, que `app/error.tsx` é `herdado` e não `próprio`, e que
`//` dentro de uma URL não é comentário. Um inventário que erra para "vazio" autoriza a conclusão
de que não há nada a corrigir — por isso a regra fica vigiada.

### F-21 · Corrigido · O lote de captura registrou "149 telas não abrem" quando quem caiu foi o servidor

`docs/auditoria/capturas/medicoes-completo-tenant.json` guarda **168 medições** (84 rotas × 2
larguras): **19 com PNG e 149 com `erro`**. A leitura ingênua é "149 telas quebradas". Medido,
eram 149 `ERR_CONNECTION_REFUSED` / `ERR_EMPTY_RESPONSE` no mesmo `http://localhost:3011` — o
processo do Next morreu no meio do lote, e o instrumento continuou tentando rota após rota,
gravando a queda como se fosse defeito de cada tela. As primeiras 19 (medidas antes da queda)
estão boas; as 149 seguintes nunca chegaram a ser vistas.

É o **mesmo defeito de método** do F-20 e do F-09a: o instrumento não distingue "o objeto não
tem a propriedade" de "o instrumento não olhou". Três correções em
`scripts/auditoria/captura-visual.mjs`:

1. **espera o servidor antes de começar** (poll em `/login` por até 120 s, sai 1 se não subir);
2. **reconhece queda e repete uma vez**, registrando `reconexoes` por rota — se o servidor voltou,
   a rota é medida de verdade; se não voltou, o erro fica com o motivo certo;
3. `--faltantes`, que lê a matriz, remove o que já tem PNG e **pula rota dinâmica com motivo
   escrito** (`rota dinâmica sem fixture (id/token real)`) — capturar `/app/pedidos/[id]` sem id
   mede a tela de não-encontrado e vira "tela vazia" no relatório.

O JSON antigo fica no repositório com o defeito visível, e esta nota é a chave de leitura.

### F-22 · Corrigido · A matriz dizia "esta tela tem abas" e não sabia o nome de nenhuma

`09-telas-estados.md` marca a coluna `abas` quando encontra `<Tabs|TabsList|TabsTrigger` no
segmento da rota, e `modal/drawer` quando encontra `<Dialog|Sheet|Drawer|Modal`. Isso responde
**se** a tela tem subtela, e não **qual**. Consequência medida: a matriz podia marcar ✓ em 26
arquivos com `Tabs` e **nenhuma** aba tinha nome — e auditoria que não sabe o nome da aba não
consegue abri-la. Na prática, "tem aba" virava "não olhei a aba".

Medido no repositório em 16/11/2026: `Dialog` em 53 arquivos, `Sheet` em 13, `Tabs` em 26 (17
telas distintas), `Drawer` em 0.

`scripts/auditoria/subtelas.ts` passou a enumerar, por tela, **aba**, **modal** e **gaveta** com
rótulo, arquivo e linha, a partir do mesmo segmento de rota (page + arquivos locais + imports
relativos). Resultado: **99 abas, 68 modais, 12 gavetas** em 156 telas, **56** delas com ao menos
uma subtela. Artefato: [`09b-subtelas.md`](09b-subtelas.md).

O extrator errou duas vezes antes de servir, e as duas viram caso de teste em
`tests/unit/subtela-tem-nome.test.ts` (8 casos):

1. **caminho absoluto devolvia zero arquivo.** `arquivosDaTela(raiz, pasta)` faz `join(raiz,
pasta)`; passar a pasta absoluta devolveu **0 abas em 156 telas** — e o artefato saiu vazio
   sem erro nenhum. Zero silencioso é o jeito mais fácil de um inventário mentir.
2. **`className` virou rótulo.** A primeira execução listou como aba o texto
   `# / ml-1.5 text-[10px]`. O rótulo passou a vir de `t("…")` / texto do JSX, com `className`
   removida antes; rótulo montado em laço é dito `(rótulo dinâmico)` em vez de inventado.

O mesmo extrator conta `<Dialog>`/`<Sheet>`/`<Drawer>`/`<AlertDialog>` **sem o `Title`
correspondente**: o Radix anuncia "diálogo" sem nome e o leitor de tela não diz o que abriu. É a
mesma classe da V-15. Medido: **0** sem título — e confirmado por fora, com `grep`
(`<Dialog>`=61 / `<DialogTitle>`=63, `<Sheet>`=15/15, `<AlertDialog>`=7/7), para o gate não
depender só do próprio extrator.

### F-23 · Contido (correção estrutural pendente) · A suíte E2E sobrescreve fixture de teste unitário

Medido em 16/11/2026, ao rodar `pnpm test:e2e:full`: **149 arquivos versionados** sob `evidence/`
foram reescritos por specs (capturas de tela e JSONs de turno). Três testes de
`tests/unit/projecao-conversador.test.ts` reprovaram em seguida — e o motivo não é o produto:

```
controle: o payload real deve conter o erro cru:
expected '[]' to contain 'unsafe_url:https_required'
```

`projecao-conversador` lê `evidence/ia-360-w4/medicao-vazamento/turnos/*.json` como **fixture
real** — e o `git diff` do turno que ele usa mostra `444 → 8 linhas`: a suíte E2E o substituiu
por um turno vazio. Uma rodada de E2E corrompe a fixture de um teste unitário, e o vermelho
aparece no lugar errado ("a projeção do Conversador quebrou").

É o mesmo defeito de método das F-20/F-21 um nível acima: **o artefato de evidência e a fonte de
verdade do teste moram no mesmo caminho**. Enquanto forem o mesmo diretório, "rodar a suíte" muda
o que os testes leem — e quem commitar o resultado do E2E commita a corrupção.

Nesta rodada os 149 arquivos foram **revertidos** (`git checkout -- evidence` + `loop/checkpoints/evidence`)
e o teste voltou a **20/20 verde**. A correção estrutural — gravar em `evidence/<rodada>/` ou em
`test-results/`, deixando `evidence/` imutável — fica como recomendação com dono: mexer no caminho
de gravação de dezenas de specs exige passar por cada uma.

Regra para quem repetir esta auditoria: **antes de commitar, `git status evidence/` tem de estar
vazio.** Se não estiver, o que está lá não é melhoria de evidência — é estado de execução.

## 4. Cobertura do checklist

| #    | Tarefa                                                                                                                                                         | Estado | Evidência                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Rotas e telas (páginas, layouts, públicas, autenticadas, admin, dinâmicas, redirects, resolvers, erro, instaláveis)                                            | `[x]`  | `inventario-rotas.md` — 156 telas, 13 resolvers, 13 layouts, **6** fronteiras de erro (5 `error.tsx` + `global-error.tsx`), **8** `loading` + `not-found`, 2 especiais (`icon.tsx`, `manifest.ts`). Sem `template.tsx` e sem `default.tsx` (não há rotas paralelas)                                                                                                                                                                                                                                                                                                                                         |
| 1.2  | Subtelas e estados                                                                                                                                             | `[~]`  | `09-telas-estados.md` — 12 estados × 156 telas no **segmento de rota** (page + `_client` + `_components` + imports locais): 143/143 telas com JSX têm ao menos um sinal. **Subtela agora tem nome** (F-22): `09b-subtelas.md` enumera **99 abas**, 68 modais e 12 gavetas com arquivo e linha (`09b-subtelas.json`, medido). Em execução: **129 das 155 rotas estáticas** abertas em build de produção, em desktop e celular (258 medições, `11-auditoria-visual.md` §3); as **26 dinâmicas** ficam fora com motivo escrito. **Continua `[~]`**: enumerar subtela não é abri-la, e as 99 abas **foram** clicadas depois pela varredura de subtelas (85 medidas em 390/834) — é o que falta para `[x]` |
| 1.3  | Componentes                                                                                                                                                    | `[x]`  | `05-componentes.md` — 242 arquivos, 19 primitivas `ui/`, tipo por área                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 1.4  | APIs (handlers, métodos, authn, authz, validação, limites, payloads, efeitos, erros, idempotência, chamadas externas)                                          | `[x]`  | `06-apis.md`/`.json` — 418 handlers com métodos, guarda, schema Zod, efeitos, idempotência, rate limit. **Erros**: código por `fail()` lido de `lib/api/errors.ts` (`inventario.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 1.5  | Dados (migrations, tabelas, views, RPCs, triggers, filas, índices, RLS, Storage, tipos, baseline, update)                                                      | `[x]`  | `04-inventario-dados.md` (texto) + **[`12-migrations-e-rls.md`](12-migrations-e-rls.md)** (medido em banco): 180 tabelas, 179/179 com RLS, 305 políticas, 104 triggers, 92 funções, 2 views, 185 tipos; instalação **e** update sobre dados verdes; Storage: **7 buckets** (`ai-policy`, `lgpd-exports`, `skill-assets`, `whatsapp-media`, `brand-logos`, `delivery-proofs`, `product-images`). Índices não foram enumerados um a um — F-09 domina a frente                                                                                                                                                 |
| 1.6  | Integrações e infra                                                                                                                                            | `[x]`  | `07-integracoes.md` — 10 integrações, 16 workers, 30 crons, serviços do compose, 45+ env                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1.7  | Mobile e offline                                                                                                                                               | `[x]`  | `08-mobile-offline.md` — Capacitor, `mobile/www`, `sw.js`, `notify-sw.js`, outbox, SQLite                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 1.8  | Cobertura de testes                                                                                                                                            | `[x]`  | `10-cobertura-testes.md` — 1.121 arquivos; 58 telas com sinal de teste, 98 sem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 1.9  | Documentação: obsoleto × código                                                                                                                                | `[x]`  | F-01 (licença), F-04 (Sage × índigo), F-11 (rotas), D-1/D-3 (Discord), e o próprio F-15                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 1.10 | Registro por rota (objetivo, perfil, entrada, ações, saída, dependências, permissões, dados, estados, links, API/tabelas, relações, problemas, decisão, teste) | `[~]`  | Estrutura gerada (tela, guarda, estados, teste). Os 15 campos narrativos por rota são preenchidos na Fase 2, tela a tela — preenchê-los agora seria inventar auditoria                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 1.11 | Matriz rota × subtela × estado                                                                                                                                 | `[~]`  | `09-telas-estados.md` + `09b-subtelas.md` (**99 abas, 68 modais, 12 gavetas**, duas famílias de aba). **Em execução**: **53 telas** em 1440 e **32 em 390**, **85 abas** (82 na página + 4 em modal + 1 de painel inline), **32 modais** em 1440 e **24 em 390** — 0 aba que não seleciona, 0 sem `<h1>`, 0 overflow, 0 campo sem nome, 0 modal sem nome, **em desktop e celular**. **12 abas não abertas** com motivo tabelado. Falta para `[x]`: as 12 e o tablet                                                                                                                                         |
| 1.12 | Reconciliação das rotas do prompt                                                                                                                              | `[x]`  | `02-reconciliacao-rotas.md` — **cobertura de rotas**: 156 = 143 páginas com JSX + 13 resolvers; 0 ausentes; 0 acréscimos. Não é cobertura de subtelas/estados/jornadas                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### Definition of Done da Fase 1

| #    | Item                                          | Estado | Evidência                                                                   |
| ---- | --------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| 1.D1 | Catálogo gerado do checkout                   | `[x]`  | 9 arquivos, todos por comando                                               |
| 1.D2 | Todas as rotas classificadas; resolver ≠ tela | `[x]`  | 143 telas com JSX · 13 resolvers sem JSX · 156 `page.tsx` no total          |
| 1.D3 | Toda subtela/estado com cobertura planejada   | `[~]`  | Matriz pronta; o _plano_ de cobertura por estado é da Fase 2 (§4 do prompt) |
| 1.D4 | Cada capacidade com estado + evidência        | `[x]`  | Tabela do §4 acima                                                          |
| 1.D5 | Contradições doc × implementação registradas  | `[x]`  | F-01, F-04, F-11, F-15                                                      |

**Fase 1: concluída** — com F-09 (P0) aberto e proposto para a Fase 10.
