# Fase 2 — Auditoria funcional, visual e de experiência

> Regido por `docs/auditoria/PROMPT-MESTRE-AAA.md` (autoridade sobre qualquer `.md`).
> Medido em **15 e 16/11/2026** contra o checkout auditado (`9f8e6faa`), Supabase local,
> sessão real do seed E2E. Instrumento: `scripts/auditoria/captura-visual.mjs`.
> A varredura grande (`§3`) rodou em **build de produção** (`pnpm build` + `next start`);
> as primeiras 37 telas rodaram em dev e foram refeitas.
> Capturas em `docs/auditoria/capturas/`, medições em `medicoes-*.json`.

## 1. Correção de método — a primeira rodada mediu o código errado

A primeira versão desta auditoria rodou contra `http://localhost:3001`, que serve
`/Users/bill/Downloads/nexus` — um checkout **208 commits divergente** do commit
auditado (medido: `git rev-list --count ce79e630..9f8e6faa` = 208; e `ce79e630`
**não é ancestral** de `9f8e6faa`). Nenhum dos números abaixo veio dali.

O instrumento passou a subir o servidor **do próprio worktree** e a receber
`AUDIT_BASE_URL`. A partir do lote de 16/11 (58 rotas `/app/**`), a varredura roda contra
**build de produção** (`pnpm build` + `pnpm exec next start -p 3011`), não em dev: em dev o
`networkidle` mede compilação por rota, e o número não descreve o produto que o cliente instala.

| O que estava errado | Como foi descoberto |
|---|---|
| capturas de um checkout 208 commits atrás | `lsof -p <pid>` mostrou `cwd = /Users/bill/Downloads/nexus` |
| `node <script>.mjs` fora do repo não achava `playwright` | o script precisa rodar na raiz do projeto (resolve `@playwright/test`) |
| login "não passava" | era o script navegando antes do Server Action concluir; e preencher antes da hidratação envia o form vazio |
| 149 de 168 rotas "quebradas" | o servidor morreu **no meio** do lote e o instrumento gravou `ERR_CONNECTION_REFUSED` como defeito de cada tela (F-21) |
| capturas em dev mediam compilação | `networkidle` em dev inclui o build da rota; trocado para `next start` sobre `pnpm build` |

## 2. Achados

### V-01 · Média · 36 de 40 páginas tinham o mesmo `<title>` — **CORRIGIDO**

```
antes:  36 | NEXUS — atendimento e vendas por WhatsApp com agentes de IA
depois:  1 | Dashboard · NEXUS   1 | Pedidos · NEXUS   1 | Funis · NEXUS
         1 | Clientes · NEXUS    1 | Agente de IA · NEXUS   1 | Inbox · NEXUS
```

O produto já sabia o nome de cada tela (o `<h1>` estava certo em 38 das 40): o que
faltava era ligar `metadata.title` à rota.

**Como foi corrigido, e por que não em 127 arquivos:** o nome de cada tela já existe
em `lib/navigation/registry.ts`, com gate de completude no CI
(`tests/unit/navegacao-completude.test.ts`). Escrever o título em cada `page.tsx`
criaria uma **segunda cópia sem gate**, que envelhece calada — o defeito que este
repo combate. Em vez disso:

| Peça | O que faz |
|---|---|
| `lib/navigation/titulos.ts` | resolve rota → título a partir do registro, com fallbacks declarados (sub-fluxo → destino exato → prefixo mais longo) |
| `generateMetadata` em `app/app/layout.tsx`, `app/admin/(protected)/layout.tsx`, `app/onboarding/layout.tsx` | lê `x-pathname` (publicado pelo `proxy.ts`) e devolve o título; a página que já declara `metadata` **continua vencendo** |
| `metadata` próprio em `/403`, `/500`, `/503` | não ficam mais no título genérico |
| `tests/unit/titulos-de-rota.test.ts` | **lê o disco**: toda `page.tsx` com JSX precisa resolver título, e o título não pode repetir entre telas distintas do tenant |

O onboarding usa `PASSOS` de `lib/onboarding/passos.ts` — a mesma definição que
alimenta o indicador de progresso. Três listas de passos já divergiram neste repo;
uma quarta, só para o `<title>`, seria a primeira a envelhecer.

