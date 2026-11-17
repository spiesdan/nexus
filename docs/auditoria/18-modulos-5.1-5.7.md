# Módulos 5.1, 5.2, 5.3, 5.5 e 5.7 — auditoria medida

> **Método:** quatro leituras paralelas do código (público/login/onboarding,
> dashboard/busca/agenda, contatos/Customer 360, radar/prospecção e financeiro),
> em 2026-11-17, na branch `docs/auditoria-aaa`. Cada problema tem
> `arquivo:linha`. O que exige execução está marcado como **não medido**.

## 1. Público, login, onboarding e legal (5.1)

**17 rotas públicas** (`lib/auth/public-paths.ts:5-95`): `/`, `/login` (+ mfa,
forgot, reset, recovery), `/signup`, `/onboarding/*` (8 passos), `/legal/{terms,
privacy}`, `/403`, `/500`, `/503`, `/account-suspended`,
`/team/accept-invite/[token]`, `/o/[token]`, `/vitrine-agenda`.

**Progresso:** onboarding salva no BANCO (`organizations.onboarding_state`,
`app/onboarding/_shared.ts:69-80`) e o roteador retoma pelo estado — mas o
**Stepper é inerte** (`Stepper.tsx:43-70`): não há "voltar" pelo cabeçalho.
Cada passo tem "Pular" e erro recuperável.

**Auth:** rate limit por IP **e** conta em login, signup, reset e convite;
mensagens neutras; token de convite HMAC 24h com `timingSafeEqual`; MFA com lock
de 3 tentativas **em cookie** (resetável, `verifyMfa.ts:46-56`).

**Integração — sucesso só depois do backend?**
- ✅ WhatsApp: "Conectado!" só com `status === "WORKING"` vindo do polling
  (`connect-whatsapp/_client.tsx:478-481`).
- ❌ Nuvemshop: "Já conectei" grava `connected_at` **sem verificação**
  (`connect-nuvemshop/_client.tsx:56`; `skipWhatsapp.ts:55-61`).
- ❌ WhatsApp: "Conectei em outro lugar" grava `status: "configured"` direto
  (`connect-whatsapp/_client.tsx:200-203`).

**Problemas abertos:**

| # | Problema | Onde |
|---|---|---|
| P1 | Nuvemshop marca o passo concluído sem confirmar o backend | `connect-nuvemshop/_client.tsx:56` |
| P2 | "Conectei em outro lugar" idem, sem verificação | `connect-whatsapp/_client.tsx:200-203` |
| P3 | Aceite de termos não é verificado no servidor (`accepted_terms_at` sempre carimbado) | `acceptWelcome.ts:32` |
| P4 | Signup sem botão de reenviar confirmação | `SignupForm.tsx:79-92` |
| P5 | `setup-ai` perde nome/jeito/regras ao sair do passo | `setup-ai/_form.tsx:57-67` |
| P6 | `/login/mfa` sem fator cai em `/app/inbox` e ignora `?next=` | `login/mfa/page.tsx:24` |
| P7 | Lock de MFA em cookie (resetável), não no servidor | `verifyMfa.ts:46-56` |
| P8 | `/vitrine-agenda` exige login apesar de listada como pública | ausente de `public-paths.ts` |
| P9 | Nenhum redirect de rota legada (`next.config.ts` sem `redirects`) | `next.config.ts` |

**Corrigido nesta rodada:** `/api/auth/signout` **não existia** — os dois botões
"Sair" (`AppShell.tsx:55`, `accept-invite/page.tsx:117`) davam 404. Rota criada.

## 2. Dashboard, Meu Dia, busca, agenda (5.2)

| Tela | Hierarquia / fonte | Estado |
|---|---|---|
| `/app` | KPIs do mês explícito no subtítulo (`_home.tsx:132-134`) | corta 5k linhas **com aviso** (`:224-228`); bloco `Atividade` sem erro/retry (`_atividade.tsx:44-52`) |
| `/app/meu-dia` | Atrasado→Hoje→Amanhã→Mais tarde (`LinhaDoTempo.tsx:146-151`) | 4 estados por bloco, retry; **sem período no contexto** |
| `/app/busca` | 6 entidades + telas (`lib/busca/global.ts:118-127`) | **sem loading**: "Nada encontrado" antes da resposta (`_client.tsx:80,115-119`); seção que falha **some calada** |
| `/app/tarefas` | sem hierarquia de urgência | `limit 500` da org; contador `(N)` não é do usuário (`_client.tsx:60,188`) |
| `/app/agenda` | mês no cabeçalho | falha da grade só vira toast (`useAgendamentos.ts:101-104`); saúde do sync (`last_sync_error`) **nunca chega à tela** (`page.tsx:180-193`) |
| `/app/indicadores` | mês + vendedor | "Desempenho" fixo em 30 dias (`:686-690`); funil duplicado na mesma tela |

**Meu Dia — ações diretas:** concluir e "amanhã" são PATCH inline
(`LinhaDoTempo.tsx:65-80`); compromissos e follow-ups **não têm ação nem link**
(`:85-100`; `MeuDiaClient.tsx:510-522`).

**Google Agenda:** conexão por pessoa, escopos `calendar.events` +
`calendar.readonly`, sync 15 min / push 5 min
(`docker/scheduler/entrypoint.sh:85-91`). O banco tem `status`,
`last_sync_at`, `last_sync_error` (`baseline.sql:15413-15426`) — a tela não lê.

