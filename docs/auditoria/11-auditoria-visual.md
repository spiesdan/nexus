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

| O que estava errado                                      | Como foi descoberto                                                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| capturas de um checkout 208 commits atrás                | `lsof -p <pid>` mostrou `cwd = /Users/bill/Downloads/nexus`                                                            |
| `node <script>.mjs` fora do repo não achava `playwright` | o script precisa rodar na raiz do projeto (resolve `@playwright/test`)                                                 |
| login "não passava"                                      | era o script navegando antes do Server Action concluir; e preencher antes da hidratação envia o form vazio             |
| 149 de 168 rotas "quebradas"                             | o servidor morreu **no meio** do lote e o instrumento gravou `ERR_CONNECTION_REFUSED` como defeito de cada tela (F-21) |
| capturas em dev mediam compilação                        | `networkidle` em dev inclui o build da rota; trocado para `next start` sobre `pnpm build`                              |

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

| Peça                                                                                                        | O que faz                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `lib/navigation/titulos.ts`                                                                                 | resolve rota → título a partir do registro, com fallbacks declarados (sub-fluxo → destino exato → prefixo mais longo)        |
| `generateMetadata` em `app/app/layout.tsx`, `app/admin/(protected)/layout.tsx`, `app/onboarding/layout.tsx` | lê `x-pathname` (publicado pelo `proxy.ts`) e devolve o título; a página que já declara `metadata` **continua vencendo**     |
| `metadata` próprio em `/403`, `/500`, `/503`                                                                | não ficam mais no título genérico                                                                                            |
| `tests/unit/titulos-de-rota.test.ts`                                                                        | **lê o disco**: toda `page.tsx` com JSX precisa resolver título, e o título não pode repetir entre telas distintas do tenant |

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

| Opção                         | Custo                                            | Efeito                                                                             |
| ----------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| A. manter nativo              | zero                                             | acessibilidade e teclado numérico do celular de graça; formato varia por navegador |
| B. campo próprio `dd/mm/aaaa` | componente + validação + teclado numérico manual | formato único; perde o seletor nativo e o preenchimento automático                 |

Não implementei nenhuma: mudar isso altera o comportamento de filtro em todas as
telas de período, e a doutrina deste repo proíbe inventar regra de produto. A decisão
é do dono do produto; a medida está acima para ela ser tomada com número.

### V-05 · **FECHADO** · desempenho medido em produção (build + `next start`)

Os tempos anteriores (2,2 s a 9,3 s) vinham de `next dev` e mediam compilação por rota. Medido
agora contra `pnpm build` + `pnpm exec next start -p 3011`, em 129 rotas × 2 larguras:

| Largura      | n   | p50          | p90      | máx      |
| ------------ | --- | ------------ | -------- | -------- |
| desktop 1440 | 129 | **1.495 ms** | 1.990 ms | 2.838 ms |
| celular 390  | 129 | **1.172 ms** | 1.536 ms | 1.920 ms |

O que cada número é: `domcontentloaded` **mais** até 4 s de assentamento (prefetch de `<Link>`
incluso) e 250 ms de espera. **Nas 258 medições a rede assentou** — o caso de 4,4 s que a primeira
rodada registrou em `/admin/platform-admins` era o 404 do runbook (V-13) mantendo requisição
viva; corrigido o link, caiu para 2,8 s no pior caso.

O trace do navegador, que era a dívida desta seção, foi feito depois: LCP, CLS e TBT em 12 telas
× 2 condições (`scripts/auditoria/desempenho.mjs`) — e foi ele que achou a V-34. O item 2.15 segue
`[~]` pelo que ainda falta (INP e custo de render dos gráficos), não pelo trace.

### V-06 · Baixa · alvos de toque abaixo de 40 px — sinal, não veredito

Medido no **celular 390** em 129 rotas: p50 de **3** alvos por tela, 17 rotas com zero, máximo
**223** em `/app/agenda`.

| Tela (celular 390)     | Elementos < 40 px |
| ---------------------- | ----------------- |
| `/app/agenda`          | 223               |
| `/vitrine-agenda`      | 151               |
| `/app/prospeccao/nova` | 85                |
| `/app/contacts`        | 75                |
| `/admin/audit`         | 56                |

A maioria é checkbox de seleção de linha (16 px), padrão de tabela densa — o alvo clicável real
pode ser a célula. `/app/agenda` e `/vitrine-agenda` merecem olhar: são as duas telas de toque
por excelência (grade de horários) e as duas com mais alvos pequenos. Fica como **sinal a
confirmar por clique**, não como defeito declarado.

### V-07 · Alta · A matriz de estados media o `page.tsx`, não a tela — **CORRIGIDO**

Antes de auditar tela a tela, o artefato que devia dizer **onde procurar** estava errado:
`09-telas-estados.md` trazia 156 linhas com as 12 colunas de estado em `—` e `error.tsx = ✓` em
todas as 156. Lido como produto, dizia que nenhuma tela trata carregamento, vazio, erro,
permissão, formulário, filtro ou tabela. As três causas eram do instrumento:

| Causa                                                   | Medida                                                                          | Efeito na matriz                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| texto vinha só do `page.tsx`                            | **89 das 156** telas delegam a UI a `_client.tsx`/`_components/` na mesma pasta | `/app/pedidos` tem filtro, tabela e confirmação no `_client.tsx` e saía `—` nas três                |
| `loading`/`error` buscados no segmento **ou em `app/`** | existe **um** `app/error.tsx` global                                            | ✓ em 156 linhas pelo mesmo arquivo: a coluna dizia "o app tem fallback", não "esta tela trata erro" |
| regex rodando dentro de **comentário**                  | este repo justifica cada decisão em parágrafo                                   | `vazio` 137/156, `filtros` 118/156, `gráfico` 67/156 — inflados por prosa                           |

Corrigido em `scripts/auditoria/segmento-de-rota.ts`: o texto é o **segmento de rota** (page +
irmãos + subpastas sem `page.tsx` próprio), com **imports relativos seguidos até 5 níveis** (a
tela `/app/radar/risco` é `return <RiscoDoRadar/>`, e o componente mora em `../_components`),
imports `@/…` **um salto sem recursão**, comentários removidos e `loading`/`error` separados em
`próprio` / `herdado` / `—`.

| Depois da correção       | Valor                                                                 |
| ------------------------ | --------------------------------------------------------------------- |
| telas com JSX e ≥1 sinal | **143 de 143** (antes: 0)                                             |
| `filtros`                | 69/156 (antes 118 — inflado)                                          |
| `gráfico`                | 7/156 (antes 67)                                                      |
| `vazio`                  | 95/156 (antes 137)                                                    |
| `error`                  | `herdado` em 156 — verdade: há fallback global, nenhuma rota fica sem |

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

| Antes                            | Depois                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `h1: []` (desktop **e** celular) | `h1: ["Imprimir pedidos"]` (desktop e celular)                                        |
| —                                | `<h1 className="sr-only">` no estado normal, para não mexer na composição do impresso |
| —                                | `<h1>` visível no estado vazio                                                        |

### V-09 · Média · O vazio de `/app/pedidos/imprimir` não tinha próximo passo — **CORRIGIDO**

O estado vazio era uma linha de texto centralizada: `"Nenhum pedido selecionado."`. Sem título,
sem botão, sem link. Medido nos dois lotes (o "antes" em `docs/auditoria/capturas/medicoes-tenant-faltantes.json`, o
"depois" em `docs/auditoria/capturas/medicoes-v08-imprimir-depois.json`):

|                              | antes          | depois                 |
| ---------------------------- | -------------- | ---------------------- |
| texto visível (desktop 1440) | 371 caracteres | **408**                |
| texto visível (celular 390)  | 86 caracteres  | **123**                |
| `<h1>`                       | `[]`           | `["Imprimir pedidos"]` |

Quem abria a tela por engano ficava numa página que só diz "nada aqui" — sem caminho de volta a
não ser o menu lateral. É o invariante "nenhuma demanda sem próximo passo" olhado do lado do
usuário.

Corrigido no mesmo arquivo: o vazio agora tem `<h1>` ("Imprimir pedidos"), a explicação e um botão
**"Voltar para Pedidos"** (`variant="outline"`, `asChild` + `next/link`, para continuar sendo
navegação e não recarregar a aplicação).

Prova: `docs/auditoria/capturas/desktop_app_pedidos_imprimir.png` recapturada contra **build de
produção**, JSON `docs/auditoria/capturas/medicoes-v08-imprimir-depois.json` com
`h1: ["Imprimir pedidos"]`, `overflow: 0`, `console: 0`.

**A primeira correção desta tinha um defeito próprio, e um gate antigo a pegou.** O `<h1>` do
estado vazio nasceu com `text-lg font-semibold` — 18 px. A varredura de aceite
(`tests/e2e/auditoria-aceite-11-itens.spec.ts`, §100) mede o `font-size` do primeiro `<h1>` de
cada rota e exige no máximo **3** famílias de tipografia de título; o cabeçalho canônico
(`NexusPageHeader`) usa `text-2xl` (24 px). O `<h1>` novo virou a **quarta** família e a spec
reprovou: corrigir a ausência de título não autoriza inventar um tamanho.

Conserto: o estado vazio passou a montar o **`NexusPageHeader`** canônico — título, subtítulo
("Nenhum pedido selecionado.") e o botão de volta como `actions`. É o mesmo cabeçalho das
outras 155 telas, então a família de título não muda.

O caso fica registrado porque é a classe de erro que este relatório inteiro tenta evitar: a
correção de um achado criou outro, e quem achou foi uma **régua que já existia** — não a minha
inspeção. Sem esse gate, 18 px numa tela de impressão passaria como "está bonito".

> Por que os dois estavam no mesmo arquivo e ninguém viu: `_imprimir.tsx` é client component e a
> única forma de vê-lo era abrir a rota **sem** `?carga=`. As capturas anteriores passaram por 37
> telas e esta entrou só na varredura de 58 rotas de 16/11 — a primeira que varreu `/app/**`
> inteiro, e não só o que o menu oferece.

### V-10 · Média · `networkidle` como condição de sucesso transformava tela renderizada em "não abre" — **CORRIGIDO**

`/admin/platform-admins` estourou 45 s nas duas larguras, em dois lotes seguidos. Lido como
produto, era "a tela do dono não abre". Medido com a ordem do lote reproduzida
(`/admin/marca` → `/admin/platform-admins`, registrando toda requisição):

| Fato medido                                  | Valor                                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `h1` renderizado                             | `["Platform Admins"]`                                                                                    |
| `GET /api/v1/admin/platform-admins`          | **200 em 191 ms**                                                                                        |
| requisições pendentes ao estourar o tempo    | **nenhuma**                                                                                              |
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