### V-02 · Média · `#/app/inbox` era a única tela sem `<h1>` — **CORRIGIDO**

Medido: 38 de 40 capturas tinham `<h1>`; o Inbox tinha `h1 = []` nas duas larguras.
(A varredura definitiva de 129 rotas achou **mais duas** do mesmo tipo — V-08 e V-12.)
É a tela de trabalho mais usada, e sem nível 1 a navegação por cabeçalho do leitor
de tela não tem onde pousar.

Correção: `<h1 className="sr-only">Inbox</h1>` no `InboxLayout`. Medido depois:
`{"h1":"Inbox","srOnly":true,"ocupa":"1x1","overflow":0}` em 390 e em 1440 — existe
na árvore de acessibilidade e **não ocupa pixel**, que era o requisito: no celular a
altura é disputada pela lista e pelo composer.

### V-03 · **DESCARTADO** · o "botão que cobre a barra inferior" é o devtools

A primeira versão registrou que um botão flutuante (que eu chamei de WhatsApp/TalkJS)
cobria o item "Inteligência" da barra inferior em 390 px, com coordenadas medidas.
As coordenadas estavam certas e a **atribuição** estava errada: a classe é `tsqd-*`,
de **TanStack Query Devtools**, montado em `app/providers.tsx` sob
`process.env.NODE_ENV === 'development'`. Não existe em produção.

Refeito com o devtools removido do DOM e varredura de **todo** elemento
`position: fixed|absolute` que intercepta a faixa da barra inferior, em 6 telas a
390 px: **0 colisões**. Registro aqui porque um achado falso num relatório de
auditoria custa mais que um achado faltando — queima a confiança da lista inteira.

### V-04 · Baixa · formato de data do filtro vem do navegador — **DECISÃO PENDENTE**

`/app/pedidos` renderiza `<input type="date">` com `mm/dd/yyyy` num Chromium em
inglês, embora `<html lang="pt-BR">` esteja correto. Não é bug de código: é o
comportamento nativo do `input[type=date]`. Consequência real: **a mesma tela mostra
formato diferente para cada pessoa**, e num produto brasileiro "03/04" é ambíguo num
filtro de período.

| Opção | Custo | Efeito |
|---|---|---|
| A. manter nativo | zero | acessibilidade e teclado numérico do celular de graça; formato varia por navegador |
| B. campo próprio `dd/mm/aaaa` | componente + validação + teclado numérico manual | formato único; perde o seletor nativo e o preenchimento automático |

Não implementei nenhuma: mudar isso altera o comportamento de filtro em todas as
telas de período, e a doutrina deste repo proíbe inventar regra de produto. A decisão
é do dono do produto; a medida está acima para ela ser tomada com número.

### V-05 · **FECHADO** · desempenho medido em produção (build + `next start`)

Os tempos anteriores (2,2 s a 9,3 s) vinham de `next dev` e mediam compilação por rota. Medido
agora contra `pnpm build` + `pnpm exec next start -p 3011`, em 129 rotas × 2 larguras:

| Largura | n | p50 | p90 | máx |
|---|---|---|---|---|
| desktop 1440 | 129 | **1.495 ms** | 1.990 ms | 2.838 ms |
| celular 390 | 129 | **1.172 ms** | 1.536 ms | 1.920 ms |

O que cada número é: `domcontentloaded` **mais** até 4 s de assentamento (prefetch de `<Link>`
incluso) e 250 ms de espera. **Nas 258 medições a rede assentou** — o caso de 4,4 s que a primeira
rodada registrou em `/admin/platform-admins` era o 404 do runbook (V-13) mantendo requisição
viva; corrigido o link, caiu para 2,8 s no pior caso.

O que continua aberto: **trace do navegador** (LCP/CLS/TBT) e medição de gráficos. O item 2.15
fica `[~]`, não `[x]`, por isso.

### V-06 · Baixa · alvos de toque abaixo de 40 px — sinal, não veredito

Medido no **celular 390** em 129 rotas: p50 de **3** alvos por tela, 17 rotas com zero, máximo
**223** em `/app/agenda`.

