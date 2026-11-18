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

> **Ressalva medida em 18/11/2026:** estes números são do tema **escuro**. O produto é dark-first
> e o instrumento abria as telas sem escolher tema; o claro não foi medido nesta rodada. Depois
> de corrigi-lo para percorrer os dois, o claro reprovou por `--color-text-subtle` — ver V-52.

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
| reload offline (pedidos) | app abre, **sem alerta**, lista vazia — F-28 | **app abre** com "Sem conexão. A lista pode estar desatualizada…" e "Tentar novamente"; a volta da rede revalida sozinha (F-28 corrigido em 17/11/2026) |

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

`/app/pedidos` também ficou muda no reload offline (lista vazia, sem alerta) — **F-28**, registrado
na ocasião. Corrigido em 17/11/2026: a tela assina `online`/`offline` com `useSyncExternalStore` e
mostra `role="alert"` com "Sem conexão. A lista pode estar desatualizada…" + "Tentar novamente";
quando a rede volta, o alerta some e `router.refresh()` revalida a lista. A falha da consulta no
servidor também deixou de virar lista vazia: o erro é logado e a tela diz "Não foi possível carregar
os pedidos." (gate `tests/unit/pedidos-offline.test.tsx`). A medida em navegador do instrumento
`offline-e-erro.mjs` fica para a próxima rodada; a prova deste conserto é o teste de componente.

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

### V-44 · Média · Offline, Pedidos não dizia que a lista falhou (F-28)

O reload offline de `/app/pedidos` abria a casca do service worker e deixava a lista vazia — sem
alerta, sem ação, indistinguível de "não há pedidos". Contatos, inbox e financeiro já diziam o que
aconteceu; Pedidos é a tela de onde sai a operação do dia.

**Corrigido em `app/app/pedidos/_client.tsx`**: a tela lê `navigator.onLine` por
`useSyncExternalStore` (servidor renderiza "online", sem mismatch de hidratação) e, fora da rede,
mostra `role="alert"` com "Sem conexão. A lista pode estar desatualizada; os pedidos voltam quando a
rede voltar." e "Tentar novamente". A transição offline→online dispara `router.refresh()`. O erro da
consulta do servidor também passou a chegar à tela (`erroInicial`): "Não foi possível carregar os
pedidos.", em vez de uma lista vazia afirmando ausência de dado.

Gate: `tests/unit/pedidos-offline.test.tsx` (2 casos: alerta offline + volta da rede revalida; erro
de carga não vira lista vazia). A regra do V-43 vale aqui também: **estado vazio é afirmação sobre o
dado**; falta de rede e erro de leitura têm ramos próprios.

### Hierarquia e densidade — 12 telas medidas na primeira dobra (2.4)

Instrumento novo, `scripts/auditoria/hierarquia-e-densidade.mjs`: em 1440 × 900, conta por tela a
**ação primária** (botão/link com fundo opaco que se destaca do fundo da página), as secundárias, os
alvos na dobra e os **caracteres por linha** de cada parágrafo com mais de uma linha.

| Tela | Primárias | Secundárias | Alvos na dobra | títulos | linha |
| --- | --- | --- | --- | --- | --- |
| `/app/pedidos` | **1** (Criar pedido) | 17 | 32 | 1 | — |
| `/app/contacts` | **1** (Novo cliente) | 33 | **50** | 1 | — |
| `/app/kanban` | **1** (Novo funil) | 6 | **7** | 1 | — |
| `/app/financeiro` | **1** (Filtrar) | 13 | 17 | 1 | — |
| `/app/notas` | **1** (Emitir nota) | 15 | 19 | 1 | — |
| `/app/expedicao` | **1** (Nova carga) | 16 | 18 | 2 | — |
| `/app/prospeccao` | **1** (Criar campanha) | 13 | 16 | 2 | — |
| `/app` | 0 | 13 | 13 | 2 | 45 ch |
| `/app/inbox` | 0 | 10 | 11 | 1 | — |
| `/app/ai` | 0 | 16 | 16 | 4 | 40 ch |
| `/app/settings` | 0 | 14 | 14 | 5 | 37 ch |
| `/admin` | — | — | — | 1 | — |

**Hierarquia: disciplinada.** As sete telas de operação têm **exatamente uma** ação primária — não
há duas portas de mesmo peso competindo. Onde não há primária (`/app`, `/app/ai`, `/app/settings`,
`/app/inbox`) são telas de leitura/hub: o certo é não haver mesmo um botão cheio pedindo clique.

**Densidade: varia 7×.** Kanban tem **7** alvos na dobra; Contatos tem **50** — 25 linhas × duas
ações por linha. Não é defeito por si (lista densa é o trabalho), mas é onde o próximo ajuste de
densidade deve olhar.

**Leitura: só 3 telas têm parágrafo de mais de uma linha**, e a maior média é **45 caracteres por
linha** — dentro do confortável, longe dos 95 que cansam.

`/admin` aparece sem números porque a sessão medida é de organização e a rota **redireciona** para
`/admin/dashboard`; medir uma tela de plataforma com sessão de tenant seria publicar outro produto.

**A régua errou duas vezes, e as duas ficaram no registro:** (1) "primária" por nome de classe dava
**0 em toda tela** — o `Button` compõe as classes em build e o `<Button asChild>` vira `<a>`; a
detecção passou a ser por **cor computada** (fundo opaco que se destaca do fundo da página); (2)
"linha longa" medida pela **largura da caixa** dava 138 caracteres numa frase de 40 — caixa larga não
é linha longa; agora um `Range` conta as linhas renderizadas e divide o texto por elas.

### V-44 · Média · Nome longo dobrava a linha da lista; nome de import de planilha quadruplicava

O item 2.12 pede casos extremos. O seed limpo não tem nenhum, então o instrumento
(`scripts/auditoria/casos-extremos.mjs`) **cria** dois contatos no banco de E2E, mede e **apaga** —
inclusive em erro. Dois extremos, de propósito: um realista (49 caracteres, nome composto de gente)
e um patológico (128 caracteres com emoji, o que um import de planilha traz).

| Medida (lista de contatos) | Antes | Depois |
| --- | --- | --- |
| altura da linha — nome realista | **97 px** | **53 px** |
| altura da linha — nome patológico | **177 px** | **53 px** |
| nome truncado com reticências | **não** (quebrava em 3–6 linhas) | **sim**, com o nome inteiro no `title` e na ficha |
| overflow horizontal (1440 e 320) | 0 | 0 |

Uma linha normal mede ~44 px. Ou seja: **um** contato com nome composto ocupava o espaço de dois, e
um vindo de import ocupava o de quatro — na tela que a operação mais abre. Nada estava "quebrado";
estava caro de ler.

**Corrigido em `components/contacts/ContactsTable.tsx`**: a célula do nome ganhou `max-w-[240px]` no
`<Link>` com `truncate` e `title`, e o e-mail (que também estourava) ganhou `max-w-[220px] truncate`.
O `title` é o que impede o corte de virar perda de informação.

**A régua errou uma vez:** a primeira medição dizia "não truncado" porque olhava o `<td>` —
quem corta é o `<a class="truncate">` dentro dele. Passou a medir a folha que contém o texto.

**Limpeza:** `limpo=true` no artefato — os dois contatos de teste foram apagados e conferidos no
banco antes de o instrumento terminar.

### INP — a latência da interação, que nenhum tempo de carregamento mede (2.15)

O trace media LCP, CLS e TBT. TBT é thread principal **sem** interação; INP é o outro lado:
quanto a tela demora a responder a um clique ou tecla. Instrumento novo,
`scripts/auditoria/inp.mjs`, com interações roteirizadas (tecla no primeiro campo, clique na
primeira aba, clique em filtro) em 6 telas × 2 condições.

| Condição | INP (pior interação, por `interactionId`) | Interações acima de 200 ms |
| --- | --- | --- |
| desktop 1440 | **64 ms** (`/app/pedidos`, `/app/financeiro`, `/app/inbox`) | **0** |
| celular 390, CPU 4× | **96 ms** (`/app/pedidos`) | **0** |

Limite "bom" do Core Web Vitals é 200 ms; o pior caso medido é metade disso. O evento mais lento foi
`pointerdown` e `keydown` — nenhum `click` passou de 96 ms.

**O que não foi medido, e por quê:** `/app/kanban` e `/app/ai` ficaram com **0 interações** — o roteiro
(primeiro campo, primeira aba, filtro) não encontra nenhum dos três na dobra. Não vira "INP ótimo":
vira lacuna declarada. E INP de campo (CrUX) usa o p98 das interações reais de muitos usuários; este
número é **laboratório com roteiro**, e o artefato diz isso.

### Esforço da tarefa — cliques e teclas contados no navegador (2.6)

O item pede cliques/digitação nas tarefas frequentes. A suíte E2E conta **uma** jornada
(`jornada-venda`: 5 cliques e 5 digitações do login ao pedido). Faltavam as tarefas de leitura, que
são a maioria do dia.

Instrumento novo, `scripts/auditoria/esforco-da-tarefa.mjs`: um listener injetado antes do primeiro
script conta **`pointerdown` e `keydown` reais** (Tab e Shift ficam de fora — é navegação, não
digitação) enquanto o roteiro executa a tarefa. Nada grava.

| Tarefa | Cliques | Teclas | Chegou |
| --- | --- | --- | --- |
| Achar um cliente pelo nome e abrir a ficha | **2** | **7** | sim ("Escalação E2E") |
| Abrir o pedido do topo da lista | **1** | 0 | sim (`PED-0062`) |
| Ver os recebíveis vencidos | **1** | 0 | sim (1 linha) |

Duas ações de mouse e sete teclas para achar um cliente é o custo do **nome inteiro digitado**
("Escalação") — a busca não é instantânea por tecla e o roteiro espera o resultado. Abrir um registro
já listado custa **1 clique** nas duas telas.

**A régua errou duas vezes, as duas registradas:** (1) `fill()` não dispara teclado e a primeira
medição disse "**0 teclas** para achar um cliente" — o instrumento estava mentindo; passou a usar
digitação real; (2) o primeiro link do `main` em Pedidos é **"Criar pedido"** (`/app/pedidos/novo`),
então a régua abriu o formulário e chamou de "não chegou"; passou a exigir href de pedido com UUID.

**Lacuna declarada:** o Inbox ficou fora — as linhas da lista são `div` de lista virtualizada, sem
seletor estável, e medir o clique na aba "Todas" não responde "quanto custa abrir uma conversa".

### V-45 · Média · A tela do roteador de intenção não tinha título nenhum

As quatro rotas dinâmicas que a instalação não conseguia medir (tabelas vazias) foram medidas com
**fixture mínima** — criada pelo instrumento `scripts/auditoria/rotas-com-fixture.mjs`, medida e
**apagada**, com `sobrou=nada` no artefato. É fixture, e o JSON diz isso.

| Rota (com fixture) | status | overflow | `<h1>` |
| --- | --- | --- | --- |
| `/app/ai/routers/{id}` | 200 | 0 | **vazio — não havia título** |
| `/app/lgpd/requests/{id}` | 200 | 0 | `#c40a2cfb` |
| `/admin/lgpd/requests/{id}` | 200 | 0 | `#c40a2cfb` |
| `/admin/incidents/{id}` | 200 | 0 | `fixture_auditoria` |

O roteador de intenção era a única das quatro sem `h1`: só `<h3>` de seção e o link "Roteadores" de
volta. Quem navega por cabeçalhos não sabia em qual roteador estava — a tela não tinha nome.

