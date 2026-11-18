# Módulos 5.10/5.11 — Configurações, equipe, LGPD e admin

> **Escopo do prompt:** configurações por seção e por papel; convite/membro;
> pedido LGPD (exportação/anonimização) com prazo e falha; admin de plataforma
> com tenant, auditoria e incidentes.
>
> **Método:** leitura do código e das rotas, em 2026-11-18, na branch
> `front/sentinel-modulos`, com o olhar de quem fez o Sentinel/LGPD. O que exige
> execução está marcado como **não medido**. Correções desta rodada são só de
> estado/UX; nenhuma regra de negócio, RLS, fiscal ou financeiro foi tocada.

## 1. Superfície e papel mínimo

| Área | Rota/tela | Papel mínimo observado | Onde |
| --- | --- | --- | --- |
| Hub | `/app/settings` | qualquer membro; cards filtrados por papel | `app/app/settings/page.tsx:24`; `lib/navigation/registry.ts:909-1009` |
| Conta | `/app/settings/profile`, `/security`, `/notifications` | qualquer membro | `lib/navigation/registry.ts:909,917,925` |
| Equipe | `/app/team` | página aberta; **membros** manager+, **atendimento** manager+ | `app/app/team/page.tsx:42-43,67-77` |
| Convidar | `/app/team/invite` | admin | `app/app/team/invite/page.tsx:13` |
| Empresa | `/app/settings/tenant` | admin | `page.tsx:35` |
| Marca | `/app/settings/marca` | admin | `page.tsx:49` |
| Billing | `/app/settings/billing` | admin | `page.tsx:21` |
| Atendimento | `/app/settings/atendimento` | manager | `page.tsx:34` |
| Etapas do funil | `/app/settings/tenant/pipelines` | manager | `lib/navigation/registry.ts` (entrada com `minRole: manager`) |
| API Tokens | `/app/settings/api-tokens` | admin | `page.tsx:13` |
| Dispositivos offline | `/app/settings/devices` | admin | `page.tsx:21` |
| LGPD | `/app/lgpd/requests` e `/[id]` | admin (ou platform admin) | `requests/page.tsx:18`; `[id]/page.tsx:18` |
| Admin | `/admin/**` | platform admin ativo + AAL2 | `app/admin/(protected)/layout.tsx:32` |
| Atualização | `/app/settings/atualizacao` | platform admin | `page.tsx:16` |

**Regra observada, não inventada:** `ROLE_RANK` é `viewer < agent < manager <
admin`; `admin` da organização não é `platform_admin`. As telas de empresa,
marca, billing, tokens, dispositivos e LGPD redirecionam para `/403`/`/app`;
o admin de plataforma é guardado no layout, não em cada página.

## 2. Matriz de estados

Legenda: **S** = server render (sem estado de carregamento próprio), **T** =
toast, **B** = botão de retry, **—** = não se aplica.

| Tela/seção | Carregando | Erro + retry | Vazio com ação | Permissão | Offline |
| --- | --- | --- | --- | --- | --- |
| Hub `/app/settings` | S | — | — (hub sempre tem cards do papel) | `NavHub` filtra por papel (`settings/page.tsx:24`) | — |
| Perfil | S | T; agora diz o **campo** (`profile/_form.tsx:67,77`) | — | qualquer membro | sem fila; falha vira toast |
| Empresa | S | T; agora diz o **campo** (`tenant/_form.tsx:63,73`) | — | `page.tsx:35` → `/403` | sem fila |
| Marca / Billing / Tokens / Dispositivos | S | T / estados próprios | tokens: vazio com “criar”; dispositivos: vazio com pareamento | `marca:49`, `billing:21`, `api-tokens:13`, `devices:21` | sem fila |
| Equipe — membros | `TeamMembersClient.tsx:85` | `:88-95`, `NexusErrorState` + refetch | `:99-108`, CTA “Convidar” só admin | agora manager+ (`team/page.tsx:67`); antes viewer/agent viam erro 403 | — |
| Equipe — atendimento | S | T | — | manager+ (`team/page.tsx:76`) | — |
| Convite | `InviteForm` | T por e-mail/lote | — | admin (`invite/page.tsx:13`) | — |
| LGPD — lista | `RequestsTable.tsx:240` (8 skeletons) | `:250-258`, retry explícito | `:262-271` “Nenhuma solicitação” | `requests/page.tsx:18` | — |
| LGPD — detalhe | `_client.tsx:53-62` | `:66-73`, **agora com retry** | — | `[id]/page.tsx:18` | — |
| Admin — tenants | `tenants/_client.tsx:49` | `:51-56`, `NexusErrorState` | tabela vazia do componente | layout `:32` | — |
| Admin — auditoria | `audit/_client.tsx:47` | `:49-54`, retry | lista vazia do componente | layout `:32` | — |
| Admin — incidentes | `incidents/_client.tsx:114` | `:116-121`, retry | lista vazia do componente | layout `:32` | — |
| Admin — shell | — | — | — | `Pular para o conteúdo` em `AdminShell.tsx:94` (confirmado) | — |

**Offline:** nenhuma destas superfícies tem fila offline. Formulário que falha
sem rede vira toast e perde o rascunho; a matriz marca isso como **ausente**,
não como “funciona”. O app offline cobre vendas/pedidos, não configuração.