| Tela (celular 390) | Elementos < 40 px |
|---|---|
| `/app/agenda` | 223 |
| `/vitrine-agenda` | 151 |
| `/app/prospeccao/nova` | 85 |
| `/app/contacts` | 75 |
| `/admin/audit` | 56 |

A maioria é checkbox de seleção de linha (16 px), padrão de tabela densa — o alvo clicável real
pode ser a célula. `/app/agenda` e `/vitrine-agenda` merecem olhar: são as duas telas de toque
por excelência (grade de horários) e as duas com mais alvos pequenos. Fica como **sinal a
confirmar por clique**, não como defeito declarado.

### V-07 · Alta · A matriz de estados media o `page.tsx`, não a tela — **CORRIGIDO**

Antes de auditar tela a tela, o artefato que devia dizer **onde procurar** estava errado:
`09-telas-estados.md` trazia 156 linhas com as 12 colunas de estado em `—` e `error.tsx = ✓` em
todas as 156. Lido como produto, dizia que nenhuma tela trata carregamento, vazio, erro,
permissão, formulário, filtro ou tabela. As três causas eram do instrumento:

| Causa | Medida | Efeito na matriz |
|---|---|---|
| texto vinha só do `page.tsx` | **89 das 156** telas delegam a UI a `_client.tsx`/`_components/` na mesma pasta | `/app/pedidos` tem filtro, tabela e confirmação no `_client.tsx` e saía `—` nas três |
| `loading`/`error` buscados no segmento **ou em `app/`** | existe **um** `app/error.tsx` global | ✓ em 156 linhas pelo mesmo arquivo: a coluna dizia "o app tem fallback", não "esta tela trata erro" |
| regex rodando dentro de **comentário** | este repo justifica cada decisão em parágrafo | `vazio` 137/156, `filtros` 118/156, `gráfico` 67/156 — inflados por prosa |

Corrigido em `scripts/auditoria/segmento-de-rota.ts`: o texto é o **segmento de rota** (page +
irmãos + subpastas sem `page.tsx` próprio), com **imports relativos seguidos até 5 níveis** (a
tela `/app/radar/risco` é `return <RiscoDoRadar/>`, e o componente mora em `../_components`),
imports `@/…` **um salto sem recursão**, comentários removidos e `loading`/`error` separados em
`próprio` / `herdado` / `—`.

| Depois da correção | Valor |
|---|---|
| telas com JSX e ≥1 sinal | **143 de 143** (antes: 0) |
| `filtros` | 69/156 (antes 118 — inflado) |
| `gráfico` | 7/156 (antes 67) |
| `vazio` | 95/156 (antes 137) |
| `error` | `herdado` em 156 — verdade: há fallback global, nenhuma rota fica sem |

Gate: `tests/unit/matriz-telas-le-segmento.test.ts`, 11 casos com fatos do repo. Um inventário
que erra para "vazio" autoriza a conclusão de que não há o que corrigir — é o pior tipo de
artefato de auditoria.

### V-08 · Média · `/app/pedidos/imprimir` não tinha `<h1>` no estado que o usuário realmente vê — **CORRIGIDO**

O `<h1>` existia, mas **só no ramo "carga maior que um lote"** (`page.tsx:92`). O estado normal
— o que a captura abriu, `?carga=` ausente — renderiza `ImprimirLoteClient` a partir de
`_imprimir.tsx` e não tinha nível 1 nenhum. Medido, não inferido: `h1: []` no JSON da captura, nas
duas larguras.

É o mesmo defeito da V-02 (`/app/inbox`) com uma diferença que importa: lá o `<h1>` não existia em
lugar nenhum; aqui existia **num ramo inalcançável pela navegação comum**, o que é pior de achar —
quem lê o código vê o `<h1>` e conclui que está resolvido.

| Antes | Depois |
|---|---|
| `h1: []` (desktop **e** celular) | `h1: ["Imprimir pedidos"]` (desktop e celular) |
| — | `<h1 className="sr-only">` no estado normal, para não mexer na composição do impresso |
| — | `<h1>` visível no estado vazio |

