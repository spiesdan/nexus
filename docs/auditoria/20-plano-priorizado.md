# Fase 10 — Plano priorizado

> **Fonte:** inventários das Fases 4–9 (`13-jornadas.md`, `15-…`, `16-modulo-5.6.md`,
> `17-modulos-5.4-5.11.md`, `18-modulos-5.1-5.7.md`,
> `19-fase-8-seguranca-performance-a11y.md`). Cada item tem evidência medida e
> `arquivo:linha`. Nenhum número de esforço é estimado aqui — a régua é impacto e
> risco, não prazo.

## Ordem de ataque

1. **P0 encerra exposição**: cross-tenant, migrations silenciosas e trilha da IA.
2. **P1 devolve confiança na operação**: o que o dono sente todo dia (lista que
   esconde item, busca que mente, envio que atrasa, tela que pesa).
3. **P2 paga consistência**: densidade, conciliação, avisos que não fecham.
4. **P3 só entra com decisão de produto** — são capacidades novas, não defeitos.

---

## P0 — segurança, perda/corrupção, operações críticas

### P0-1 · Cobertura cross-org dos handlers com service role

| Campo | Conteúdo |
|---|---|
| **Impacto** | Um filtro esquecido vaza dado de outro tenant — o pior defeito possível num multi-tenant. |
| **Evidência** | **40** handlers em `app/api/**` usam admin client sem a string `organization_id` (`app/api/v1/ai/cases/route.ts:42`, `leads/at-risk/route.ts:50` + 38); `AGENTS.md` mede **209/416** handlers citando service role. |
| **Dependências** | Nenhuma. |
| **Risco** | Baixo: revisão caso a caso; onde faltar filtro, o erro é adicionar `.eq("organization_id", …)` — nunca remover. |
| **Arquivos** | `app/api/**/route.ts` com `createAdminClient`. |
| **Estratégia** | (a) revisar os 40 um a um; (b) criar teste estático que reprova admin client sem `organization_id` **quando a tabela for tenant-aware**; (c) allowlist explícita para crons/admin/system. |
| **Validação** | Teste novo reprova handler sem filtro; `pnpm test:unit` verde. |
| **Conclusão** | 40 revisados, gate ativo, allowlist com razão escrita. |

### P0-2 · Prova comportamental de RLS nas 73 tabelas

| Campo | Conteúdo |
|---|---|
| **Impacto** | RLS habilitado não é prova de isolamento: policy errada passa despercebida. |
| **Evidência** | `tests/invariants/rls-completude-varredura.test.ts:227-301` — 73 tabelas em `DEBITO_CONHECIDO` sem teste `set role authenticated` + contagem cross-org. |
| **Dependências** | Docker (`pnpm test:db`). |
| **Risco** | Médio: o teste pode revelar vazamentos reais — cada um vira correção de policy. |
| **Arquivos** | `tests/invariants/**`, `supabase/baseline.sql` (policies). |
| **Estratégia** | Gerar o teste a partir do catálogo (org A vê 0 linhas da org B para cada tabela), começando pelas tabelas com PII e dinheiro. |
| **Validação** | `pnpm test:db` verde; lista de dívida encolhe no diff. |
| **Conclusão** | As 73 saem de `DEBITO_CONHECIDO` com teste executado. |

### P0-3 · Migrations nunca aplicadas no deploy

| Campo | Conteúdo |
|---|---|
| **Impacto** | Atualização que traga migration sobe o código sem o schema — e o sintoma aparece como erro em tela, dias depois. |
| **Evidência** | `scripts/deploy.sh` chama `dc run --rm app pnpm db:migrate \|\| true`; a imagem de runtime **não tem `pnpm`** (`sem-pnpm`), o comando morre com `MODULE_NOT_FOUND` e o `\|\| true` engole. Medido no deploy da 1.54.0. |
| **Dependências** | Decidir onde as migrations rodam (imagem de build × job separado). |
| **Risco** | Médio: aplicar schema sem ensaio pode travar deploy; o baseline é idempotente e as migrations são aditivas. |
| **Arquivos** | `scripts/deploy.sh`, `Dockerfile`, `scripts/db/aplicar-schema.sh`, `hostgator-setup-kit/`. |
| **Estratégia** | Chamar o `aplicar-schema.sh` com `bash` (que existe na imagem) ou publicar a etapa como serviço `migrate` do compose; remover o `\|\| true` e falhar alto. |
| **Validação** | `pnpm test:shell` + ensaio de update numa VPS de teste com uma migration real. |
| **Conclusão** | Update aplica migration e falha alto se não conseguir. |