**Corrigido em `app/app/ai/routers/[id]/_client.tsx`**: `<h1>` com o nome do roteador, no peso e
tamanho canônicos (24 px / 500), acima dos cartões.

**E o token do link público foi redigido.** Medir `/o/[token]` exigiu assinar um link real (HMAC do
pedido). Medida feita — 200, 0 overflow, 0 erro de console — e o artefato guarda `/o/{token}`, não o
token: credencial não entra em commit. As capturas com o token no nome foram apagadas.

### 2.1 fechado — as 26 rotas dinâmicas, cada uma com o seu tipo de prova

| Prova | Rotas |
| --- | --- |
| captura em desktop e celular | **20** (40 medições, todas 200, 0 overflow) |
| captura com link assinado (token redigido) | **1** (`/o/[token]`) |
| fixture criada, medida e apagada | **4** (`ai_routers`, `lgpd_requests` ×2, `incidents`) |
| E2E executado (`invite-lifecycle`, 12 testes verdes) | **1** (`/team/accept-invite/[token]`) |

Nenhuma rota ficou "não auditada": cada uma tem captura, fixture com aviso, ou teste executado — e o
motivo escrito quando a prova é de outro tipo. Somando às 129 estáticas em 1440/390 e às 32 em
tablet, o item **2.1** fecha.

### V-46 · Alta · No tablet, o título de Pedidos tinha 0 px de largura e o subtítulo virava coluna de uma palavra

Medindo hierarquia em 834 px (tablet), o instrumento contou **0 alvos** e **0 títulos** em
`/app/pedidos` — e a sonda mostrou por quê: o `<h1>` existia com **largura 0**.

| Medida (834 × 1112) | Antes | Depois |
| --- | --- | --- |
| largura do `<h1>` | **0 px** | **498 px** |
| subtítulo | coluna de ~40 px, uma palavra por linha ("Os / pedidos / da / loja, / do / rascunho…") | uma linha |
| ações | na mesma linha do título, esmagando-o | abaixo, quando não há espaço |

A causa: o cabeçalho virava linha em `sm` (640 px) — cedo demais para uma tela com três botões de
ação — e o bloco do título tinha `min-w-0`, que permite encolher até zero sem reclamar. O
comentário do próprio componente dizia que `min-w-0 flex-1` existia para o título **ceder** espaço;
ceder até desaparecer não estava previsto.

**Corrigido em `components/nexus-ui/layout/NexusPageHeader.tsx`**: a linha só começa em `lg`
(1024 px). Abaixo disso, título em cima e ações embaixo — os dois nunca disputam a mesma linha.
Gate em `tests/unit/cabecalho-nao-esmaga-no-tablet.test.ts`: o cabeçalho não pode voltar a usar
`sm:flex-row` nem `sm:justify-end`.

**Prova visual:** `capturas/v46-tablet-pedidos-depois.png` (834 px, título inteiro e subtítulo em
uma linha). O "antes" está medido no instrumento (0 px) — refazer a captura exigiria reverter o
conserto.

### Breadcrumb: duas cascas, dois padrões de orientação — declarado, não uniformizado

O item 2.5 cobra consistência. Medido no DOM das 129 rotas estáticas:

| Casca | Rotas | Trilha (breadcrumb) | Como orienta em tela profunda |
| --- | --- | --- | --- |
| tenant (`/app/**`) | 115 | **sim** — 51 das 51 rotas profundas reais | trilha no TopBar (`components/shell/Breadcrumb.tsx`), derivada do registro de navegação |
| plataforma (`/admin/**`) | 14 | **não** | **voltar + abas** na tela de detalhe (`/admin/tenants/[id]` tem "Tenants" + TabNav; idem `audit/[entryId]`, `incidents/[id]`, `users/[id]`, `lgpd/requests/[id]`) |

Quatro rotas profundas pareciam sem trilha — `/app/settings/canal-oficial`, `/app/settings/templates`,
`/app/settings/tenant/whatsapp` e `/app/recuperacao` — e **nenhuma é tela**: as quatro são aliases que
redirecionam, e a medida caiu no destino. Depois de descontá-las, o tenant fica em **51/51**.

A decisão, escrita para não virar "esqueceram": **a casca do tenant usa trilha porque a hierarquia
tem três níveis (área → módulo → detalhe); a do admin usa voltar + abas porque a hierarquia é rasa
(Tenants → tenant → aba) e a trilha repetiria o que o botão de voltar já diz.** Uniformizar as duas
seria o item 2.16 ao contrário: padronizar o que é diferente de propósito.

### Composição intencional — o que foi padronizado, e o que foi deixado em paz (2.16)

Padronizar é fácil; o difícil é não apagar o que é diferente de propósito. Este item existe para
isso, e a resposta é uma **lista de exceções declaradas**, cada uma com o motivo e com o lugar onde
a regra vale:

| Exceção | Por que NÃO se padroniza | Onde está declarada |
| --- | --- | --- |
| `/design` com **dois `h1`** (18 px e 22 px) | é o showcase do design system: existe para mostrar títulos | V-35 |
| Título que **é um identificador**: `#A1B2C3` em mono e "Orçamento #123" | o nome da tela é o número; forçar 24 px/500 apagaria o sinal | gate de título (allowlist com motivo) |
| Admin **sem trilha**, com voltar + abas | hierarquia rasa (Tenants → tenant → aba); a trilha repetiria o botão | 2.5 |
| Paleta `--color-*` (magenta, amber, sky…) **como cor de gráfico** | é cor de série, não de texto; a V-30 mediu e declarou o preço | V-30 |
| `/app/inbox` e `/admin/inbox` com **`h1` `sr-only`** | o título visual é o da conversa; o `h1` existe para a árvore de acessibilidade | V-43 |
| Esqueleto do **radar** com grid próprio | os cartões de lá não são `NexusKpi` (`Card p-3`); o grid do esqueleto já é igual ao do conteúdo | V-34 |
| **Duas cascas, duas larguras de TopBar** | admin e tenant têm densidades diferentes de navegação | 2.5 |

E o que **foi** padronizado, com medida: título de página (117 de 119 a 24 px/500), um `h1` por tela,
uma ação primária por tela de operação, rótulo de campo ligado ao controle (101 rótulos, 0 soltos),
botão de envio com `disabled` e rótulo de progresso (35 de 35) e contraste AA (22 → 0).

**O critério, escrito:** padroniza-se o que a pessoa **compara entre telas** (título, ação primária,
rótulo, contraste). Não se padroniza o que a tela **é** (showcase, identificador, densidade de
navegação da casca).

### Gráficos: o custo é JS, não o desenho — F-29 diagnosticado (10 rodadas/tela)

A primeira medição (3 rodadas) não separava sinal de ruído. Com **10 rodadas por tela** na mesma
condição (390×844, CPU 4×, janela de 6 s), a diferença aparece e a atribuição muda de lugar:

| Tela | Gráficos | TBT mediana | p10 | p90 |
| --- | --- | --- | --- | --- |
| `/app/indicadores` | 5 | **321 ms** | 277 | 376 |
| `/app/radar` | 4 | **301 ms** | 275 | 339 |
| `/app/financeiro` (controle, mesma casca) | 0 | 136 ms | 114 | 218 |
| `/app/settings` (controle) | 0 | **111 ms** | 103 | 142 |

**As faixas não se cruzam:** p10 das telas com gráfico (276 ms) > p90 das sem gráfico (159 ms); em 200
de 200 pares a tela com gráfico é pior, permutação exata **p = 5,4 × 10⁻⁶**. O controle de mesma casca
(`/app/financeiro`, 136 ms) descarta "peso de página".

**Mas o TBT não está no desenho do gráfico: 0 ms depois do primeiro SVG em 20 de 20 rodadas.** O que
existe é uma tarefa de **montagem** de 115 ms (indicadores) e 154 ms (radar) — 20 % e 36 % do TBT —, e
**64–80 % do bloqueio acontece antes de qualquer gráfico existir**. O correlato medido: as telas de
gráfico baixam **+350–530 KB de JS** (2,07–2,26 MB, 33–36 chunks, contra 1,63–1,72 MB e 27–32 dos
controles) — parse e avaliação sob CPU 4× caem justamente nessas tarefas anteriores.

**Conclusão, e por que a tentativa anterior de conserto não mudou nada:** desligar a animação das
séries não podia ajudar, porque o custo dominante não é animar — é carregar e avaliar JavaScript de
gráfico numa tela que talvez nem precise dele. O conserto é **orçamento de JS**: carregar a biblioteca
de gráfico sob demanda (dynamic import) e não montar gráfico fora da dobra. Fica como frente
priorizada, com a medida que a justifica — e não como "otimizar gráficos" no abstrato.

Ressalvas registradas: a tarefa de montagem **não** escala com o número de gráficos (radar 154 ms com
4, indicadores 115 ms com 5), então "montagem" não é "quantidade de séries"; e o CPU profile saiu
desalinhado (81 % idle), então **não** foi usado para atribuir função — a atribuição a parse/avaliação
é inferida do payload e do commit, não provada por amostragem.

## 8. Exposição sem rate limit — medida, e não há superfície aberta (8.x / 6.5)

O número "3 de 417 rotas com rate limit" assusta sozinho. O que importa é **quem** chega até essas
rotas. Medido nas 49 rotas mutantes que não têm RBAC no próprio `route.ts`:

| Classe | Rotas | Proteção real |
| --- | --- | --- |
| aceitável por desenho — **cron** | 25 | `Bearer` com `INTERNAL_CRON_SECRET`/`INTERNAL_SECRET`, fail-closed |
| aceitável — **webhook** | 8 | HMAC com `timingSafeEqual` (Nuvemshop, WAHA, Meta, canal) |
| aceitável — **RBAC no helper** | 8 | `team/*` → `requireRole("admin")` em `_shared.ts`; `shipments/*/rota/*` → `requireRole("agent")` em `_transicao.ts` |
| **risco real** (público, sem assinatura, escreve e é caro) | **0** | — |
| **indeterminado** | 2 | abaixo |

**Os dois indeterminados:**

1. `/api/internal/agents/run` — roda agente de IA (**LLM pago**) atrás de segredo estático
   (`INTERNAL_SECRET`, comparação em tempo constante, fail-closed). Não é público: sem header, 401.
   Mas **não há teto por chamada** — segredo vazado = custo ilimitado;
2. `/api/v1/onboarding/whatsapp/session` — só `loadAuthUser()` (cookie), sem papel: qualquer membro
   criava sessão/QR no WAHA. **Corrigido**: piso `agent` (403 para `viewer`), sem arrastar a exigência
   de MFA para dentro do onboarding; gate em `route.test.ts` (3 casos, com o dublê do WAHA provando
   que a recusa acontece ANTES de tocar no serviço externo).

O link público do orçamento, que é o caso mais sensível, é **assinado** (`verificarOrcamento` com HMAC
e expiração). A conclusão medida: não existe rota "pública + sem assinatura + escrita no banco + cara".

## 6. APIs — superfície medida (6.2 e 6.5)

### Contrato de resposta (6.2)

| Medida | Resultado |
| --- | --- |
| rotas que respondem por `ok()`/`fail()` | **403 de 417** |
| rotas que montam `Response`/`NextResponse` na mão | **8** |
| … sendo só `Response` na mão | **1** (`/api/mcp` — protocolo próprio) |
| … misturando wrapper com resposta manual | **7**: export CSV (`/audit/export`), avatar, mídia de mensagem, imagens de produto, importação de leads/produtos, `admin/platform-admins` |

