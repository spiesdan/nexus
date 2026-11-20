# 56 — Settings: passe sistêmico (16 caminhos, 13 telas + 3 redirects)

**Data:** 20/11/2026 · **Base:** `nexus/main` @ `54cd7b21d` · **Branch:** `front/settings-sistemico`
**Instrumento:** `scripts/auditoria/varredura-de-modulo.mjs` (novo)
**Sessão de medição:** `e2e-manager` promovido a `admin` da org **e** `platform_admin` no
banco LOCAL para alcançar as telas admin-only; os dois vínculos foram revertidos ao fim.
O `depois` de `/app/settings/notifications` foi remedido com a sessão normal de `manager`.

## O que foi medido

16 caminhos de `page.tsx` × 2 temas (claro/escuro) × 2 larguras (1440/390) = **64
combinações em cada lado**, na MESMA base: `antes` = `nexus/main`, `depois` = a
mesma base com o passe. Cada combinação responde:

- **contraste** WCAG 2.1 AA (4,5:1 normal / 3:1 grande), com fundo composto;
- **overflow** horizontal da raiz (`scrollWidth - clientWidth`);
- **console** (`console.error` + `pageerror`, com ruído de HMR filtrado);
- **alvos de toque** visíveis < 40 px (botões, switches, inputs, selects, summary);
- **status HTTP** e a URL FINAL (redirect não é tela — ver abaixo).

### Placar

| Régua | Antes | Depois |
| --- | --- | --- |
| Caminhos com HTTP 200 | 16/16 | 16/16 |
| Combinações medidas | 64/64 | 64/64 |
| Contraste AA reprovado | **0** | **0** |
| Overflow horizontal | **0 px** | **0 px** |
| Console + pageerror | **4** (notificações) | **0** |
| Alvos < 40 px (soma das 64) | 784 | 764 |

As duas primeiras réguas já estavam verdes: este módulo não tinha texto ilegível nem
transbordo. O que a varredura **pegou** foi o console — e o resto dos defeitos veio da
leitura visual, que é o que uma régua mecânica não vê.

### Por caminho

| Caminho | Status | Contraste | Overflow | Console | Alvos <40 | Destino |
| --- | --- | --- | --- | --- | --- | --- |
| `/app/settings/api-tokens` | 200 | 0→0 | 0→0 | 0→0 | 10→10 | — |
| `/app/settings/atendimento` | 200 | 0→0 | 0→0 | 0→0 | 28→27 | — |
| `/app/settings/atualizacao` | 200 | 0→0 | 0→0 | 0→0 | 8→8 | — |
| `/app/settings/billing` | 200 | 0→0 | 0→0 | 0→0 | 6→6 | — |
| `/app/settings/canal-oficial` | 200 | 0→0 | 0→0 | 0→0 | 28→28 | **redirect → `/app/connections?aba=oficial`** |
| `/app/settings/devices` | 200 | 0→0 | 0→0 | 0→0 | 16→14 | — |
| `/app/settings/marca` | 200 | 0→0 | 0→0 | 0→0 | 16→12 | — |
| `/app/settings` | 200 | 0→0 | 0→0 | 0→0 | 6→6 | — |
| `/app/settings/profile` | 200 | 0→0 | 0→0 | 0→0 | 16→16 | — |
| `/app/settings/security` | 200 | 0→0 | 0→0 | 0→0 | 16→16 | — |
| `/app/settings/templates` | 200 | 0→0 | 0→0 | 0→0 | 28→28 | **redirect → `/app/connections?aba=oficial&sub=templates`** |
| `/app/settings/tenant/agenda` | 200 | 0→0 | 0→0 | 0→0 | 44→42 | — |
| `/app/settings/tenant` | 200 | 0→0 | 0→0 | 0→0 | 16→15 | — |
| `/app/settings/tenant/pipelines` | 200 | 0→0 | 0→0 | 0→0 | 390→390 | — |
| `/app/settings/tenant/whatsapp` | 200 | 0→0 | 0→0 | 0→0 | 90→90 | **redirect → `/app/connections`** |
| `/app/settings/notifications` | 200 | 0→0 | 0→0 | **4→0** | 66→55 | — |

Os três redirects são aliases antigos de `/app/connections` (a Central de Conexões).
A varredura mede o **destino** e agora grava `redirecionaPara` — a linha não finge ser
uma tela de configuração. Elas continuam verdes porque `Conexões` está verde.

## Primitivas tocadas

### 1. `PaginaDeConfiguracao` — a moldura que faltava

`components/nexus-ui/layout/PaginaDeConfiguracao.tsx` compõe o `NexusPageHeader`
canônico (título + descrição + ações) com o padding/gap do módulo. Dez telas
escreviam o próprio `<header>` com as mesmas classes — e duas (`marca`,
`atendimento`) criavam um **segundo scroll** com `overflow-y-auto` dentro do
`<main>`, que já rola. A moldura removeu as duas cópias.

Aplicada em: `api-tokens`, `atendimento`, `billing`, `devices`, `marca`,
`notifications`, `profile`, `security`, `tenant`, `tenant/agenda`.