### P0-4 · Run da IA sem trilha auditável

| Campo | Conteúdo |
|---|---|
| **Impacto** | Não dá para explicar por que o agente respondeu o que respondeu — e o prompt AAA exige inspeção de entrada, contexto, fontes e saída. |
| **Evidência** | `ai_agent_runs` não tem colunas para isso (`lib/database.types.ts:224-249`); `RunTrace.tsx:22` só mostra `tool_calls`. |
| **Dependências** | Migration (novas colunas ou tabela `ai_run_traces`), retenção e LGPD. |
| **Risco** | Médio: armazenar conteúdo de mensagem amplia PII — retenção e redação precisam vir junto. |
| **Arquivos** | `lib/database.types.ts`, worker do agente, `app/app/ai/**`, `supabase/`. |
| **Estratégia** | Persistir entrada, fontes (ids + trechos), prompt de sistema versionado e saída, com retenção curta e scrub; tela do run lê daí. |
| **Validação** | Teste de integração de um turno grava e lê a trilha; e2e abre o run e vê as fontes. |
| **Conclusão** | Todo run mostra de onde veio a resposta, com retenção declarada. |

### P0-5 · Injeção indireta sem gate determinístico

| Campo | Conteúdo |
|---|---|
| **Impacto** | Conteúdo malicioso (e-mail, site, anexo) pode instruir o agente a executar tool com efeito. |
| **Evidência** | `guardrails/jailbreak/classifier.ts:7-25` é **advisório**; confirmação humana por tool só no orquestrador (`lib/ai/orchestrator/decide.ts:45,121`). |
| **Dependências** | Catálogo de tools com efeito já existe (`edge/crm/mcp-tools.ts:12-45`). |
| **Risco** | Baixo: o gate só bloqueia mais; falso positivo vira revisão humana. |
| **Arquivos** | `lib/agent-engine/guardrails/`, `lib/ai/orchestrator/`. |
| **Estratégia** | Exigir confirmação humana para toda tool de efeito quando o turno teve conteúdo externo não confiável; manter o classificador como sinal, não como decisão. |
| **Validação** | Teste: conteúdo externo com instrução + tool de envio → vira proposta/handoff, não execução. |
| **Conclusão** | Nenhuma tool de efeito executa sozinha em turno com entrada externa. |

---

## P1 — o que o dono sente na operação

### P1-1 · Inbox acima do budget (386 KB gz × 250)

| Campo | Conteúdo |
|---|---|
| **Impacto** | A tela mais usada demora a abrir em 3G e em celular médio. |
| **Evidência** | Cálculo sobre `page_client-reference-manifest` do `.next` de 17/11: **386 KB gz**; budget em `next.config.ts:8`. |
| **Dependências** | Nenhuma. |
| **Risco** | Baixo: lazy-load de painéis fechados por padrão. |
| **Arquivos** | `components/inbox/InboxLayout.tsx`, `CRMSidePanel`, `_components/dossier/*`. |
| **Estratégia** | `dynamic()` no painel de CRM e no compositor de mídia; medir de novo. |
| **Validação** | Soma dos chunks do manifest ≤ 250 KB gz; e2e do inbox verde. |
| **Conclusão** | Inbox dentro do budget, com o número no PR. |

### P1-2 · `gpt-tokenizer` estático (1007 KB gz)

| Campo | Conteúdo |
|---|---|
| **Impacto** | As telas de agente carregam 1 MB de tabela BPE para mostrar uma contagem. |
| **Evidência** | `lib/ui/TokenCounter.tsx:3` importa `encode` estaticamente; chunk de 1007 KB gz nas rotas `/app/ai/agents/*`. |
| **Dependências** | Nenhuma. |
| **Risco** | Baixo: cálculo sob demanda. |
| **Arquivos** | `lib/ui/TokenCounter.tsx`. |
| **Estratégia** | `import()` dinâmico no evento, ou calcular no servidor e devolver o número. |
| **Validação** | Chunk sai do carregamento inicial; contagem continua correta. |
| **Conclusão** | Telas de agente sem a tabela no bundle. |