As sete mistas têm motivo conhecido: arquivo/binário e CSV **não** são JSON — quando a resposta não
é JSON, `ok()` não se aplica. Fora delas, o contrato é um só.

### Limites, paginação e proteções (6.5)

| Medida | Resultado |
| --- | --- |
| rotas com `.limit(`/`.range(`/`Math.min(` | **127** |
| rotas com teto explícito | **147** |
| rotas com `rate limit` | **3** (importação por IA, upload de marca, webhook de entrada) |
| rotas com `Idempotency-Key` | **2** (`lgpd/.../approve`, `financeiro/.../pagamentos`) |
| **GET de lista sem teto no handler** | **80** (medido em 16/11; **79** após o F-30 em 17/11) |

O rate limit não é "3 no produto": login, signup, recuperação e aceite de convite vivem em **Server
Actions** (`app/actions/auth/*`), e o dispatcher de IA tem o próprio
(`lib/ai/dispatcher/rate-limit.ts`). A conta acima é só de `route.ts`.

> **Atualização de 17/11/2026 (F-30):** `/ai/followups/enrollments` passou a paginar com
> `limit` (default 200, teto 500) + `offset` e a devolver `meta.has_more`/`meta.next_offset` —
> o instrumento (`superficie-de-api.mjs`) caiu de **80 para 79** GETs sem teto. Em
> `/admin/usage`, as contagens por organização passaram a usar `count: "exact", head: true`
> (zero linha trafegada para contar) e `llm_calls` passou a ser lida **uma vez** para total e
> série. O instrumento ganhou a métrica **contagem no banco: 19 rotas**. A série diária de
> mensagens continua lendo linhas porque é gráfico, não contagem — teto declarado no código.

**O achado que fica (F-30, `[~]`):** **79** listas ainda não declaram teto **no handler**. A primeira
contagem era 82 porque `/agenda/agendamentos` limita no helper (`lib/agenda/consulta.ts`: default 200,
máximo 500) — o instrumento passou a reconhecer `limite`/`limit` passado a helper e o falso positivo
saiu.

**Impacto medido** (banco de E2E, `count=exact`; é fixture, não produção):

| Rota | Tabela | Linhas hoje | Leitura |
| --- | --- | --- | --- |
| `/admin/usage` | `organizations`+`messages`+`conversations`+`llm_calls`, janela 7/30/90 d, **sem limite** | 6 / 8 / 17 / 0 | **cresce com o uso** — varre a janela e agrega em memória |
| `/ai/followups/enrollments` | `followup_enrollments` | 10 | **cresce muito** — uma linha por contato em fluxo |
| `/ai/followup-flows` | `followup_flow_pointers` | 19 | cresce; `select("*")` piora |
| `/ai/agents` | `ai_agents` | 8 | cresce |
| `/agenda/tipos` | `calendar_event_types` | 25 | cresce por organização |
| `/ai/cases` | `agent_cases` | 2 | cresce |
| `/ai/credentials`, `/ai/guardrail-layers`, `/admin/platform-admins` | — | 0–1 | impacto nulo/baixo hoje |

Não foi alterado nesta rodada: cortar em silêncio devolveria menos dado sem a tela saber, e em
`/admin/usage` um teto mudaria o **número** (é agregação sobre a janela, não lista). O conserto é
paginação na rota + "carregar mais" na tela, e no caso do uso é agregação no banco (RPC), não
`limit`.

## 9. Testes — o que existe, medido por tipo (9.1 a 9.9)

| Tipo | Arquivos | Evidência de execução |
| --- | --- | --- |
| Unitário | **650** em `tests/unit` + **253** em `lib/` + 7 em `components/` (1.144 `*.test.*` no total) | `pnpm test:unit`: **983 arquivos / 14.857 testes** verdes hoje |
| API (handler) | **46** `route.test.ts` junto ao código + **6** em `tests/api` | dentro do `test:unit` |
| Banco/invariantes | **159** em `tests/invariants` | `pnpm test:db`: **1.492 testes** verdes, install+update do baseline |
| E2E | **99** specs | smoke: **32 verdes** hoje; 16 jornadas (J1–J16) já medidas com **254 testes** |
| Shell/kit | **5** | `pnpm test:shell` verde hoje |

**Dados sintéticos e guardrail de banco remoto (9.9):** o loader central
(`scripts/lib/env-de-teste.ts`) **recusa** cair em arquivo que aponte para destino remoto — e lança,
não avisa (foi assim que 1.483 linhas de teste foram parar na produção em 07/10). Medido: **31 dos
33** scripts de seed usam o loader; **1** (`semear-cargas-de-teste`) tem guarda própria
(`ehAmbienteLocal`, com teste); **1** é placeholder sem código. Destino remoto, hoje, só por decisão
explícita de ambiente.

**O que falta, com nome:**
- **9.5 — zero snapshot visual.** Nenhuma spec usa `toHaveScreenshot`/`toMatchSnapshot`; a regressão
  visual depende das 60+ capturas do instrumento de auditoria, que não é gate. É a lacuna maior desta
  frente;
- **9.6 — acessibilidade automatizada em 2 specs** (`auth`, `rbac-roles` usam `AxeBuilder`); as outras
  97 não passam axe. Teclado/foco e contraste foram medidos por instrumento, não por gate;
- **9.7 — mobile/offline** depende da frente 7 (fila local, conflitos): hoje há service worker e
  sincronizador, sem teste de conflito.

## 6. Operação do self-host — instalar, atualizar, salvar, restaurar (6.9)

O produto é vendido como código instalado na VPS do cliente, então a operação é parte da entrega.
Medido no kit (`hostgator-setup-kit/`) e no gate `pnpm test:shell`:

| Peça | O que faz | Prova |
| --- | --- | --- |
| `install.sh` | instala do zero (compose, banco, baseline, app) | `test:db` aplica o baseline; `e2e` roda contra banco com ele |
| `update.sh` | **7 etapas**: procura versão → **backup antes de tocar no banco** → baixa código → atualiza banco → baixa imagem nova e reinicia → confere app no ar → confere automações | `scripts/test-update-com-dados.sh` prova update sobre dados |
| `backup.sh` | `pg_dump` pela conexão de **schema** (não a do app), com **piso de 4 KiB** para recusar dump vazio, + volume `waha-data` | `test:shell`: "backup: banco em container → pg_dump de dentro" e "recusa dump vazio" |
| `restore.sh` | exige digitar `RESTAURAR`, restaura pelo `psql_run` (mesmo motivo do dump) | `test:shell`: `psql_run` dentro do container |
| `healthcheck.sh` / `diagnostico.sh` | consulta `/api/v1/health` **de dentro da rede** (a rota não é pública sem TLS) e lista containers | rota existe e cobre subsistemas |
| `agent.sh` | atualização pela tela, cron a cada 5 min | `test:shell` cobre o agendamento |

**Gate de hoje:** `pnpm test:shell` **verde** — validadores do kit passaram, incluindo
"backup recusa dump vazio" e "a suíte não escreve no crontab da máquina" (a suíte agenda em sandbox;
o crontab real ficou intacto — 13 linhas medidas no sandbox).

**O que falta, medido e nomeado:**
- **restauração não foi exercitada de ponta a ponta nesta auditoria** — o script existe, exige
  confirmação e usa a conexão certa, mas "restaurar num banco limpo e comparar" não rodou. É ensaio
  de restauração, não leitura de código;
- o backup cobre **banco + sessões de WhatsApp**; arquivos de upload (avatars, imagens de produto,
  mídia de conversa) não entram no `backup.sh`. Recuperar essas fotos hoje é backup manual do
  storage — e quem não sabe disso descobre no restore;
- **não há rotação de backup**: `backup.sh` grava `db-<timestamp>.sql.gz` e nada apaga o antigo; num
  cron diário, o disco cresce sem teto.

Os três ficam como **F-32 (aberto)**: ensaio de restauração, backup de uploads e rotação.

## 6. Dados — tabelas, relações, exclusão e retenção (6.8)

Documento **gerado do schema**, não escrito à mão: `docs/auditoria/15-tabelas-e-relacoes.md`,
produzido por `scripts/auditoria/dados-documentados-e-retencao.mjs`. O que envelhece é prosa, não o
`baseline.sql`.

| Medida | Valor |
| --- | --- |
| Tabelas | **180** |
| Com `COMMENT ON TABLE` | **76** (42%) |
| Com `organization_id` (de um tenant) | **170** |
| Globais (plataforma) | **10** |
| Com `deleted_at` (soft delete) | **0** |
| Chaves estrangeiras | **315** — `cascade` 215, `set null` 88, `restrict` 3 |
| Crons que apagam | **3** (`data-retention`, `webhook-log-retention`, reconciliação da agenda) |

**Exclusão:** não existe soft delete. Apagar é hard delete, e a maior parte das FKs é
`on delete cascade` (215) — o vínculo morre junto, que é o certo para filho de pedido. O que a LGPD
manda preservar **não** é apagado: `POST /api/v1/lgpd/anonymize` nulifica PII em cascata e marca
`is_anonymized`/`anonymized_at`.

**Retenção:** seis janelas declaradas em `lib/retencao/politica.ts`, com piso que o knob não fura —
fila 90 d (piso 7), auditoria **1825 d = os 5 anos da regra L-10** (piso 90), espelho de agenda 90 d
(piso 7), captação 365 d (piso 30), log de webhook corpo 7 d / linha 90 d. A poda roda por RPC
(`fn_podar_fila_de_jobs`, `fn_expurgar_auditoria_vencida`, `fn_expurgar_espelho_da_agenda`,
`fn_expurgar_nonces_de_oauth`), e cada rodada deixa rastro em `retention.sweep_run`.

**O que continua em falta, com nome:** **104 tabelas sem `COMMENT ON TABLE`**. A referência gerada
cobre nome, colunas, dono, FKs e documentação; o comentário no banco é o que aparece para quem abre o
banco sem o repositório — e são 104. Fazer isso é **migration** (apêndice idempotente no baseline +
MANIFEST), não edição de doc.

## 6. APIs — catálogo com payload e efeito de dados (6.1)

O inventário já trazia métodos, guarda, nome do schema e efeitos declarados. Faltavam as duas
colunas que o item pede: **quais campos o corpo aceita** e **quais tabelas o handler escreve**.
Instrumento novo, `scripts/auditoria/catalogo-de-apis.mjs`:

| Medida | Resultado |
| --- | --- |
| handlers | **417** |
| com chaves de payload inline (`z.object`) | **108** |
| mutações que **leem corpo** sem schema identificável | **24** |
| … das quais **multipart** (imagem/XML/CSV/certificado) | **11** — validadas por MIME, tamanho e parser |
| … das quais **webhook** | **9** — HMAC + leitura manual do payload de terceiro |
| … das quais **JSON com validação manual** | **4** — `typeof`/`Array.isArray`/whitelist de ação |
| **corpo JSON sem NENHUMA validação** | **0** |
| mutações que escrevem tabela declarada no próprio arquivo | **102** |
| mutações sem escrita declarada (delegam a `lib/`) | 102 |