| Rota                    | Acusado                                     | Veredito         |
| ----------------------- | ------------------------------------------- | ---------------- |
| `/app/audit`            | 2 × `input[type=datetime-local]`, 204×40 px | **defeito real** |
| `/app/settings/profile` | 2 × `select`                                | falso positivo   |
| `/admin/tenants/new`    | 1 × `select`                                | falso positivo   |

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

### V-16 · Alta · O editor de agente era a única tela do produto sem `<h1>` — **CORRIGIDO**

Encontrado pela varredura de aceite (112 rotas em 1280 px), não pela minha captura de 258
medições — e o motivo é instrutivo: na minha varredura, `/app/ai/agents/new` era visitada com o
perfil `manager` e cai em `/403` (a rota exige `admin`+). Medida com o `dono`, a tela abre e o
relatório acusa:

```
H1 sem-h1 (1): /app/ai/agents/new
```

A tela é o **editor de agente** — criar e editar —, o coração de um produto que se vende como
"agentes de IA nativos". O cabeçalho era `<h2 className="text-xl">` e a página não tinha título
de nível 1: nem `NexusPageHeader`, nem `sr-only`. Corrigido para `<h1>` no tamanho canônico
(`text-2xl`), herdado por `/app/ai/agents/[id]` porque as duas rotas montam o mesmo `AgentForm`.

### V-17 · Média · Três telas com título fora da tipografia canônica — **CORRIGIDO**

A mesma varredura mediu o `font-size` do primeiro `<h1>` de cada rota. O canônico é 24 px
(`NexusPageHeader`). Fora dele:

| Tela                                                     | Antes | Depois |
| -------------------------------------------------------- | ----- | ------ |
| `/app/pedidos/imprimir?carga=` (estado "muitos pedidos") | 18 px | 24 px  |
| `/app/campanhas` (medida via alias `/app/prospeccao`)    | 20 px | 24 px  |
| `/app/lgpd/requests/[id]` (título é o `#id`, em mono)    | 20 px | 24 px  |

Os dois primeiros passaram a montar o cabeçalho canônico; o terceiro manteve o `font-mono` e
subiu para `text-2xl` — o identificador continua mono, o tamanho é o da casa.

Ficam como estão, com motivo: `/design` (22 px — o showcase existe para mostrar a escala) e os
`<h1 className="sr-only">` (16 px herdados — um título recortado não tem tipografia visível).

Gate novo: `tests/unit/titulo-de-tela-tem-um-tamanho.test.ts` lê todo `<h1>` de `app/app/**` e
`app/admin/**` em segundos e reprova tamanho fora do canônico, antes de a varredura de 1,3 min
descobrir.

### V-18 · Média · Dois controles com o mesmo nome acessível: "Buscar" — **CORRIGIDO**

`filterbar-unica-nas-listas` reprovou com:

```
strict mode violation: getByLabel('Buscar') resolved to 2 elements
  1) <button aria-label="Buscar" aria-keyshortcuts="Meta+K Control+K">
  2) <input type="search" id="fornecedores-busca">
```

O botão da busca global do shell e o campo de filtro da página tinham o **mesmo nome
acessível**. O efeito não é só de teste: quem usa leitor de tela ouve "Buscar" duas vezes e não
sabe qual é o global. O botão passou a se chamar **"Buscar em todo o sistema"** (`title`
continua "Buscar" — dica visual, não nome acessível), e o locator do teste passou a ser
`getByRole("searchbox", { name: "Buscar" })`, que diz o que mede.

### V-19 · Média · Uma spec reprovava o produto por uma decisão que o produto tomou — **CORRIGIDO**

`notas-fiscais-modulo:75` exigia que o item de sidebar "Notas fiscais" apontasse para
`/app/fiscal`. O commit `5eee8923` (04/11) mudou o item para `/app/notas` — emissão, que é o uso
diário — e renomeou o recebimento para "NF-e recebidas", explicando a decisão no registro. O
commit atualizou o título de `TELAS` e esqueceu esta asserção. A spec é que estava velha; agora
afirma `/app/notas` e diz por quê.

### V-20 · Alta · O rótulo visível não dava nome a nenhum campo — **CORRIGIDO (55 campos)**

Este é o maior achado da Fase 2 e o mais invisível até aqui: meu gate de rótulos
(`rotulo-de-campo-aponta-para-controle`) lia `<label>` literal, e o produto usa **`<Label>`** —
o primitivo de `components/ui/label`, que renderiza `<label>` em runtime. Toda a classe escapou.

Apareceu ao abrir a aba **Motoristas** de `/app/frota` com o instrumento de subtelas:
`camposSemRotulo = 2`. A causa estava no helper local:

```tsx
<Label className="text-xs text-muted-foreground">{rotulo}</Label>   {/* sem htmlFor */}
{children}                                                          {/* irmão, não filho */}
```

Medido com o mesmo critério em todo `app/` e `components/`: **90 `<Label>` sem `htmlFor` e sem
controle dentro**; em **55** deles o campo ficava **sem nome nenhum** — leitor de tela
anunciando "campo de texto" sem dizer o que preencher. Em 35 o campo já tinha `aria-label`/`id`,
e o defeito ali é outro (texto visível ≠ nome), registrado e não silenciado.

Conserto em duas frentes, e a segunda é a que importa:

1. **`scripts/auditoria/cod-rotulo-acessivel.mjs`** injeta `aria-label` com o **texto do rótulo**
   no controle irmão — preservando a expressão (`aria-label={t("Qtd.")}`). Rodou em **35
   rótulos** nesta rodada (25 + 10), e é idempotente.
2. **O gate e o conserto são o mesmo código**: `tests/unit/rotulo-visivel-vira-nome-acessivel.test.ts`
   importa `planejar()` do script e exige lista vazia. Não existe o caso "o teste mede uma coisa
   e o conserto faz outra" — é a mesma régua.

O que o codemod **não** toca, de propósito, porque adivinhar seria pior que deixar sem nome:

| Caso                                                                                           | Por que não mexer                                                             |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| rótulo de **grupo** sobre uma lista (`Janelas de envio`, `Mensagens`, `Itens`)                 | carimbar o rótulo do grupo no primeiro item faria o leitor de tela **mentir** |
| controle com `placeholder` que descreve outra coisa (`Cidades com clientes` / "Buscar cidade") | os dois textos disputam o nome; corrigido à mão com o texto da busca          |
| rótulo + bloco com 2+ controles                                                                | não há como saber qual é "o" campo                                            |

Os casos de grupo receberam nome específico à mão: os quatro horários de "Janelas de envio" em
`/app/campanhas` e `/app/radar/recuperacao` agora são "Início da janela 1", "Fim da janela 1", …

### V-21 · Média · Aba de `/app/compras` sem estado anunciado — **CORRIGIDO**

`/app/compras` navega entre "Pedidos" e "Fornecedores" com dois `<button>` marcados **só por
`className`**. Nem `role=tab`, nem `aria-selected`, nem `aria-current` — as outras barras do
produto (`/app/products`, `/app/prospeccao`, `/app/expedicao/[id]`) usam `aria-current`. Quem usa
leitor de tela ouvia dois botões sem saber qual estava aberto; o inventário de subtelas também
não conseguia enumerá-los. Corrigido com `aria-current="page"` na aba ativa, como o resto do
produto.

### V-22 · Média · Erro de API renderizado como "estado vazio" — **CORRIGIDO**

Abrindo a aba **Modelos do parceiro** de `/app/connections` numa instalação **sem** conexão de
parceiro, o console registrava `404 /api/v1/channels/partner/templates` e a tela mostrava:

> "Nenhum modelo espelhado ainda. Clique em **Sincronizar** para trazer os que já existem na
> plataforma."

Duas coisas erradas de uma vez: a instrução **não tem como funcionar** (não há conexão para
sincronizar) e o 404 nunca chegava a quem estava na tela. A API estava certa — `not_found:
"Nenhuma conexão de parceiro ativa."` (medido em `route.ts`, `contexto()`). Erro tratado como
vazio é o padrão que a doutrina do produto chama de "degradação silenciosa": o operador insiste
num caminho que não existe.

Agora `lista.isError` vem antes do vazio: 404 vira "Este número ainda não tem conexão com o
provedor parceiro — conecte na aba Provedor parceiro", e qualquer outro erro vira mensagem com
**"Tentar de novo"**.

### Instrumento: as subtelas passaram a ser ABERTAS, não só enumeradas

`docs/auditoria/09b-subtelas.md` enumerou 99 abas, 68 modais e 12 gavetas. Enumerar não é abrir.
`scripts/auditoria/captura-subtelas.mjs` abre cada uma e mede o mesmo conjunto da varredura de
rotas, mais duas coisas próprias: se a aba **ficou selecionada** e se o **conteúdo mudou**.

Resultado medido (39 telas, sessão real de `manager`, `dono` e admin, build de produção):

| Medida                                              | Resultado                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| telas abertas                                       | **53** (33 tenant + 6 do `dono` + 14 dinâmicas com id real do banco) |
| abas clicadas e medidas                             | **82** + **4 dentro de modal**                                       |
| aba clicada que **não** ficou selecionada           | **0**                                                                |
| aba que selecionou e **não mudou** o conteúdo       | **0**                                                                |
| overflow horizontal em aba aberta                   | **0**                                                                |
| aba sem `<h1>`                                      | **4 → 0** (as 4 eram a V-23: a tela de edição do agente)             |
| campo visível sem nome acessível em aba aberta      | **0** (era 2 em `/app/frota`, V-20)                                  |
| modais abertos e medidos                            | **32**                                                               |
| modal sem nome acessível (`role=dialog` sem título) | **0**                                                                |
| erro de console                                     | **1**, e virou a V-22                                                |

**Como as 20 rotas dinâmicas entraram** (40 medições, em `medicoes-dinamicas.json`). `scripts/auditoria/ids-para-rotas-dinamicas.mjs` pede um
id real ao PostgREST para cada tabela (`commercial_orders`, `shipments`, `crm_pipelines`,
`followup_flow_pointers`…), monta a URL e devolve o que não tem dado com o motivo. Sem isso,
abrir `/app/pedidos/[id]` mediria a tela de "não encontrado" e o relatório chamaria isso de "tela
vazia" — o mesmo erro do F-21. Duas rotas ficaram sem dado nesta instalação (`ai_routers` e
`lgpd_requests` estão vazias), e é isso que o artefato publica.