### P1-3 · Assets `-dev` do maplibre publicados (5,3 MB)

| Campo | Conteúdo |
|---|---|
| **Impacto** | Peso morto em toda instalação: 2,5 MB + 1,2 MB de builds de desenvolvimento. |
| **Evidência** | `.next/static/media/maplibre-gl-dev.mjs` e `worker-dev.mjs` no build de produção. |
| **Dependências** | Nenhuma. |
| **Risco** | Baixo. |
| **Arquivos** | imports de `maplibre-gl` em `app/`, `next.config.ts`. |
| **Estratégia** | Importar o entry de produção (`maplibre-gl/dist/maplibre-gl`) e conferir o `dist` publicado. |
| **Validação** | `ls .next/static/media` sem `-dev`; mapa continua funcionando. |
| **Conclusão** | Build não publica os artefatos de dev. |

### P1-4 · Listas com teto silencioso (F-30)

| Campo | Conteúdo |
|---|---|
| **Impacto** | O item 201 existe e é invisível — e a tela afirma que a lista acabou. |
| **Evidência** | Só **15** rotas têm paginação; `/app/pedidos`, `/app/fiscal/*`, `/app/notas` cortam em 200/500 sem aviso (`app/app/pedidos/page.tsx:34-40`). |
| **Dependências** | Padrão de paginação por cursor já existe em contatos. |
| **Risco** | Médio: cada tela precisa de paginação de servidor e estado de URL. |
| **Arquivos** | Rotas de listagem + `NexusDataTable`. |
| **Estratégia** | começar pelas 5 telas de maior volume (pedidos, notas, fiscal, clientes, títulos), com contagem declarada. |
| **Validação** | Teste com N+1 itens mostra “carregar mais” e o total correto. |
| **Conclusão** | Nenhuma lista esconde item sem dizê-lo. |

### P1-5 · Rate limit no aceite de convite, recovery code e MFA

| Campo | Conteúdo |
|---|---|
| **Impacto** | Força bruta em código de recuperação e convite; o `AGENTS.md` afirma cobertura que não existe. |
| **Evidência** | `AUTH_LIMITS.invite_accept` nunca chamado (`rate-limit.ts:140` vs `acceptInvite.ts:25`); `useRecoveryCode.ts:55-101` e `verifyMfa.ts` sem throttle. |
| **Dependências** | Nenhuma. |
| **Risco** | Baixo; limites generosos (60/h convite, 10/15min recovery). |
| **Arquivos** | `app/actions/team/acceptInvite.ts`, `app/actions/auth/useRecoveryCode.ts`, `verifyMfa.ts`. |
| **Estratégia** | Chamar `authRateLimited` nos três; corrigir a linha do `AGENTS.md`. |
| **Validação** | Testes unitários de limite; e2e de convite/MFA verde. |
| **Conclusão** | Documento e código dizem a mesma coisa. |

### P1-6 · Webhook do WAHA sem assinatura obrigatória

| Campo | Conteúdo |
|---|---|
| **Impacto** | Payload forjado entra como mensagem real se a rota for alcançável. |
| **Evidência** | `WAHA_WEBHOOK_REQUIRE_SIGNATURE` default `false` (`lib/waha/webhook-auth.ts:15-27`); mitigado por a rota global não estar no Caddy. |
| **Dependências** | WAHA Plus configurado com HMAC. |
| **Risco** | Alto se o operador não configurar — por isso o default precisa de instrução explícita no update. |
| **Arquivos** | `lib/waha/webhook-auth.ts`, `install.sh`/`.env.example`. |
| **Estratégia** | Default `true` em produção, com erro instrutivo e caminho de exceção documentado. |
| **Validação** | Teste com assinatura ausente → 401; com assinatura válida → 200. |
| **Conclusão** | Fail-closed por padrão, com instrução para quem usa WAHA Core. |