**Nenhum corpo JSON entra sem validação** — os 24 casos sem schema são 11 multipart, 9 webhooks e 4
com checagem manual visível no arquivo. E a escrita de dados por handler agora está no catálogo:
`contacts` (12 handlers), `catalog_products` (9), `shipment_orders` e `shipment_destinations` (8 e
7), `webhook_events_log` (7), `commercial_orders`/`conversations`/`prospecting_campaigns` (6 cada).

**O limite do instrumento, declarado:** ele lê o handler, não o módulo chamado. Mutações que delegam
a `lib/` aparecem sem tabela — 102 delas —, e o número não deve ser lido como "não escreve".

## 6. APIs — 417 rotas, 35 sem chamador interno, zero órfã

A varredura visual não responde a pergunta do 6.4 ("endpoints duplicados, sem uso ou legados").
Instrumento novo, `scripts/auditoria/apis-sem-chamador.mjs`: para cada `route.ts`, monta o caminho e
procura o prefixo em todo o código que **não é rota** (`app/` telas e componentes, `components/`,
`hooks/`, `lib/`, `workers/`, `scripts/`).

| Medida | Resultado |
| --- | --- |
| rotas de API | **417** |
| sem menção fora de `app/api/` | **35** |
| … de integração (`internal`, `mcp`, `cron`, webhook) | **22** — chamador é de fora, por desenho |
| … internas ao produto, sem chamador | **13** |
| duplicadas (mesmo `normalizado` → mais de uma rota) | **0** |
| com "legacy/deprecated/old/v2" no nome | **0** |

**As 13 internas sem chamador não são lixo:** todas as 13 aparecem em spec (`docs/specs/` e
`docs/prd/`). São `fiscal-*` (6), `commercial-goals`, `commercial-policies`,
`conversations/arquivar-todas`, `ai/decisions/propose`, `products/images`,
`fiscal-ibpt/importar-siscomex` e `system/agent`. Ou seja: **API declarada antes de a tela que a
consome existir** — dívida de integração, não resto.

**Nada foi removido.** O prompt manda não remover sem consulta, e a lista acima é exatamente o que
a consulta precisa ver: caminho, por que apareceu e onde está declarado
(`capturas/apis-sem-chamador.json`).

### V-50 · Alta · Remover produto do pedido devolvia 422 — e o 422 escondia um erro de banco

Reportado pelo dono ao editar um pedido: "erro ao remover produtos do pedido". A chamada era
`PATCH /api/v1/commercial-orders/{id}/itens` com `remover: ["8e954d66-…"]` e a resposta, **422** com
`"Um dos itens não pertence a este pedido."`

**O item pertencia ao pedido.** Conferido no banco: `order_id` igual ao do pedido, `posicao` 0. O que
o log do servidor mostrou foi outra coisa:

```
patch de itens: falha ao ajustar
erro: duplicate key value violates unique constraint "commercial_order_items_pkey"
```

A causa: `admin.from("commercial_order_items").update([{...}, {...}])` — **array**. O PostgREST trata
o corpo de um `PATCH` como **um objeto**; com array, o servidor cai no caminho de inserção e bate na
chave primária. Remover um item de uma lista de 2 obriga a regravar as posições das duas linhas,
então o caminho era sempre exercitado com 2+ itens.

**E o 422 mentia.** No serviço, `{ok:false}` sem motivo (falha de gravação) caía no mesmo ramo de
"item não pertence", porque a rota só distinguia `nao_encontrado` e `produto_desconhecido`. O
usuário recebia "erro de quem chamou" quando o banco havia recusado a escrita.

**O dublê dos testes aceitava array** — o comentário no próprio teste dizia "o Supabase aceita objeto
OU array no `update`". Era falso, e por isso 16 testes passavam com o produto quebrado.

**Corrigido** em `lib/comercial/patch-itens.ts`: uma linha por vez (`update({...}).eq("id").eq("order_id")`),
com motivo `falha_ao_gravar`; e em `app/api/v1/commercial-orders/[id]/itens/route.ts`: falha de
gravação agora é **500** com "Não foi possível atualizar os itens. Tente novamente."

**Prova:** a mesma remoção, no mesmo pedido, devolveu **200**; o banco ficou com 1 item, `posicao`
reindexada para 0, `subtotal_cents` e `total_cents` recalculados para **89.900** (eram 139.900).

**Gate:** `tests/unit/patch-itens-servico.test.ts` ganhou o caso de regressão (remover 1 de 2 itens)
e o dublê passou a **recusar array** em `update`, reproduzindo o comportamento do PostgREST — o teste
agora falha se alguém voltar a mandar lista.

### V-48 · Alta · `aria-sort` estava no botão, não na coluna — 4 colunas invisíveis para leitor de tela

Primeira rodada do **axe** nas telas de operação (instrumento novo, `scripts/auditoria/axe-nas-telas.mjs`,
regras `wcag2a` + `wcag2aa`): `/app/contacts` reprovou com `aria-allowed-attr` **crítico** em **4
nós**. A causa: o atributo `aria-sort` morava no `<button>` do cabeçalho, e ele só é válido em
`columnheader` (`<th>`). Para o leitor de tela, a ordenação da tabela simplesmente não existia.

**Corrigido em `components/contacts/ContactsTable.tsx`**: `aria-sort` foi para o `<TableHead>`, onde
o papel é `columnheader`; o botão continua sendo o controle.

### V-49 · Alta · O filtro do Inbox usava abas sem painel — valor ARIA inválido

O mesmo axe reprovou `/app/inbox` com `aria-valid-attr-value` **crítico**: cada gatilho saía com
`aria-controls="radix-…-content-unassigned"` — o Radix só assina o id do painel quando existe um
`TabsContent` correspondente, e ali as cinco opções (Fila/Minhas/Todas/Fechadas/Automático)
**filtram a mesma lista**: nunca houve painel por aba. O produto usava `role="tab"` para um
segmentado de filtro.

**Corrigido em `components/inbox/InboxFilters.tsx`**: virou `role="group"` com botões e
`aria-pressed` — o padrão de "escolher um recorte". O visual foi preservado trocando
`data-[state=active]` por `aria-pressed:` nas mesmas classes.

**Prova:** o axe rodou de novo nas **8 telas**: `0` violações em todas (antes: 1 crítica em cada
uma das duas). E as 16 asserções de `tests/unit/inbox-filters-scope.test.tsx` passaram a consultar
`role="button"` — o teste cobrava `role="tab"` do componente que estava errado.

**Gate novo:** `tests/e2e/axe-telas-principais.spec.ts` roda axe nas 8 telas e reprova qualquer
violação `serious`/`critical`. Registrado em `SPECS_PARTE_2` e em `TRANSVERSAIS` (acessibilidade
atravessa as telas) — sem isso o gate de cobertura do E2E reprova a spec nova, e reprovou mesmo.

### V-51 · Mudança de produto pedida pelo dono · O pedido nasce "Em orçamento" e pode ser **concluído**

Pedido do dono (17/11/2026): *"nos pedidos criação, primeiro ele fica em orçamento, depois opção
marcar concluído no pedido, igual o Mercos faz."*

**O que já existia:** o pedido nasce `rascunho`, e a **lista** já o chamava de "Em orçamento"
(`rotuloDaPill`). O que faltava era o resto:

| Antes | Depois |
| --- | --- |
| `ROTULO_DO_STATUS.rascunho` = **"Rascunho"** (ficha, filtros) e a lista com caso especial "Em orçamento" — duas palavras para o mesmo estado | **"Em orçamento"** no vocabulário único; o caso especial da pill saiu |
| status `concluido` existia no schema, no CHECK e na Expedição, mas **nenhuma tela chegava nele** | botão **"Marcar como concluído"** na ficha, em orçamento / em análise / aprovado |
| sair do orçamento só por "Aprovar" (que exige teto de desconto e gerente) | **concluir passa pelas mesmas travas** — é compromisso de venda, não atalho |

**Medido em produção local (build + `next start`):**

| Passo | Resultado |
| --- | --- |
| ficha de pedido em orçamento | pill **"Em orçamento"**, botão **"Marcar como concluído"** presente |
| clique | `PATCH /api/v1/commercial-orders/{id}` → **200**; banco `concluido`; pill **"Concluído"** |
| lista de pedidos | mostra **"Em orçamento"** (o rótulo unificado) |
| **agent** tentando concluir pedido **em análise** | **422** "Só gerente aprova pedido em análise."; status **não muda** |

O último caso é o que importa: concluir não pode ser o caminho para furar a alçada. O `PATCH` passou
a tratar `concluido` como `aprovado` no gate de desconto (acima do teto → escala para `em_analise`) e
na exigência de gerente.

O pedido usado na prova foi devolvido ao estado original (`rascunho`) depois da medição.

## 3. Identidade visual — tokens medidos no CSS (fase 3)

Instrumento novo, `scripts/auditoria/tokens-do-tema.mjs`, lê `app/globals.css` e compara com os
números que o prompt fixa (3.2 a 3.12).

| Item do prompt | Exigência | Medido | Situação |
| --- | --- | --- | --- |
| 3.2 / 3.3 tokens claro e escuro | os dois temas com o mesmo conjunto | `:root` **129** · `[data-theme="light"]` **81** · `[data-theme="dark"]` **92** (18/11: +2 com `--color-border-control`). Não são conjuntos iguais e não devem ser: o escuro sobrescreve 92 chaves, e o espelho claro redeclara exatamente essas 92 **menos as 11 da rampa accent** (81) — a igualdade é cobrada por `tests/unit/branding-tema-claro-escopavel.test.ts` | **ok, com medição corrigida** (ver V-53) |
| 3.7 tipografia própria | fonte do produto, não do sistema | `--font-sans`/`--font-mono` começam em `var(--font-inter)`/`var(--font-mono)` (next/font) | **ok** |
| 3.8 escala tipográfica | curta | 12, 13, 14, 16, 18, 20, 24, 36, 48, 60 px em `DESIGN.md` | **ok** |
| 3.9 espaçamento base 4 | múltiplos de 4 | `--space-*`: **0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128** | **ok** |
| 3.10 raios **6/10/14** | 6, 10, 14 | `--radius-*`: **4, 8, 12, 16, 9999** (+ `none`) — e `DESIGN.md` declara cards 16, inputs/imagens 8, tabelas 24, botões/tags pill | **divergência declarada** |
| 3.11 sombras sutis | poucas, curtas | **5 níveis** (`xs`…`xl`), todos com alfa ≤ 0,16 | **ok** |
| 3.12 movimento 120–220 ms + reduced motion | faixa e preferência | `fast` 120 ms, `base` 200 ms, `slow` **320 ms**; `prefers-reduced-motion` **respeitado** (V-26) | **ok, com `slow` acima** |

**A divergência que fica escrita:** os raios do produto são **4/8/12/16/24/pill**, não 6/10/14. Não é
descuido — está declarado no `DESIGN.md` (a identidade do produto), e trocar os tokens mudaria todo
canto de todo componente de uma vez. O prompt pede 6/10/14; o produto declara outra escala. **A
decisão é do dono, não da auditoria** — e fica registrada como divergência, não como "corrigido".

