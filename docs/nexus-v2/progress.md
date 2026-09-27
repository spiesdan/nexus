# NEXUS 2.0 — PROGRESSO / HANDOFF (leia isto primeiro)

> **Propósito:** este arquivo é a memória entre sessões. Atualize-o SEMPRE no fim de
> cada torno (última ação + próximas passos) antes de os tokens acabarem.
> Quem chegar novo: NÃO alucine estado — tudo abaixo foi medido neste repo.
> Espelho do spec: `# NEXUS 2.0 — ERP + CRM + SALES OS .txt` (fora do repo, em
> `C:\Users\Daniel\Documents\wppcrm2\`).

## Estado do repositório (última medição)

- Repo: `C:\Users\Daniel\Documents\wppcrm2\DeskcommCRM` · branch **`nexus-v2`**
- HEAD: `e83ac2fdd feat(passo-7): jornadas E2E §86 — 7 specs novas verdes (venda, expedicao, financeiro, fiscal, IA, compras, estoque)` — o **PASSO 7**: 5 jornadas nomeadas do §86 + specs de Compras/Estoque, todas em `SPECS_PARTE_*`, seed da cifra fiscal no CI, e os fixes de produto que a jornada achou (envelope do `ok()` lido sem `.data` em `EmitirNota`; `codigo_municipio` faltando no select de `carregarContextoSped` — a pré-validação acusava IBGE SEMPRE; `?aba=` que não trocava a `Tabs` uncontrolled no push client-side; envelope dobrado da conciliação; refetch dos recebíveis na ficha do pedido por `status`).
  — e o commit que entrega este arquivo **fecha o handoff do PASSO 7**.
  (anteriores: `57bdcc511` docs handoff 6 · `8935da608`/`6b3732ee0` Fase 6b ·
  `448269803` docs handoff 6a · `b12004435` Fase 6a ·
  `061042c5f` docs handoff 5e · `3fbd91b21` Fase 5e FormField ·
  `4015614b7` docs handoff 5d · `05857124a` Fase 5d NexusKpi +
  NexusChart · `1f2239e18` docs handoff 5c · `c370b8c8a` Fase 5c abas ·
  `9843f3ed9` docs handoff 5b · `fd6a18d9e` Fase 5b FilterBar ·
  `c9d294721` docs handoff 5a · `0a9409f58` Fase 5a header +
  fix #185 · `3c5c7f97d` docs handoff 4m · `f681effb4` Fase 4m admin ·
  `aa8f4b4bd` docs handoff 4l · `4262e415b` Fase 4l /webhooks ·
  `8afd3cbe2` docs handoff 4k · `badee8467` Fase 4k pedidos/[id]/novo ·
  `2bf70b937` docs handoff 4j · `66aa9927b` Fase 4j /agenda ·
  `a8eb3d118` docs handoff 4i · `65ec570f3` Fase 4i funis ·
  `05d32dadd` docs handoff 4h · `bd4635147` Fase 4h /prospeccao ·
  `dc8a5b8ae` docs handoff 4g · `f13ca808d` Fase 4g /indicadores ·
  `ff482cdc4` docs handoff 4f · `b60fe1a1f` Fase 4f /radar ·
  `b9d45b3ef` docs handoff 4e · `679b65fb3` Fase 4e /financeiro ·
  `eb09ce298` docs handoff 4d · `0228f8c9f` Fase 4d /inbox ·
  `e373d0545` docs handoff 4c · `3612818d7` Fase 4c 360 ·
  `6f32a5f5c` docs handoff 4b · `921435fe8` Fase 4b /pedidos ·
  `b7850a0bb` docs handoff 4a · `e062aa3b5` Fase 4a /contacts ·
  `05359785a` docs handoff 3f · `6ed0d5670` Fase 3f toasts ·
  `958806f13` docs handoff 3e · `41173e58d` Fase 3e overlays+confirm ·
  `ab0545095` Fase 3b AdminDataTable · `37b35a029` Fase 3a StatusPage ·
  `c343a9993` Fase 2d Global Search · `727faf650` handoff fases 0/1/2 ·
  `6f12049c0` infra e2e · `d949973d5` TopBar admin · `40e049aab` ContextualDrawer ·
  `cd0caeccc` NotificationCenter · `359c03e3f` Breadcrumb · `0353cd57b` Fase 1 mata uimaxxing ·
  `9c26fd26e` inventário §100 · `4126a9681` Sidebar §19 ·
  `31e1b6655` helper Windows · `7225f5c80` docs · passos 1-4: `b5ae07bed`/
  `259023c91`/`31d9411a9`/`3c5126932`)
- Remotes: `nexus` = escrita canônica (`https://github.com/spiesdan/nexus`) —
  **todo push vai para `nexus`**; `origin`/`fork` = somente leitura (AGENTS.md);
  o spec §101 quer SÓ o nexus — **decisão pendente do usuário** (ver abaixo).
- Não existe PR `nexus-v2 → main` ainda (abrir só com ordem explícita).
- Árvore limpa (nada de WIP). Todos os commits acima já estão em `nexus`.

## Última ação

**Passo 7 (E2E §86) — FECHADO. 7 specs novas verdes e registradas no CI.**
Commit `e83ac2fdd`:

- **Specs** (`tests/e2e/`): `jornada-venda`, `jornada-expedicao`,
  `jornada-financeiro`, `jornada-fiscal`, `jornada-ia` (as 5 jornadas
  nomeadas do §86 — a 6ª, `recompra-radar`, já existia) +
  `compras-do-rascunho-ao-estoque` + `estoque-entrada-saida-e-saldo`;
  helper `tests/e2e/helpers/pedidos.ts` ganhou `ncm?` (NCM 8 dígitos: a
  pré-validação fiscal cobra antes da SEFAZ).
- **CI**: `e2e.yml` PARTE_1 += compras/estoque, PARTE_2 += as 5 jornadas
  (as 3 antigas estavam órfãs — o gate reprovava); seed
  `scripts/seed-e2e-fiscal-cifra.ts` + linha no workflow (sem a chave em
  `private.app_secrets`, `fn_encrypt_oauth` derruba o PUT de
  `fiscal-settings` com 422 na senha do certificado — o self-hoster tem
  essa linha no setup, o banco fresco do CI não).
- **Fixes de produto achados pela jornada**: envelope do `ok()` em
  `EmitirNota` (`.data` — sem ele `setPendencias(undefined)` derrubava o
  boundary com `undefined.length` e o POST de emissão nunca saía);
  `carregarContextoSped` não pedia `codigo_municipio` (toda config
  "passava" e a pré-validação dizia IBGE faltando); `?aba=` da
  `/app/notas` não trocava a `Tabs` uncontrolled no push client-side
  (`key={abaInicial}`); conciliação com envelope dobrado (`{data:{data}}`
  → `.map` na aba); ficha do pedido refetch por `status` (o "Faturar
  pedido" gera os recebíveis dentro do PATCH).
- **Verificação**: typecheck 0 · lint 0 erros/340 warnings (baseline) ·
  `pnpm build` ✓ · unit = baseline (16 flakes nos mesmos 5 arquivos) ·
  **7/7 specs em 2,9min** (regressão de uma tacada) · gates
  `evidencia-citada` + `e2e-cobertura-completa` **49/49**.
- Próximo: **passo 8 — fechamento** (`parity-matrix`/`migration-plan`,
  checklist §94, PR só com ordem explícita).

(estado anterior — passo 6:) Fase 3 COMPLETA (3a-3f); Fase 4
COMPLETA (4a-4m); Fase 5 COMPLETA (5a-5e); Fase 6 COMPLETA (6a
responsividade §60 + 6b auditoria de aceite §100 — checklist dos 11
itens comprovado: 106 rotas varridas com VIOLACOES(0)/FAMILIAS(1),
gates de fonte 8/8, evidência em `evidence/fase6b-aceite/` e
`evidence/fase6-mobile/`); fases 0/1/2 + shell §17
fechados no handoff `727faf650`.** Inventário:
`docs/nexus-v2/redesign-inventory.md` (tabela §5 com os hashes + §6 com
o checklist comprovado item a item).
Decisão INFIDO travada: **tema dark-first mantido** (§100/§14 não mandam claro).

- **Fase 3a `37b35a029` — `StatusPage` 6→1**: uma tela de erro em
  `components/nexus-ui/feedback/StatusPage.tsx` serve 403/404/500/503/
  account-suspended/admin.forbidden; `lib/i18n/idioma-da-pagina.ts` resolve o
  idioma do documento fora do provider React (as páginas de erro não têm
  `useT`). Teste `status-page.test.tsx`.
- **Fase 3b `ab0545095` — `AdminDataTable` 7→1 + badges**: as 7 tabelas admin
  (audit, incidents, lgpd, platform-admins, tenants, usage, users) montam
  skeleton/empty/badge/load-more sobre `components/admin/AdminDataTable.tsx`;
  variantes de status agrupadas em `admin/incidents/badges.tsx` +
  `admin/tenants/status-badge.tsx` (consumidos por `incidents/[id]/_client` e
  `tenants/[id]/layout`, que deixaram de ter cópias locais).
- **Fase 3c `eafb9c071` — confirmações unificadas**: `NexusConfirmDialog`
  estendeu o contrato (title `ReactNode`, description opcional, `busyLabel`,
  slot `children`, modo trigger `triggerLabel` OU controlado `aberto`/`aoFechar`,
  `try/catch` no `onConfirm` — erro mantém a dialog aberta para retry) e ganhou
  `forms/ConfirmacaoProvider.tsx` (`useConfirmar()` promise-based; montado em
  `app/app/layout.tsx` dentro do `IdiomaProvider`; exportado no barril
  `nexus-ui`). Migraram **7 `window.confirm`** (financeiro estornar; expedição
  reotimizar×2, excluirCarga; categorias apagar; pedidos excluirEmMassa e
  excluir; prospecção excluir) e **13 `AlertDialogContent`** (RulesTab,
  Templates, DeleteFollowupFlow, Impersonate, ContactsTable, CredentialCard,
  AgentRowMenu, VersionHistory, PublishConfirm, SourceDetail, QueueTab,
   routers, DossieDoFollowup). Teste novo
   `tests/unit/confirmacao-provider.test.tsx` (8 casos); e2e `followup-queue` e
   `retorno-anti-morte` migraram `execFileSync("npx")` → `execNpx` (Windows).
 - **Fase 3d `7340d3e54` — `TenantReasonDialog`**: `SuspendDialog` ×
   `ReactivateDialog` (123 linhas idênticas, cópias e endpoints distintos)
   viraram UM componente em `components/admin/tenants/TenantReasonDialog.tsx`,
   montado sobre o `NexusConfirmDialog` controlado — `Textarea` do motivo no
   slot `children`, `busyLabel` com a cópia de pending de cada ação, `danger`
   só em suspender, e a régua dos 10 caracteres herdada via prop NOVA
   `confirmDisabled` no `NexusConfirmDialog` (o estado de erro dos antigos era
   inalcançável — o botão já saía desabilitado). Consumidor único
   `TenantActions.tsx` monta 2× `TenantReasonDialog`. Teste novo
   `tests/unit/tenant-reason-dialog.test.tsx` (5 casos: régua, copy/endpoint
   por ação, falha mantém aberto, fechar limpa o motivo). `AlertDialogContent`
    no repo: 5 → **3** (`NexusConfirmDialog`, `ResolveIncidentDialog`,
    `ApproveButton`).
 - **Fase 3e `41173e58d` — overlays→`ui/dialog` + `confirm(` globais→`useConfirmar`**:
   - Os 3 overlays manuais que sobravam (`fixed inset-0 z-50` fora dos primitivos
     `ui/`): `prospeccao/_importar-arquivo` e `GradeNotas` (Carta de correção)
     viraram `Dialog`+`DialogContent` com Esc/portal/foco do Radix; e o
     `MfaEnrollModal` ganhou modalidade — `motivo="obrigatorio"` (o gate)
     RECUSA fechar e esconde o X nativo via `[&>button:last-child]:hidden` (o
     `Close` é o último filho de `DialogContent`, `ui/dialog.tsx:50`);
     `motivo="escolha"` (Segurança→Ativar) ganhou saída por prop NOVA
     `onFechar`, ligada em `settings/security/_client.tsx`. `#mfa-title`
     preservado no `DialogTitle` (e2e `mfa-opcional` usa o id e o heading).
   - Os **5 `confirm(` globais** que a 3c omitiu (grep era só `window.confirm(`)
     viraram `useConfirmar()`: `settings/security/_client.tsx` ×3
     (regenerar códigos, sair de todos os dispositivos, desligar MFA — este
     ganhou função `desligar()` extraída), `ConversationHeader` (Fechar
     conversa) e `InboxKeyboardShortcuts` (atalho `e`). Teste
     `inbox-header-nao-trava.test.tsx` envolve o header com
     `ConfirmacaoProvider` (sem provider o hook lança, por contrato).
   - Resíduo medido: `confirm(`/`window.confirm(` fora do próprio provider = 0;
     `fixed inset-0 z-50` = só os primitivos `ui/{dialog,alert-dialog,sheet}`.
 - **Fase 3f `6ed0d5670` — toasts → `nexusToast` porta única**: a porta
   (`components/nexus-ui/feedback/nexus-toast.ts`) passou a ofertar a superfície
   toda do sonner usada no repo (chamada `toast(...)` + `success/error/warning/
   info/loading/message/dismiss`, retorno de id, 2º arg `string | ExternalToast`
   com string→`{description}`) e repassa 1 arg quando não há 2º (mantém os
   `toHaveBeenCalledWith(msg)` dos testes idênticos). **121 arquivos prod**
   trocaram `import { toast } from "sonner"` por `nexusToast as toast` (~411
   call sites intactos); `showApiError` virou mapa de código→tom sobre a porta.
   Exceções (medidas): `lib/notifications/deliver.ts` (server runtime) e
   `app/layout.tsx` (`<Toaster/>`) seguem com `sonner`; os testes mockam
   `sonner` e o mock intercepta via porta (nada de mock mudou). Resíduo
   `from "sonner"` em prod = exatamente esses 3 arquivos.
 - **Gates da torno**: typecheck ✓ · lint 0 erros/338 warnings (baseline) ·
   `test:unit` = baseline (7.423 pass / 15 flakes conhecidos: guarda-da-release,
   namespace-das-imagens, performed-at, rate-limit) · `pnpm build` ✓ ·
   e2e da 3f: `webhooks`+`followup-queue`+`marca-logo` 9/9 ✓ ·
   e2e da 3e: `mfa-opcional` 4/4 ✓ + smoke `inbox-quem-manda`/
   `inbox-abas-espelham-o-comando` 3/3 ✓ · e2e da 3d:
   `webhooks`+`followup-queue`+`retorno-anti-morte` 6/6 ✓ ·
   `navegacao` 13/13 ✓ · `pnpm format:check` reprova pré-existente no repo
   inteiro (não é gate) · nenhum e2e visita `/admin/tenants` (unit é o gate da 3d).
 - **Fase 4a `e062aa3b5` — `/contacts` (lista)**: `<header>/<h1>` à mão →
   `NexusPageHeader` (actions = Importar CSV + Novo cliente, com o `shrink-0`
   do PR #267 preservado dentro do slot); a filter bar caseira (dropdowns
   Tag/Origem/por-página + "Limpar filtros") → `FilterBar`+`FilterPrimary` +
   `FilterSearch` (label visível "Buscar") + 3× `FilterSelect` + `FilterChips`
   (remoção individual por chip + limpar tudo) — o mesmo módulo que já usam
   pedidos/products/prospeccao/relatorios/titulos. `SOURCE_OPTIONS` perdeu a
   entrada `undefined` (virou `allLabel`). Estados loading/error/empty e a
   tabela (`ContactsTable`, MANTER com sort/seleção) já estavam na régua e
   não mudaram. Prova visual: `evidence/fase4-contacts/1-lista-clientes-desktop.png`
   (desktop 1280) e `evidence/fase4-contacts/2-lista-clientes-mobile-390.png`
   (390px — header empilhado, botões sem comprimir, filtros em coluna).
   Bônus: `confirmar-dado-do-contato.spec.ts` migrado de
   `execFileSync("npx")` → `execNpx` (3 call sites; era o único dos specs de
   contacts que ainda quebrava no Windows).
 - **Gates da 4a**: typecheck ✓ · lint 0/338 ✓ · `test:unit` = baseline
   (15 flakes / 7.423 pass; 1 rodada transitória acusou +1 em
   `activity-write-failure` — passa isolado) · e2e: evidência (spec temporária,
   apagada) 1/1 ✓ + `confirmar-dado-do-contato` 2/2 ✓ (após execNpx) ·
   `pnpm build` ✓. Atenção medida: a stack Docker/WSL caiu entre as rodadas
   (11h de gap) — login do e2e falhava com `fetch failed` até reiniciar o
   Docker Desktop; e o `next start` serviu o build ANTIGO na 1ª tentativa
    (heading aparecia mas o label novo não) — SEMPRE `pnpm build` depois de
    mexer em UI antes de rodar e2e.
 - **Fase 4b `921435fe8` — `/pedidos` (hex Mercos→tokens + header)**:
   - Os 20 hexes do "molde Mercos" sumiram (`grep` de `#[0-9a-f]{3,8}` em
     `app/app/pedidos` = **0**): `bg-[#f4f4f3]` da página → canvas temático;
     botão primário `#4b2e83`/hover `#3d2569` → variante default (accent);
     `border-[#d9d9d9]` da busca → borda default; os 8 `text-[#6a2fb3]`
     (links, selects da frase, resumo) → `text-accent`; os cinzas
     `#555`/`#3c3c3c`/`#333`/`#222`/`#8a8a8a`/`#b5b5b5` dos cards →
     `text-muted-foreground`/`text-text`/`text-text-subtle` (a view Cartões
     era cinza-fixado fora do tema — some no dark); pill "Concluído"
     `bg-[#7cb342] text-white` → `bg-green-100 text-green-800` (mesma
     família light-chip dos 6 irmãos em `_pills.tsx`).
   - `textos.titulo`/`subtitulo` eram **props mortas**: a lista não tinha
     `<h1>` nenhum (medido: `grep '<h1'` em `app/app/pedidos` só achava
     `novo/_editor`). Agora renderizadas via `NexusPageHeader`, com as 3
     ações (Criar pedido / Criar com IA / Imprimir) no slot `actions`
     (`PageHeader` já envolve em `flex flex-wrap gap-2`); a barra
     justify-between antiga virou a linha de busca avulsa.
   - Já canônico e preservado: `FilterChips` + `SavedFilters` +
     `FilterNumber` + `FilterActions`. A "frase" Mercos (`Mostrando X feitos
     por Y via Z`) ficou intacta de propósito — trocá-la por `FilterSelect`
     é redesign de UX, decisão de produto, não migração de token.
   - Prova visual: `evidence/fase4-pedidos/1-lista-pedidos-desktop.png`
     (cards com rótulo de dia, pill e acentos temizados) e
     `evidence/fase4-pedidos/2-lista-pedidos-mobile-390.png` (header
     empilhado + bottom dock). Dados: `scripts/seed-e2e-recompra.ts` +
     `UPDATE commercial_orders SET status='entregue'` pontual para
     fotografar a pill verde.
   - Lições medidas: **nenhuma spec e2e visita a lista de pedidos** — a
     evidência temporária (apagada depois) É o gate e2e deste módulo; o
     locator do "Criar pedido" é `getByRole("link")` (o `Button` é
     `asChild`); o TOTP do login caiu 1× com "Código inválido" e o retry
     resolveu, como documenta `helpers/login-admin.ts`.
 - **Gates da 4b**: typecheck ✓ · lint 0/338 ✓ · `test:unit` = baseline
   (15 flakes nos mesmos 4 arquivos · 7.424 pass / 710 arquivos) ·
   `pnpm build` ✓ · e2e: evidência (spec temporária, apagada) 1/1 ✓ ·
   hexes em `app/app/pedidos` = 0.
 - **Fase 4c `3612818d7` — `360` (`contacts/[id]`)**: o `Cabecalho360`
   (header manual com `<h1>` próprio) adotou `NexusPageHeader`
   (title = `rotuloDoContato`, subtitle = `email • telefone` juntos,
   actions = Editar, condicionada a `!is_anonymized`); badges + KPIs
   (`<dl>` última compra/valor acumulado/negócios) ficam num bloco logo
   abaixo, dentro da MESMA tag `<header>` — **obrigatório**: o e2e
   `confirmar-dado-do-contato` ancora o email em
   `page.locator("header").getByText(email)` (linha 136/142) e a troca da
   tag por `<div>` quebraria o gate. Subtítulo monta-se com
   `.filter(Boolean).join(" • ")` (contato sem email/telefone → `undefined`,
   sem `<p>` vazio). Sombra do map de tags renomeada `t` → `tag` (antojam o
   `t()` de tradução). Módulo já estava na régua em outro ponto: 0 hexes,
   tabs = `ui/tabs`, estados loading/empty/error existem — nada a criar.
   Prova visual: `evidence/fase4-360/1-contato-360-desktop.png` (header
   canônico + badge "Recompra atrasada" + KPIs) e
   `evidence/fase4-360/2-contato-360-mobile-390.png` (Editar empilhado).
   - Lições medidas: (1) a captura desktop saiu com o SKELETO na 1ª tentativa
     — a espera agora é explícita no `dt` "Última compra" + 600ms de settle;
     (2) o read de imagem do ambiente serviu mídia CACHEADA (pelo hash do
     arquivo) em leituras repetidas — confirme dimensões com
     `System.Drawing` antes de concluir que a evidência está errada;
     (3) rodada combinada de 2 specs e2e flakou no TOTP/timeout e passou
     isolada (2/2) — regressões daqui: `confirmar-dado-do-contato` 2/2 ✓ +
     `contato-salva-email` 1/1 ✓.
 - **Gates da 4c**: typecheck ✓ · lint 0/338 ✓ · `test:unit` = baseline
   (15 flakes documentados nos mesmos 4 arquivos) + flakes novos de
   TIMEOUT 15s em testes de varredura (`branding-marca-css`,
   `consulta-usa-o-vocabulario-do-banco`, `sem-marcador-de-conflito`,
   `telas-sem-dado-de-mentira`, `aritmetica-de-timestamp-infinito`) sob
   carga da suíte — **prova de que não são do diff**: com `git stash` do
   arquivo (árvore limpa) a suíte reproduz o mesmo tipo de falha (17/6,
   7 timeouts) e TODOS os suspeitos passam isolados (5/5 e 34/34) ·
    `pnpm build` ✓ · e2e: evidência (spec temporária, apagada) 1/1 ✓ +
    regressões do 360 3/3 ✓.
  - **Fase 4d `0228f8c9f` — `/inbox` (componentes em `components/inbox/`)**:
    - Diagnóstico: o módulo estava **quase todo na régua** — `InboxFilters`
      já usa primitivos canônicos (Tabs/Select/Input/Switch); `ConversationList`
      já tem skeleton + `q.isError` + botão de refetch; sem `<h1>` por DESENHO
      (three-pane `h-[calc(100dvh-...)]` — master-detail não é página; um
      `NexusPageHeader` em cima empurraria a lista numa tela onde espaço é
      escasso; hierarquia §100 não exige h1 em painel); diálogos do módulo já
      são `DialogContent` (migração `NexusFormDialog` é trilha da Fase 5).
    - Feito (1) **paleta WhatsApp centralizada**: os 2 hexes que vazaram do
      tema voltaram para dentro dele — `WA.dayLabel` (`#54656f`, divisor de
      dia, ChatThread) e `WA.quote`/`WA.quoteOut` (`#075e54`, barra da
      citação, MessageBubble); hexes fora do `whatsapp-theme.ts` em
      `components/inbox` = **0**. Os 8 hexes DENTRO do tema ficaram de
      propósito: o arquivo é a assimilação visual do WhatsApp (cabeçalho
      documenta "SÓ COR… escopo estrito"), consumido também por
      `pedidos/[id]`, `prospeccao` e `radar` — **decisão: não converter para
      tokens Nexus**.
    - Feito (2) **`JanelaFechadaAviso`**: `<select>` nativo → `ui/select`
      (`SelectTrigger` com `aria-label="Modelo aprovado"`,
      `value={escolhido || undefined}` no precedente de
      `CredentialPicker`/`ModelPicker`, placeholder no `SelectValue`);
      import de `cn` removido (ficou sem uso).
    - Prova visual: `evidence/fase4-inbox/1-aviso-janela-fechada-desktop.png`
      (banner da janela fechada + seletor fechado),
      `evidence/fase4-inbox/2-seletor-modelo-desktop.png` (dropdown Radix
      aberto com o modelo APPROVED) e
      `evidence/fase4-inbox/3-aviso-janela-fechada-mobile.png`.
    - Fixture da evidência (spec temporária, apagada): o ambiente e2e só tem
      conversas `waha` (sem restrição de janela) — a spec criou sessão
      `meta_cloud` (+ `meta_phone_number_id`, exigido pelo check
      `channel_sessions_provider_ref_check`), contato, conversa com
      `last_inbound_at` NULO (janela que nunca abriu) e `meta_templates`
      `APPROVED`; `bot_silenced_until='infinity'` porque
      `fn_comando_da_conversa` sem trava devolve `automatico` e a conversa
      não caía na aba Fila (default da tela).
    - Specs corrigidas — **falhas pré-existentes, provadas com stash** (o
      mesmo vermelho com a árvore limpa):
      `inbox-responder-citando` clicava no `li` da SIDEBAR (locator
      `li, [role='listitem']` casava o Dashboard primeiro) e contava
      `rounded-2xl` dos cards como bolha — migrou para
      `button[data-conversation-id]`, bolhas escopadas em
      `[data-testid='chat-thread']` com `rounded-br-sm`/`rounded-bl-sm`,
      percorrendo até 8 linhas (a mais recente pode não ter mensagens);
      `escalacao-ciclo` (2 sites: `pnpm exec tsx`→`execNpx(["tsx", …])` +
      `npx`→`execNpx`, cast `as string` no precedente de
      `retorno-anti-morte`) e `queue-assign` (npx→`execNpx`) migrados para
      rodar no Windows.
  - **Gates da 4d**: typecheck ✓ · lint 0/338 ✓ · `test:unit` = baseline
    (15 flakes nos mesmos 4 arquivos) + `lib/ui/icons.test.ts` (barrel de
    ~1300 módulos, timeout documentado no próprio teste; passa isolado 1/1) ·
    `pnpm build` ✓ · e2e: evidência (spec temporária, apagada) 1/1 ✓ +
    regressão das 7 specs do inbox — citando 2/2 ✓ (após o fix), quem-manda
    3/3 ✓, abas ✓, scope ✓, tempo-real ✓, escalacao 1/1 ✓, queue 1/1 ✓;
    uma rodada COMBINADA derrubou quem-manda + escalacao no error boundary
    "Algo deu errado" (transiente, problema conhecido — PR aberto de socket
    hang up no e2e) e as duas passaram re-rodadas isoladas · imagens
     `evidence/*` sobrescritas pela regressão restauradas com `git checkout`.
  - **Fase 4e `679b65fb3` — `/financeiro` (fusão com `/titulos`)**:
    - **Decisão do usuário** (question tool): `/titulos` vira **aba de
      `/financeiro`**. Rota antiga permanece como **redirect puro** (padrão
      `settings/whatsapp`, sem auth interno) preservando `?busca=`; links e
      busca global passam a apontar `/app/financeiro?aba=titulos`; **registry
      mantém href `/app/titulos`** — `navegacao-completude` exige href ∈ rota
      em disco com match exato (sem query string), por isso a rota não morre.
    - Feito: `TitulosClient` movido para `financeiro/_titulos.tsx` (`AbaTitulos`,
      sem header/padding próprios, Excel na row de filtros); `page.tsx` lê
      `searchParams` (`aba` validada em `ABAS_CONHECIDAS`, `busca`) e troca a
      aba por `key={aba|busca}` (remount — sem estado stale); 6º TabsTrigger;
      `CrmPageHeader`→`NexusPageHeader` (eyebrow redundante removido); as 4
      `<table>` cruas (receber/pagar/cobranças/fluxo) → `ui/table` +
      `NexusDataTable` com `state` (erro→`onRetry`, empty→empty existente,
      `pagination` na recebíveis); `AbaPagar`/`AbaCobrancas`/`AbaFluxo`
      ganharam `erro` real (o catch mostrava empty no lugar de erro); botão
      "Abrir em Títulos" em Cobranças → `setAba("titulos")` sem navegar.
    - Prova visual: `evidence/fase4-financeiro/1-recebiveis-desktop.png`
      (aba Contas a receber), `evidence/fase4-financeiro/2-titulos-desktop.png`
      (aba Títulos com as 8 parcelas), `evidence/fase4-financeiro/3-redirect-titulos-desktop.png`
      (redirect legado caindo na aba) e
      `evidence/fase4-financeiro/4-recebiveis-mobile.png` (390).
    - Fixture da evidência (spec temporária, apagada): Docker religado (stack
      Supabase subiu com restart policy); `financial_receivables` ganhou 2
      linhas (1 a vencer +5d, 1 vencido -3d, 150000 cents); os 8 pedidos
      faturados aptos a título já existiam no org e2e.
  - **Gates da 4e**: typecheck ✓ · lint 0/338 ✓ · `pnpm build` ✓ (rotas
    `ƒ /app/financeiro` + `ƒ /app/titulos`) · `test:unit` = baseline (15
    flakes nos mesmos 4 arquivos; o "Failed Suites 1" é o mesmo
    `guarda-da-release` com EPERM no `rmSync`, flake Windows conhecido) ·
    e2e: evidência 1/1 ✓ + regressão `navegacao` 13/13 ✓; nenhuma spec cita
    `/app/titulos` nem visita `/app/financeiro`.
  - **Fase 4f `b60fe1a1f` — `/radar` (fusão com `/recuperacao`)**:
    - Mesma mecânica da fusão decidida na 4e (precedente do usuário): o
      conteúdo da antiga `/app/recuperacao` virou a **4ª seção do Radar**
      (`#radar-recuperacao`, botão que rola — não aba, porque os e2e
      `recompra-radar`/`risk-radar`/`retorno-anti-morte` leem as seções SEM
      clique intermediário); a rota antiga virou **redirect puro**
      `redirect("/app/radar#radar-recuperacao")` (padrão stub `settings`,
      **o `#` sobrevive ao `redirect()`** — provado na evidência).
    - Feito: `CrmPageHeader`→`NexusPageHeader` (eyebrow "Sales Intelligence"
      caiu, como na 4e); contagem `temBase` (pedidos >60d) movida da página
      antiga para `radar/page.tsx` e passada por `RadarTabs`; o client virou
      `radar/_components/RecuperacaoLista.tsx` **sem `textos`** (tudo via
      `useT`, as 13 strings originais intactas), `<h1>`/`p-6` saíram (o h2 da
      seção é estrutura), loading `Carregando…`→3×`Skeleton h-16` (padrão das
      listas vizinhas) e erro ganhou `NexusErrorState` com retry (copy
      canônica); card "Maiores chances de recuperação" agora rola para a
      seção em vez de navegar; briefing de indicadores aponta para a âncora;
      registry href `/app/recuperacao` **mantido** (gate exige href ∈ rota em
      disco; comentário explica o redirect).
    - Gráficos (hex→tokens na régua do módulo): grid `#e8e8e8`→
      `var(--color-border)` (**era literalmente o valor do token**), ticks
      `#666666`→`var(--color-muted-foreground)`, tooltip `#ffffff`/`#e8e8e8`
      →`var(--color-popover)`/`var(--color-border)`, barra `#7e77f0`→
      `var(--color-accent)` (o hex era a cor de marca do tema). Paleta de
      status do donut (`#33c758`/`#ffa600`/`#ff3e00`/`#a94a3c`) **mantida**
      — não há token com esses valores (só success/warning/error apagados);
      converter mudaria a visualização = decisão de design para a Fase 5
      (`NexusChart`).
    - Prova visual: `evidence/fase4-radar/1-radar-desktop.png` (header +
      4 botões de seção), `evidence/fase4-radar/2-recuperacao-lista-desktop.png`
      (lista com `dias=1`: um inativo do org e2e), `evidence/fase4-radar/3-redirect-recuperacao-desktop.png`
      (URL `…/radar#radar-recuperacao`) e `evidence/fase4-radar/4-radar-mobile-390.png`.
    - Specs `risk-radar`/`recompra-radar` migradas para `execNpx` (mesmo
      ENOENT Windows que a 4d corrigiu em outras 3; **~60 specs ainda usam
      `execFileSync("npx")`** — débito conhecido, fora do escopo do passo 6;
      só os gates do módulo foram corrigidos).
  - **Gates da 4f**: typecheck ✓ · lint 0/338 ✓ (`Date.now()` em render dá
    `react-hooks/purity`; `new Date().getTime()` — a forma da página antiga —
    passa) · `pnpm build` ✓ · `test:unit` = baseline (15 flakes nos mesmos 4
    arquivos, sem Failed Suite) · alvos 131/131 (navegacao-registry,
    completude, busca-global, inventario, risk-radar, inatividade,
    mapas-de-arquitetura, e2e-cobertura) · e2e: evidência 1/1 ✓ +
    regressões recompra/risk/retorno 6/6 ✓ + `navegacao` 13/13 ✓.
  - **Fase 4g `f13ca808d` — `/indicadores` (fusão com `/metrics`)**:
    - Mesma mecânica das fusões anteriores: o "Desempenho" (atrito, funil,
      performance por atendente — `MetricsClient` + `AtritoPanel`) virou a
      **seção `#desempenho` no fim de `/app/indicadores`** (h2 + subtítulo
      com as 2 variantes manager/agent já existentes); a rota antiga virou
      **redirect puro** `redirect("/app/indicadores#desempenho")` (padrão
      stub; o `#` sobrevive, provado na evidência).
    - Feito: `CrmPageHeader`→`NexusPageHeader` (title "Indicadores",
      subtitle = `rotuloMes`; eyebrow "Sales Intelligence" caiu, régua da
      4e/4f); saudação `_saudacao` desce de `h1`→`h2` (mesmas classes — um
      h1 só por página); **ranking cru → `ui/table`** (classes duplicadas de
      thead/linha removidas, alinhamentos via `className` — 0 `<table>`
      crua no diretório); `IndicadoresClient` ganhou `canCompare`
      (ROLE_RANK, mesma regra §6.1 da rota antiga) + `currentUserId`;
      `MetricsClient` estados → 3×`Skeleton` + `NexusErrorState`
      (onRetry=`refetch` do useQuery); registry href `/app/metrics`
      mantido (gate); **5 sondas `tests/sonda-atrito-*`/`sonda-overflow`**
      atualizadas para `#desempenho` (não são gates, mas eram a ferramenta
      de medição da rota antiga).
    - Prova visual: `evidence/fase4-indicadores/1-indicadores-desktop.png`
      (h1 + saudação h2 + ranking), `evidence/fase4-indicadores/2-desempenho-secao-desktop.png`
      (seção com atrito/funil/performance),
      `evidence/fase4-indicadores/3-redirect-metrics-desktop.png` (URL
      `…/indicadores#desempenho`) e
      `evidence/fase4-indicadores/4-indicadores-mobile-390.png`.
    - Atenção medida: `CardTitle` do shadcn é `div`, não heading — o e2e
      casa "Performance por atendente" por **texto**, não por role heading.
  - **Gates da 4g**: typecheck ✓ · lint 0/338 ✓ · `pnpm build` ✓ (rotas
    `ƒ /app/indicadores` + `ƒ /app/metrics`) · unit alvo 44/44 ·
    `test:unit` = baseline (15 flakes nos mesmos 4 arquivos) · e2e:
    evidência 1/1 ✓ + regressão `navegacao` 13/13 ✓ (primeira tentativa
    abortou num hang transiente do webServer; re-rodada limpa) — nenhuma
    spec navega em `/app/indicadores` ou `/app/metrics`.
  - **Fase 4h `bd4635147` — `/prospeccao`**:
    - Rota única com 6 abas (Nova busca, Pesquisas, Empresas, Mercado,
      Campanhas, Config); tabela de Empresas já era `ui/table`, 0 `<table>`
      crua no diretório. Feito: `CrmPageHeader`-à-mão (`h1`+`<p>` do
      `_client`) → `NexusPageHeader` (mesmas classes do `PageHeader`, h1
      único preservado); **estados vazios crua→`NexusEmptyState`** (buscas
      vazias, "Nenhuma empresa com estes filtros.", "Nenhuma campanha
      ainda.", aviso de permissão "Criar busca exige papel…" com ícone
      `LockKey`); **loading `Carregando…`→3×`Skeleton`** (Campanhas, Config,
      Mercado) e **bug do loading infinito corrigido** (catch só fazia toast
      e a tela ficava presa em Carregando/skeleton): `erro` state +
      `NexusErrorState onRetry` em Campanhas, Config, Mercado e Empresas
      (`buscar(filtros)` no retry); hexes do `_mapa` (paleta de status
      novo/crm/cliente + divIcons Leaflet) mantidos com comentário —
      codificação de série, mesma regra 4f.
    - Prova visual: `evidence/fase4-prospeccao/1-prospeccao-desktop.png`
      (header + Nova busca), `evidence/fase4-prospeccao/2-pesquisas-vazio-desktop.png`,
      `evidence/fase4-prospeccao/3-empresas-desktop.png`,
      `evidence/fase4-prospeccao/4-campanhas-vazio-desktop.png`,
      `evidence/fase4-prospeccao/5-config-desktop.png` e
      `evidence/fase4-prospeccao/6-prospeccao-mobile-390.png`.
    - `EmptyFilterResults` (sem chips) já era canônico — mantido.
  - **Gates da 4h**: typecheck ✓ · lint 0/338 ✓ · `pnpm build` ✓ · unit
    alvo 64/64 (prospeccao-lib/providers/buscas + branding + e2e-cobertura)
    · `test:unit` = baseline (15 flakes nos mesmos 4 arquivos) · e2e:
    evidência 1/1 ✓ + regressão do módulo `prospeccao-mapa` 1/1 ✓ (única
    spec que cita a rota).
  - **Fase 4i `65ec570f3` — funis (`/app/kanban` + `/app/settings/tenant/pipelines`)**:
    - Feito: `/app/kanban` header à mão (ícone `Kanban` + `h1`) →
      `NexusPageHeader` (título "Funis" preservado; **o ícone decorativo
      caiu**, mesma régua do eyebrow das 4e-4g; comentário sobre o rename
      "Pipelines"→"Funis" mantido); `/settings/tenant/pipelines` `<header>`
      h1+`<p>` → `NexusPageHeader` com subtítulo montado no servidor
      (mesma frase: base + trecho condicional de admin + ponto); empty do
      `PipelinesClient` (Card com copy longa sobre quem cria o funil —
      texto NÃO tocado, só re-segmentado no período já existente) →
      `NexusEmptyState` (`GitBranch` do barril `@/lib/ui/icons`, ADR-05);
      loading `Carregando as etapas…` → 3×`Skeleton` e erro de leitura →
      `NexusErrorState onRetry=refetch` em `_stages` e `_mapping` (testids
      `etapas-carregando`/`*-erro-leitura` não tinham nenhum teste; copy
      específica substituída pela canônica); empty do `/kanban` já usava
      `EmptyPipeline` — mantido; 0 hex e 0 `<table>` cru no par.
    - Specs da regressão livres da dívida Windows: `execFileSync("npx")` →
      `execNpx` em `pipelines-gestao`, `invite-lifecycle` e
      `agente-organiza-operacao` (as 3 falhavam com ENOENT antes de rodar;
      mesma correção da 4f).
    - Prova visual: `evidence/fase4-funis/1-kanban-funis-desktop.png`
      (h1 "Funis"), `evidence/fase4-funis/2-etapas-do-funil-desktop.png`
      (h1 "Etapas do funil" + subtítulo + cartões) e
      `evidence/fase4-funis/3-kanban-funis-mobile-390.png`.
    - Imagens W4 sobrescritas pela regressão (`qa-selo`/`agente-organiza`)
      RESTAURADAS com `git checkout` — evidência histórica não muda.
  - **Gates da 4i**: typecheck ✓ · lint 0/338 ✓ · `pnpm build` ✓ (rotas
    `ƒ /app/kanban` + `ƒ /app/settings/tenant/pipelines`) · unit alvo
    91/91 (`_stages`, `_mapping`, `kanban/_client`, branding,
    e2e-cobertura) · `test:unit` = baseline (15 flakes nos mesmos 4
    arquivos) · e2e: evidência 1/1 ✓ + regressão 34/34 em 6 specs
    (`navegacao`, `rbac-roles`, `invite-lifecycle`, `pipelines-gestao`,
    `agente-organiza-operacao` — falha 1× pós-seed e 2× verde seguidas —,
    `qa-selo-no-funil-usado`).
  - **Fase 4j `66aa9927b` — `/agenda`**:
    - Feito: `<header>` à mão (h1 "Agenda" + subtítulo + bloco de ações:
      "Hoje", motivo-condicional e "Novo agendamento" com testids
      `motivo-novo-agendamento`/`novo-agendamento`) → `NexusPageHeader`
      (title/subtitle/actions — o `PageHeader` por baixo tem EXATAMENTE o
      layout do header antigo: `flex-col gap-3 sm:flex-row
      sm:items-center sm:justify-between`); todos os comentários de
      produto (botão desabilitado com motivo, testid vs rótulo) mantidos
      intactos; `loading.tsx`→`AgendaCarregando`, `error.tsx`→
      `SegmentError`, empty→`EmptyAgenda`, tudo já canônico — fora do
      header não havia nada a converter (0 hex, 0 `<table>`).
    - Specs da regressão livres da dívida Windows: `execFileSync("npx")` →
      `execNpx` em 7 specs (`agenda-escopo-da-organizacao`,
      `agenda-grade-interativa`, `agenda-marcar-pela-tela`,
      `agenda-painel-cabe-na-tela`, `agenda-remarcar-e-cancelar`,
      `agenda-tipos-de-agendamento`, `agente-marca-consulta`).
    - Prova visual: `evidence/fase4-agenda/1-agenda-desktop.png` (h1 +
      subtítulo + ações) e `evidence/fase4-agenda/2-agenda-mobile-390.png`
      (ações empilhadas pelo layout do `PageHeader`).
    - Imagens `evidence/calendario/*` sobrescritas pela regressão
      RESTAURADAS com `git checkout` (mesma regra da 4i).
  - **Gates da 4j**: typecheck ✓ · lint 0/338 ✓ · `pnpm build` ✓ · unit
    alvo 61/61 (agenda-spec-não-escolhe/aviso/cartão + branding +
    e2e-cobertura) · `test:unit` = baseline (15 flakes nos mesmos 4
    arquivos) · e2e: evidência 1/1 ✓ + regressão em 3 batches — 13 specs
    que visitam `/app/agenda`: batch1 17/17 ✓ (após `execNpx`; 9 falhas
    ENOENT antes), batch2 20+2 → as 2 falhas eram
    `auth_permissions_unavailable: JWT issued at future` (flake de
    relógio host↔GoTrue, −48s, anotado no globalSetup) e a re-execução
    passou **24/24**, batch3 6/6 ✓.
  - **Fase 4k `badee8467` — `pedidos/[id]` + `pedidos/novo`**:
    - Feito: no DETALHE, o Card de chroma (número `text-lg` + pill), o link
      "← Pedidos" solto e a div de ações irmã viraram `NexusPageHeader`
      (title = `PED-XXXX`, navigation = link dos pedidos, actions = os
      8 botões intocados dentro do `flex flex-wrap gap-2` canônico); a
      `PillDoStatus` ficou numa linha própria logo abaixo — mesmo arranjo
      de `compras/[id]`; a rota ganhou `<h1>` (antes não tinha nenhum).
      No NOVO, o `<h1>` copiado à mão das classes do `PageHeader` virou
      `NexusPageHeader`; o "· salvo há X" do autosave virou string no
      subtitle (texto idêntico). Sem confirm/hex/`<table>` crua/`Carregando`
      nesses arquivos — a dívida era só o header.
    - Evidência: `evidence/fase4-pedidos/1-detalhe-desktop.png`,
      `evidence/fase4-pedidos/2-detalhe-mobile-390.png`,
      `evidence/fase4-pedidos/3-novo-desktop.png` e
      `evidence/fase4-pedidos/4-novo-mobile-390.png` (os 2 `lista-*` da
      pasta são da 4b, intactos). Pedido da prova nasce pela API na mesma
      sessão (não existe seed de `commercial_orders`).
    - Sem regressão e2e dedicada: **nenhuma spec** de `tests/e2e` cita
      `/app/pedidos` (medido) — a evidência cobre as duas rotas e o
      canário `navegacao` passou 13/13.
  - **Gates da 4k**: typecheck ✓ · lint 0/338 ✓ · `pnpm build` ✓ · unit
    alvo 53/53 (navegacao-completude + breadcrumb + busca-global +
    e2e-cobertura + branding) · `test:unit` = baseline (15 flakes nos
    mesmos 4 arquivos) · e2e: evidência 1/1 ✓ (8.8s) + canário
    `navegacao` 13/13 ✓.
  - **Fase 4l `4262e415b` — `/webhooks`**:
    - Feito: `page.tsx` — `<header>` à mão (h1 + subtítulo copiando as
      classes do `PageHeader`) → `NexusPageHeader` (title literal
      "Webhooks", subtítulo traduzido intacto; sem ações). O cliente já
      era canônico (skeleton SSR + `ui/tabs`, decisão documentada).
    - **Bug de erro corrigido nas 3 abas**: `SourcesTab`, `RulesTab` e
      `ActivityTab` liam `{ data, isLoading }` sem `isError` — a falha da
      consulta renderizava o EMPTY da aba ("Conecte sua landing page",
      "Crie sua primeira automação", "Nenhuma automação rodou ainda"), o
      mesmo anti-padrão que o `CapturasTab` já corrigia com comentário.
      Agora as três têm `NexusErrorState onRetry={refetch}` (copy
      canônica, `role="alert"`); `CapturasTab` ficou intacto (copy de
      produto específica + já tratado). Empties RICOS (ex.: os 3 passos
      em `<ol>` de SourcesTab) mantidos — copy de produto não cabe em
      `subcopy` string.
    - Specs da regressão livres da dívida Windows: `execFileSync("npx")`
      → `execNpx` em `automacao-diz-a-verdade` (3 chamadas) e
      `historico-de-captacao` (1).
    - Evidência: `evidence/fase4-webhooks/1-header-desktop.png`,
      `evidence/fase4-webhooks/2-header-mobile-390.png` e
      `evidence/fase4-webhooks/3-erro-com-retry.png` (estado de erro
      FORÇADO com `page.route(abort)` na consulta de fontes — prova de
      que a aba deixa de fingir que está vazia).
    - Imagens `evidence/ia-360-w4/*` sobrescritas pela regressão
      RESTAURADAS com `git checkout` (mesma regra das fases anteriores).
  - **Gates da 4l**: typecheck ✓ · lint 0/338 ✓ · `pnpm build` ✓ ·
    unit alvo 50/50 (spec-de-envio + navegacao-completude + breadcrumb +
    e2e-cobertura + branding) · `test:unit` = baseline (15 flakes nos
    mesmos 4 arquivos) · e2e: evidência 1/1 ✓ (10.1s) + regressão das 5
    specs que visitam `/app/webhooks` (`webhooks`, `agente-organiza`,
    `automacao-diz-a-verdade`, `historico-de-captacao`,
    `vps-webhook-outbound-ssrf`): 6/7 verdes e 1 falha de flake
    (query transitória — a re-execução passou 2/2 e o estado de erro
    novo é justamente o comportamento correto); imagens W4 restauradas.
  - **Fase 4m `f681effb4` — admin (última da Fase 4)**:
    - Feito: os **16** cabeçalhos manuscritos de `app/admin/(protected)/**`
      → `NexusPageHeader`: listas (`audit`, `dashboard`, `incidents`,
      `lgpd`, `tenants`, `users`, `usage`, `platform-admins`), detalhes
      (`audit/[entryId]`, `incidents/[id]`, `lgpd/requests/[id]`,
      `users/[id]`, `tenants/[id]` layout) e formulários (`google/_form`,
      `marca`, `tenants/new/_form`). Subtítulos dinâmicos de contagem
      (ex.: `50 eventos+`) viraram expression strings no `subtitle`;
      ações existentes (`Novo tenant`, select de período) ocuparam o slot
      `actions`; badges/status de detalhe ficaram em linha própria abaixo
      do header (mesmo padrão de `pedidos/[id]`).
    - Estados de erro bespoke → `NexusErrorState` com `onRetry=refetch`
      (copy existente preservada como `description`): `usage`,
      `platform-admins`, `audit/[entryId]` e `lgpd/requests/[id]` —
      o divisor "erro não é tela muda" ganhou ação canônica. Os erros
      COM ação própria (`incidents/[id]`, `users/[id]`, que já oferiam
      "Voltar" para a lista) ficaram intactos — converteria perder navegação.
    - Fora do escopo de UI: `audit`/`lgpd`/`marca`/`forbidden` SEGUEM
      rotas separadas (fusão é decisão à parte); `inbox` admin é three-pane
      sem header por desenho (decisão 4d); hexes de `marca/_form`
      (color picker) mantidos com comentário.
    - **Medido no caminho**: `loginComoAdmin` (helper) loga como
      `users.admin` = admin de TENANT → o proxy manda `/admin/*` para
      `/admin/forbidden`. Superfície de plataforma loga como `users.dono`
      + `seed-e2e-system-update.ts` (promoção idempotente, mesmo passo do
      `marca-logo.spec.ts`). Também medido: nenhum e2e/unit afirma heading
      de página admin (só `marca-logo` visita `/admin`, sem asserir o h1).
    - Evidência: `evidence/fase4-admin/1-dashboard-desktop.png`,
      `evidence/fase4-admin/2-tenants-desktop.png`,
      `evidence/fase4-admin/3-audit-desktop.png`,
      `evidence/fase4-admin/4-dashboard-mobile-390.png`,
      `evidence/fase4-admin/5-tenants-mobile-390.png`,
      `evidence/fase4-admin/6-audit-mobile-390.png` e
      `evidence/fase4-admin/7-tenant-detalhe-desktop.png` (cada tela com
      EXATAMENTE UM `h1`, contado na spec; conteúdo carregado — espera
      `.animate-pulse` zerar, `networkidle` não serve: dashboard mantém
      canal de realtime aberto).
    - Imagens `evidence/marca-logo/*` sobrescritas pela regressão
      RESTAURADAS com `git checkout` (mesma regra das fases anteriores).
  - **Gates da 4m**: typecheck ✓ · lint 0/338 ✓ · `pnpm build` ✓ ·
    unit alvo 152/152 (13 arquivos: admin-shell-tooltip, admin-topbar,
    audit-lista, inventario-de-telas, marca-*, tenant-reason-dialog,
    navegacao-*, breadcrumb, branding, e2e-cobertura, evidencia-citada) ·
    `test:unit` = baseline (15 flakes nos mesmos 4 arquivos) · e2e:
    evidência 1/1 ✓ (9.1s) + regressão `marca-logo` 6/6 ✓ + canário
    `navegacao` 13/13 ✓.
  - **Fase 5a `0a9409f58` — cabeçalho único (mata `layout/PageHeader` +
    `CrmPageHeader`)**:
    - `git rm` nos 2 componentes mortos; o markup do `PageHeader` (wrapper
      `space-y-3` + slot `navigation` + flex mobile/desktop com ação
      principal primeiro) foi absorvido pelo `NexusPageHeader` — mesma
      identidade visual, mesmo componente.
    - Novo prop `headingLevel?: 1 | 2` (default 1, `Titulo` vira `h1`/`h2`
      com as mesmas classes): um `h1` por página. Os 4 `NexusPageHeader`
      internos de `components/nexus-ui/intelligence/NexusIntelligence.tsx`
      usam `headingLevel={2}` — corrige double-h1 pré-existente em
      `/app/inteligencia` (único importador do componente interno:
      `app/app/inteligencia/_client.tsx:6`).
    - 5 sites convertidos: `products`, `relatorios`, `tarefas` (ações
      intactas; tag `.NET` preservada em products), `inteligencia` (eyebrow
      "Sales Intelligence" CAIU — régua 4e-4f-4g; `description`→`subtitle`),
      `NavHub` (`title`/`description`→`title`/`subtitle` — hubs `/app/ai` e
      `/app/settings`). Barrel `nexus-ui/index.ts` perdeu o export
      `CrmPageHeader`; zero imports remanescentes dos 2 mortos.
    - **Fix de bug pré-existente que a evidência pegou**: `/app/inteligencia`
      morria com React #185 ("Maximum update depth exceeded") logo após o
      mount — reproduzido 2/2 em build de produção e 1/1 em dev; a primeira
      leva de PNGs saiu COM A PÁGINA DE ERRO apesar das asserções passarem
      (crash acontecia entre o assert e o screenshot). Causa (stack do dev):
      `SelectionListenerInner` emite `onSelectionChange` →
      `setSelectedIds(mapped)` com referência NOVA mesmo com o mesmo conteúdo
      → re-render → `nos` array novo → `StoreUpdater` manda `setNodes` no
      store → nova emissão (o `aoSelecionar` é inline, identidade muda
      sempre) → ciclo até o teto do React. Correção: guarda de conteúdo no
      setter (`selecionarNos`, bailout de `Object.is` em
      `NexusIntelligence.tsx`).
    - Regressão PERMANENTE `tests/e2e/inteligencia-carrega.spec.ts`
      (registrada em `SPECS_PARTE_2`, `.github/workflows/e2e.yml`): h1
      único → pulso zerado → re-assert do h1 + `Algo deu errado` count 0 —
      exatamente o intervalo em que a página quebrada passava e morria.
    - Evidência: `evidence/fase5-header-unico/1-inteligencia-desktop.png`,
      `evidence/fase5-header-unico/2-inteligencia-mobile-390.png`,
      `evidence/fase5-header-unico/3-hub-ia-desktop.png` e
      `evidence/fase5-header-unico/4-hub-settings-desktop.png` (h1
      re-assertado IMEDIATAMENTE antes de cada shot; as 4 conferidas).
    - Medido no caminho: nenhum spec visita products/relatorios/tarefas/
      inteligencia via `goto`; hubs exatos `/app/ai`+`/app/settings` em
      `prova-painel-provedores`, `agenda-tipos-de-agendamento`,
      `distribuicao-atendimento` + canário `navegacao`; `rotulo-do-contato`
      (usa `git ls-files`) reprova com a exclusão do PageHeader ainda não
      stageada — verde depois do `git add` (não é bug, é índice).
    - Fixture medida: `prova-painel-provedores` F3/F1 reprovavam com
      `ai_models` (openrouter) VAZIO (04/05 datavam de 03/09 — pré-existente,
      nada a ver com headers) — `seed-e2e-catalogo-openrouter.ts` reexecutado
      (62 modelos) e os 2 casos passaram 2/2.
    - Regressão da 5a: evidência 1/1 ✓ (4 PNGs) + batch `navegacao` +
      `prova-painel-provedores` + `agenda-tipos` + `distribuicao` +
      `inteligencia-carrega` = 29/29 ✓ (2 falhas = fixture do catálogo,
      resolvidas acima); imagens sobrescritas por specs de regressão
      (`evidence/calendario`, `evidence/provedores`) RESTAURADAS com
      `git checkout`.
  - **Gates da 5a**: typecheck ✓ · lint 0 erros/338 warnings (baseline) ·
    `pnpm build` ✓ · `test:unit` = baseline (15 flakes nos mesmos 4
    arquivos; `rotulo-do-contato` verde com exclusão stageada; os 4 PNGs
    novos citados acima para o gate `evidencia-citada`) · e2e: evidência
    1/1 ✓ + regressão 29/29 ✓.
  - **Fase 5b `fd6a18d9e` — FilterBar única nas toolbars caseiras**:
    - Medição (varredura por `type="search"`/`placeholder Buscar` +
      `Filtrar por` em `app/app` e `components`): 5 toolbars caseiras
      (`div.flex` + `Input`/`Select` shadcn cru, sem card nem Label)
      fora dos 2 componentes nomeados `FilterBar`: compras (abas pedidos
      + fornecedores), estoque (abas saldos + movimentos) e carteira.
      Nenhuma spec e2e visitava essas 3 telas (medido).
    - Convertidas para a barra canônica: `FilterBar` > `FilterPrimary` >
      `FilterSearch`/`FilterSelect`, com a ação da tela em
      `FilterActions` + `div.ml-auto` (mesmo arranjo de
      `prospeccao/_empresas`). Copy 100% intacta — os novos `label`
      visíveis vêm do vocabulário existente ("Status" = `t("Status")`
      de `pedidos/page.tsx`, "Tipo" = `t("Tipo")` do admin/LGPD, "Buscar"
      = já usado em contacts/carteira/financeiro); o `aria-label`
      "Filtrar por status/tipo" virou Label associada (mesmo nome de
      acessibilidade, agora visível). Wiring idêntico: os `useEffect`
      em `[status]`/`[tipo]`/`[busca]` não mudaram; a opção "todos"
      shadcn (`value="todos"`) virou `allLabel` com `value=""`.
    - Fora de escopo DECIDIDO: `components/kanban/FilterBar.tsx` é
      barra de DOMÍNIO (pills de `LeadFilters`, debounce, dono com
      agentes) — não é toolbar de lista e não entra nesta consolidação;
      `InboxFilters`/`AuditFiltersAdmin`/`TenantsFilters`/`UsageFilters`/
      `AgentsListFilters` são também de domínio e seguem para decisão
      por categoria na continuação da Fase 5 (o §3 do inventário conta
      5 "FilterBar distintos" = esta canônica + as nomeadas de domínio).
    - **Achado de ambiente (não do diff)**: a primeira leva da evidência
      saiu com "Erro ao carregar movimentos" — sonda de rede mostrou
      `GET /api/v1/inventory/movements` **500 determinístico** e
      `/api/v1/products` 200. Causa raiz: `inventory_movements`
      INEXISTENTE no banco local (migration `0242` de 25/09 nunca
      aplicada aqui; o baseline local estava defasado). `supabase/
      baseline.sql` reaplicado pelo mesmo caminho do CI (`psql -v
      ON_ERROR_STOP=1 -q -f`, EXIT=0; idempotente, 901 `IF NOT
      EXISTS`, dados intactos — catálogo openrouter 62 ✓) e a API
      passou a 200 (confirmado por sonda, apagada depois). É o mesmo
      caminho que o `install.sh`/`update.sh` do self-host usa.
    - Evidência (6 PNGs, todos conferidos): `evidence/fase5-filterbar-unico/1-compras-pedidos-desktop.png`,
      `evidence/fase5-filterbar-unico/2-compras-fornecedores-desktop.png`,
      `evidence/fase5-filterbar-unico/3-estoque-saldos-desktop.png`,
      `evidence/fase5-filterbar-unico/4-estoque-movimentos-desktop.png`,
      `evidence/fase5-filterbar-unico/5-carteira-desktop.png` e
      `evidence/fase5-filterbar-unico/6-estoque-saldos-mobile-390.png`
      — a de carteira prova a busca filtrando de verdade ("ana" → "Ana
      E2E 1790351494016").
    - Regressão PERMANENTE `tests/e2e/filterbar-unica-nas-listas.spec.ts`
      (registrada em `SPECS_PARTE_2`): eram 3 telas com ZERO cobertura;
      cada visita asserta a barra canônica (label + ação) e que a tela
      NÃO cai em "Erro ao (carregar|listar)" — o contrato que o 500
      quebrava. A sonda de diagnóstico (`sonda-estoque-apis`,
      `sonda-iat`) foi temporária e saiu do repo.
    - Regressão da 5b: lote `navegacao` + `inteligencia-carrega` +
      `agenda-tipos` + `distribuicao` + `prova-painel-provedores` +
      `filterbar-unica-nas-listas` = 30 passed/1 failed — a falha foi
      `agenda-tipos` no teste1 com `auth_permissions_unavailable: JWT
      issued at future` (flake de relógio host↔GoTrue já documentado
      neste arquivo na 4j, −47s medido hoje; `w32tm /resync` negado sem
      admin) e a re-execução passou 4/4 → **31/31 efetivo**. Imagens
      sobrescritas (`evidence/calendario/d6-tipo-com-responsavel.png`,
      `evidence/provedores/*`) RESTAURADAS com `git checkout`.
  - **Gates da 5b**: typecheck ✓ · lint 0 erros/338 warnings (baseline) ·
    `pnpm build` ✓ · `test:unit` = baseline + 1 (`lib/ui/icons.test.ts`
    estourou 48s de timeout sob carga; isolado roda em 3,6s e passa —
    os 15 flakes são os mesmos 4 arquivos de sempre) · e2e: evidência
    2/2 ✓ + regressão 31/31 ✓ (flake de relógio acima).

## Próximos passos (ordem aprovada — continue por aqui)

1. **Redesign §100 (passo 6) — FECHADO: shell §17 (2a-2e ✅); Fase 3 COMPLETA (3a-3f ✅); Fase 4 COMPLETA (4a-4m ✅); Fase 5 COMPLETA (5a-5e ✅); Fase 6 COMPLETA (6a-6b ✅)**:
   a. **Fase 3 — consolidações ✅ TODA**: ✅ `StatusPage` 6→1 (`37b35a029`); ✅
      `AdminDataTable` 7 tabelas→1 + badges (`ab0545095`); ✅
      `NexusConfirmDialog` (`eafb9c071`: 7 `window.confirm` + 13 AlertDialog +
      `ConfirmacaoProvider`); ✅ `SuspendDialog`+`ReactivateDialog`→1
      (`TenantReasonDialog`, `7340d3e54`); ✅ overlays→`ui/dialog` (3
      restantes) + 5 `confirm(` globais→`useConfirmar` (`41173e58d`);
      ✅ toasts→`nexusToast` porta única (`6ed0d5670`, 121 arquivos).
   b. **Fase 4 — refatoração por módulo** (inventário §2.1): ✅ `/contacts`
      (lista, `e062aa3b5`); ✅ `/pedidos` (`921435fe8`: hex Mercos→tokens +
      `NexusPageHeader`); ✅ `360` (`3612818d7`: `Cabecalho360` no
       `NexusPageHeader`, `<header>` preservada pro e2e); ✅ `/inbox`
       (`0228f8c9f`: paleta WhatsApp centralizada, seletor da janela
        fechada→`ui/select`, specs de regressão corrigidas); ✅ `/financeiro`
        (`679b65fb3`: `NexusPageHeader` + `NexusDataTable` nas 4 tabelas,
        `/titulos` virou aba com redirect legado preservando `?busca=`); ✅
        `/radar` (`b60fe1a1f`: `NexusPageHeader`, 4ª seção com a
        `/recuperacao` movida para cá + redirect `#radar-recuperacao`,
        gráficos em tokens); ✅ `/indicadores` (`f13ca808d`:
        `NexusPageHeader`, ranking em `ui/table`, `/metrics` virou a seção
        `#desempenho` com redirect); ✅ `/prospeccao` (`bd4635147`:
        `NexusPageHeader`, estados vazios/erro/loading canônicos nas 6
        abas); ✅ funis (`65ec570f3`: `NexusPageHeader` nos dois +
        loading/erro/empty canônicos, 3 specs livres de `execFileSync`);
        ✅ `/agenda` (`66aa9927b`: `NexusPageHeader` com ações no slot,
        7 specs livres de `execFileSync`); ✅ `pedidos/[id]`/`novo`
        (`badee8467`: número como title, ações no slot, pill em linha
        própria; novo troca o h1 copiado pelo componente); ✅ `/webhooks`
        (`4262e415b`: `NexusPageHeader` + `NexusErrorState` com retry em
        3 abas — erro não vira lista vazia; 2 specs livres de
        `execFileSync`); ✅ admin (`f681effb4`: 16 cabeçalhos →
        `NexusPageHeader`, 4 erros bespoke → `NexusErrorState` com retry)
        → **Fase 4 TODA (4a-4m ✅); próximo Fase 5**. Padrão de cada módulo (medido na 4a): header à
      mão→`NexusPageHeader`; filter bar caseira→`FilterBar`; hex→tokens;
      estados ausentes→criar; `pnpm build` antes do e2e de evidência.
   c. **Fase 5 — superfície compartilhada ✅ COMPLETA**: ✅ `NexusPageHeader`
      único (`0a9409f58`: mata `layout/PageHeader`+`CrmPageHeader`, markup
      absorvido, `headingLevel 1|2`, 5 sites convertidos, fix do React #185
      da Inteligência com regressão `inteligencia-carrega.spec.ts`); ✅
       FilterBar única nas 5 toolbars caseiras de compras/estoque/carteira
       (`fd6a18d9e`, regressão `filterbar-unica-nas-listas.spec.ts` — as
       barras nomeadas de domínio kanban/inbox/admin seguem por categoria);
       ✅ abas canônicas (`c370b8c8a`: 7 telas em `ui/tabs` — os 6
       `role="tab"` manuais + `_tab-nav` do tenant com `asChild` sobre
       `Link`; regressão `abas-canonicas-nas-telas.spec.ts` nas 6 telas,
       evidência `evidence/fase5-tabs-unicas/`; junto: helper
       `loginComoDono`/`dono_totp` e `execNpx` em 2 specs, `fireEvent.mouseDown`
       no unit do histórico da agenda; flake `recompra-radar` (+8→+9) provado
       pré-existente — falha igual no HEAD); ✅ `NexusKpi` único +
       primitivos `NexusChart` (`05857124a`: o `CrmKpi` virou `NexusKpi`
       absorvendo `KPICards` + os 3 `StatCard` locais nas 5 superfícies,
       copy intacta; `nexus-ui/charts/nexus-chart.tsx` guardou o literal
       dos irmãos `UsageChart`/`UsageCharts` + tooltip do `GraficoDiario`;
       regressão `kpi-e-charts-canonicos.spec.ts` em 7 telas; flakes do
       lote provados pré-existentes: `agente-novo-e-uso` falha igual no
        HEAD, `olhar-telas` verde isolado); ✅ `FormField` canônico
        (`3fbd91b21`: `nexus-ui/forms/form-field.tsx` com clone de
        `id`/`aria-describedby`/`aria-invalid` no controle único e
        `role="alert"` na recusa; os 7 `_form.tsx` de configuração
        convertidos — admin google/marca/tenants-new e settings
        atendimento/marca/profile/tenant, ~30 campos, copy e testids
        intactos; os 2 campos de cor com seletor+erro inline ficam com
        markup próprio; regressão `form-field-canonico.spec.ts` em 6 telas
        com asserts de vínculo label→input; flake JWT do lote de regressão
        re-exec verde) → **Fase 5 TODA (5a-5e ✅); próximo Fase 6**.
   d. **Fase 6 — responsividade §60 + auditoria §100 ✅ COMPLETA (6a+6b)**:
      ✅ 6a responsividade (`b12004435`: spec permanente
      `responsividade-nas-rotas.spec.ts` — as 5 telas mobile-priority em
      390 com evidência `evidence/fase6-mobile/` + varredura das 69 rotas
      estáticas de `/app` em 390/430/768 com régua de `scrollWidth`,
      0px de overflow em 207 combos; único defeito: célula
      "Atualizar/Limpar filtros" do Radar sem `flex-wrap` vazava em 390 →
      corrigido; "Rotas" do §60 não tem rota no produto — não inventada).
      ✅ 6b auditoria de aceite (`6b3732ee0` + fecho `8935da608`): a
      spec permanente `auditoria-aceite-11-itens.spec.ts` varre as 106
      rotas estáticas (69 tenant + 14 admin + 23 públicas) em 1280 com
      régua DOM — navegação do shell, assinatura de `ui/table` em todo
      `<table>`, hex em `style` inline, transição >400ms, glass,
      estado-erro, família de fonte única e tamanho de título —
      **VIOLACOES(0), FAMILIAS(1), títulos em ≤3 tamanhos**; exceções
      declaradas na própria spec (editor de cor da marca = o hex é o
      dado; `/admin/forbidden` fora do `(protected)` por loop do guard;
      impressão/galeria do inventário). Achados corrigidos: as últimas 2
      tabelas cruas (`settings/notifications` e `ai/agents/[id]`
      `VersionDiff`) → `ui/table`; título `text-xl` de
      `/app/integrations/nuvemshop` → assinatura canônica 24px. Gate de
      fonte permanente `tests/unit/auditoria-aceite-100.test.ts` (8
      testes: legado Fase 1 não volta, `window.confirm`/`sonner` só nas
      portas documentadas, sem espaçamento arbitrário — carve-out
      `env(safe-area)` —, sem hex em classe, `animate-` só do catálogo).
      Evidência: `evidence/fase6b-aceite/1-novo-design-meu-dia.png`,
      `evidence/fase6b-aceite/2-tabela-canonica-notifications.png`,
      `evidence/fase6b-aceite/3-navegacao-shell.png`,
      `evidence/fase6b-aceite/4-tabelas-financeiro.png`,
      `evidence/fase6b-aceite/5-formularios-tenant.png`,
      `evidence/fase6b-aceite/6-estados-prospeccao.png`,
      `evidence/fase6b-aceite/7-tipografia-clientes.png`,
      `evidence/fase6b-aceite/8-cores-radar.png`
      → **PASSO 6 FECHADO; próximo item 2 (E2E §86)**.
   Checklist §100 item a item: ver inventário §6.
   Guarda por fase: `pnpm typecheck` + `pnpm lint` + `test:unit` (breadcrumb,
   notification-center, contextual-drawer, admin-topbar, sidebar-grupos,
   command-palette, busca-global, leads/titulos route, status-page,
   confirmacao-provider, tenant-reason-dialog, navegacao-*) + e2e alvo +
   evidence/ quando a tela mudar.
2. **E2E §86 (passo 7) — FECHADO (`e83ac2fdd`)**: 5 jornadas nomeadas do
   §86 (`jornada-venda`/`expedicao`/`financeiro`/`fiscal`/`ia`; a 6ª,
   `recompra-radar`, já existia) + `compras-do-rascunho-ao-estoque` +
   `estoque-entrada-saida-e-saldo`, todas nas `SPECS_PARTE_*` (gate
   e2e-cobertura 49/49); seed da cifra fiscal no workflow; regressão
   7/7 verdes; 4 fixes de produto (detalhe na "Última ação").
3. **Fechamento (passo 8)** — docs (`parity-matrix`/`migration-plan`
   desatualizados desde a Etapa 1-3), checklist §94 recontado, **abrir PR**
   (ordem do usuário), CI Linux, deploy medido na VPS (§84).
   Antes de fechar: checar o spec linha a linha (§19/§20/§91 já cumpridos;
   confirmar §51-§53, §14 contra o spec).

## Decisões pendentes do usuário (NÃO decidir sozinho)

- **§101**: posso remover os remotes `origin`/`fork` (critério de aceite do
  spec diz `git remote -v` só com NEXUS, mas AGENTS.md os declara permanentes)?
- **PR**: abrir `nexus-v2 → main` em qual ponto (antes ou depois do redesign)?

## Fatos para não alucinar (medidos)

- Testes: `pnpm test:unit` ~5min · `pnpm test:db` (Docker) ~16-18min ·
  `tsc --noEmit -p tsconfig.typecheck.json` ~40s. `pnpm gov:verify` NÃO cobre
  test:db nem e2e.
- Flakes pré-existentes (NÃO são nossos, provados na main limpa):
  `contato-consent-e-auditoria`, `triagem194-defeitos-alegados` (test:db);
  unit no Windows: `namespace-das-imagens`/`guarda-da-release` (falta `grep`),
  `rate-limit` (timeout 15s), `performed-at-um-relogio-so`, `lib/ui/icons`.
- Gates que travam entrega nova: navegação (rota nova → registry),
  `manifest-x-migrations` + apêndice no `baseline.sql` **ANTES** do bloco
  `VARREDURA anon` (~linha 19860), branding (nunca "Deskcomm" no código de
  usuário), `lib/audit/actions.ts` para ação nova, RLS: tabela nova em
  `tests/invariants/rls-isolation.test.ts` TABLES+seed, definer em
  `AUTHENTICATED_PERMITIDO` do `hardening-definer-varredura.test.ts`.
- Rotas com `[id]` NÃO precisam entrar no registry (gate as ignora); estáticas
  SIM.
- `NexusEmptyState` props são `icon/headline/subcopy/primary{label,onClick}` —
  NÃO `title/description/action`.
- API é `snake_case`, dinheiro `*_cents`, `apiClient.get/post/patch/delete`,
  erros via `showApiError`/`nexusToast`, wrappers `ok()/fail()`.
- Endpoints consumidos pelos passos 1-4: `/api/v1/financeiro/fluxo`,
  `/api/v1/roadmap`, `/api/v1/inventory/sugestoes`, `/api/v1/inventory/movements`,
  `/api/v1/financial-pagaveis`, `/api/v1/radar-compras`,
  `/api/v1/ai/followups/queue`, `/api/v1/sales-brain`. Refaça a varredura de
  órfãos antes de afirmar qual ainda sobra.
- `GET /api/v1/pipelines` exige **manager** — o Dashboard (viewer) não pode
  usá-lo; use radar-compras/roadmap/fila/sales-brain (viewer OK).
- Agrupamento oficial do radar (não inventar): risco=`em_risco`;
  recompra=`recompra_atrasada`; oportunidade=`oportunidade_aberta`+
  `em_voo`+`primeira_compra`; perda=`cancelado_sem_nova`
  (`app/app/radar/_components/RadarCategorias.tsx`).
- `<BrainRecomendacoes />` não tem props (busca sozinho via `useSalesBrain(6)`);
  Badge aceita variant `error|warning|info`; filtros de fila vencida:
  `status ∈ {active, waiting_reply, agendada}` e `next_fire_at < agora`.
- Padrões de UI aprendidos nos passos 1-4 (mantidos): `toLocaleDateString`
  com tag de `useTagDeIdioma()`; `// eslint-disable-next-line
  react-hooks/set-state-in-effect` antes de `void carregar()` (precedente
  `financeiro/_client.tsx:142`); **o lint do react-compiler reprova `Date.now()`
  dentro do render** ("Cannot call impure function during render").
- **Orçamento da dobra (medido)**: `conteudo = 4 + 30·L + 25·H ≤ 763` no
  viewport 1280×900 do spec; H=8 títulos ⇒ L≤18 links. MEXER no sidebar exige
  re-medição (o script `medir-dobra.spec.ts` foi temporário e saiu do repo;
  recrie medindo `nav`/`conteudo` antes de adicionar qualquer `sidebar: true`).
- **`pnpm e2e:build` no Windows**: a cada `next build`, 4 junctions dentro de
  `.next/node_modules/` nascem vazios (Next#87737 — `require-in-the-middle`,
  `import-in-the-middle`, `pg`, `@react-pdf/renderer`). Reparo: `Remove-Item`
  + `cmd /c mklink /J <link> <absoluto em node_modules\.pnpm\…>`; se estiverem
  vazios o `next start` cai com MODULE_NOT_FOUND no runtime.
- Relógio desta máquina +46~47s adiantado: sem compensação todo TOTP dá 422 e
  o erro vira "MFA falhou". **A compensação é automática desde `6f12049c0`**:
  `globalSetup` do Playwright mede (header `Date` do `/auth/v1/health`) e
  publica `E2E_CLOCK_OFFSET_MS`; `generateTotp`/`msUntilNextTotpWindow` em
  `tests/e2e/utils/totp.ts` já default ao relógio do servidor. Correção de
  fundo segue sendo `w32tm /resync` como admin (sem permissão interativa).
  MFA lockout = cookie 3 falhas/60s. Seed: `npx tsx
  scripts/seed-e2e-credentials.ts` + `seed-e2e-followup-agent.ts`.
- `execNpx` (`tests/e2e/utils/npx.ts`, shell só no win32) é obrigatório para
  chamar `npx` de spec: `execFileSync("npx")` cru dá `ENOENT` no Windows (CI
  Linux ok). 2 specs migrados na Fase 3c (`followup-queue`,
  `retorno-anti-morte`); os call sites restantes só quebram quem roda e2e
  local no Windows — migrar ao tocar no spec.
- `AuthProvider` só nasce em `app/app/layout.tsx`; `/admin` ganhou o seu em
  `(protected)/layout.tsx` (Fase 2e). Qualquer componente novo em `/admin` que
  use `useUser`/`useAuth` depende dessa junção — sem ela, SSR derruba a rota.
- `evidence/` é TRACKED (commitar screenshots de e2e como prova visual);
  `.superpowers/` não. E o gate `evidencia-citada.test.ts` cobra o OUTRO
  lado: imagem versionada sem citação (`[x](…)`/crase) em `*.md` versionado
  reprova — e "versionado" lê `git ls-files`, então um `README` novo só
  conta depois do `git add` (aconteceu com as 6 fotos da marca-logo).
- Busca global: SoR única = `lib/busca/global.ts` (paleta e `/app/busca`
  compartilham); vocabulário de cada endpoint e hrefs estão em
  `tests/unit/busca-global.test.ts`. Produto/título não têm tela de
  detalhe → caem na LISTA filtrada (`?busca=` no preload). `limite=0` de
  `/api/v1/leads` cai no default 5 (mesmo `Number(x) || 5` do prospects).

## Arquivos de contexto do projeto

- Spec (fora do repo): `C:\Users\Daniel\Documents\wppcrm2\# NEXUS 2.0 — ERP + CRM + SALES OS .txt`
- Auditoria: `docs/nexus-v2/*.md` (11 arquivos) · deploy: `docs/infrastructure/deploy-performance.md`
- Doutrina: `AGENTS.md` + `CLAUDE.md` (ler antes de mexer em schema/CI/packaging)