### P1-7 · SSRF: guard do raio-x e avatar de contato

| Campo | Conteúdo |
|---|---|
| **Impacto** | Busca de site e avatar podem alcançar rede interna. |
| **Evidência** | `lib/prospeccao/raio-x-site.ts:90-176` tem tabela mais frouxa que `outbound-ip.ts`; `cron/contact-avatars/route.ts:168` usa URL do payload sem reconstrução de host. |
| **Dependências** | Guard canônico já existe. |
| **Risco** | Baixo. |
| **Arquivos** | `lib/prospeccao/raio-x-site.ts`, `app/api/v1/cron/contact-avatars/route.ts`. |
| **Estratégia** | Reusar `outbound-ip` e reconstruir a URL sobre host confiável. |
| **Validação** | Testes com IP privado/metadata → recusa. |
| **Conclusão** | Um único guard, sem tabela paralela. |

### P1-8 · `audit` fire-and-forget

| Campo | Conteúdo |
|---|---|
| **Impacto** | Ação administrativa pode acontecer sem trilha. |
| **Evidência** | `void audit(...)` em ~40 sites (`app/app/ai/agents/_actions.ts:86`, `app/api/auth/signout/route.ts:35`). |
| **Dependências** | Nenhuma. |
| **Risco** | Baixo; o audit já tolera falha. |
| **Arquivos** | Rotas administrativas e ações de mutação. |
| **Estratégia** | `await` nas mutações sensíveis (admin, dinheiro, LGPD) e manter fire-and-forget só em telemetria. |
| **Validação** | Teste de rota admin com audit aguardado. |
| **Conclusão** | Nenhuma mutação sensível sem trilha gravada. |

### P1-9 · Flywheel sem claim

| Campo | Conteúdo |
|---|---|
| **Impacto** | Duas réplicas julgam o mesmo turno a cada 6 h — custo de IA duplicado. |
| **Evidência** | `lib/agent-engine/flywheel/live.ts:33-44` sem claim nem filtro de “já julgado”. |
| **Dependências** | Tabela de vereditos já idempotente. |
| **Risco** | Baixo. |
| **Arquivos** | `flywheel/live.ts`. |
| **Estratégia** | `FOR UPDATE SKIP LOCKED` ou unique por (dataset, trace). |
| **Validação** | Teste com dois workers: 1 veredito. |
| **Conclusão** | Julgamento único por turno. |

### P1-10 · Acessibilidade: WCAG 2.2 e foco

| Campo | Conteúdo |
|---|---|
| **Impacto** | Usuário de teclado/leitor fica preso em diálogo e não alcança alvo de 24px. |
| **Evidência** | axe usa tags 2.0/2.1 e roda só na main; nenhum `FocusTrap`/`aria-modal`; sem reflow. |
| **Dependências** | Nenhuma. |
| **Risco** | Baixo. |
| **Arquivos** | `tests/e2e/axe-*.spec.ts`, `components/nexus-ui/**`. |
| **Estratégia** | tags `wcag22aa` + `target-size`, gate no smoke, foco preso no diálogo de confirmação, teste de reflow 200%. |
| **Validação** | axe sem `violations` serious/critical nas 8 telas + diálogo. |
| **Conclusão** | Norma 2.2 cobrada no PR. |

### P1-11 · Marca e domínio do shell mobile

| Campo | Conteúdo |
|---|---|
| **Impacto** | O produto é revendido; um clone do repo builda o app com o nome e o domínio de OUTRO cliente. |
| **Evidência** | `capacitor.config.ts` (`appName: "Bill Higiene"`), `mobile/index.html:6,15`, `mobile/src/shell.ts:26`, `android/.../strings.xml:3-6`. |
| **Dependências** | Build mobile por env. |
| **Risco** | Baixo em código; médio no artefato (o build atual do dono precisa passar as envs). |
| **Arquivos** | `capacitor.config.ts`, `mobile/`, `android/`, `mobile/vite.config.ts`. |
| **Estratégia** | nome/id/URL por variável de build, com default neutro; varredura de marca passa a cobrir `mobile/` e `android/`. |
| **Validação** | `pnpm mobile:build` com env de teste gera nome/URL diferentes; `branding.test` verde. |
| **Conclusão** | Nenhum nome de revendedor no código distribuído. |