`--duration-slow` a 320 ms também passa dos 220 ms do item 3.12 — usado em transição de painel
grande, não em microinteração. Mesma natureza: medido e declarado.

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
| 2.1  | Avaliar em execução e no código; desktop/tablet/celular             | `[x]`  | **129 rotas estáticas** em 1440/390 (258 medições) · **32 telas** em tablet 834 · **26 rotas dinâmicas, todas com prova**: 20 medidas em desktop e celular (40 medições, 200/0 overflow), 1 com link assinado (`/o/[token]`, token redigido), 4 com fixture criada e apagada (`sobrou=nada`) e 1 por E2E (`invite-lifecycle`, 12 verdes). **6 larguras** medidas (320, 360, 390, 430, 834, 1440). **Falta nada**: lacuna futura vira achado, não omissão |
| 2.2  | Se impedido, registrar bloqueio sem alegar inspeção visual          | `[x]`  | Nada foi alegado sem execução; o que não foi coberto está listado com o motivo (§3)                                                                                                                                                                                                                                                                                                                                                            |
| 2.3  | Propósito e próximo passo evidentes                                 | `[x]`  | Título de aba próprio em todas as rotas (V-01) e `<h1>` em todas as medições depois de V-02, V-08 e V-12 — inclui o vazio de `/app/pedidos/imprimir`, que passou a ter próximo passo                                                                                                                                                                                                                                                           |
| 2.4  | Hierarquia e densidade                                                | `[x]`  | **12 telas em 3 larguras** (1440, 834, 320): **1 ação primária** em cada uma das 7 telas de operação em 1440 e 834; a 320, financeiro e notas têm a primária abaixo da dobra (declarado). **Densidade**: 7 alvos (kanban) a **64** (contatos em 834). **Leitura**: máximo 53 caracteres por linha. A medição **achou e corrigiu** o cabeçalho esmagando o título no tablet (V-46: `<h1>` com 0 px → 498 px) |
| 2.5  | Consistência de headers, breadcrumb, ações, filtros, navegação      | `[x]`  | **Título**: 117 de 119 `h1` visíveis a 24 px / 500, **um por tela** (V-35/V-36) — 2 exceções declaradas (showcase `/design` e título-identificador). **Breadcrumb**: 51 das 51 rotas profundas REAIS do tenant têm trilha no TopBar; as 4 que apareciam sem são **aliases** medidos no destino. **Admin**: o shell de plataforma (14 rotas) não tem trilha por decisão — as 4 telas de detalhe profundo usam **voltar + abas** (conferido em `/admin/tenants/[id]`, `audit/[entryId]`, `incidents/[id]`, `users/[id]`, `lgpd/requests/[id]`). **Ações**: 1 primária por tela de operação (2.4). **Regra declarada**: tenant = trilha; admin = voltar + abas (hierarquia rasa) |
| 2.6  | Cliques/digitação em tarefas frequentes                             | `[~]`  | **Medido no navegador** (`esforco-da-tarefa.mjs`, eventos reais): achar cliente e abrir a ficha = **2 cliques + 7 teclas**; abrir o pedido do topo = **1 clique**; ver vencidos = **1 clique**. `jornada-venda` (E2E) = 5 cliques + 5 digitações do login ao pedido criado. **Falta**: Inbox (lista virtualizada sem seletor estável) e as demais jornadas |
| 2.7  | Busca, ordenação, filtros, paginação, seleção em massa              | `[~]`  | **Medido no dedo** (`lista-busca-e-paginacao.mjs`): contatos 25 → 19 linhas com "E2E" e 25 → 50 com "Carregar mais"; pedidos 49 → 11 com o termo, 47 linhas na visão Tabela e **"47 selecionados"** após selecionar todos. **Não vai para a URL**: filtro em `/app/contacts` e `/app/pedidos` não sobrevive a reload (decisão de produto, 4.5). **Falta**: ordenação por coluna e seleção em massa fora de Pedidos |
| 2.8  | Formulários (rótulos, validação, erros, preservação, salvar, cancelar, confirmar) | `[x]`  | **Recusa**: 3 formulários submetidos vazios recusam, explicam e não gravam. **Caminho válido**: `contato-salva-email` e `jornada-venda` verdes (12,2 s) + os 2 que faltavam medidos hoje — renomear agent (nome mudou no banco e foi revertido) e criar token de API (criado, plaintext exibido **uma vez**, revogado; `limpo=true`). **Inventário**: 34 arquivos com botão de envio, todos com caminho válido coberto. **Rótulos**: 101 ligados, 0 soltos |
| 2.9  | Estados (loading, vazio, erro, sucesso, offline, permissão negada)  | `[~]`  | **Offline medido em 5 telas** (`offline-e-erro.mjs`): com SW ativo o app abre; contatos/inbox/financeiro mostram "Algo deu errado … Tentar novamente"; ação pausada avisa "Sem conexão" (V-42) e o Audit Log deixou de dizer "Nenhum log" quando a busca só estava pausada (V-43). **Pedidos offline segue mudo** — F-28. Loading/vazio/erro/sucesso por V-07/V-09/V-12/V-25; permissão negada em 10 rotas. **Falta**: offline de escrita (fila/outbox) — frente 7 |
| 2.10 | Feedback imediato e prevenção de duplicidade                        | `[~]`  | **Medido no clique** (`scripts/auditoria/feedback-e-duplicidade.mjs`, POST abortado após 2,5 s — nada grava): cliente novo e template novo mostram botão desabilitado, rótulo de progresso, **1 requisição por envio** e erro visível quando a resposta falha. Antes: **3 POSTs por clique** (V-39 — o cliente repetia erro de rede em método que grava) e 4 de 35 botões de envio mudos (V-40). **Falta**: dedupe server-side da `Idempotency-Key`, hoje lida por **2** rotas |
| 2.11 | A11y: contraste, foco, teclado, leitor, toque, zoom, reduced motion | `[~]`  | **Contraste**: 22 → **0 de 1.030** textos abaixo do mínimo (V-37/V-38). **Foco/teclado**: 301 paradas em 9 telas, 0 sem foco visível. **Movimento**: 0 de 20 animando com `prefers-reduced-motion`. **Zoom 200%** (viewport de 720×450, 20 rotas): **0 overflow** e 0 erro de console. **Alvos**: p50 3 em 390, 7,5 em 320 (sinal). **Falta**: leitor de tela real (NVDA/VoiceOver) — não há como emular honestamente aqui |
| 2.12 | Casos extremos                                                      | `[x]`  | **Nome longo** (V-44, fixture real): linha 97/177 px → **53 px** com `truncate` + `title`. **Valor extremo** (`valores-extremos-e-tabela-grande.mjs`): pedido de **R$ 99.999.999,99** e de **R$ 0,01** legíveis em 1440 e 320, **0 overflow**. **Tabela grande**: com **+1.000 contatos**, primeira linha em **526 ms**, **25 linhas** na tela e **50** após "Carregar mais" — não carrega 1.000. Extremos fiscais cobertos por teste. `limpo=true` nos dois instrumentos |
| 2.13 | Largura/overflow, sticky, modais, drawers em telas estreitas | `[x]`  | **Overflow 0 em 6 larguras** (320×20 rotas, 360×5, 430×5, 390×129, 834×32, 1440×129) **e em rotação** (844×390, 6 telas) — nenhuma rola na horizontal, 320 inclusive. **Sticky**: cabeçalho visível na rotação nas 6 telas. **Modais/drawers**: 32 modais e 85 abas abertos em 390/834 (`captura-subtelas`), 0 overflow, 0 aba sem seleção. **Teclado virtual** (viewport 390×508, campo focado): o campo de contatos fica em 339–379, **acima da dobra útil**. **Alvos < 40 px**: p50 3 em 390, 7,5 em 320 (V-06, sinal) |
| 2.14 | Idioma, moeda, datas, timezone, convenções BR                       | `[~]`  | pt-BR e R$ corretos; formato de data depende do navegador (V-04, decidir)                                                                                                                                                                                                                                                                                                                                                                      |
| 2.15 | Desempenho percebido e gráficos                                     | `[~]`  | **Medido em produção** (V-05 fechado): desktop p50 1.495 ms / p90 1.990 ms / máx 2.838 ms; celular p50 1.172 ms / p90 1.536 ms / máx 1.920 ms. **Trace** (`desempenho.mjs`, 12 telas × 2): desktop LCP máx 924 ms, CLS máx 0,026, TBT 0–17 ms; celular LCP máx 1.428 ms, CLS máx **0,037** (`/app/inbox`), TBT máx 181 ms (`/app/pedidos`, sinal). **INP** (`inp.mjs`, 6 telas × 2): pior **96 ms** (celular CPU 4×), **0 interações acima de 200 ms**; 0 interações medidas em kanban/ai (roteiro não acha campo/aba/filtro). CLS de `/app/financeiro` era **0,130** e é **0,000** (V-34). **Falta**: custo de render dos gráficos por canvas |
| 2.16 | Não padronizar mecanicamente onde a composição é intencional        | `[x]`  | **7 exceções declaradas com motivo** (showcase `/design`, título-identificador, admin sem trilha, paleta de categoria em gráfico, `h1` `sr-only` do Inbox, esqueleto do radar, duas cascas). **Padronizado com medida**: título 24 px/500 (117 de 119), um `h1` por tela, 1 ação primária por tela, 101 rótulos ligados (0 soltos), 35 de 35 botões de envio com progresso, contraste 22 → 0 |

**Fase 2: em andamento.** **42 achados corrigidos** com medida antes/depois — as 20 seções
marcadas `CORRIGIDO` (V-01, V-02, V-07, V-08, V-09, V-10, V-12, V-13, V-15, V-16, V-17, V-18,
V-19, V-20, V-21, V-22, V-23, V-24, V-25, V-26), V-27, V-28 e V-29 (tabela de contraste) e
V-31 (correção automática da nota), V-32 (403 do cliente HTTP na BrasilAPI) e V-33
(o instrumento que apagava o próprio artefato), V-34 (esqueleto de KPI com grid divergente), V-35 (segundo `h1` na subtela de prospecção) e
V-36 (título de página com dois pesos), V-37 (legenda pintada com a cor da série) e V-38
(selo de status usando a paleta de categoria como texto), V-39 (POST repetido em erro de
rede), V-40 (botão de envio mudo) V-41 (a varredura media rota inexistente) V-42 (ação pausada offline sem aviso) V-43 (estado vazio mentindo offline) V-44 (nome longo quadruplicando a linha) V-45 (tela do roteador sem título), V-46 (cabeçalho esmagando o título no tablet) e
V-48 (`aria-sort` no botão), V-49 (filtro do Inbox com aba sem painel), V-50
(remover item do pedido devolvia 422);
V-03 e V-11 descartados com prova; V-05 **fechado** (produção medida); V-06 é sinal a confirmar
por clique; V-14 é observação. V-04 aguarda **decisão de produto**.

As **16 jornadas** (J1–J16) foram mapeadas, medidas e executadas: **254 testes E2E verdes** em
37,1 min, com 7 falhas abertas uma a uma — 5 consertadas (4 do produto, 1 spec obsoleta, 1 de
orçamento de teste) e 1 achado novo (F-27, o mapa de empresas) — **fechado em 17/11** com a causa
provada: um efeito de URL escrevia no alias `/app/prospeccao`, navegava e remontava a tela, e a aba
Empresas voltava para Campanhas. Relatório: [`13-jornadas.md`](13-jornadas.md).

## Central de avisos — a pilha de 27 avisos idênticos, medida e desfeita

Medido em 17/11/2026 a partir do relato do dono (**27 avisos críticos em aberto**, todos
"Uma resposta não chegou ao cliente"). O `git grep` achou a origem em um único lugar:
`app/api/v1/cron/recover-stuck-messages/route.ts`.