## 3. Regras observadas

- **Convite:** token HMAC com `INVITE_TTL_SECONDS = 24h`
  (`lib/auth/invite-token.ts:84`; constante em `lib/auth/invite-ttl.ts:9`).
  Antes a tabela só olhava `accepted_at`: convite de 3 dias aparecia como
  “Pendente”. Agora `estadoDoConvite` distingue **Aceito / Pendente /
  Expirado** (`lib/team/convite.ts`), usando a mesma janela do servidor.
- **Remover membro:** pede confirmação e explica a consequência (“perderá
  acesso… pode ser desfeito reconvidando”) — `TeamMembersClient.tsx:387-416`.
- **Papel legível:** a coluna mostra o rótulo em português (`Atendente`,
  `Gerente`…) e a descrição no seletor; não é preciso abrir o membro
  (`TeamMembersClient.tsx:133,160-175`).
- **LGPD:** o worker limita a 3 tentativas e grava `failed` +
  `error_message: max_attempts_exceeded` (`workers/lgpd-export-worker.ts:133-155`).
  A lista mostra status/SLA e o detalhe mostra tentativas e erro; não fica
  “processando” eterno no backend. O detalhe agora permite tentar de novo a
  **leitura**; reprocessar o pedido é outra ação, não tocada.
- **Admin:** `/admin/**` exige platform admin ativo + AAL2 no layout; o skip
  link existe no `AdminShell` (`:94`), como no app.

## 4. Riscos e lacunas (não corrigidos nesta rodada)

| # | Risco | Onde |
| --- | --- | --- |
| C1 | Formulários de tenant/perfil ainda mostram **código** de erro de servidor (`forbidden_role`) quando não é validação de campo; não há tradução por código. | `tenant/_form.tsx:70-76`; `profile/_form.tsx:74-80` |
| C2 | Equipe não tem guarda de página: viewer/agent veem o cabeçalho e a aba de atendimento; a lista de membros foi escondida agora, mas a rota continua alcançável. | `team/page.tsx:42-43` |
| C3 | Convite expirado não tem ação de **reenviar** na tabela; o administrador precisa ir a “Convidar” de novo. Não há endpoint de reenvio. | `TeamMembersClient.tsx:216-230` |
| C4 | LGPD detalhe não faz polling; um pedido `processing` só muda ao recarregar. O backend tem teto de tentativas, a tela não mostra “última tentativa”. | `[id]/_client.tsx:52-73` |
| C5 | Configurações não têm estado offline/rascunho; falha de rede perde o formulário. | `settings/*/_form.tsx` |
| C6 | Admin: `platform_admins.scope` e impersonação de tenant suspenso continuam como na auditoria 17; fora do escopo de estado/UX. | `docs/auditoria/17-modulos-5.4-5.11.md` §4 |
| C7 | `settings/atualizacao` é platform-admin e não aparece no hub de organização; é acessada pelo rodapé. Decisão de navegação, não bug. | `settings/atualizacao/page.tsx:16` |

## 5. O que foi corrigido (só estado/UX)

1. **Erro de salvar diz o campo, não “Dados inválidos.”** O helper
   `lib/forms/mensagem-de-validacao.ts` lê `fieldErrors`/`formErrors` do Zod e
   usa o rótulo da tela; tenant e perfil passaram a usá-lo no cliente e no
   retorno da Server Action. Teste: `lib/forms/mensagem-de-validacao.test.ts`
   (3 casos).
2. **Equipe: lista de membros é manager+.** Viewer/agent deixam de receber um
   erro de fetch (403) na aba Membros; veem uma frase que diz o que fazer. A
   aba Atendimento continua disponível para o gerente; a mensagem para não
   gerente já existia.
3. **Convite expirado é um estado distinto.** `estadoDoConvite` usa a janela de
   24h do token; a tabela mostra **Expirado** em vez de **Pendente**.
   Testes: `lib/team/convite.test.ts` (3) e
   `TeamMembersClient.test.tsx` (convite de 25h → Expirado).
4. **Detalhe LGPD com erro tem retry.** Antes era uma faixa vermelha sem saída;
   agora há “Tentar novamente” (`_client.tsx:66-73`). Teste:
   `app/app/lgpd/requests/[id]/_client.test.tsx`.

**Prova dirigida:** 5 arquivos, 18 testes verdes no conjunto acima;
`pnpm typecheck` e eslint sem erros. Nenhuma migration, nenhuma alteração de
RLS/regra; `test:db` não se aplica.

## 6. O que NÃO foi tocado

- RLS, policies, roles e `requireRole`/`requirePlatformAdmin`.
- Regras de negócio de convite (TTL/token), LGPD (SLA, retenção, tentativas) e
  admin (impersonação, suspensão, scope).
- Fiscal, financeiro, pedidos, estoque e mensagens.
- APIs e contratos de dados.

## 7. Próximos passos seguros

1. Traduzir códigos de erro de servidor (`forbidden_role`, `forbidden_tenant`)
   para frases de tela — sem mudar o contrato.
2. Ação de reenvio de convite expirado, se o produto decidir que reenviar é
   permitido (hoje o caminho é convidar de novo).
3. Polling/refresh explícito no detalhe LGPD para `processing`.