### P1-12 · Índices para os filtros que varrem tabela

| Campo | Conteúdo |
|---|---|
| **Impacto** | Relatório e financeiro ficam lentos conforme a base cresce. |
| **Evidência** | `commercial_orders` sem índice para faixa de `total_cents`; `messages` sem `(org, contact_id, sent_at)` — flywheel filtra por isso. |
| **Dependências** | Migration + baseline + MANIFEST. |
| **Risco** | Baixo (índice novo), custo de escrita pequeno. |
| **Arquivos** | `supabase/migrations/*`, `supabase/baseline.sql`, `MANIFEST.md`. |
| **Estratégia** | Medir `EXPLAIN` antes/depois; criar só os dois com uso comprovado. |
| **Validação** | `pnpm test:db` + plano sem seq scan. |
| **Conclusão** | Consultas medidas antes e depois, com número no PR. |

---

## P2 — consistência e operação

### P2-1 · Avisos `fora_da_carga` acumulam sem fechar
- **Impacto:** 121 cartões abertos escondem o que exige ação hoje.
- **Evidência:** consulta em produção (17/11): 121 abertos, de 09/11 a 17/11, todos `faturado`.
- **Dependências:** regra escrita do que resolve o aviso (entrar em carga, entregar, cancelar).
- **Risco:** baixo — fechar aviso não muda pedido.
- **Arquivos:** gerador do aviso, `operational_alerts`, central de avisos.
- **Estratégia:** auto-resolver na transição; ação em massa na central; teto por tipo.
- **Validação:** consulta com 0 avisos órfãos após a transição; e2e da central.
- **Conclusão:** aviso fecha quando o fato deixa de existir.

### P2-2 · Densidade e telas com cinco gráficos
- **Impacto:** leitura cansativa; dois lugares para a mesma informação.
- **Evidência:** só a densidade Aerada (`globals.css:102-106`); `_indicadores.tsx` com 5 gráficos.
- **Dependências:** decisão de produto sobre densidade por tela.
- **Risco:** baixo.
- **Arquivos:** `app/globals.css`, `app/app/indicadores/_indicadores.tsx`.
- **Estratégia:** um gráfico primário por tela; secundários atrás de detalhe.
- **Validação:** e2e visual 390/1440.
- **Conclusão:** regra de densidade aplicada onde dói, com prova visual.

### P2-3 · Conciliação sem link e com chave instável
- **Impacto:** divergência não leva ao título que a causou.
- **Evidência:** `financeiro/_client.tsx:501-502` (`key={i}`, `receivable_id` sem link).
- **Dependências:** rota de detalhe do título já existe.
- **Risco:** baixo.
- **Arquivos:** `app/app/financeiro/_client.tsx`.
- **Estratégia:** link por `receivable_id`; chave estável.
- **Validação:** teste de render da tabela.
- **Conclusão:** toda linha de conciliação abre o título.

### P2-4 · Inbox sem prioridade, SLA, macros, presença e reenvio
- **Impacto:** atendente não sabe o que vem primeiro e não recupera envio falho.
- **Evidência:** relatório 5.4 (`inbox` sem SLA/prioridade/macros/presença/reenvio).
- **Dependências:** decisão de produto (SLA por canal? macros por equipe?).
- **Risco:** médio — mexe na fila.
- **Arquivos:** `components/inbox/**`, rotas de conversas.
- **Estratégia:** começar por **reenvio** (defeito com recuperação) e prioridade explícita.
- **Validação:** e2e de reenvio e de ordenação.
- **Conclusão:** envio falho tem caminho de volta na tela.

### P2-5 · “Potencial” do Radar sem regra escrita
- **Impacto:** número com nome de promessa sem definição no repositório.
- **Evidência:** soma de ticket médio (`radar-score.ts:188`); tooltip explica, doc não.
- **Dependências:** nenhuma.
- **Risco:** baixo.
- **Arquivos:** `docs/business-rules/`, `lib/comercial/radar-score.ts`.
- **Estratégia:** escrever a regra e vinculá-la ao teste que já existe.
- **Validação:** doc + teste citando a regra.
- **Conclusão:** número tem definição escrita.