**O que ele não abre, com número:** **29** modais. O extrator dá o `<DialogTitle>`, não o gatilho,
e clicar em botão por semelhança de nome é como se apaga dado de cliente — "Excluir" e "Excluir
filtro" começam igual. O instrumento tem lista de verbos destrutivos e **não clica** neles;
registra cada um como `não aberto` com o motivo ("nenhum botão visível com nome relacionado",
gatilho casou mas não abriu").

### As mesmas subtelas em 390 px

As 42 abas e os 24 modais das telas de tenant foram medidos de novo em **390 px**, com a mesma
sessão e o mesmo build:

| Medida (390 px)                  | Resultado                             |
| -------------------------------- | ------------------------------------- |
| telas                            | **32**                                |
| abas clicadas e medidas          | **42**                                |
| modais abertos                   | **24**                                |
| overflow horizontal              | **0**                                 |
| aba sem `<h1>`                   | **0**                                 |
| erro de console                  | **0**                                 |
| campo visível sem nome acessível | **0**                                 |
| abas não encontradas             | **7** (as mesmas estruturais de 1440) |

Nenhuma aba vaza na largura de celular — que era a hipótese a testar: barra de abas é o
componente que mais estoura em tela estreita, e aqui as 42 rolam ou empilham dentro da largura.

**Um resultado "não determinado", e é de propósito.** Em "Importar fotos" o rótulo ganha
contador ao ativar ("Importar fotos" → "Importar fotos (12)"), o elemento é recriado, e a leitura
de `aria-current` estoura no nó que saiu do DOM. Antes o instrumento gravava `false` e inventava
"clicou e não selecionou"; agora grava `null` e o relatório diz **não determinado**. Quem não
conseguiu ler não acusa.

**O que segue não aberto, com motivo medido** — e a lista encurtou porque três causas eram minhas:

| Quantas | Onde                                                                     | Por quê                                                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6       | `/app/ai/agents/[id]` — "Configuração"…"Propostas"                       | a tela monta `AgentEditor`, **não** `AgentTabs`. Essas seis abas não existem no DOM                                                                                                                            |
| 2       | `/app/products` — "Variações", "Peso e dimensões"                        | a ficha entra **inline** ao clicar "Cadastrar produto"; a primeira aba ("Informações gerais") foi medida, as outras duas exigem a ficha aberta **no momento** da medição — clicar em outro botão antes a fecha |
| 2       | `/app/contacts/[id]` — "Pessoa jurídica/física"                          | o diálogo de **edição** não abriu naquela tela                                                                                                                                                                 |
| 2       | `/app/connections` "Templates da Meta", `/admin/tenants/[id]` "em breve" | a primeira pertence a uma barra que só monta no canal oficial; a segunda é a aba declarada como "em breve"                                                                                                     |

Duas que estavam nesta lista **saíram nesta rodada**, e as duas eram o instrumento culpando o
produto:

- **"Produtos e tabelas" e "Importar fotos"** (as duas abas caseiras de `/app/products`) não eram
  encontradas porque o laço anterior já tinha trocado de painel e as escondido. O instrumento
  passou a **recarregar a página e tentar de novo** antes de declarar ausência.
- **"Pessoa jurídica/física"** de `/app/contacts` e `/app/pedidos/novo` foram medidas: o
  instrumento passou a abrir as abas **de dentro do modal** (`Novo cliente › Pessoa jurídica`).

Também aprendi a não morrer: ler `aria-current` de um locator que acabou de sumir estourava com
"Timeout 30000ms exceeded" e derrubava o lote inteiro. Instrumento de auditoria **registra e
segue** — uma aba nunca justifica perder 50 medições.

**Dois falsos positivos do próprio instrumento, corrigidos nesta rodada** — e os dois eram o
produto estando certo:

1. **`aria-current="true"`.** `/app/ai/cases` aparecia com "aba clicada que não ficou
   selecionada": a `CaseList` marca a aba com `aria-current="true"` e o instrumento só aceitava
   `"page"`. Remedido: 0.
2. **Rótulo com contador.** `{t("Abertos")}{data ? ` (${data.open_count})` : ""}` produz o nome
   acessível "Abertos (3)"; `exact: true` com "Abertos" não casava, e 10 abas apareciam como "não
   encontradas" estando na tela. O localizador passou a cair para busca por trecho.

O terceiro erro foi meu, no instrumento, e está documentado no código: o padrão `/app/ai/agents/[id]`
reivindicava `/app/ai/agents/new` (`[^/]+` casa "new"), e a passada do `dono` mediu a tela de
**criação** gravando como se fosse a de edição — 10 "abas não encontradas" que não existiam. A
precedência passou a ser rota exata primeiro, e cada URL só pode ser consumida uma vez.

**O único erro de console que sobra** é o 404 de `/api/v1/channels/partner/templates` — e ele é
a **resposta certa** da API (`not_found: nenhuma conexão de parceiro ativa`). A V-22 corrigiu o
que importava: a tela deixou de chamar isso de "estado vazio". Silenciar o 404 exigiria a página
saber que não há conexão antes de perguntar — decisão de produto, não de instrumento.

### V-23 · Alta · A tela de edição do agente também não tinha `<h1>` — **CORRIGIDO**

A V-16 corrigiu o `<h1>` em `AgentForm`, que é a tela de **criação**
(`/app/ai/agents/new`). A tela de **edição** usa outro componente, `AgentEditor`, e continuou sem
título de nível 1 — descoberto só quando as rotas dinâmicas entraram na varredura:

```
/app/ai/agents/<id>  base  h1: []
/app/ai/agents/<id>  aba "Geral"  h1: []
```

`auditoria-aceite` não podia achar: `/app/ai/agents/[id]` é rota dinâmica e a spec mede as
estáticas. Aqui o id veio do banco (`ids-para-rotas-dinamicas.mjs`), e a tela abriu de verdade.
O título era `<h2 className="text-xl">`. Agora é `<h1>` em `text-2xl`, o canônico.

**A lição de método:** "corrigi a tela do agente" era verdade para uma das duas telas. `new` e
`[id]` **parecem** a mesma tela e são componentes diferentes (`AgentForm` e `AgentEditor`) — só
abrir as duas provou.

### V-24 · Média · Dois formulários recusavam em silêncio (só o balão do navegador) — **CORRIGIDO**

Primeira medição da Fase 2 que **submete** em vez de olhar. Instrumento novo,
`scripts/auditoria/escrita-e-validacao.mjs`, com três formulários que podem recusar sem efeito
colateral — e a regra do experimento é uma só: _submeti inválido; o produto disse o que estava
errado, onde, e sem gravar nada?_

| Caso                 | Antes                                           | Depois                                                                               |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| token com nome vazio | recusou · `mensagens: []` · `ariaInvalid: 0`    | **"Dê um nome ao token — pelo menos 2 letras."** · `ariaInvalid: 1`                  |
| fonte sem nome       | recusou · `mensagens: []` · `ariaInvalid: 0`    | **"Dê um nome à fonte — é por ele que você a reconhece depois."** · `ariaInvalid: 1` |
| convite sem e-mail   | recusou · mensagem na página · `ariaInvalid: 1` | igual (já estava certo)                                                              |

Os dois primeiros recusavam pelo `required` do HTML: o navegador mostra o balão nativo, que
**some ao sair do campo**, não usa a tipografia de erro do produto e **não marca `aria-invalid`**.
Quem usa leitor de tela ouve "entrada inválida" sem saber o motivo. E a inconsistência era dentro
do **mesmo** diálogo: o de token já validava escopos em JS (`erroEscopos`) e deixava o nome na
mão do navegador.

Conserto: `noValidate` no `<form>` + validação do nome no handler, com a mensagem no `FormField`
(`erro=`) no token e em `<p role="alert">` ligado por `aria-describedby` na fonte. Nos três casos
o instrumento agora registra `recusou: true`, `explicou: true`, `citaOCampo: true`,
`gravouApesarDeInvalido: false`.

Gate novo: `tests/unit/formulario-que-recusa-explica.test.ts` lê os **20 `<form>`** do produto e
reprova formulário que desliga a validação nativa (`noValidate`) sem ter onde escrever a recusa —
isto é, o clique em Enviar virando um no-op silencioso.

**O que este instrumento NÃO faz, de propósito:** submeter formulário **válido**. Criar registro
de teste em tela de produção é sujar o banco de quem instalou; para isso existe a suíte E2E, que
roda contra banco semeado e limpa o que cria. Aqui só se exercita o caminho de **recusa** — e
recusa, por definição, não grava. Se gravar, o registro diz `gravouApesarDeInvalido`.

### Tablet 834 px — o buraco que este relatório vinha declarando

Desde a primeira varredura o item 2.1 dizia "falta tablet: só 5 telas, medidas em dev". As 32
telas de tenant do instrumento de subtelas foram medidas em **834 × 1112**, no build de produção:

| Medida (834 px)                  | Resultado                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| medições                         | **32** (`medicoes-tablet-tenant.json`, uma linha por captura)                                          |
| status                           | **32 × 200**, 0 erro de captura                                                                        |
| overflow horizontal              | **0**                                                                                                  |
| `<h1>` ausente                   | **0**                                                                                                  |
| campo visível sem nome acessível | **0**                                                                                                  |
| erro de console                  | **1** — o 422 de disponibilidade em `/app/agenda` (V-14, estado de instalação fresca que a tela trata) |
| tempo até o HTML + assentamento  | p50 **1.334 ms** · p90 1.521 ms · máx 1.932 ms                                                         |

E os alvos de toque, que é onde tablet diverge dos dois extremos: p50 de 3 por tela, com a mesma
cauda do celular — `/app/agenda` 261, `/app/prospeccao/nova` 109, `/app/contacts` 99. Continua
**sinal**, não defeito: a maioria é checkbox de linha de tabela densa, e o alvo clicável real pode
ser a célula.

### Tabelas, densidade e paginação — medido no DOM, não na captura

Uma lista com 8 linhas e uma com 800 têm o mesmo PNG quando o servidor devolve as 800. O
instrumento `scripts/auditoria/tabelas.mjs` lê as linhas **renderizadas** de cada lista:

| Rota                                                                                | linhas | colunas | paginação | declara total |
| ----------------------------------------------------------------------------------- | ------ | ------- | --------- | ------------- |
| `/app/audit`                                                                        | **50** | 6       | sim       | —             |
| `/admin/audit`                                                                      | **50** | 6       | sim       | sim           |
| `/app/comissoes`                                                                    | **35** | 8       | —         | sim           |
| `/app/contacts`                                                                     | **25** | 9       | sim       | sim           |
| `/app/products`                                                                     | **21** | 10      | sim       | sim           |
| `/admin/users`                                                                      | 10     | 7       | —         | sim           |
| `/app/team`                                                                         | 6      | 8       | —         | —             |
| `/admin/tenants`                                                                    | 6      | 8       | —         | —             |
| `/app/estoque` · `/app/financeiro` · `/app/notas`                                   | 2      | 4–10    | —         | sim           |
| `/app/compras`                                                                      | 1      | 5       | —         | —             |
| `/app/pedidos` · `/app/expedicao` · `/app/frota` · `/app/fiscal/*` · `/app/ai/runs` | **0**  | —       | —         | —             |

**Nenhuma tabela acima de 100 linhas sem paginação — 0.** O maior volume desta instalação é o
audit log, 50 linhas, e ele **tem** paginação. As duas listas de maior densidade (contatos e
produtos) também têm.

**O que este número NÃO prova, e é o ponto:** a instalação auditada tem no máximo 50 linhas por
lista. O caso extremo que o prompt pede — "tabela grande" — **não foi reproduzido aqui**, e
declarar "o produto aguenta 10 mil linhas" a partir disso seria inventar. O que se pode afirmar:
o mecanismo de paginação existe e está ligado nas duas listas que mais crescem. O teste de carga
de lista continua dívida, com nome: `tabelas.mjs --linhas 5000` contra um banco semeado.

`/app/team` é a única com **5 células truncadas** — e truncar ali é o comportamento certo: é a
lista de pessoas, com nomes de tamanho livre.

### V-25 · Média · Dez datas seguiam o idioma do **navegador**, não o de quem lê — **CORRIGIDO**

O produto já tem uma camada de data (`useTagDeIdioma`) e um guarda que reprova `locale: ptBR`
importado à mão. O guarda cobria **idioma fixo**; não cobria **idioma ausente**. Medido:

```
toLocaleDateString()  sem argumento  em  7 arquivos
```

Sem argumento, quem decide é o navegador. Quem escolheu espanhol na interface via
`12/25/2026` — a mesma classe de defeito de antes, por outro caminho: antes o idioma era fixo em
português; agora era o do sistema, e em nenhum dos dois era o de quem lê.

Onde: `imprimir` (3 datas do documento), `RunsTable`, `VersionHistory` (2), `RunDetailDrawer` (2),
`_home-secoes` (fila de follow-ups), `contacts/[id]/_compras`, `pedidos/[id]/_detalhe`.

**E o guarda passou a cobrar a ausência.** Ao estendê-lo, ele achou **mais três** que um `grep`
por `toLocaleDateString()` não pegava — porque o receptor era expressão (`new Date(\`${l.vencimento}T12:00:00Z\`)`).
Ficaram **12** no total, e 11 foram corrigidas.

A décima segunda é o PDF de "puladas" (`lib/fiscal/puladas-pdf.tsx`), e vai para a lista de
exceções **com o motivo do autor, não com o meu**: o comentário do arquivo diz que o rodapé segue
"o locale da máquina de quem emite". Isso não é seguir quem **lê** — o PDF vai para alguém. Está
registrado como **pendente de decisão**: o certo é o idioma da organização, e isso muda a
assinatura de `renderPuladasPdf`.

### Teclado, foco e movimento reduzido — o bloco do 2.11 que não tem PNG

Foco e teclado não aparecem em captura de tela: um botão com `outline: none` é idêntico a um com
foco visível **até alguém apertar Tab**. Instrumento novo, `scripts/auditoria/teclado-e-foco.mjs`,
percorre até 40 paradas de Tab por tela nas 9 telas onde o teclado é caminho principal.

| Medida                                 | Resultado                         |
| -------------------------------------- | --------------------------------- |
| telas                                  | **9** (8 autenticadas + login)    |
| paradas de foco                        | **301**                           |
| elemento focado **sem** foco visível   | **0**                             |
| primeiro Tab é "Pular para o conteúdo" | **sim, nas 8 telas autenticadas** |
| foco dentro de `aria-hidden`           | **0**                             |

O critério é o do WCAG 2.4.7: `outline` com largura > 0, ou `box-shadow` — os dois caminhos que o
tema usa. Nenhum elemento ficou sem. E o "pular para o conteúdo" ser o **primeiro** Tab é o que
salva quem navega por teclado de atravessar 18 portas de menu antes de chegar ao conteúdo.

### V-26 · Média · O produto ignorava `prefers-reduced-motion` — **CORRIGIDO**

Com a preferência emulada, **18 de 20** elementos amostrados continuavam animando
(`transition-duration` > 0). O `uimaxxing.css` já respeitava a preferência — mas em **três
componentes nomeados** (`.pointer-cursor`, `.roll-in`, `.caret-smooth`). Todo o resto, que é onde
o produto passa o dia (botões, cards, `transition` do Tailwind), ignorava.

Para quem tem sensibilidade vestibular, transição de 150 ms não é enfeite: é desconforto. A regra
global entrou em `app/globals.css` reduzindo a duração a ~zero em vez de remover a propriedade —
`transitionend`/`animationend` continua disparando, e há componente que fecha por evento.

Depois: **0 de 20**. Medido, não presumido.

**E o instrumento errou primeiro.** A primeira rodada pós-conserto deu `movimento=20` — **pior**
que antes. A causa era a régua: ela comparava com `"0s"` e a regra global escreve `0.01ms`, que
não é `"0s"`. Ou seja, o instrumento lia "o produto respeita" como "o produto ignora". O limiar
passou a ser **≥ 20 ms de duração percebível**. É a quinta vez nesta auditoria que o defeito
estava na medição — e a regra segue a mesma: **antes de acusar o produto, provar que a régua
olhou**.

### Contraste — medido no navegador, com a cor final de cada texto

Instrumento novo, `scripts/auditoria/contraste.mjs`: para cada elemento com texto próprio, lê a
`color` computada, sobe a árvore compondo o fundo real (alfa sobre alfa é conta, não média) e
calcula a razão do WCAG — **4,5:1** para texto normal, **3:1** para texto grande. Limiar por
tamanho, como a norma manda.

**1.030 textos medidos em 8 telas. 48 abaixo do mínimo. Depois das correções: 22.**

| #    | O que era                                                                                | Números                                                           | Desfecho                                                                                |
| ---- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| V-27 | `--color-text-subtle` no tema escuro tinha o valor do **claro** (`#5e5e5e`)              | **2,82:1** sobre `#151515`, em texto de 11 px da lista de pedidos | **corrigido** → `#8d8d8d` (4,9:1 / 4,5:1 no elevado)                                    |
| V-28 | `Badge variant="mint"` = `text-mint` sobre `bg-mint-wash`, e o wash **não era temado**   | **1,95:1** nos dois temas (selo "Entregue")                       | **corrigido** → wash com alfa no escuro + `text-success-fg` (5,6:1 claro, 7,4:1 escuro) |
| V-29 | `text-fg-muted` do **uimaxxing** vazando para o produto (`#737373`)                      | **3,85:1** sobre `#151515`, 12 px                                 | **corrigido** → 19 usos passaram a `text-text-muted`                                    |
| V-29 | Legenda de gráfico pintava o **texto** com a cor da série (Recharts)                     | **3,3:1** (azul) e **3,53:1** (vermelho) sobre `#1c1c1c`          | **corrigido** → `formatter` com `text-text-muted`; o swatch continua colorido           |
| V-30 | **Paleta de categoria** usada como texto (`magenta`, `amber`, `sky`, `lavender`, `iris`) | `magenta` **4,13:1**; `amber` **1,9:1** sobre branco              | **declarado, não corrigido** — ver abaixo                                               |

### V-30 · A paleta de categoria não passa AA, e isso é decisão declarada

O próprio `globals.css` diz, no bloco dos tons de categoria: _"abaixo de 4,5 — tags curtas e
pontuação funcional, como a referência manda"_. Ou seja: não é descuido, é escolha de design
ancorada numa referência externa.

O que a medição acrescenta é o **preço exato** dessa escolha:

| Tom                 | Sobre `#1c1c1c` (escuro) | Sobre branco (claro) | AA (4,5)         |
| ------------------- | ------------------------ | -------------------- | ---------------- |
| `magenta` `#d6409f` | **4,13:1**               | **4,12:1**           | reprova nos dois |
| `amber` `#ffa600`   | 8,6:1                    | **1,9:1**            | reprova no claro |
| `sky` `#2c78fc`     | 4,7:1                    | 3,4:1                | reprova no claro |
| `mint` `#33c758`    | 7,1:1                    | **2,1:1**            | reprova no claro |

Não existe **um** hex que sirva aos dois temas: escurecer conserta o claro e quebra o escuro, e
vice-versa. Consertar de verdade exige **dois valores por tom** (um por tema) e a decisão de qual
referência vence — o que é escolha de design, não de auditoria.

O que fiz: **declarei com número** em vez de corrigir por conta própria, e apontei o caminho
(par por tema). O `mint` já foi corrigido porque o defeito ali não era a paleta: era o **wash**
não acompanhar o tema, e isso é bug, não gosto.

### V-31 · Alta · A nota rejeitada por cadastro do destinatário era corrigida a mão, campo por campo

A fila de notas para nas mesmas rejeições: **232** (IE do destinatário não informada),
**726** (endereço incompleto), documento divergente. O diálogo de correção existia, mas exigia
que alguém descobrisse o dado que falta e digitasse — inclusive a IE, que é pública.

**O que passou a acontecer.** Ao abrir uma nota com o destinatário incompleto, o sistema consulta
o cadastro público pelo CNPJ e monta um **plano**: o que preenche, de onde veio, e o que ele
**não** consegue resolver. O operador revisa e aplica nos campos com um clique; salvar continua
sendo ato separado — corrigir não é emitir.

| Peça | Onde | O que faz |
|---|---|---|
| Fonte da IE | `lib/brasil/inscricao-estadual.ts` | `publica.cnpj.ws` (a BrasilAPI **não** publica IE — verificado em 16/11/2026); `escolherIe` devolve **só** a IE da UF do destinatário |
| Cadastro completo | `GET /api/v1/fiscal/cadastro-do-cnpj` | razão social, endereço, CEP e IE em uma resposta; 422 nomeado quando a fonte cai |
| Plano puro | `lib/fiscal/correcao-automatica.ts` | `planejarCorrecaoAutomatica` devolve mudanças + pendências; não grava nada |
| Tela | `app/app/notas/_components/CorrigirNota.tsx` | painel "Correção automática", "Aplicar nos campos", "Buscar pelo CNPJ" manual |
| Cadastro de cliente | `components/contacts/{New,Edit}ContactDialog.tsx` | a busca por CNPJ passou a preencher a IE — a próxima nota não nasce sem ela |

**As três regras, e cada uma tem teste.**

1. **Nunca sobrescreve o que a pessoa digitou.** Só preenche campo vazio; endereço digitado manda.
2. **Nunca inventa dado fiscal.** IE de outra UF **nunca** é usada — isso trocaria a rejeição 232
   por divergência de UF, que é pior porque o dado parece certo. Sem IE na UF, o campo fica vazio
   e a pendência explica as opções (ISENTO × não contribuinte).
3. **O que não dá para consertar aparece na lista.** CFOP depende da operação; NCM sem cadastro do
   produto; CNPJ com dígito inválido; campo acima dos 60 caracteres do leiaute. Esconder isso
   faria a tela dizer "corrigido" e a SEFAZ recusar de novo.

**Medido:** `tests/unit/inscricao-estadual.test.ts` (13), `tests/unit/correcao-automatica.test.ts`
(17) e `tests/unit/fiscal-cadastro-do-cnpj-route.test.ts` (7) — **37 testes**, mais 3 novos em
`tests/unit/cnpj-contrato.test.ts` que prendem a segunda fonte, o caso "fonte de IE fora do ar
não derruba o cadastro" e o User-Agent da V-32 (9 no arquivo). `pnpm typecheck` 0 e
`pnpm exec eslint` 0 erros nos arquivos tocados.

**Prova em produção** (16/11, `next start` contra o banco E2E): nota de prova com rejeição **232**
e destinatário PJ sem IE e sem endereço (Petrobras, CNPJ 33.000.167/0001-01). Ao abrir, o painel
mostra **"6 campos preenchidos · 3 pendências"**; "Aplicar nos campos" preenche a IE **81281882**
(a ativa do RJ), `REPUBLICA DO CHILE`, `65`, `CENTRO`, `RIO DE JANEIRO`, `RJ` e `20031170`. As 3
pendências são NCM, CFOP e unidade do item — o que a máquina não pode adivinhar. Depois do
clique, a nota continua `erro/232` e o contato continua sem IE e sem endereço: **nada foi
gravado**. Nenhum erro de console. Capturas: `capturas/v31-correcao-automatica.png` (plano) e
`capturas/v31-correcao-aplicada.png` (campos preenchidos).

> **Não é auto-save.** O plano só entra no estado do formulário depois do clique em "Aplicar nos
> campos"; gravar continua exigindo "Salvar" ou "Salvar e reenviar". Automatizar a gravação de
> dado fiscal sem revisão seria trocar rejeição por documento errado aceito.

### V-32 · Alta · A BrasilAPI respondia 403 ao `fetch` do servidor — e o produto chamava isso de "Receita indisponível"

Descoberto ao provar a V-31 contra o build de produção: a rota nova devolveu **422 "Cadastro
público indisponível"** para um CNPJ que responde 200 no `curl`, no mesmo instante e da mesma
máquina.

| Cliente | Requisição ao mesmo CNPJ (16/11/2026) | Status |
| --- | --- | --- |
| `curl` | `GET /api/cnpj/v1/33000167000101` | **200** |
| Node 22 `fetch`, sem headers | idem | **403** |
| Node 22 `fetch`, `user-agent` próprio | idem | **200** |

A BrasilAPI passou a recusar o **User-Agent padrão do Node** (`node`). O produto usava `fetch`
sem header nenhum, então a busca de CNPJ do cadastro de cliente — e a consulta de IE da nota —
falhavam com "fonte indisponível" sem a fonte ter caído. O erro não aparecia no `curl` de
conferência justamente porque `curl` manda UA próprio.

**Corrigido:** `lib/brasil/cnpj.ts` e `lib/brasil/inscricao-estadual.ts` mandam
`accept: application/json` e `user-agent` identificando a instalação. Gate novo em
`tests/unit/cnpj-contrato.test.ts` reprova se o header sumir ou voltar a ser o UA do Node.
Medido depois: `buscarCnpj("33000167000101")` → `ok: true` com razão social, endereço e as
quatro IEs publicadas (DF/MS/RJ/RS, só a do RJ ativa).

### V-33 · Média · O instrumento de medição apagava evidência: uma rodada avulsa reduziu o artefato de 5 rotas para 1

Encontrado ao provar a V-31: para capturar a tela de notas, o instrumento foi rodado com
`--rotas /app/notas`. Como `--grupo` cai em `inicio` por padrão, ele gravou
`capturas/medicoes-inicio.json` com `writeFileSync` — e o artefato que tinha **5 rotas** ficou
com **1**. Nenhum aviso: o script terminou com `ok: 1 medições`.

| Antes da rodada avulsa | Depois |
| --- | --- |
| 5 medições (`/app`, `/app/pedidos`, `/app/kanban`, `/app/contacts`, `/app/ai`) | **1** (`/app/notas`) |

Um instrumento de auditoria que apaga evidência é o mesmo defeito que ele deveria detectar: o
relatório publica um número que o artefato não sustenta mais. Foi restaurado do git e a regra
mudou.

**Corrigido em `scripts/auditoria/medicoes.mjs`**: o arquivo passa a ser o **último resultado por
rota × largura** — o que foi remedido é atualizado, o que não foi permanece, e a mesma rota em
outra largura entra como outra chave. Leitura de arquivo ausente, vazio ou corrompido não lança.
`scripts/auditoria/captura-visual.mjs` passou a usar o mesclador e imprime o total do artefato ao
final. Gate em `tests/unit/medicoes-do-instrumento.test.ts` (**6 testes**): o primeiro caso é
exatamente o defeito medido — 5 rotas + 1 avulsa tem de resultar em 6, nunca em 1.

### V-34 · Média · O esqueleto do KPI não era o grid do KPI: 286 px de pulo e CLS 0,128

O primeiro trace de navegador da auditoria (`scripts/auditoria/desempenho.mjs`, 12 telas × 2
condições) apontou **uma** tela acima do limite de Core Web Vitals: `/app/financeiro`, com **CLS
0,130** no celular (CPU 4×, rede de 1,6 Mbps). Não era ruído — reproduziu em todas as rodadas.

**O que deslocava.** A sonda de deslocamento (mesmo contexto, mesmas condições) mostrou o painel
inteiro mover 286 px: `428 → 714` no topo da lista de abas. A causa estava antes do número chegar:

| Medida (390 px) | Esqueleto de carregamento | Cartão real (`NexusKpiGrid`) |
| --- | --- | --- |
| grid | `grid-cols-2 gap-3` + `Skeleton h-24` = **204 px** | `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`, `p-5` = **490 px** |
| cartões | 4 × 96 px, 2 colunas | **99, 99, 123, 123** (1 coluna; os dois últimos têm comparação) |

Dois grids diferentes e duas caixas diferentes: o esqueleto prometia 2 colunas e o produto
entregava 1, com cartão 27 % mais alto. Em 1440 px o erro era menor (96 → 123 px de cartão) mas
existia.

**Corrigido em `components/nexus-ui/kpi/nexus-kpi.tsx`**: nasceu o `NexusKpiSkeleton`, e ele não
tem layout próprio — usa o `NexusKpiGrid` de verdade e compartilha **uma definição** de cada peça
com o cartão que mostra número:

- `QUADRO_DO_KPI` — a caixa (`rounded-card border bg-card p-5`);
- `TEXTO_DO_ROTULO`, `TEXTO_DO_VALOR`, `TEXTO_DO_RODAPE` — as três linhas.

A primeira tentativa cravou altura em pixel (`h-5`/`h-8`) e errou **3 px por cartão** (102 contra
99): retângulo de altura fixa não adivinha `line-height`. A versão final desenha as **mesmas
classes** com o texto transparente — a altura da linha vem da fonte, não de um palpite. O
`comRodape` reproduz a linha de comparação só nos cartões que a têm.

O segundo esqueleto de KPI da mesma tela (aba *Contas a pagar*) tinha o mesmo defeito, em outro
formato: um `Skeleton h-24` onde o carregado é um grid de 4 KPIs. Também corrigido.

**Antes e depois, medidos:**

| Medida | Antes | Depois |
| --- | --- | --- |
| altura do esqueleto × cartão (390 px) | 204 × 490 px | **490 × 490 px — 0 px** |
| altura do esqueleto × cartão (1440 px) | 96 × 123 px | **123 × 123 px — 0 px** |
| CLS de `/app/financeiro` (390, CPU 4×) | **0,129** | **0,000** (3 rodadas) |
| maior CLS das 12 telas (celular) | 0,130 (`/app/financeiro`) | **0,037** (`/app/inbox`) |
| maior CLS das 12 telas (desktop) | 0,026 | 0,026 |

Artefatos: `capturas/desempenho-producao-antes-v34.json` (24 medições, antes) e
`capturas/desempenho-producao.json` (24 medições, depois). A coluna "antes" de CLS é do
instrumento; os 0,129 do diagnóstico vêm da sonda que aquece as 10 telas anteriores no mesmo
contexto — é ela que reproduz a condição do instrumento, e foi ela que apontou o elemento que
deslocava.

**Gate em `tests/unit/kpi-skeleton-espelha-o-grid.test.ts`** (708 casos): quadro e linhas têm uma
definição só, usada pelos dois componentes; o esqueleto não pode cravar `h-*`; e **nenhum arquivo
com `NexusKpiGrid` pode montar esqueleto de KPI à mão** — reintroduzi o bloco medido para conferir:
o teste reprova com o nome do arquivo.

**O que ficou de fora, de propósito:** o `/app/radar` tem grid de esqueleto `grid-cols-2 gap-3
lg:grid-cols-4`, mas ali os cartões reais são `Card p-3` (não são `NexusKpi`), e o grid do
esqueleto **já é igual** ao do conteúdo. Trocar por `NexusKpiGrid` criaria desalinhamento novo em
nome de simetria.

### V-35 · Média · A subtela de prospecção tinha o segundo `h1` da mesma página

`/app/prospeccao` é o endereço antigo: ele redireciona para
`/app/campanhas?subtela=prospeccao`. Medido no DOM das 130 rotas estáticas
(`capturas/h1-em-producao.json`), a rota entregava **dois títulos de nível 1** na mesma árvore —
"Campanha" (cabeçalho da página) e "Prospecção" (cabeçalho da subtela):

| Medida (produção, 1440) | Antes | Depois |
| --- | --- | --- |
| `<h1>` na rota | **2** — "Campanha" + "Prospecção" | **1** — "Campanha" |
| peso/tamanho | 24 px / 500 nos dois | 24 px / 500 |

Dois `h1` não é detalhe de marcação: a navegação por cabeçalhos do leitor de tela anuncia duas
páginas onde existe uma, e quem chega pelo "ir para o conteúdo principal" não sabe qual é o
assunto da tela.

**Corrigido em `app/app/prospeccao/_client.tsx`**: a subtela passa `headingLevel={2}` ao
`NexusPageHeader` — o componente já tinha essa prop exatamente para cabeçalho EMBUTIDO (o visual
não muda; muda o nível). A tela só é renderizada dentro de `/app/campanhas`, então o nível 2 é o
certo em todos os usos.

**Gate em `tests/unit/titulo-de-pagina-uma-familia.test.ts`**: todo arquivo que importa a
`_client` de outra rota não pode deixar essa tela desenhar `h1` — a subtela precisa declarar
`headingLevel={2}`. Reintroduzi o defeito para conferir: reprova apontando
`app/app/prospeccao/_client.tsx`.

`/design` continua com dois `h1` **de propósito**: é o showcase do design system, que existe para
mostrar títulos — não é tela de produto e está fora do gate por decisão, não por esquecimento.

### V-36 · Baixa · O título de página tinha dois pesos: 500 no canônico, 600 em 11 telas

O `h1` é 24 px em todas as telas de produto, mas o **peso** divergia. Medido no DOM:

| Peso do `<h1>` | Antes | Depois |
| --- | --- | --- |
| 24 px / **500** (o do `NexusPageHeader`) | 107 rotas | **117 rotas** |
| 24 px / **600** | **11 rotas** — `/`, `/app`, `/login/{forgot,mfa,recovery,reset}`, `/signup`, `/403`, `/503`, `/account-suspended`, `/vitrine-agenda` | **0** |

A divergência aparecia dentro da MESMA família: `/login` a 500 e `/login/forgot` a 600, com o
mesmo cartão e o mesmo tamanho. E dentro do mesmo componente: `StatusPage` tinha `font-semibold`
como padrão e uma variante (`acesso-negado-admin`) que corrigia para `font-medium` à mão — ou
seja, o padrão já estava errado pelo próprio código.

**Corrigido** em `app/app/_home.tsx`, nas 5 páginas de autenticação + `/signup`,
`app/vitrine-agenda/_client.tsx` e `components/nexus-ui/feedback/StatusPage.tsx` (padrão 500; a
variante mantém a cor explícita). Nada de tamanho mudou: só o peso, que agora é um só.

**Gate** no mesmo arquivo de teste: `<h1>` com `text-2xl` não pode declarar `font-semibold` nem
`font-bold`. Duas exceções **declaradas com motivo** no teste, porque ali o título é um
identificador e não um nome: `app/app/lgpd/requests/[id]/_client.tsx` (`#A1B2C3`, em mono) e
`app/o/[token]/page.tsx` ("Orçamento #123", página pública do cliente). É o item 2.16 do prompt:
onde a composição é intencional, padronizar mecanicamente seria o defeito.

**Estático × DOM, e por que os dois aparecem.** O instrumento estático de origem do título
(`titulos-de-pagina.ts`) lista 4 telas com "dois `h1`" e 24 "sem título" — e **nenhuma** das duas
coisas vale como achado: o mesmo arquivo desenha `h1` em ramos que não aparecem juntos (impressão,
modal, estado de erro) e título pode vir de componente fora do segmento. Foi o DOM que decidiu: um
`h1` visível por tela em 129 rotas, dois só em `/design`. O JSON do instrumento carrega esse aviso
no próprio artefato, para ninguém citar a lista estática como prova.

**O que a medição NÃO autoriza dizer.** A varredura também aponta 11 rotas sem `h1` **visível** —
e nenhuma delas é defeito: `/app/inbox` e `/admin/inbox` usam `sr-only` de propósito (o título
visível é o da conversa; está escrito no próprio componente), e as 9 `/onboarding/*` foram medidas
em `/app/inbox` porque a sessão de teste já passou do onboarding e a rota redireciona. Marcar isso
como "tela sem título" seria publicar o efeito da sessão, não do produto. O instrumento agora
separa `visiveis` de `ocultos` justamente para não repetir o erro.

### V-37 · Média · A terceira legenda de gráfico pintada com a cor da série

O instrumento de contraste rodou de novo depois das correções da V-29 e ainda acusou um texto
ilegível: **"Inativos antigos" a 3,53:1**, 16 px, no gráfico de carteira de `/app/indicadores`.

A causa é a mesma da V-29 — o Recharts pinta o **texto** do rótulo com a cor da série quando o
`<Legend>` não tem `formatter` —, e ela tinha sido corrigida em **duas** legendas, não na classe.
Esta era a terceira. Corrigida com o mesmo `formatter` que devolve `text-text-muted` ao rótulo (o
swatch continua colorido).

**Gate novo em `tests/unit/texto-com-cor-de-grafico.test.ts`**: nenhum `<Legend>` do produto pode
existir sem `formatter` (ou `content`). A regra passa a valer para o arquivo, não para a instância
que a medição abriu.

### V-38 · Alta · O selo de status usava a paleta de categoria como cor de texto

Os outros **21** dos 22 textos reprovados eram o mesmo caso: o selo "Faturado" da lista de
pedidos, 12 px, **4,13:1**. O `Badge variant="magenta"` pintava o texto com `--color-magenta` — a
cor de gráfico.

O que a medição de um selo esconde: os outros variants da mesma família estavam **piores** e não
apareciam na tela medida.

| Variant (`text-*` sobre `surface`) | Antes, tema claro | Depois (`-fg`) |
| --- | --- | --- |
| `amber` ("Em orçamento") | **1,96:1** | **6,39:1** (`#8a5200`) |
| `mint` ("Entregue") | 2,22:1 | já corrigido na V-28 (`success-fg`) |
| `ember` | **3,53:1** | **6,44:1** (`#b32b00`) |
| `sky` ("Aprovado") | **4,04:1** | **6,98:1** (`#1d56b0`) |
| `magenta` ("Faturado") | **4,13:1** | **6,91:1** (`#a3246f`) |

**Corrigido** com tokens de TEXTO por tema — `--color-{amber,sky,ember,magenta}-fg` (no escuro:
`#ffc46b`, `#8ab4ff`, `#ff9b80`, `#f07ac0`, todos ≥ 6,7:1 sobre `#1c1c1c`) — usados pelos quatro
variants do `Badge`. A paleta `--color-*` intacta para gráfico, swatch e ilustração: é para isso
que ela existe.

**Resultado da varredura, nas mesmas 8 telas:** **22 → 0** textos abaixo do mínimo. O denominador
mudou junto (**867 → 1.030** textos medidos): as telas com lista e gráfico renderizam quantidades
diferentes a cada rodada, e o total acompanha. O número que importa é o de reprovados, e ele é
zero — com a ressalva, escrita no próprio artefato, de que **27 elementos por tela não são
medidos** por terem `background-image` (gradiente ou foto).

**E a V-30 continua de pé:** a paleta de categoria segue abaixo de AA — como cor de gráfico e tag
curta, que é o uso declarado. O que mudou é que ela deixou de ser cor de TEXTO em selo de status.

### V-39 · Alta · Um clique em "Criar cliente" virava três POSTs — e a deduplicação era acidente do schema

O item 2.10 pergunta duas coisas: há feedback imediato? **dois envios criam dois registros?** A
segunda não se responde lendo `disabled={isPending}` — responde-se clicando. E clicar em formulário
que grava cria registro no banco de quem instalou, o que o instrumento não pode fazer.

Instrumento novo, `scripts/auditoria/feedback-e-duplicidade.mjs`: o POST é **interceptado e
abortado depois de 2,5 s**. Nada chega ao banco, e o que se mede é o que a pessoa veria nesse
intervalo — botão desabilitado, rótulo, erro — mais a contagem de requisições.

O resultado, no diálogo de cliente:

| Medida | Antes | Depois |
| --- | --- | --- |
| POSTs por **um** clique | **3** (mesma `Idempotency-Key`) | **1** |
| botão desabilitado durante o envio | sim | sim |
| rótulo durante o envio | "Criando…" | "Criando…" |
| erro visível quando a resposta falha | sim | sim |

A causa estava em `lib/api/client.ts`: erro de rede/timeout repetia a requisição **até 3 vezes para
qualquer método**, inclusive os que gravam. "Sem resposta" não distingue "o servidor não recebeu" de
"o servidor gravou e a resposta se perdeu" — e repetir a segunda é criar duplicata.

**O que evitava a duplicata não era desenho.** O mesmo POST três vezes com a mesma chave só gerou
**um** contato porque o schema tem índice único em `(organização, telefone)` — conferido no banco
depois da rodada. E `Idempotency-Key`, o mecanismo que deveria cobrir isso, é lido por **duas**
rotas do produto (`grep -rln "idempotency-key" app/api` → `lgpd/requests/[id]/approve` e
`financeiro/recebiveis/[id]/pagamentos`). Num recurso sem campo único — template, por exemplo — os
três POSTs criam três registros.

**Corrigido em `lib/api/client.ts`**: erro de rede em método que grava **não repete**. `429` e `503`
continuam repetindo, porque ali o servidor disse explicitamente "não processei, tente depois" — e
essa distinção é o conserto, não um detalhe. Leitura (GET/HEAD) continua repetindo: repetir leitura
é seguro.

**Gate em `lib/api/client.test.ts`**, com o caso medido em forma de teste: POST com falha de rede é
chamado **uma** vez (t7); GET continua tentando três (t8); POST com `429` continua repetindo (t9).

**O que fica em aberto, com nome:** a `Idempotency-Key` não é honrada pela maioria das rotas. O
conserto do cliente remove o caminho que duplicava sem o servidor saber; implementar a dedupe
server-side (tabela de chaves + TTL, ou `on conflict`) é decisão de arquitetura, não um ajuste de
tela — e fica registrado como dívida em vez de "resolvido".

### V-40 · Baixa · Quatro botões de envio desabilitavam sem dizer o que estavam fazendo

A mesma rodada mediu o **feedback**: no diálogo de template o botão desabilitava e continuava
escrito "Criar template" — o clique não dava resposta nenhuma além do silêncio. No de cliente, o
mesmo gesto dizia "Criando…".

Contagem estática nos **35** botões `type="submit"` do produto: **4** desabilitavam sem rótulo de
progresso (template, renomear agente, token de API, fonte de captação). Os quatro passaram a dizer
"Criando…"/"Salvando…".

**Depois, medido no navegador:** template — `Salvando…`, botão desabilitado, **1 POST**, erro
visível quando a resposta falha. Cliente — `Criando…`, desabilitado, 1 POST, erro visível.

**Gate em `tests/unit/botao-de-envio-diz-o-que-faz.test.ts`** (686 casos): todo `<Button
type="submit">` precisa de `disabled` **e** de um rótulo de progresso no ternário. Reintroduzi o
rótulo antigo do template para conferir: reprova.

### V-41 · Baixa · A varredura media uma rota que não existe e chamava o 404 de defeito do produto

Ao medir as larguras extremas do item 2.13, `/app/lgpd` respondeu **404**. O menu aponta para
`/app/lgpd/requests` (`lib/navigation/registry.ts`), e `/app/lgpd` não existe como página — o erro
era do **grupo de rotas do instrumento**, não do produto.

| Medida | Antes | Depois |
| --- | --- | --- |
| `/app/lgpd` (320 px) | **404** | rota saiu do grupo |
| `/app/lgpd/requests` (320 px) | não era medida | **200**, 0 overflow |

O grupo foi corrigido e as três linhas do 404 foram **removidas do artefato com o motivo escrito** —
um instrumento que apaga evidência é o defeito da V-33; um que **mantém** medida de rota inexistente
publica um 404 que o produto não tem. A saída foi nomear as duas coisas.

### Larguras extremas — 320, 360 e 430 px (o bloco do 2.13 que faltava)

O instrumento ganhou os extremos: `estreito` (320 × 720), `compacto` (360 × 780) e `grande`
(430 × 932). Antes ele media 1440, 834 e 390 — o **meio**, não o pior caso.

| Largura | Rotas | Overflow horizontal | status ≠ 200 | alvos < 40 px (p50 / máx) |
| --- | --- | --- | --- | --- |
| **320** | 20 | **0** | 0 | 7,5 / **99** (`/app/pedidos`) |
| **360** | 5 | **0** | 0 | 11 / 75 |
| **430** | 5 | **0** | 0 | 10 / 74 |

Somando às 258 medições em 1440/390 e às 32 em 834, o produto **não rola na horizontal em nenhuma
das 6 larguras medidas** — 320 inclusive, que é o iPhone SE de primeira geração.

E o sinal da V-06 fica mais forte quanto mais estreita a tela: a mediana de alvos abaixo de 40 px
sai de **3** (390) para **7,5** (320), e `/app/pedidos` chega a **99**. Não é regressão — é a mesma
tabela densa em menos espaço; o número mostra onde a próxima passada de toque deve olhar.

### Busca, "carregar mais" e seleção em massa — o 2.7 medido com o dedo

A matriz de telas prova que a tela **tem** filtro; não prova que digitar filtra. Instrumento novo,
`scripts/auditoria/lista-busca-e-paginacao.mjs`, digita e conta linha antes/depois — com o termo
batendo em dado que o seed deixou.

| Tela | Medida | Resultado |
| --- | --- | --- |
| `/app/contacts` | linhas antes → com "E2E" | **25 → 19** |
| `/app/contacts` | "Carregar mais" | **25 → 50** linhas |
| `/app/pedidos` | pedidos na visão de cartões → com "E2E" | **49 → 11** |
| `/app/pedidos` | visão Tabela | **47** linhas |
| `/app/pedidos` | "selecionar todos" | **47 selecionados** |

Três visões convivem em Pedidos (Cartões, Tabela, Quadro) e a seleção em massa vive na Tabela — o
número acima é o contador real depois do clique, não o texto do componente.

**O que a medição mostra e o produto não faz:** depois de filtrar, a URL continua `/app/contacts` e
`/app/pedidos` — o filtro **não** vai para a URL nessas duas telas. Recarregar perde o recorte, e o
link compartilhado abre sem ele. Não é regressão desta rodada e não entra como "corrigido": é
decisão de produto (o mesmo tema do 4.5), registrada com medida.

**Falta no 2.7:** ordenação por coluna (nenhuma das duas telas tem cabeçalho ordenável) e seleção em
massa fora de Pedidos.

### V-42 · Média · Offline, "Carregar mais" não fazia nada — nem requisição, nem aviso

O estado que o item 2.9 pede e que ninguém tinha medido é o **offline**. Instrumento novo,
`scripts/auditoria/offline-e-erro.mjs`: a tela carrega, o navegador vai para offline
(`context.setOffline(true)`) e o instrumento provoca uma busca de dados — primeiro uma **ação** com
a tela já carregada, depois um **reload**.

| Medida (offline, com a tela carregada) | Antes | Depois |
| --- | --- | --- |
| clique em "Carregar mais" (contatos) | 25 linhas → **25**, nenhuma requisição, nenhum aviso, botão inalterado **por 20 s** | mensagem "Sem conexão. O que já carregou continua na tela…" |
| reload offline (contatos, inbox, financeiro) | — | **app abre** (service worker ativo) com "Algo deu errado … Tentar novamente" |
| reload offline (pedidos) | — | app abre, **sem alerta** — registrado como **F-28** em aberto |

O clique silencioso tinha causa específica: o TanStack Query, no modo `online` (o padrão), **pausa**
a busca quando não há rede — não dispara requisição, não erra, não avisa. `isFetchingNextPage`
continua falso, então o botão não desabilita e não muda de rótulo. Para quem está no galpão, o app
simplesmente não responde.

**Corrigido em `app/app/contacts/_client.tsx`**: quando a query está pausada (`q.isPaused`), o botão
dá lugar a uma linha de status — "Sem conexão. O que já carregou continua na tela; os próximos
clientes vêm quando a rede voltar." O recorte atual continua visível, que é o comportamento certo
para quem perdeu o sinal no meio da lista.

**A régua errou duas vezes antes de acertar** — as duas foram medidas e as duas ficaram no registro:
1. a primeira versão recarregava offline **antes** de o service worker controlar a página e
   registrava "Sem internet" (a página do navegador) como se o produto não tivesse tela. O app tem
   SW ativo (`sw.js`, `clients.claim`): recarregar uma vez com rede e só então cortar a conexão
   mostra o app inteiro;
2. a segunda capturava o primeiro `h1`/`h2` como "texto de erro" e anotava "Visão geral" — o título
   da tela. Agora lê `[role="alert"]` primeiro.

`/app/pedidos` continua sem dizer nada no reload offline: a lista fica vazia e não há alerta, enquanto
contatos, inbox e financeiro mostram "Algo deu errado" com "Tentar novamente". Fica como **F-28,
aberto e medido** — o caminho de dados de Pedidos é servidor + SW, e o conserto é da frente 7
(PWA/offline), não deste item.

### V-43 · Alta · Offline, o Audit Log dizia "Nenhum log no período" — afirmação sobre o dado quando o problema era a rede

A varredura offline de V-42 mediu cinco telas. Quatro se comportaram (ou ficaram em silêncio); a
quinta **mentiu**:

| Situação (offline) | Antes | Depois |
| --- | --- | --- |
| reload em `/app/audit` | "**Nenhum log no período.**" | "Não foi possível carregar o log. Tente novamente." |
| busca pausada na mesma tela | "Nenhum log no período." | "Sem conexão. O que já carregou continua na tela…" |

As duas situações foram medidas: no reload a query **erra** (o service worker serve a casca, a busca
falha), e com a tela viva a query fica **pausada**. Antes, as duas caíam no mesmo ramo e viravam a
mesma frase errada.

A mecânica é a mesma do botão pausado: offline, o TanStack Query **pausa** a busca. `isLoading`
fica falso (a query não está buscando, está esperando rede) e `rows` está vazio — então a tela cai
no ramo do **estado vazio** e afirma que não há log. Para quem audita, é a diferença entre "não
aconteceu nada" e "eu não consegui olhar".

**Corrigido em `app/app/audit/_client.tsx`**: o ramo `q.isPaused` mostra o aviso de conexão e o
`q.isError` mostra erro com o texto de falha — os dois vêm **antes** do "Nenhum log no período", que
passa a significar só o que diz.

**A regra que fica, e vale para qualquer lista:** estado vazio é afirmação sobre o DADO. Ele só pode
aparecer quando a busca terminou com sucesso. Busca pausada (offline) e busca com erro têm os seus
próprios ramos.

## 3. O que está bom — e foi medido, não elogiado

Números da varredura de **16/11 contra build de produção** (`pnpm build` + `pnpm exec next start`):
**129 rotas estáticas × 2 larguras = 258 medições**, em três lotes (`producao-tenant`,
`producao-admin`, `producao-publica`).

| Medida                           | Resultado                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| status HTTP                      | **256 × 200** e **2 × 500** — os dois do `/500`, que é a página de erro (esperado)                             |
| erro de captura                  | **0** (nenhum `ERR_CONNECTION_REFUSED`, nenhum timeout)                                                        |
| rede assentou                    | **258 de 258** medições                                                                                        |
| overflow horizontal > 0          | **0 de 258**                                                                                                   |
| erro de console                  | **4 medições** em 2 rotas: `/app/agenda` (422 de disponibilidade, V-14) e `/500` (a própria página de erro)    |
| `<h1>` ausente                   | **0**                                                                                                          |
| campo visível sem nome acessível | **0**                                                                                                          |
| tempo até o HTML + assentamento  | desktop **p50 1.495 ms** · p90 1.990 ms · máx 2.838 ms; celular **p50 1.172 ms** · p90 1.536 ms · máx 1.920 ms |

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

| Não coberto                                                                 | Motivo medido                                                                                                                                                                       |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2 das 26 rotas dinâmicas** (`[token]`) | abrir sem id mede a tela de "não encontrado" e viraria "tela vazia" no relatório. Das 26, o instrumento pede id real ao banco para **24**: **20 medidas** em desktop e celular (40 medições, `medicoes-dinamicas.json`, todas 200, 0 overflow, 0 erro de console) e **4 sem dado** nesta instalação (`ai_routers`, `lgpd_requests` ×2, `incidents` — tabelas vazias, com motivo no JSON). As **2 restantes** são as de token gerado (`/o/[token]`, `/team/accept-invite/[token]`), que exigem criar o token antes de abrir |
| `/onboarding/*` (9 rotas)                                                   | a conta do seed já completou o onboarding: todas redirecionam para `/app/inbox`. Auditar onboarding exige uma conta recém-criada, que a suíte E2E não mantém                        |
| `/login/mfa`                                                                | a sessão do seed já está autenticada: redireciona para `/app/inbox`                                                                                                                 |
| **tablet 834 px**                                                           | **medido depois**, em 32 telas de tenant (§ "Tablet 834 px") — a lacuna que resta é que essas 32 não são as 129: a varredura completa rodou em 1440 e 390                              |

### Redirecionamentos medidos — 26 de 129 (e nenhum é link quebrado)

A varredura segue o redirect e mede a tela de destino. Os 26 se dividem em três grupos, e o
número de cada grupo fecha com `medicoes-producao-*.json`:

| Destino      | Rotas | O que é                                                                                                                                                                                                                                                   |
| ------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/403`       | 10    | guarda de papel: `manager` pedindo tela de `admin`                                                                                                                                                                                                        |
| `/app/inbox` | 10    | sessão já autenticada: 9 de `/onboarding/**` + `/login/mfa`                                                                                                                                                                                               |
| outra tela   | 6     | **alias antigo** que continua funcionando: `/app/lgpd/requests`→`/app`, `/app/metrics`→`/app/indicadores`, `/app/prospeccao`→`/app/campanhas`, `/app/recuperacao`→`/app/radar/recuperacao`, `/app/titulos`→`/app/financeiro`, `/admin`→`/admin/dashboard` |

Os 6 aliases são um acerto que a auditoria não esperava encontrar: link antigo no menu do
navegador de um cliente não vira 404. Os 10 de `/403` e os 10 de `/app/inbox` são o motivo pelo
qual `onboarding`, `login/mfa` e as telas de papel `admin` **não** têm auditoria visual nesta
rodada — o que se mediria ali é a tela de destino, não a tela pedida (§ "O que a varredura NÃO
cobriu").

### Falsos positivos descartados antes de virarem achado

| Parecia                                    | Era                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `/app/lgpd` responde 404                   | a rota real é `/app/lgpd/requests` (`lib/navigation/registry.ts`); erro meu de rota                          |
| `/admin` cai em "Acesso negado"            | `manager` não é admin de plataforma — comportamento correto, com estado próprio                              |
| `/admin/platform-admins` "não abre" (45 s) | `networkidle` nunca assentava por causa do prefetch do menu (V-10)                                           |
| `/admin/platform-admins` responde 404      | o link do runbook no aviso "somente DBA" (V-13) — o 404 era real, mas de um `<a>`, não da tela               |
| `/app/agenda` com erro de console 422      | instalação sem `attendant_availability`; a tela trata (V-14)                                                 |
| 11 campos sem rótulo em `/app/products`    | o detector contava `type=hidden` e campo dentro de `<label>`; corrigido, restaram **3 rotas** com 1–2 campos |
| círculo "N" cobrindo "Recolher" no rodapé  | indicador de dev do Next, não elemento do produto                                                            |
| botão flutuante cobre a barra inferior     | TanStack Query Devtools, só em `NODE_ENV=development` (V-03)                                                 |

## 4. Cobertura do checklist

| #    | Item                                                                | Estado | Medido                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | Avaliar em execução e no código; desktop/tablet/celular             | `[~]`  | **129 rotas estáticas** contra build de produção em 1440 e 390 (258 medições), **32 telas em tablet 834** e **20 rotas dinâmicas com id real** em desktop e celular (40 medições, todas 200, 0 overflow, 0 erro de console). **4 dinâmicas sem dado** com motivo (`ai_routers`, `lgpd_requests` ×2, `incidents`); **2 de token** exigem criar o token. **Falta**: as 2 rotas de token |
| 2.2  | Se impedido, registrar bloqueio sem alegar inspeção visual          | `[x]`  | Nada foi alegado sem execução; o que não foi coberto está listado com o motivo (§3)                                                                                                                                                                                                                                                                                                                                                            |
| 2.3  | Propósito e próximo passo evidentes                                 | `[x]`  | Título de aba próprio em todas as rotas (V-01) e `<h1>` em todas as medições depois de V-02, V-08 e V-12 — inclui o vazio de `/app/pedidos/imprimir`, que passou a ter próximo passo                                                                                                                                                                                                                                                           |
| 2.4  | Hierarquia e densidade                                              | `[~]`  | Lida nas 258 capturas; sem medição de densidade                                                                                                                                                                                                                                                                                                                                                                                                |
| 2.5  | Consistência de headers, breadcrumb, ações, filtros, navegação      | `[~]`  | **Título medido no DOM das 129 rotas estáticas**: 117 de 119 `h1` visíveis a 24 px / 500, **um `h1` por tela** (V-35 e V-36 corrigidos; 2 exceções declaradas: `/design` e os títulos que são identificador). `sr-only` separado de visível no instrumento. **Breadcrumb**: 52 de 129 rotas têm; shell e barra de filtros consistentes nos 258 screenshots. **Falta**: decidir se breadcrumb é padrão de todas as telas internas ou só das profundas |
| 2.6  | Cliques/digitação em tarefas frequentes                             | `[~]`  | **Cliques reais exercitados pela suíte E2E** (16 jornadas, 254 testes verdes): a contagem por tarefa só existe para `jornada-venda` (**5 cliques + 5 digitações** do login ao pedido criado); nas demais o teste mede o resultado, não o esforço. **F-27 fechado**: o mapa de empresas não abria porque um efeito de URL escrevia no alias `/app/prospeccao` e remontava a tela — a aba Empresas voltava para Campanhas. **Falta**: instrumento de contagem por tarefa (quantos cliques/digitações cada jornada custa) |
| 2.7  | Busca, ordenação, filtros, paginação, seleção em massa              | `[~]`  | **Medido no dedo** (`lista-busca-e-paginacao.mjs`): contatos 25 → 19 linhas com "E2E" e 25 → 50 com "Carregar mais"; pedidos 49 → 11 com o termo, 47 linhas na visão Tabela e **"47 selecionados"** após selecionar todos. **Não vai para a URL**: filtro em `/app/contacts` e `/app/pedidos` não sobrevive a reload (decisão de produto, 4.5). **Falta**: ordenação por coluna e seleção em massa fora de Pedidos |
| 2.8  | Formulários                                                         | `[x]`  | **3 formulários submetidos vazios** em produção: os 3 recusam, explicam na página, citam o campo e não gravam (`escrita-e-validacao.mjs`); gate `formulario-que-recusa-explica.test.ts`. Correção de nota rejeitada ganhou o plano de preenchimento (V-31)                                                                                                                                                                                     |
| 2.9  | Estados (loading, vazio, erro, sucesso, offline, permissão negada)  | `[~]`  | **Offline medido em 5 telas** (`offline-e-erro.mjs`): com SW ativo o app abre; contatos/inbox/financeiro mostram "Algo deu errado … Tentar novamente"; ação pausada avisa "Sem conexão" (V-42) e o Audit Log deixou de dizer "Nenhum log" quando a busca só estava pausada (V-43). **Pedidos offline segue mudo** — F-28. Loading/vazio/erro/sucesso por V-07/V-09/V-12/V-25; permissão negada em 10 rotas. **Falta**: offline de escrita (fila/outbox) — frente 7 |
| 2.10 | Feedback imediato e prevenção de duplicidade                        | `[~]`  | **Medido no clique** (`scripts/auditoria/feedback-e-duplicidade.mjs`, POST abortado após 2,5 s — nada grava): cliente novo e template novo mostram botão desabilitado, rótulo de progresso, **1 requisição por envio** e erro visível quando a resposta falha. Antes: **3 POSTs por clique** (V-39 — o cliente repetia erro de rede em método que grava) e 4 de 35 botões de envio mudos (V-40). **Falta**: dedupe server-side da `Idempotency-Key`, hoje lida por **2** rotas |
| 2.11 | A11y: contraste, foco, teclado, leitor, toque, zoom, reduced motion | `[~]`  | **Contraste medido no navegador** (8 telas, cor final de cada texto sobre o fundo real): de **22 abaixo do mínimo** para **0 de 1.030** depois de V-37/V-38 (V-27 a V-30 na rodada anterior). 27 elementos por tela ficam fora por terem `background-image` — contados, não aprovados. **Foco/teclado**: 301 paradas em 9 telas, 0 sem foco visível, "Pular para o conteúdo" é o primeiro Tab. **Movimento**: 0 de 20 animando com `prefers-reduced-motion`. **Alvos de toque**: p50 de 3 por tela abaixo de 40 px (V-06, sinal). **Falta**: leitor de tela real (NVDA/VoiceOver) e zoom 200% |
| 2.12 | Casos extremos                                                      | `[~]`  | Extremos fiscais cobertos por teste: IE ausente e IE de outra UF, CNPJ com dígito inválido, documento fora de 11/14, campo acima dos 60 do leiaute, fonte pública fora do ar (V-31). Extremos de volume/encoding não exercitados                                                                                                                                                                                                              |
| 2.13 | Largura/overflow, sticky, modais, drawers em telas estreitas        | `[~]`  | **Overflow 0 em 6 larguras**: 320 × 20 rotas, 360 × 5, 430 × 5, 390 × 129, 834 × 32, 1440 × 129 — nenhuma rola na horizontal, 320 inclusive (V-41 corrigiu o 404 que era da régua). **Alvos < 40 px**: p50 3 em 390, **7,5 em 320** (máx 99 em `/app/pedidos`) — V-06 segue sinal. **Falta**: teclado virtual sobre campo focado e rotação |
| 2.14 | Idioma, moeda, datas, timezone, convenções BR                       | `[~]`  | pt-BR e R$ corretos; formato de data depende do navegador (V-04, decidir)                                                                                                                                                                                                                                                                                                                                                                      |
| 2.15 | Desempenho percebido e gráficos                                     | `[~]`  | **Medido em produção** (V-05 fechado): desktop p50 1.495 ms / p90 1.990 ms / máx 2.838 ms; celular p50 1.172 ms / p90 1.536 ms / máx 1.920 ms. **Trace do navegador** (`scripts/auditoria/desempenho.mjs`, 12 telas × 2 condições, 24 medições): desktop LCP máx **924 ms** (`/app/agenda`), CLS máx **0,026** (`/app/inbox`), TBT 0–17 ms; celular (CPU 4×, 1,6 Mbps/150 ms) LCP máx **1.428 ms**, CLS máx **0,037** (`/app/inbox`), TBT máx **181 ms** (`/app/pedidos`, sinal — repete entre rodadas, não provado como defeito). O CLS de `/app/financeiro`, que era **0,130**, é **0,000** depois da V-34. Artefatos: `capturas/desempenho-producao.json` e `...-antes-v34.json`. **Falta**: INP (exige interação real, é o que a suíte E2E exercita) e custo de render dos gráficos por canvas                                                                                                                                                                                                                                    |
| 2.16 | Não padronizar mecanicamente onde a composição é intencional        | `[x]`  | O título vem de UMA fonte e cada tela mantém sua composição                                                                                                                                                                                                                                                                                                                                                                                    |

**Fase 2: em andamento.** **36 achados corrigidos** com medida antes/depois — as 20 seções
marcadas `CORRIGIDO` (V-01, V-02, V-07, V-08, V-09, V-10, V-12, V-13, V-15, V-16, V-17, V-18,
V-19, V-20, V-21, V-22, V-23, V-24, V-25, V-26), V-27, V-28 e V-29 (tabela de contraste) e
V-31 (correção automática da nota), V-32 (403 do cliente HTTP na BrasilAPI) e V-33
(o instrumento que apagava o próprio artefato), V-34 (esqueleto de KPI com grid divergente), V-35 (segundo `h1` na subtela de prospecção) e
V-36 (título de página com dois pesos), V-37 (legenda pintada com a cor da série) e V-38
(selo de status usando a paleta de categoria como texto), V-39 (POST repetido em erro de
rede), V-40 (botão de envio mudo) V-41 (a varredura media rota inexistente) V-42 (ação pausada offline sem aviso) e V-43 (estado vazio mentindo offline);
V-03 e V-11 descartados com prova; V-05 **fechado** (produção medida); V-06 é sinal a confirmar
por clique; V-14 é observação. V-04 aguarda **decisão de produto**.

As **16 jornadas** (J1–J16) foram mapeadas, medidas e executadas: **254 testes E2E verdes** em
37,1 min, com 7 falhas abertas uma a uma — 5 consertadas (4 do produto, 1 spec obsoleta, 1 de
orçamento de teste) e 1 achado novo (F-27, o mapa de empresas) — **fechado em 17/11** com a causa
provada: um efeito de URL escrevia no alias `/app/prospeccao`, navegava e remontava a tela, e a aba
Empresas voltava para Campanhas. Relatório: [`13-jornadas.md`](13-jornadas.md).