**De onde vem:** toda mensagem outbound nasce `queued`; quando o WAHA aceita, vira `sending`
com `external_id`; só o webhook `message.ack` a promove a `sent`/`delivered`/`read`. Se o ack
não chega em 5 min (regra W-12), o cron marca `failed` e abre um aviso.

**Três defeitos, todos provados no código e reproduzidos no banco:**

| Defeito | Prova |
| --- | --- |
| **um aviso por rodada**, sem dedup | o cron inseria a cada tick; a condição não sumia e a Central acumulava |
| **nada fechava o aviso** quando a causa desaparecia | nenhuma consulta a `agent_inbox_items` com `status='open'` para resolver |
| **"não chegou ao cliente" era afirmação sem lastro** | `sending` cobre dois mundos: `external_id` nulo (nunca saiu) e preenchido (saiu, faltou o ack) |

**Conserto:** o cron passou a manter **um aviso por organização** — atualiza o aberto, fecha
os duplicados que já existirem e resolve sozinho quando a rodada não encontra nada preso. O
texto separa as duas causas e diz que, no caso do `external_id` preenchido, é provável que a
mensagem tenha chegado. O aviso ganhou link para a conversa (`/app/inbox?id=`).

**Prova de ponta a ponta no banco E2E** (3 avisos abertos + 1 mensagem sem id + 1 com id):

```
ANTES:  avisos = 3  abertos = 3
RODADA: {"scanned":2,"failed":2,"organizations":1,"resolved":2}
DEPOIS: total = 3  abertos = 1
TÍTULO: 2 respostas ficaram sem confirmação de envio
```

Os dois `failed` mantêm o `external_id` intacto — é o que permite ao operador distinguir
"não saiu" de "saiu sem confirmação" antes de decidir reenviar. `tests/unit/recover-stuck-messages.test.ts`
passou de 7 para 11 casos (dedup, colapso da pilha, texto honesto, fechamento automático).

![Central de avisos depois do conserto: um aviso, texto honesto e link para a conversa](docs/auditoria/capturas/central-de-avisos-colapsada.png)

A legenda do tipo também mudou: era `"Uma resposta ficou presa e não chegou ao cliente"` em
`lib/ai/agent-inbox-copy.ts` (era essa a frase que o dono via, abaixo do título) e passou a
`"Uma resposta ficou sem confirmação de envio"`. O título do item diz quantas e de que lado
veio a dúvida; o corpo separa as duas causas; e o botão "Abrir conversa" leva à conversa
(`/app/inbox?id=<conversa>`), que antes não existia.

## Navegação por papel e telas com erro disfarçado de vazio (fases 4 e 5)

### Menu × servidor: quatro telas restritas no menu, abertas por URL

Medido em 17/11/2026: **74 destinos** no registry (47 `viewer`, 19 `manager`, 7 `admin`; e
`ai_operator` **não ganha nenhum destino** sobre `agent`). Quatro telas restritas no menu
**não tinham gate no servidor**: `/app/ai/followups`, `/app/fiscal/configuracoes`,
`/app/relatorios` e `/app/integrations/nuvemshop`.

**Corrigido:** as três primeiras ganharam `redirect("/app")` para quem está abaixo do papel do
menu. Em Follow-ups a correção foi outra: a **Fila** é leitura de qualquer membro (decisão
escrita na própria página), então a aba **Fluxos** — que terminava em 403 no detalhe — passou a
aparecer só para `manager+`.

**Ressalva que o medidor corrigiu:** a página da Nuvemshop **não vazava credencial** — o `select`
deixa de fora `oauth_access_token_encrypted`, `oauth_refresh_token_encrypted`,
`webhook_secret_encrypted` e `webhook_path_token`, e as Server Actions já exigiam `admin`. O gate
é **consistência menu × página**, não contenção de vazamento. A auditoria anterior dizia "viewer
vê `tenant_integrations`" sem essa distinção; o texto agora diz o que é verdade.

### Pedidos: falha de rede aparecia como "sem financeiro" e "sem nota fiscal"

Em `app/app/pedidos/[id]/_detalhe.tsx`, o `catch` dos dois cards fazia `setLinhas([])` e
`setNotas([])`: uma falha de leitura virava o **estado vazio**, e o operador gerava um financeiro
que já existia ou emitia uma segunda NF-e. Agora cada card tem estado de erro próprio, com
**"Tentar de novo"** — erro não se disfarça de vazio.

Também: a busca de produto e de cliente no `/app/pedidos/novo` não dizia nada quando não achava
nada; agora diz "Nenhum produto encontrado" e "Nenhum contato encontrado — o nome digitado será
usado como cliente avulso".

**Achado que NÃO virou conserto:** um agente apontou a ordem dos botões (Imprimir antes de Criar
pedido) como violação do cabeçalho. Existe um teste que registra **pedido explícito do dono** —
`tests/unit/pedidos-imprimir-dia.test.tsx`, "se alguém reordenar de volta, este teste conta a
história". A ordem foi mantida. Réggua errada não vira achado.

### Status nunca só por cor: 3 casos corrigidos de 13 medidos

| Onde | Antes | Agora |
| --- | --- | --- |
| `components/inbox/ConversationListItem.tsx` | bolinha `aria-hidden`, só matiz | `role="img"` + `aria-label`/`title` ("Atendente no comando", "Aguardando atendente"…) |
| `app/app/lgpd/requests/[id]/SlaTimeline.tsx` | marco só por cor e `aria-hidden` | texto "concluído / em andamento / pendente" ao lado da data |
| `app/onboarding/_components/JaEstaPronto.tsx` | verde × âmbar | "pronto" / "falta" ao lado de cada item |

Os **12 tokens de estado** (`success/warning/error/info` × base/`-bg`/`-fg`) existem nos três
blocos de tema e na ponte `@theme inline`; nenhum teste vigiava a presença — agora este parágrafo
vigia a afirmação.

## Offline e PWA — o que foi corrigido (movido de `08`, que é gerado)

### Dois service workers no mesmo escopo — medido em 17/11/2026

O app registrava **dois** workers em `scope: "/"`: `/sw.js` (cache offline) e
`/notify-sw.js` (bandeja + Web Push). Um escopo só admite **um** worker: ao
ativar notificações, o segundo **substituía** o primeiro e o cache offline
morria em silêncio — a tela não avisa, o app apenas deixa de abrir sem rede.

**Corrigido:** os tratadores de `push`, `notificationclick` e `message`
(`show-os-notify`) passaram para o próprio `sw.js`; `ensureNotifyServiceWorker()`
registra `/sw.js`; `public/notify-sw.js` foi removido. Gate novo em
`tests/unit/service-worker-unico.test.ts`: só um `*sw.js` em `public/`, o worker
único trata cache **e** bandeja, e o registro aponta para `/sw.js` (o comentário
pode citar o arquivo antigo; o código, não).

**O que continua em aberto (fase 7):**

- `mobile-offline.spec.ts` (5 casos) só roda no job `apk-debug`, que **não é**
  um dos cinco checks obrigatórios — o offline não tem gate no PR;
- `sw.js` e `lib/offline/catalogo.ts` **não têm teste** (a outbox tem 14 casos);
- **sem precache**: o offline só existe para telas já visitadas, e o fallback é um HTML
  genérico, não uma página offline (a versão do cache agora segue o build — ver abaixo);
- `mobile/src/shell.ts` navega para `https://crm.billhigiene.tech` **hardcoded**
  (`server.url` ausente no Capacitor).

### O cache `nexus-app-v1` fixo — corrigido em 17/11/2026

O `public/sw.js` guardava tudo em `CACHE = "nexus-app-v1"`, um literal. O arquivo
é copiado verbatim para a imagem (não é compilado), então a cada `update.sh` ele
chegava **byte-idêntico**: o navegador não reinstalava, o `activate` não rodava e o
`v1` nunca morria. Consequência: chunks antigos acumulavam sem teto e quem não abria
online depois do deploy continuava vendo a versão anterior offline.

**Conserto:** a URL de registro passou a levar a versão do build —
`/sw.js?v=<versão>` (`lib/service-worker/url.ts`, alimentado por
`/api/v1/system/version`, cacheado no `sessionStorage`). O `sw.js` lê o próprio
`location.search` e batiza o cache (`nexus-app-<versão>`); um build novo muda a URL,
o navegador instala o worker novo e o `activate` apaga **só** as versões antigas
(`nexus-app-*`) — nunca caches de outra coisa no mesmo escopo. O logout apaga todas
as versões, não só a atual: uma versão anterior guarda o HTML de quem saiu.

`ensureNotifyServiceWorker()` passou a **reusar** o registro existente
(`getRegistration("/")`) em vez de registrar `/sw.js` puro — registrar sem a query
forçaria a volta para a URL sem versão.

Gate em `tests/unit/service-worker-unico.test.ts` (4 casos): um worker só, URL
versionada, cache nomeado pela versão e `activate` restrito ao prefixo.


## PRD × telas — medido (movido de `10`, que é gerado)

### PRD × telas — medido em 17/11/2026 (fase 5)

Cruzamento por nome de módulo (sem NLP): 7 PRDs, **156** `page.tsx`, 76 destinos de navegação.

| Categoria | Módulos |
| --- | --- |
| prometido no PRD **e** com rota | **25 de 28 (89%)** |
| prometido, **sem rota** | **3**: merge de contatos (PRD 02 §3.4), mobile `/chat` (04 §3.10), `/dashboard/atendimento` literal (04 §3.13 — o conteúdo existe em `/app` e `/indicadores`) |
| com rota e **sem menção em PRD** | **24** (8 são sub-abas de `/app/ai`): estoque, compras, expedição, frota, financeiro, faturamento, fiscal, títulos, comissões, carteira, prospecção, radar, recuperação, tarefas, meu dia, relatórios, metrics, indicadores, laboratório, inteligência, venda automática, notas, agenda, rotas de IA |

**Leitura:** os PRDs descrevem o MVP e-commerce de julho/2026; metade do produto de hoje (ERP fiscal,
estoque, logística) **não tem PRD**. A cobertura promessa→tela é alta (89%); a tela→promessa é 51%.
Atualizar PRD é dívida de documentação, não de produto — e as 3 promessas sem rota precisam de decisão
(entregar ou retirar da promessa).


## Casca e navegação — medidas (4.3 e 4.7)

Instrumento: `scripts/auditoria/shell-e-navegacao.mjs`, contra o build de produção local,
1440×900 e 390×844 (`docs/auditoria/capturas/shell-e-navegacao.json`).

| Item | Medido |
| --- | --- |
| sidebar, topbar, busca, avisos, menu do usuário | **presentes nas 7 telas** |
| trilha (breadcrumb) | **ausente com 1–2 segmentos** (`/app`, `/app/pedidos`, `/app/contacts`, `/app/financeiro`, `/app/settings`); **presente** com 3 (`/app/ai/knowledge/sources`, `/app/settings/tenant/agenda`) |
| paleta (⌘K) | abre, foco cai no campo ("Buscar telas, clientes, conversas…"), **Esc fecha** |
| celular (390) | botão "Abrir navegação" presente, **gaveta abre e fecha** |

**Leitura:** a trilha sumir em telas de 1–2 segmentos é o comportamento do próprio
`Breadcrumb` (devolve `null` com menos de duas migalhas) — não é defeito; o teste só
deixou de chamar de "sem trilha" o que nunca teve o que mostrar. O que **não** foi medido:
leitor de tela real e a ordem de foco da paleta com resultados dinâmicos.