### P2-6 · Catálogos globais com `GRANT ALL` a `anon`
- **Impacto:** superfície desnecessária para papel anônimo.
- **Evidência:** `baseline.sql:4022-4033`.
- **Dependências:** nenhuma.
- **Risco:** baixo (só SELECT é usado).
- **Arquivos:** `supabase/baseline.sql`, migration.
- **Estratégia:** revogar e conceder `SELECT`.
- **Validação:** invariante de grants.
- **Conclusão:** `anon` só lê.

### P2-7 · `public-paths` por prefixo sem âncora
- **Impacto:** rota nova nasce sem auth de borda.
- **Evidência:** `public-paths.ts:11-13`.
- **Dependências:** nenhuma.
- **Risco:** baixo.
- **Arquivos:** `lib/auth/public-paths.ts`.
- **Estratégia:** âncora por rota; teste que lista as rotas públicas.
- **Validação:** `public-paths` test verde.
- **Conclusão:** toda rota pública é explícita.

### P2-8 · Semana da Agenda em 390
- **Impacto:** sete colunas de ~46px são ilegíveis no celular.
- **Evidência:** `GradeDaAgenda.tsx:959-974`.
- **Dependências:** nenhuma.
- **Risco:** baixo.
- **Arquivos:** `app/app/agenda/**`.
- **Estratégia:** visão Dia abaixo de `sm`, com alternância.
- **Validação:** e2e em 390.
- **Conclusão:** agenda utilizável no celular.

### P2-9 · `select("*")` em 20 rotas
- **Impacto:** campos que a tela não usa viajam e ampliam PII.
- **Evidência:** relatório 8.1 (`leads/_handler.ts:369`, `automation-rules/route.ts:28`).
- **Dependências:** nenhuma.
- **Risco:** baixo.
- **Arquivos:** handlers citados.
- **Estratégia:** listar colunas por consumidor.
- **Validação:** testes existentes de contrato.
- **Conclusão:** resposta só com o que a tela lê.

### P2-10 · Equipe sem guarda de página
- **Impacto:** viewer vê a lista de membros e e-mails.
- **Evidência:** `team/page.tsx:42` (guarda só a gestão).
- **Dependências:** decisão de produto sobre ver colegas.
- **Risco:** baixo.
- **Arquivos:** `app/app/team/page.tsx`.
- **Estratégia:** guardar por papel conforme a decisão; esconder e-mail se não for para ver.
- **Validação:** e2e por papel.
- **Conclusão:** comportamento declarado e testado.

---

## P3 — capacidades ausentes (exigem decisão de produto)

### P3-1 · iOS
- **Impacto:** quem usa iPhone não tem app; o PWA instala sem ícone próprio.
- **Evidência:** sem `ios/` e sem `@capacitor/ios`; `app/manifest.ts` sem `apple-touch-icon`.
- **Dependências:** decisão de suportar iOS; conta Apple; assinatura.
- **Risco:** alto (provisioning/App Store).
- **Arquivos:** `capacitor.config.ts`, `ios/`, `app/apple-icon.tsx`.
- **Estratégia:** `cap add ios` + ATS + ícones; ou declarar “não suportado” no produto.
- **Validação:** build em simulador + instalação.
- **Conclusão:** suporte real ou ausência declarada.

### P3-2 · Criar template no canal oficial
- **Impacto:** o operador não consegue criar template pela tela.
- **Evidência:** rota só sincroniza; `canManageTemplates` diz que sim.
- **Dependências:** API do provedor.
- **Risco:** médio.
- **Arquivos:** `channels/templates`, `capabilities.ts`.
- **Estratégia:** implementar ou corrigir a capability.
- **Validação:** teste de capability + e2e.
- **Conclusão:** capacidade e UI dizem a verdade.