### 2. `RodapeDeSalvamento` + `useAvisoDeSaida` — salvar com estado

`components/nexus-ui/forms/rodape-de-salvamento.tsx`. Antes, só `atendimento`
sabia dizer “há mudança não salva”; `tenant`, `profile` e `marca` nasciam com
“Salvar” habilitado e continuavam habilitados depois de salvar. Agora as quatro
telas:

- desabilitam o botão quando nada mudou;
- mostram **“Há mudanças não salvas.”** (`role="status"`);
- trocam para **“Salvando…”** e travam durante o envio;
- `beforeunload` avisa ao recarregar/fechar (navegação interna fica com a frase —
  interceptar clique em `<a>` roubaria a navegação do produto inteiro);
- o botão primário tem **40 px** (o `h-9` de 36 px fica para ações secundárias).

### 3. `CampoDeArquivo` — o seletor em português

`components/nexus-ui/forms/campo-de-arquivo.tsx`, usado pelo `CampoDeLogo`
(afeta `/app/settings/marca` **e** `/admin/marca`). O `<input type="file">`
nativo desenhava **“Choose File / No file chosen”** no meio de uma tela em
pt-BR — não há atributo que traduza esse rótulo. O input agora cobre o botão
(`opacity-0`, alvo grande), o nome do arquivo escolhido aparece ao lado e é
anunciado (`aria-live`). O `id` foi preservado para o e2e de hidratação.

### 4. Formulários em uma coluna no celular

`tenant` e `profile` usavam `grid-cols-2` fixo: a 390 px, cada campo ficava com
~150 px e rótulos como “Retenção de mídia (dias)” quebravam em três linhas.
Agora `grid gap-4 sm:grid-cols-2` (e `sm:col-span-2` no logradouro, que estava
`col-span-2` e criava coluna implícita em uma coluna só).

### 5. Notificações — dois defeitos reais

- **Hidratação**: `useState(() => lerPrefs())` lia `localStorage` no primeiro
  render; o servidor pintava `push: true`, o cliente hidratava com o valor
  gravado e o React registrava *“Hydration failed”* nas QUATRO combinações
  (os 4 erros de console do `antes`). O primeiro render usa `prefsIniciais()`
  (sem storage) e o valor gravado entra num efeito. O `useNotificationPermission`
  passou a ter um `getServerSnapshot` **constante** (`"unsupported"`), que é o
  que o HTML do servidor diz — antes ele passava `getPermission`, que no cliente
  devolve “granted” e não casa com o SSR.
- **Tabela no 390**: a quarta coluna (Email, com switches `disabled` desde
  sempre, porque o canal não envia) empurrava **“Push” para fora da tela**.
  Email fica `hidden sm:table-cell`; a pessoa ganha a coluna que usa e o aviso
  do topo continua dizendo que email não está disponível.

### 6. Microcopy

- `tenant`: **“Admin only.”** (inglês no meio da frase) → “Só administradores
  editam.”;
- `profile`: “Email só pode ser trocado em breve” → “O email desta conta não
  pode ser trocado por aqui.”; “Upload — em breve” → “O upload ainda não está
  disponível: cole a URL pública de uma imagem.”. Promessa sem dono virou fato.

## O que ficou de fora, com motivo

- **`billing`** — a tela diz “Em breve — Fase 2”. É estado de produto, não
  desenho; mudar a frase seria inventar roadmap.
- **Canal Email das notificações** — os switches são `disabled` para todo mundo
  porque o envio não existe. Esconder no celular é desenho; **ligar ou remover a
  coluna é decisão de produto**. Fica a proposta: ou implementar o canal, ou
  remover a coluna e a promessa do texto.
- **`/app/settings/atualizacao`** — superfície do dono da instalação
  (`is_platform_admin`); para os demais é `notFound()` **de propósito**. Medida
  como platform admin; não é uma tela de organização.
- **Alvos < 40 px restantes** — são os switches (20×36) e botões secundários de
  36 px. O mínimo AA (WCAG 2.5.8) é 24×24; 36 px passa. O que o passe corrigiu
  foi o **alvo primário** (salvar) para 40 px. Subir o `Button` global inteiro
  mudaria 159 telas por causa de uma régua de 40 que não é a do WCAG.
- **`tenant/pipelines`** — já usava `NexusPageHeader` e tem edição densa própria
  (390 alvos pequenos, quase todos setas de reordenar). Não foi tocada nesta
  rodada; medi-la é o que a matriz agora tem.

## Evidência

- `docs/auditoria/capturas/varredura-settings-antes/` — 64 PNGs + `varredura.json`
- `docs/auditoria/capturas/varredura-settings-depois/` — 64 PNGs + `varredura.json`
- `scripts/auditoria/varredura-de-modulo.mjs` — o instrumento, reutilizável por
  módulo (`--rotas`, `--estado`, `--saida`), com guarda de sessão vencida e de
  redirect.

**Limite honesto:** a varredura prova que as quatro réguas passaram naquele
commit; não prova fluxo (isso é e2e) nem que o texto é bom. O que ela não vê
está listado acima como decisão ou como dívida — não como “aplicado”.