## Campanha travada por leitura truncada do ledger (17/11/2026)

Relato do dono: campanha **ativa**, sem pausa, sem erro, sem envio há mais de uma hora. A
tela mostrava 26 confirmadas e o motor devolvia `intervalo` a cada tick.

**O que os números diziam:** 33 aceitas pelo transporte, 26 com `ack ≥ 1`, 7 sem confirmação
— o "26" não era a 26ª mensagem, era o recorte de confirmadas. O último envio foi às 16:04
UTC.

**A causa, medida:** a organização tinha **1.002** linhas em `prospecting_sends`. O motor lia o
ledger **sem paginação** (`.select()` em `agendado.ts`), e o PostgREST corta em **1.000**. As
duas linhas de fora eram exatamente uma de cada campanha ativa. O motor achava que aquele
prospect ainda estava pendente, tentava reservar, a unique `(organization_id, prospect_id)`
recusava, e o código tratava "reserva perdida" como **`intervalo`** — um motivo que não era
ritmo. Nada era inserido, o mesmo prospect continuava em primeiro: laço infinito.

**Conserto:**
1. **paginação** do ledger em páginas de 1.000, com ordem estável (`enviado_em`, `prospect_id`);
   acima de 50.000 linhas a campanha é pulada com `ledger_indisponivel`, em vez de truncar em
   silêncio;
2. motivo próprio **`reserva_perdida`** — a tela não chama mais de "intervalo" o que não é
   ritmo;
3. teste de regressão com **1.002 linhas** onde a linha do prospect está na 1.002ª posição: o
   motor tem de enxergá-la e mandar para o próximo, não reescolher o primeiro.

**Destravar antes do deploy:** `scripts/prospeccao/destravar-campanha.ts --campanha <prefixo>`
remove da audiência só quem já tem `message_id` (comprovante). `--seco` mostra o que faria.
Reserva sem comprovante não é envio e **não** é removida. Provado no banco E2E: audiência
2 → 1, o prospect com comprovante saiu e o próximo ficou.

## Nota fiscal — o destinatário incompleto (17/11/2026)

Relato do dono: pedido **PED-19669** com "O cadastro do cliente precisa de ajuste: CPF/CNPJ" ao
emitir, e "no Mercos tem!".

**O que foi medido:**
1. o resolvedor fiscal lia `contacts.cnpj` e `source_metadata.mercos.documento`, mas **não** o
   CPF que o operador digitou na ficha (`contacts.cpf_encrypted`) — um cliente com CPF no CRM
   pedia CPF na NF-e;
2. o importador do Mercos **só grava o documento quando cria o contato**. Se o cliente já
   existia (WhatsApp/manual), o documento que está no Mercos não chega ao CRM — que é o caso do
   pedido acima.

**Corrigido:**
- `documentoDoCadastro` aceita o documento **numérico** que o importador antigo gravou;
- `carregarDestinatario` decifra `cpf_encrypted` (RPC `decrypt_cpf`) quando o cadastro e o
  snapshot não têm documento;
- a tela **Emitir NF-e** ganhou uma seção **Destinatário** editável (nome, CPF/CNPJ, IE) e a
  prévia **"Conferir a nota campo por campo"** (destinatário, itens e totais); o que for digitado
  vence o cadastro e fica gravado na nota (`extras.destinatario`);
- `scripts/contatos/definir-documento.ts --contato <telefone|id> --documento <CPF/CNPJ>` grava o
  documento no contato (CNPJ em `cnpj`; CPF em `cpf_hash` + `cpf_encrypted` +
  `source_metadata.mercos.documento`), para a nota seguinte já achar sozinha.

**O que não foi feito:** atualizar o contato existente dentro do importador do Mercos — mudança
de função SQL (migration + baseline + MANIFEST); fica para o próximo bloco. O script e a tela
resolvem o caso imediato.

## Tema claro: o contraste que nenhum instrumento olhava (18/11/2026)

Esta rodada começou com uma pergunta simples — "o contraste publicado cobre os dois temas?" —
e a resposta era **não**. O produto é dark-first (`app/layout.tsx` fixa `data-theme="dark"` antes
do primeiro paint), e `scripts/auditoria/contraste.mjs` abria as 8 telas **sem escolher tema**:
as 1.030 medições de 17/11/2026 descreviam só o escuro. O claro, que qualquer pessoa liga no
menu, nunca foi medido por ele.

### V-52 · Alta · No tema claro, `text-subtle` media 2,85:1 em 74 usos de texto — **CORRIGIDO**

| | antes (`#999999`) | depois (`#6f6f6f`) |
| --- | --- | --- |
| sobre `--color-surface` (`#ffffff`) | **2,85:1** ✗ | **5,02:1** ✓ |
| sobre `--color-bg` (`#f6f7f9`) | **2,66:1** ✗ | **4,69:1** ✓ |
| sobre `--color-surface-elevated` (`#fafafa`) | **2,73:1** ✗ | **4,81:1** ✓ |

Piso AA de texto normal: **4,5:1**. O escuro já havia sido corrigido na V-27 (`#8d8d8d`) pelo
mesmo motivo; o claro herdou a cor da referência (Ash `#999`) e ficou para trás.

**Não é decoração.** Medido: **75 usos** de `text-text-subtle` em `app/` e `components/`, dos
quais **74** não estão em `aria-hidden` — são texto que se lê. Exemplos onde o defeito aparece
como produto:

| Onde | O que é | Tamanho |
| --- | --- | --- |
| `app/app/pedidos/_client.tsx:1165` | rótulo do dia na lista ("QUINTA-FEIRA, 15 DE OUTUBRO") | 11 px |
| `app/app/pedidos/_client.tsx:1174` | "N pedidos · R$ X" ao lado do dia | 11 px |
| `app/app/expedicao/_client.tsx:966` | rótulo de seção em caixa alta | 9 px |
| `app/app/settings/tenant/agenda/_client.tsx:299` | "desativado" ao lado do tipo de compromisso | 12 px |

**As duas causas eram de régua, não de tela** — e por isso o defeito atravessou quatro fases de
auditoria sem aparecer:

1. `tests/unit/tailwind-tokens.test.ts` excluía `text-subtle` da lista de tokens de TEXTO com a
   justificativa "é decoração (divisor, ícone desligado)". A justificativa era falsa: o próprio
   `globals.css` já dizia, no bloco escuro, que "o gate o excluía como decoração — e ele não é".
   **Corrigido no gate, não só no token**: `text-subtle` entrou em `TOKENS_DE_TEXTO` e é medido
   contra os três fundos de página nos dois temas.
2. `scripts/auditoria/contraste.mjs` media um tema só. Agora percorre `dark` e `light`, semeia
   `nexus-theme` antes do primeiro paint (o mesmo caminho do `ThemeProvider`) e grava `tema` em
   cada registro. O resumo é **por tema**: um total agregado transforma um defeito do claro em
   "quase tudo bem".

**Prova reproduzível sem banco nem navegador:** `node scripts/auditoria/tokens-do-tema.mjs` agora
mede os papéis de texto contra os três fundos de página, nos três blocos, e imprime as reprovas.
Com o `HEAD` anterior: **6 reprovas — as MESMAS 3**, medidas duas vezes (`:root` e o espelho
claro, que redeclara o mesmo valor); o escuro já passava. Com esta correção: **0**.

### V-53 · Média · O instrumento de tokens lia o `:root` como se fosse o tema escuro

O artefato de 17/11 (`capturas/tokens-do-tema.json`) afirmava "127 tokens em cada um dos três
blocos — o mesmo conjunto, sem tema de segunda classe". A frase nunca foi medida: `blocoDeTema`
usava `CSS.indexOf('[data-theme="dark"]')` e achava a primeira ocorrência da string, que é o
`@custom-variant dark (&:where([data-theme="dark"], …))` no topo do arquivo. O recorte ia dali
até o primeiro `\n}` — ou seja, **o bloco `:root` inteiro**. A coluna "dark" era a coluna clara
com outro nome.

| Bloco | Antes (medido errado) | Depois |
| --- | --- | --- |
| `:root` | 127 | **127** |
| `[data-theme="light"]` | 127 | **79** |
| `[data-theme="dark"]` | 127 (era o `:root`) | **90** |

Os números certos **não** são iguais, e não deveriam ser: o escuro sobrescreve 90 chaves e o
espelho claro redeclara 90 − 11 da rampa accent = 79. A paridade real é cobrada por
`tests/unit/branding-tema-claro-escopavel.test.ts` (conjunto e valor, chave por chave) — o
instrumento estava só repetindo o `:root` três vezes. O seletor passou a ser ancorado no começo
da linha (`^...` com flag `m`), o mesmo cuidado que o teste já tinha.

É a **sexta** vez nesta auditoria em que o defeito estava na régua (F-20, F-21, V-10, V-26, V-33,
esta). A regra que fica: antes de publicar um número que absolve o produto, provar que a régua
olhou para o lado certo.

### V-54 · Alta · No tema claro, o accent usado como TEXTO dava 3,63:1 — e 3,06:1 no selo — **CORRIGIDO**

A V-52 mostrou que o tema claro nunca era medido. Procurando a mesma classe de defeito nos
tokens (não só na tela), o accent apareceu em **dois papéis com um token só**:

| Papel | Par medido | Claro | Escuro |
| --- | --- | --- | --- |
| **preenchimento** (`bg-accent`) + texto Carbon | `#181925` sobre `#7e77f0` | **4,80:1** ✓ | 7,81:1 ✓ |
| **tinta** (`text-accent`) sobre `--color-surface` | `#7e77f0` sobre `#ffffff` | **3,63:1** ✗ | 7,63:1 ✓ |
| tinta sobre `--color-bg` | `#7e77f0` sobre `#f6f7f9` | **3,39:1** ✗ | 8,18:1 ✓ |
| tinta sobre `--color-accent-soft` (`Badge` default) | `#7e77f0` sobre `#e9eaff` | **3,06:1** ✗ | 5,65:1 ✓ |

Piso AA de texto normal: 4,5:1. Eram **140 usos** de `text-accent` — links com sublinhado
("Ver detalhes", "Atual"), aba ativa, o selo padrão, ícones. No escuro tudo passava; de novo o
defeito existia de um lado só.

**Por que não bastava escurecer `--color-accent`:** ele é o preenchimento do botão primário, com
texto Carbon. Escurecer o fill derruba esse par (o Carbon sobre um 700 daria ~3,1:1). São dois
papéis, e agora são dois tokens:

| Token | Claro | Escuro | Medidas |
| --- | --- | --- | --- |
| `--color-accent-ink` | `var(--color-accent-700)` = `#625db8` | `var(--color-accent-400)` = `#a4a5ff` | 5,56 / 5,19 / 5,33 sobre surface/bg/elevada · **4,68 sobre o soft** · escuro 7,63 e 5,65 |
| `--destructive-foreground` | `#ffffff` (5,63:1 sobre `#a94a3c`) | **`#151515`** (5,02:1 sobre `#c87263`) | — |

Os valores são **paradas da rampa** (`var(--color-accent-NNN)`), não hex fixos: a marca do
revendedor reescreve a rampa inteira em `lib/branding/css.ts` e a tinta acompanha.

**Segundo defeito, encontrado no caminho:** `Button variant="destructive"` e o
`NexusConfirmDialog` pintavam `bg-error text-white` com branco **fixo** — no escuro, branco sobre
`#c87263` dá **3,48:1**. O token `--destructive-foreground` já existia e já declarava o lado
escuro certo; era o componente que não o usava (o contador do sino, 10 px, usava e estava certo).