### V-09 · Média · O vazio de `/app/pedidos/imprimir` não tinha próximo passo — **CORRIGIDO**

O estado vazio era uma linha de texto centralizada: `"Nenhum pedido selecionado."`. Sem título,
sem botão, sem link. Medido nos dois lotes (o "antes" em `docs/auditoria/capturas/medicoes-tenant-faltantes.json`, o
"depois" em `docs/auditoria/capturas/medicoes-v08-imprimir-depois.json`):

| | antes | depois |
|---|---|---|
| texto visível (desktop 1440) | 371 caracteres | **408** |
| texto visível (celular 390) | 86 caracteres | **123** |
| `<h1>` | `[]` | `["Imprimir pedidos"]` |

Quem abria a tela por engano ficava numa página que só diz "nada aqui" — sem caminho de volta a
não ser o menu lateral. É o invariante "nenhuma demanda sem próximo passo" olhado do lado do
usuário.

Corrigido no mesmo arquivo: o vazio agora tem `<h1>` ("Imprimir pedidos"), a explicação e um botão
**"Voltar para Pedidos"** (`variant="outline"`, `asChild` + `next/link`, para continuar sendo
navegação e não recarregar a aplicação).

Prova: `docs/auditoria/capturas/desktop_app_pedidos_imprimir.png` recapturada contra **build de
produção**, JSON `docs/auditoria/capturas/medicoes-v08-imprimir-depois.json` com
`h1: ["Imprimir pedidos"]`, `overflow: 0`, `console: 0`.

> Por que os dois estavam no mesmo arquivo e ninguém viu: `_imprimir.tsx` é client component e a
> única forma de vê-lo era abrir a rota **sem** `?carga=`. As capturas anteriores passaram por 37
> telas e esta entrou só na varredura de 58 rotas de 16/11 — a primeira que varreu `/app/**`
> inteiro, e não só o que o menu oferece.

### V-10 · Média · `networkidle` como condição de sucesso transformava tela renderizada em "não abre" — **CORRIGIDO**

`/admin/platform-admins` estourou 45 s nas duas larguras, em dois lotes seguidos. Lido como
produto, era "a tela do dono não abre". Medido com a ordem do lote reproduzida
(`/admin/marca` → `/admin/platform-admins`, registrando toda requisição):

| Fato medido | Valor |
|---|---|
| `h1` renderizado | `["Platform Admins"]` |
| `GET /api/v1/admin/platform-admins` | **200 em 191 ms** |
| requisições pendentes ao estourar o tempo | **nenhuma** |
| requisições em 8 s após o `domcontentloaded` | 67 — 25 `fetch` e 33 `script`, incluindo `/admin/usage`, `/admin/users`, `/admin/marca`, `/admin/google` |

Não era a tela: era o **prefetch dos `<Link>` do menu**. O Next busca as rotas vizinhas assim que
a tela monta, a rede nunca fica 500 ms em silêncio, e `networkidle` — que era **condição de
sucesso** — nunca acontecia. A rota era idêntica à que respondia em 191 ms quando aberta sozinha;
o que mudava era a ordem das visitas dentro da mesma sessão.

Corrigido em `scripts/auditoria/captura-visual.mjs`: `domcontentloaded` + **até 4 s** de
assentamento (sem falhar se não assentar) + 250 ms. Cada medição passa a gravar `assentou`, para
que "1.500 ms" não seja lido como "1.500 ms de tela" quando parte é prefetch.

Remeção depois de V-13 (o link morto que mantinha requisição pendente): a rede assentou nas
**258** medições, e o pior caso foi 2,8 s — antes eram 4,4 s em duas delas. Ou seja: o prefetch
era real, mas parte do "nunca assenta" era o 404 do runbook.