**Problemas abertos:** P10 busca com falso vazio (acima); P11 seção de busca
some; P12 "Conectar de novo" é botão morto (`AvisoDaConexaoGoogle.tsx:234-238`);
P13 semana em 390 = 7 colunas de ~46px sem scroll (`GradeDaAgenda.tsx:959-974`);
P14 "Pedidos hoje" é contador morto (`MeuDiaClient.tsx:553-560`); P15
contadores truncados sem aviso (`_home-secoes.tsx:75,113-126`).

## 3. Contatos, leads e Customer 360 (5.3)

**Tela do contato:** header + KPIs, conversa, abas Pedidos, Produtos,
Financeiro, WhatsApp, Histórico (timeline), Oportunidades, Inteligência, LGPD e
"Próximas ações". **Ausentes:** tarefas e **consentimento/preferências** — o
campo `consent` é buscado (`_handler.ts:30`) e não é renderizado em lugar nenhum.

**Score:** mostra `reason` + `factors` (`ScoreSlot.tsx:85-119`), **não** a data
(`score.at` existe em `lib/types/leads.ts:89`). A recomendação do Sales Brain não
traz confiança nem data (`_inteligencia360.tsx:34-58`).

**Funis:** motivo de perda obrigatório (`LoseLeadDialog.tsx:15-27,65`), mas o
diálogo **ignora** `pipeline.settings.lost_reasons` configurado em
`settings/tenant/pipelines`. Duração de etapa usava a última atividade — a coluna
`stage_changed_at` existe e é carimbada por trigger.

**Problemas abertos:** P16 tarefas/consentimento ausentes no 360; P17 score sem
origem/data; P18 motivo de perda ignora a configuração; P19 importação CSV
pré-filtra sem CPF embora o cabeçalho prometa CPF (`import/route.ts:171-199`);
P20 "Editar" sem gate de papel na ficha (`cabecalho360.tsx:49-56`) — viewer
recebe 403; P21 exportação só na carteira; campo customizado só no lead.

**Corrigido nesta rodada:**
- **duplicata → 409** com código `contato_duplicado` (era 500 `internal_error`);
- **lista esconde mesclados e anonimizados** (era filtro nenhum);
- **tempo de etapa mede `stage_changed_at`** (era `last_activity_at`);
- **carteira**: mesmo recorte + teto de 10.000 **declarado** (era silencioso);
- **ficha e timeline filtram a organização ativa** (vazamento entre orgs).

## 4. Radar, prospecção e recuperação (5.5)

**Score do Radar** = atraso÷intervalo (50%) + ticket/5k (30%) + pedidos/10 (20%)
(`radar-score.ts:62`), derivado de `commercial_orders` a cada leitura.
`/radar/categorias` explica o motivo; `/radar/oportunidades` mostra `score 72`,
`+18d`, `padrão ~15d` — **não** explica os pesos. `/radar/risco` usa a janela do
estágio com fallback 24h/72h e mostra data + confiança da IA.

**Problemas abertos:** P22 "potencial" é soma de ticket médio, não receita
recuperável — rótulo não diz (`Oportunidades.tsx:179-180`); P23 score sem
tooltip de origem; P24 `RiskRadarList` sem `isError` — falha vira "nenhuma
demanda em risco" (`:79`); P25 prospecção com lista fixa de 30, sem paginação.

**Corrigido nesta rodada:** o `console.error` TEMP de diagnóstico saiu da rota; a
base cortada em 25.000 agora volta como `meta.amostra_parcial` e a Visão geral
**diz** que os números são da amostra.

## 5. Financeiro, títulos e comissões (5.7)

**Funciona:** vencido derivado (vencimento < hoje ∧ saldo > 0), baixa com
idempotência e estorno, aba de conciliação, fluxo com `amostra_parcial`, comissão
por `catalog_products.comissao_pct`.

**Problemas abertos:** P26 KPIs de "A receber"/"Vencido" vêm de `limit(5000)` sem
flag (a tela agora avisa quando bate); P27 conciliação concatena valores sem
separador e usa `key={i}` (`_client.tsx:501-502`); P28 baixa de comissão é
UPSERT (uma por pedido) — segunda baixa substitui, não acumula.

**Corrigido nesta rodada:**
- **mês da comissão no fuso da organização** — em UTC, pedido das 21h–23h59 do
  último dia caía no mês seguinte (`commissions/route.ts`);
- **baixa parcial aparece como parcial** — o total somava `comissao_cents`
  inteiro quando existia `baixado_em` (`_client.tsx:134`);
- **fim do período inclusivo nas vendas** — "Recebido" e "Vendas" comparavam
  janelas de um dia diferentes (`financeiro/dashboard/route.ts`);
- **KPIs seguem o filtro de data** — "Recebido (período)" era o total histórico
  ao lado de um filtro visível (`_client.tsx:148`);
- "Dar baixa" pede confirmação com valor e pedido.

## 6. O que fica aberto

**P0:** nenhum novo nesta fatia (os P0 conhecidos são run trace da IA,
`platform_admins.scope` e impersonação de tenant suspenso).

**P1:** Nuvemshop/WhatsApp declarando conexão sem backend (P1/P2); busca com
falso "Nada encontrado" (P10); consentimento e tarefas no Customer 360 (P16);
duplicata de importação sem CPF (P19); guarda de papel na ficha (P20).

**P2:** Stepper sem voltar; reenvio de confirmação; MFA lock em cookie;
`/vitrine-agenda` pública; health do Google Agenda na tela; semana em 390;
motivo de perda configurável; explicação do score no Radar; conciliação com
links e chaves estáveis.

**Não medido:** jornada de instalação fresca ponta a ponta (depende de
WAHA/Redis/Resend/Nuvemshop), comportamento real do OAuth do Google e o volume
de cada teto em produção.