**A régua que fica:** `tests/unit/tinta-do-accent-passa-aa.test.ts` mede os tokens (tinta × quatro
fundos, nos dois temas; e o par do destrutivo) e reprova qualquer `text-accent` novo fora de
`app/app/fiscal/**` — a única pasta que esta rodada não tocou, por acordo de frentes, e cuja
dívida está declarada aqui em vez de silenciada.

**Efeito na régua da marca:** o token novo entra na conta de contraste da derivação
(`lib/branding/regua-do-produto.ts`, regenerado), então uma semente de revendedor cuja tinta não
se distinga do fundo passa a reprovar — 18/26 pares viraram 22/32, e o número que sobe é papel
novo entrando na conta.

### V-55 · Média · A borda do campo de formulário tem 1,21:1 — **CORRIGIDO (decisão do dono, 18/11)**

WCAG 2.2 **1.4.11 (contraste de conteúdo não textual, AA)** pede **3:1** para a informação
visual que identifica um componente de interface. Medido nos três primitivos
(`components/ui/input.tsx:11`, `textarea.tsx:12`, `select.tsx:22`), que usam `border-border`:

| Par | Claro | Escuro |
| --- | --- | --- |
| borda (`--color-border`) sobre a superfície atrás do campo | **1,21:1** | **1,31:1** |
| preenchimento do campo (`bg-bg`) sobre a superfície | 1,07:1 | 1,07:1 |
| `--color-border-strong` (o degrau acima, usado no hover) | 1,40:1 | 1,70:1 |

Ou seja: um campo em repouso é identificado por uma hairline de 1,2:1. `border-strong` também
não chega lá. Para passar, a borda do CONTROLE precisa de um tom próprio — em torno de `#8a8a8a`
no claro (3,22:1 sobre o fundo do campo) e `#7a7a7a` no escuro.

**O dono decidiu (18/11/2026): corrigir, mantendo 1px.** "1,21:1 não é hairline sutil, é borda
invisível" — e o hairline do `DESIGN.md` é a ESPESSURA, não a invisibilidade. A correção separa
dois papéis que estavam no mesmo token:

| Token | Claro | Escuro | Papel |
| --- | --- | --- | --- |
| `--color-border` | `#e7e9ee` (1,21:1) | `#313131` (1,31:1) | **divisória** entre blocos — não identifica controle, não precisa passar 1.4.11 |
| `--color-border-control` **(novo)** | `#848c98` — **3,39** / 3,17 / 3,25 | `#747a82` — **3,93** / 4,22 / 3,49 | **borda de campo**, o que a 1.4.11 cobra |

A hierarquia dos estados continua crescendo, como o dono pediu: repouso ~3,4 → hover
`accent-600` (3,63 claro / 4,69 escuro) → foco `accent-ink` (**5,56 / 7,63**) + anel de 2px.

Aplicado em um lugar só para os ~20 campos que usam o primitivo (`Input`, `Textarea`, `Select`
via o alias `--input`, que passou a apontar para o token novo) e nos 7 campos escritos à mão
(agenda, cadastro de horários, busca global). O valor é **literal**, não vem da rampa: a função
dele é ser legível, e a marca do revendedor não deve poder torná-lo invisível.

Gate: `tests/unit/borda-de-campo-passa-3-para-1.test.ts` — mede o token nos dois temas, exige que
foco > hover > repouso e **vigia a divisória para continuar abaixo de 3:1** (se alguém "consertar"
a divisória também, a hierarquia visual do produto muda sem ninguém pedir).

**O que já está certo:** o indicador de foco do campo usa accent-600 e passa o piso de 3:1 nos
dois temas; o estado de erro usa `border-error`; e os alvos de toque dos botões têm 44 px abaixo
de `lg`.

## Casca e navegação — o que a leitura do código achou (18/11/2026)

As medições de casca (4.3/4.7) já existiam; esta rodada leu os componentes do shell procurando o
que **medição de presença** não vê: caminho oferecido que não existe e mudança de estado que não é
anunciada.

### V-56 · Média · A trilha oferecia um link sem destino (`href="#"`) — **CORRIGIDO**

`components/shell/Breadcrumb.tsx` monta as migalhas a partir do registro de navegação. Segmento
que o registro **não** conhece (rota da allowlist legada, tela nova ainda não registrada) entra
com rótulo humanizado e sem `href` — e o render fazia `<Link href={m.href ?? "#"}>`.

| O que a pessoa vê | O que acontece |
| --- | --- |
| "Pedidos › **Foo** › Bar" | "Foo" parece link, recebe foco no Tab e, ao ser ativado, leva ao topo da página |

Não quebra nada e por isso nunca apareceu em captura: é um alvo a mais no caminho de quem usa
teclado, sem destino nenhum. Corrigido na semântica — migalha sem destino é `<span>`, não âncora.
Gate: `tests/unit/trilha-sem-link-morto.test.tsx` renderiza a trilha numa rota de três segmentos
fora do registro e reprova qualquer `a[href="#"]`, além de exigir que o nível intermediário seja
`SPAN` e o último carregue `aria-current="page"`.

### V-57 · Média · O sino mudava de número em silêncio para leitor de tela — **CORRIGIDO**

O total de avisos vive num `<span>` dentro do botão, e o `aria-label` do botão ("Central de avisos
— 3 em aberto") só é lido quando o foco passa por ele. Quem está digitando no inbox recebia um
aviso novo e **não ouvia nada**: o número mudava na tela.

Corrigido com uma região viva (`role="status" aria-live="polite"`, `sr-only`) que anuncia o novo
total. As duas regras que evitam o efeito contrário — ruído constante treina a pessoa a ignorar o
anúncio — estão no código e no teste:

1. a **carga inicial não é novidade** (só entra em vigor depois do primeiro carregamento);
2. **só o aumento anuncia**; recontagem que cai é ajuste de estado, não alerta.

Gate: `tests/unit/central-de-avisos-anuncia.test.tsx` (4 casos: carga inicial silenciosa, aviso
novo anunciado, queda silenciosa, nome acessível do sino preservado).

**O que continua não medido, e por quê:** a captura de tela desta fatia não foi feita. O ambiente
derrubou o runtime seis vezes na rodada anterior (build de produção interrompido duas vezes, dev
server uma) e a nova regra de operação proíbe build/suíte por rotina. A prova aqui é de componente
— render + árvore de acessibilidade —, e os dois testes falham se a correção for revertida.

### V-58 · Média · Seis campos sinalizavam foco com uma borda 1,21 → 1,40 — **CORRIGIDO**

Varredura de todo `outline-hidden`/`outline-none` em `app/` e `components/` (21 ocorrências).
A maioria é legítima: item de menu usa `focus:bg-accent` como indicador, e o contêiner de rolagem
da casca suprime o anel de propósito. Três casos não eram:

| Onde | Antes | Efeito |
| --- | --- | --- |
| `app/app/agenda/_client.tsx` (motivo da remarcação) e 5 campos de `settings/tenant/agenda` | `focus:border-border-strong` | a borda vai de **1,21:1** para **1,40:1** — existe, não se vê |
| `app/app/busca/_client.tsx` (busca global) | `outline-hidden` no `<input>`, sem nada no contêiner | campo focado sem indicador nenhum |
| `components/shell/CommandPalette.tsx` | idem | idem |

Corrigido com o foco canônico do produto (borda accent + `ring-2 ring-accent-soft`) nos seis
campos, e `focus-within` nos dois contêineres de busca (o input é transparente dentro deles — o
anel tem de morar na caixa que a pessoa vê).

**O que fica de fora, com motivo:** itens de menu (`dropdown-menu`, `select`, `popover`) sinalizam
foco por fundo, que é o padrão do Radix e passa o piso de 3:1 (`bg-accent-soft` com texto
`accent-ink`); e `AppShell` suprime o anel no contêiner de rolagem, que não é foco de controle.
O método é a varredura, não a lista: `grep -rn "outline-hidden\|outline-none" app components`.

### V-59 · Baixa · O botão de fechar o aviso era anunciado em inglês — **CORRIGIDO**

O `<Toaster/>` do `app/layout.tsx` ligava `closeButton` sem passar o rótulo. O `sonner` 2.0.8
declara `closeButtonAriaLabel = 'Close toast'` como padrão
(`node_modules/sonner/dist/index.js:502`), e o produto só tem `pt-BR`
(`lib/i18n/idiomas.ts`).

| Onde se ouvia | O que se ouvia |
| --- | --- |
| todo aviso (toast) com botão de fechar | "Close toast" |

Corrigido com um wrapper de cliente (`components/feedback/ToasterDoProduto.tsx`) que usa o
tradutor do produto e passa o rótulo por `toastOptions`.

**A armadilha medida, e por que ela fica escrita:** a primeira correção passou
`closeButtonAriaLabel` direto no `<Toaster>` — o tipo aceita, e o DOM continuou com
`aria-label="Close toast"`. O pacote desestrutura o prop com o default (linha 502) mas só o
repassa adiante via `toastOptions` (linha 1233): o prop de topo é aceito e **ignorado**. O teste
(`tests/unit/toast-fala-portugues.test.tsx`) dispara um aviso de verdade e exige
`getByRole("button", { name: "Fechar aviso" })` — foi ele que pegou a primeira tentativa.

**Não medido:** o `richColors` do aviso usa a paleta da biblioteca, não os tokens do produto (o
aviso é o único feedback que pinta fora do design system). Trocar isso é mudança visível de
superfície e fica para uma fatia com captura — com a operação atual (sem build), não se prova
pixel.

### V-60 · Média · O aviso pintava com a paleta da biblioteca — **CORRIGIDO**

`richColors` fazia o `sonner` escolher as cores de sucesso/alerta/erro/informação. Era o único
feedback do produto fora do design system: sem tema, sem régua de contraste, sem marca — e o
contraste do texto sobre aquelas cores nunca foi medido por ninguém.

Decisão do dono: remover. Os quatro tipos passam a usar `--color-success|warning|error|info` com
o `-fg` correspondente, e o texto é medido sobre o fundo **composto** (o `-bg` é translúcido:
`rgba(…, 0.12)` no claro, `0.18` no escuro):

| Tipo | Claro | Escuro |
| --- | --- | --- |
| sucesso | **5,66:1** | **6,13:1** |
| aviso | **5,25:1** | **6,21:1** |
| erro | **6,50:1** | **5,32:1** |
| informação | **6,11:1** | **6,42:1** |

As classes moram em `components/feedback/cores-do-aviso.ts`, junto do mapa de pares que o gate
mede — duas listas (componente e teste) seriam duas verdades, e a que envelhece é sempre a que não
está em produção. O `!` (important) é deliberado: o `sonner` injeta `background: var(--normal-bg)`
em `[data-sonner-toast]`, mesma especificidade de um utilitário nosso, e a ordem de injeção não é
contrato.

Gate: `tests/unit/aviso-com-nossos-tokens.test.ts` — compõe o fundo antes de medir, exige ≥4,5:1
nos dois temas e **recusa o `richColors` de volta** (senão a biblioteca pintaria por cima das
nossas classes e o gate de contraste continuaria verde enquanto o produto voltava ao errado).

**Não medido em pixel:** sem build nesta rodada, a prova é a cor final composta por token — que é
exatamente o par que importa para contraste de texto.