É o **terceiro** defeito da mesma família nesta auditoria — F-21 (servidor caiu e virou "149 telas
quebradas"), F-20 (matriz media o `page.tsx`) e este. O padrão é sempre o mesmo: o instrumento
reportando a própria limitação como propriedade do produto.

### V-11 · Baixa · `/admin/**` exige o seed do dono, e sem ele toda a área responde "Acesso negado"

`/admin/**` é `requirePlatformAdmin`. Nesta base o `e2e-dono` **não** estava promovido, e as 13
rotas de admin redirecionavam para `/admin/forbidden` ("Acesso negado"). Duas leituras erradas
possíveis, e as duas foram evitadas: "a área de admin está quebrada" e "o guard está funcionando,
então não há nada a auditar".

Corrigido pelo caminho documentado — `pnpm exec tsx scripts/seed-e2e-system-update.ts`, o mesmo
que o job `e2e` roda —, que promove `e2e-dono` a `platform_admins` e não toca no `e2e-admin` (o
seed revoga explicitamente; `tests/unit/seed-nao-promove-o-admin-compartilhado.test.ts` vigia
isso). Depois: `/admin/tenants` → `h1: ["Tenants"]`, `/admin/platform-admins` → `h1: ["Platform
Admins"]`.

Registrado porque **a auditoria de `/admin/**` só existe se o dono existir**: uma instalação
fresca sem ninguém promovido tem a área inteira inalcançável, e isso não é bug — é o desenho.

### V-12 · Média · `/admin/inbox` era a única tela de `/admin/**` sem `<h1>` — **CORRIGIDO**

O lote de 129 rotas estáticas mediu `h1: []` em **uma** tela do admin: `/admin/inbox`, o índice
do inbox da plataforma. É o mesmo padrão da V-02 (`/app/inbox`) e da V-08: a tela desenha um
estado vazio centralizado (ícone + "Selecione uma conversa para visualizar") e nenhum nível 1.

Corrigido com `<h1 className="sr-only">Inbox da plataforma</h1>`. `sr-only` porque o layout de
três colunas (lista 360 px | conversa | painel) não tem lugar para cabeçalho visual, e um `<h1>`
de 24 px ali empurraria a lista.

> **A primeira versão desta correção criou um defeito novo, e a remedição pegou.** `sr-only` é
> `position: absolute`; sem ancestral posicionado, o elemento escapa do `overflow-hidden` do
> layout e estica o documento. Medido a 390 px: **overflow horizontal de 25 px**, com o `<h1>`
> em `right: 415` num viewport de 390. A correção foi `relative` no container — o absoluto passa
> a ser clipado junto. Depois: `h1: ["Inbox da plataforma"]`, `overflow: 0` nas duas larguras.
> Fica registrado porque é a prova de que a remedição depois da correção não é cerimônia.

### V-13 · Média · O aviso de "somente DBA" oferecia um link que dava 404 — **CORRIGIDO**

A captura de `/admin/platform-admins` registrou, nas duas larguras:

```
Failed to load resource: the server responded with a status of 404 (Not Found)
GET /runbook/platform-admin-management.md → 404
```

`components/admin/platform-admins/DBAOnlyNotice.tsx` oferece **"Ver runbook →"** apontando para
`/runbook/platform-admin-management.md`, e `public/runbook/` **não existia**. O produto dizia, em
destaque azul, "o procedimento está documentado aqui" — e o aqui não existia. Nenhum teste via
isso porque nenhum teste abre a tela e clica.

Corrigido em dois passos: o runbook passou a existir (`public/runbook/platform-admin-management.md`,
escrito a partir do schema real — colunas, constraints, política de RLS, `405` da rota e o rastro
em `api_audit_log`), e um gate novo vigia a classe inteira do defeito:
`tests/unit/link-para-arquivo-estatico-existe.test.ts` varre `app/` e `components/` procurando
`href`/`src` com extensão de arquivo e reprova se o arquivo não está em `public/`.

### V-14 · Observação · O 422 da Agenda é estado configurado-ainda-não, não defeito

`/app/agenda` emite, nas duas larguras, `Failed to load resource: 422` em
`GET /api/v1/agenda/horarios-livres?...`. Investigado no código: a rota devolve 422
`agenda_sem_responsavel` / `agenda_jornada_nao_configurada` quando ninguém está em
`attendant_availability` — o estado de uma instalação fresca — e a tela **trata** (`isError`
alimenta o aviso; sem isso ela "mentiria por default" mostrando agenda vazia como se fosse
disponibilidade real). Não é bug; é a primeira coisa que o operador precisa configurar. Fica
registrado porque, sem esta nota, o próximo leitor do JSON leria "422 na Agenda" como defeito.

### V-15 · Média · `/app/audit` tinha quatro `<label>` que não rotulavam nada — **CORRIGIDO**

A varredura de 258 medições deixou **3 rotas** com campo visível sem nome acessível. Duas eram
falso positivo do detector; uma era real.

| Rota | Acusado | Veredito |
|---|---|---|
| `/app/audit` | 2 × `input[type=datetime-local]`, 204×40 px | **defeito real** |
| `/app/settings/profile` | 2 × `select` | falso positivo |
| `/admin/tenants/new` | 1 × `select` | falso positivo |

**Por que os dois `select` eram falso positivo.** Medido no DOM: `aria-hidden="true"`,
`tabindex="-1"`, `position: absolute`, **1×1 px**, dentro do `<form>`. É o `BubbleSelect` do
Radix — o `<select>` nativo invisível que ele injeta para autofill. O controle que a pessoa usa é
um `button[role=combobox]`, e os três têm `<label for=...>` de verdade (`Idioma`, `Fuso horário`,
`Plano`). O detector contava elemento fora da árvore de acessibilidade; passou a pular
`aria-hidden="true"` e `tabindex="-1"`.

**Por que `/app/audit` era real.** O texto existe na tela, o vínculo não:

```tsx
<label className="block text-xs text-muted-foreground">{t("De")}</label>
<Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
```

`<label>` sem `htmlFor`, `<Input>` sem `id`: são dois vizinhos, não um campo rotulado. Um leitor
de tela anuncia "campo de data" — e o mesmo valia para "Até", que é o par do mesmo filtro. Os
outros dois campos da barra (`Ação contém`, `Tipo de recurso`) escapavam do detector só porque
têm `placeholder`; também não tinham vínculo, e foram corrigidos junto.

Corrigido nos quatro: `id` no campo + `htmlFor` no rótulo. Gate novo em
`tests/unit/rotulo-de-campo-aponta-para-controle.test.ts` analisa **todos** os 101 `<label>` de
`app/` e `components/` e exige um dos três vínculos — `htmlFor`, embrulhamento do controle
(`<label><input/></label>`) ou `aria-labelledby` apontando para o `id` do rótulo. Hoje: 73 por
embrulhamento, 26 por `htmlFor`, 2 por `aria-labelledby`, **0 soltos**.

O gate encontrou mais duas ocorrências que a varredura de tela não via, porque os `<Select>`
tinham `aria-label` no gatilho e o detector só olhava `<label>`: `app/app/webhooks/_components/CapturasTab.tsx`,
nos filtros "Fonte" e "Resultado". Ali o rótulo visível dizia uma coisa e o nome acessível dizia
outra ("Filtrar por fonte"). Trocado por `aria-labelledby` apontando para o `<label>`, para o
nome acessível ser exatamente o texto que a pessoa lê.

## 3. O que está bom — e foi medido, não elogiado

Números da varredura de **16/11 contra build de produção** (`pnpm build` + `pnpm exec next start`):
**129 rotas estáticas × 2 larguras = 258 medições**, em três lotes (`producao-tenant`,
`producao-admin`, `producao-publica`).

| Medida | Resultado |
|---|---|
| status HTTP | **256 × 200** e **2 × 500** — os dois do `/500`, que é a página de erro (esperado) |
| erro de captura | **0** (nenhum `ERR_CONNECTION_REFUSED`, nenhum timeout) |
| rede assentou | **258 de 258** medições |
| overflow horizontal > 0 | **0 de 258** |
| erro de console | **4 medições** em 2 rotas: `/app/agenda` (422 de disponibilidade, V-14) e `/500` (a própria página de erro) |
| `<h1>` ausente | **0** |
| campo visível sem nome acessível | **0** |
| tempo até o HTML + assentamento | desktop **p50 1.495 ms** · p90 1.990 ms · máx 2.838 ms; celular **p50 1.172 ms** · p90 1.536 ms · máx 1.920 ms |

> Esta é a **segunda** varredura completa do dia, e as diferenças entre as duas são as correções
> da própria auditoria — não ruído. Na primeira, `/admin/inbox` aparecia sem `<h1>` (V-12),
> `/admin/platform-admins` tinha 404 de console (V-13), 6 medições tinham campo sem rótulo
> (V-15) e 2 não assentavam. Depois de corrigir as três, o mesmo instrumento, a mesma base e as
> mesmas 129 rotas dão zero nas três colunas.

- `main` tem `padding-bottom: 96px`: a barra inferior fixa não esconde o fim das listas.
- **Permissão negada tem estado próprio** (`/admin/forbidden`, "Acesso negado") e 10 rotas de
  configuração redirecionam para ele quando o perfil não tem papel — não é erro, é guarda.
- A marca resolve do banco: `/login` mostra `Entrar · NEXUS` mesmo com `appName` de
  cliente no `capacitor.config.ts` (F-10) — o vazamento é do shell nativo, não da web.

### O que a varredura NÃO cobriu — e por quê

| Não coberto | Motivo medido |
|---|---|
| **26 rotas dinâmicas** (`[id]`, `[token]`, `[conversationId]`, `[entryId]`) | precisam de um id real no banco; abrir sem id mede a tela de "não encontrado" e viraria "tela vazia" no relatório. O instrumento as **pula com motivo escrito** no JSON (`puladas`) |
| `/onboarding/*` (9 rotas) | a conta do seed já completou o onboarding: todas redirecionam para `/app/inbox`. Auditar onboarding exige uma conta recém-criada, que a suíte E2E não mantém |
| `/login/mfa` | a sessão do seed já está autenticada: redireciona para `/app/inbox` |
| **tablet 834 px** | medido em 5 telas numa rodada anterior; a varredura completa rodou em 1440 e 390 |

### Redirecionamentos medidos — 26 de 129 (e nenhum é link quebrado)

A varredura segue o redirect e mede a tela de destino. Os 26 se dividem em três grupos, e o
número de cada grupo fecha com `medicoes-producao-*.json`:

| Destino | Rotas | O que é |
|---|---|---|
| `/403` | 10 | guarda de papel: `manager` pedindo tela de `admin` |
| `/app/inbox` | 10 | sessão já autenticada: 9 de `/onboarding/**` + `/login/mfa` |
| outra tela | 6 | **alias antigo** que continua funcionando: `/app/lgpd/requests`→`/app`, `/app/metrics`→`/app/indicadores`, `/app/prospeccao`→`/app/campanhas`, `/app/recuperacao`→`/app/radar/recuperacao`, `/app/titulos`→`/app/financeiro`, `/admin`→`/admin/dashboard` |

Os 6 aliases são um acerto que a auditoria não esperava encontrar: link antigo no menu do
navegador de um cliente não vira 404. Os 10 de `/403` e os 10 de `/app/inbox` são o motivo pelo
qual `onboarding`, `login/mfa` e as telas de papel `admin` **não** têm auditoria visual nesta
rodada — o que se mediria ali é a tela de destino, não a tela pedida (§ "O que a varredura NÃO
cobriu").

### Falsos positivos descartados antes de virarem achado

| Parecia | Era |
|---|---|
| `/app/lgpd` responde 404 | a rota real é `/app/lgpd/requests` (`lib/navigation/registry.ts`); erro meu de rota |
| `/admin` cai em "Acesso negado" | `manager` não é admin de plataforma — comportamento correto, com estado próprio |
| `/admin/platform-admins` "não abre" (45 s) | `networkidle` nunca assentava por causa do prefetch do menu (V-10) |
| `/admin/platform-admins` responde 404 | o link do runbook no aviso "somente DBA" (V-13) — o 404 era real, mas de um `<a>`, não da tela |
| `/app/agenda` com erro de console 422 | instalação sem `attendant_availability`; a tela trata (V-14) |
| 11 campos sem rótulo em `/app/products` | o detector contava `type=hidden` e campo dentro de `<label>`; corrigido, restaram **3 rotas** com 1–2 campos |
| círculo "N" cobrindo "Recolher" no rodapé | indicador de dev do Next, não elemento do produto |
| botão flutuante cobre a barra inferior | TanStack Query Devtools, só em `NODE_ENV=development` (V-03) |

## 4. Cobertura do checklist

| # | Item | Estado | Medido |
|---|---|---|---|
| 2.1 | Avaliar em execução e no código; desktop/tablet/celular | `[~]` | **129 rotas estáticas** abertas em navegador contra build de produção, em 1440 e 390 (= 258 medições), de 155 telas distintas. 26 dinâmicas puladas com motivo; tablet 834 em 5 telas |
| 2.2 | Se impedido, registrar bloqueio sem alegar inspeção visual | `[x]` | Nada foi alegado sem execução; o que não foi coberto está listado com o motivo (§3) |
| 2.3 | Propósito e próximo passo evidentes | `[x]` | Título de aba próprio em todas as rotas (V-01) e `<h1>` em todas as medições depois de V-02, V-08 e V-12 — inclui o vazio de `/app/pedidos/imprimir`, que passou a ter próximo passo |
| 2.4 | Hierarquia e densidade | `[~]` | Lida nas 258 capturas; sem medição de densidade |
| 2.5 | Consistência de headers, breadcrumb, ações, filtros, navegação | `[~]` | Shell e barra de filtros consistentes; títulos por rota |
| 2.6 | Cliques/digitação em tarefas frequentes | `[ ]` | Depende das jornadas J1–J16 |
| 2.7 | Busca, ordenação, filtros, paginação, seleção em massa | `[~]` | Presença confirmada na matriz (69 telas com filtro, 51 com tabela); comportamento não exercitado |
| 2.8 | Formulários | `[ ]` | Não executado |
| 2.9 | Estados (loading, vazio, erro, sucesso, offline, permissão negada) | `[~]` | Onde cada estado existe: 143/143 telas com ≥1 sinal (V-07). Em execução: vazio, permissão negada (**10 rotas → `/403`**, todas de `manager` pedindo tela de `admin`: `ai/agents/new`, `connections`, `settings/api-tokens`, `settings/billing`, `settings/canal-oficial`, `settings/marca`, `settings/templates`, `settings/tenant`, `settings/tenant/whatsapp`, `team/invite`) e erro (`/500`) **observados**. loading, sucesso e offline não |
| 2.10 | Feedback imediato e prevenção de duplicidade | `[ ]` | — |
| 2.11 | A11y: contraste, foco, teclado, leitor, toque, zoom, reduced motion | `[~]` | `<h1>` em 100% após V-02/V-08/V-12; alvos < 40 px medidos em 258 medições (p50 = 3 por tela no celular, máx 223 em `/app/agenda` — V-06 segue sinal); **101 `<label>`** analisados, **0 sem vínculo** com o campo após a V-15 (gate novo); contraste, foco e teclado não medidos |
| 2.12 | Casos extremos | `[ ]` | — |
| 2.13 | Largura/overflow, sticky, modais, drawers em telas estreitas | `[~]` | **Overflow 0 em 258 medições** (e o único caso de 25 px foi introduzido e removido na própria V-12); colisão com a barra inferior = 0 (V-03 descartado); modais e drawers não abertos |
| 2.14 | Idioma, moeda, datas, timezone, convenções BR | `[~]` | pt-BR e R$ corretos; formato de data depende do navegador (V-04, decidir) |
| 2.15 | Desempenho percebido e gráficos | `[~]` | **Medido em produção** (V-05 fechado): desktop p50 1.495 ms / p90 1.990 ms / máx 2.838 ms; celular p50 1.172 ms / p90 1.536 ms / máx 1.920 ms. Sem trace de navegador (LCP/CLS/TBT); gráficos não avaliados |
| 2.16 | Não padronizar mecanicamente onde a composição é intencional | `[x]` | O título vem de UMA fonte e cada tela mantém sua composição |

**Fase 2: em andamento.** V-01, V-02, V-07, V-08, V-09, V-10, V-12, V-13 e V-15 corrigidos com
medida antes/depois; V-03 e V-11 descartados com prova; V-05 **fechado** (produção medida); V-06 é
sinal a confirmar por clique; V-14 é observação. V-04 aguarda **decisão de produto**. As jornadas
J1–J16 ainda não começaram.