### P3-3 · `sticker` e `location`
- **Impacto:** dois tipos aceitos pelo schema caem como documento.
- **Evidência:** adapters sem branch.
- **Dependências:** suporte do transporte.
- **Risco:** baixo.
- **Arquivos:** `lib/channels/adapters/*`.
- **Estratégia:** implementar ou recusar com mensagem clara.
- **Validação:** teste por tipo.
- **Conclusão:** nenhum tipo vira arquivo por acidente.

### P3-4 · Consentimento no Customer 360
- **Impacto:** quem atende não vê a base legal nem a preferência.
- **Evidência:** `consent` buscado e não renderizado (`_handler.ts:30`).
- **Dependências:** decisão de exibição.
- **Risco:** baixo.
- **Arquivos:** `app/app/contacts/[id]/**`.
- **Estratégia:** bloco de consentimento/preferências na ficha.
- **Validação:** e2e da ficha.
- **Conclusão:** consentimento visível onde se atende.

### P3-5 · Token de API sem expiração padrão
- **Impacto:** credencial imortal.
- **Evidência:** `lib/schemas/team.ts:113`.
- **Dependências:** política de rotação.
- **Risco:** médio (quebra integração que não rotaciona).
- **Arquivos:** schema, tela de tokens.
- **Estratégia:** default de 90 dias com aviso.
- **Validação:** teste de criação.
- **Conclusão:** token novo expira por padrão.

### P3-6 · Billing placeholder no menu
- **Impacto:** menu promete uma tela que não cobra nada.
- **Evidência:** `billing/page.tsx:37`; `registry.ts:986-993`.
- **Dependências:** decisão de self-host × assinatura.
- **Risco:** baixo.
- **Arquivos:** menu, tela.
- **Estratégia:** esconder ou rotular “não disponível no self-host”.
- **Validação:** e2e de menu.
- **Conclusão:** menu não promete o que não existe.

### P3-7 · Tela de atualização ignora revogação/AAL2
- **Impacto:** admin revogado ainda vê a tela de update.
- **Evidência:** `atualizacao/page.tsx:16` lê o snapshot.
- **Dependências:** nenhuma.
- **Risco:** baixo.
- **Arquivos:** `settings/atualizacao/page.tsx`, `system/version/route.ts`.
- **Estratégia:** usar o guard canônico de platform admin.
- **Validação:** teste por papel/AAL.
- **Conclusão:** mesma régua do `/admin`.

### P3-8 · `/vitrine-agenda` atrás de login
- **Impacto:** página de divulgação pede login.
- **Evidência:** ausente de `public-paths.ts`.
- **Dependências:** decisão de exposição.
- **Risco:** baixo.
- **Arquivos:** `lib/auth/public-paths.ts`.
- **Estratégia:** tornar pública com rate limit.
- **Validação:** acesso anônimo no e2e.
- **Conclusão:** vitrine abre sem sessão.

### P3-9 · Tela de run trace
- **Impacto:** mesmo com o dado persistido (P0-4), falta a tela.
- **Evidência:** `RunTrace.tsx:22` só mostra tools.
- **Dependências:** P0-4.
- **Risco:** baixo.
- **Arquivos:** `app/app/ai/**`.
- **Estratégia:** ler a trilha e mostrar entrada/contexto/fontes/saída.
- **Validação:** e2e do run.
- **Conclusão:** auditoria de IA pela tela.

### P3-10 · Presença/typing do atendente
- **Impacto:** dois atendentes na mesma conversa sem sinal.
- **Evidência:** relatório 5.4 (não existe no modelo).
- **Dependências:** realtime de presença.
- **Risco:** médio.
- **Arquivos:** `components/inbox/**`, realtime.
- **Estratégia:** presença por conversa via canal existente.
- **Validação:** e2e com duas sessões.
- **Conclusão:** quem atende vê quem está ali.

---

## O que NÃO fazer

- **Não** ampliar escopo de P0 com refactor: os cinco itens acima fecham exposição.
- **Não** virtualizar lista antes de paginar no servidor (P1-4) — virtualizar 5.000
  linhas já buscadas não resolve a origem.
- **Não** trocar densidade por “compacta em tudo”: a regra escrita
  (`docs/design-system/04-density-aerada.md`) é a referência.
- **Não** anunciar iOS, SLA de inbox ou templates até P3-1/P2-4/P3-2 existirem.
