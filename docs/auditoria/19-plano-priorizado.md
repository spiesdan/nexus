# Plano priorizado — 115 pendências da Parte 2 (Fase 10, itens 10.1 e 10.6)

> **O que este documento é.** A fila executável do `PROMPT-MESTRE-AAA.md`: cada item
> da Parte 2 que ainda não está `[x]`, classificado por prioridade (Fase 10), com
> impacto, evidência, dependência, risco, arquivos, estratégia, validação e critério
> de conclusão. Ele **não substitui** o prompt mestre — a marca de estado continua
> vivendo lá. Aqui está o *porquê da ordem* e o *como fechar cada um*.
>
> **Regra de honestidade.** Número neste documento é o medido na auditoria, com a data
> e o instrumento citados. Onde não há medida, está escrito "não medido". Onde a
> execução depende de decisão de produto, dispositivo real ou conta externa, o item
> está `[!]` com a pergunta exata — não `[x]`.
>
> **Régua de prioridade** (prompt, Fase 10):
>
> | P | Critério |
> |---|---|
> | **P0** | segurança, perda/corrupção de dados, isolamento multi-tenant, operação crítica, bloqueio de deploy |
> | **P1** | jornada central (CRM, vendas, inbox, pedidos, mobile), erro sem recuperação, acessibilidade grave |
> | **P2** | consistência visual, densidade, tabelas, navegação, relatórios, automações |
> | **P3** | capacidade nova confirmada ausente, conveniência, documentação de contexto |
>
> **Como cada item fecha** (uma das três, nunca "declarado"):
> 1. **evidência medida** — comando/arquivo/captura/teste citado no prompt;
> 2. **PR de correção** — um PR por correção de código, com gate e fragmento `.changes/`;
> 3. **`[!]` com causa e impacto** — quando exige decisão do dono, dispositivo real
>    (leitor de tela, APK Android, iOS), conta externa (Google/WhatsApp) ou é grande
>    demais para uma fatia. Bloqueio não é desistência: é a pergunta certa escrita.

---

## 1. Resumo da fila

| Prioridade | Itens | O que domina |
|---|---|---|
| **P0** | 7 | F-09 (cadeia de migrations), F-17 (73 tabelas sem prova de isolamento), 6.3 (service-role sem gate), 8.1/8.2 (segurança), 6.A3 (idempotência financeira), 10.2 |
| **P1** | 53 | jornadas J3/J6/J8/J13/J14/J16, medições 2.6–2.15, módulos 5.1–5.11, API/banco 6.2/6.5–6.10, mobile 7.1–7.12 + 7.A1–A4, segurança 8.3–8.5, testes 9.4/9.6/9.7/9.8, D1–D11 |
| **P2** | 15 | design system 3.1–3.16, shell 4.1–4.6/4.A1/4.A3, snapshots visuais 9.5 |
| **P3** | 40 | contexto C4–C12, referências P1–P7, inventário fino 1.2/1.5/1.10/1.11/1.D3, execução 10.3–10.5, D3 |
| **Total** | **115** | — |

Três itens já foram atacados nesta rodada e estão referenciados na Parte 2:
F-28 (PR #447), F-30 (6.5) e F-32 (6.9/9.8). Eles aparecem aqui com a marca atual
(`[~]`) e o plano de fechamento.

---

## 2. P0 — segurança, dados, isolamento, operação

| Item | Impacto se ficar aberto | Evidência medida / dependência | Risco da correção | Arquivos | Estratégia | Validação e critério de conclusão |
|---|---|---|---|---|---|---|
| **F-09** (1.5, 6.6, L6) | **Deploy por migrations aplica schema parcial**: 35 de 292 aplicam, 257 falham por pré-requisito, 10 são stubs `SELECT 1;`. Quem usar `supabase db push` fica com schema incompleto e migrations marcadas como aplicadas. | Medido em 16/11/2026 (`12-migrations-e-rls.md` §2): 35 ok / 257 falhas; 71 objetos distintos ausentes; 257 de 257 citam objeto que existe no `baseline.sql`; causa raiz nos 10 stubs. **Depende de decisão do dono**: reescrever histórico × documentar cadeia como não-executável. | Alto: reescrever 257 migrations pode quebrar instalações; "consertar" stubs em massa inventa schema que ninguém aplicou. | `supabase/migrations/*.sql`, `supabase/baseline.sql`, `scripts/auditoria/replay-migrations.sh`, `docs/doctrine/versionamento.md` | **Fatiar**: (a) diagnóstico e recomendação escrita (`20-f09-estrategia.md`); (b) bloquear o caminho errado — `db:migrate` já aplica o baseline, falta um guarda que reprove `supabase db push`/cadeia em CI e doc de operação; (c) só depois, com decisão, reconstruir a cadeia como histórico replayável. | (a) doc com estratégia e custo por opção + aviso ao dono no Discord; (b) gate que falha se o caminho da cadeia for usado como instalação. **Não** fecha como `[x]` enquanto a decisão (b′) não existir. |
| **F-17** (6.3, L7) | **73 tabelas tenant-aware sem prova comportamental** de isolamento. RLS ligada + policy presente não é isolamento (já houve policy `... or true` viva). | Medido em 17/11/2026 (`rls-completude-varredura.test.ts`): 96 tabelas provadas, **73 em `DEBITO_CONHECIDO`**. Cada tabela exige seed próprio (colunas NOT NULL + FKs), por isso não há varredura genérica possível. | Médio: teste mal semeado prova vacuidade (controle positivo exigido) ou falsa segurança. | `tests/invariants/rls-isolation.test.ts`, `tests/invariants/rls-completude-varredura.test.ts`, `tests/invariants/gov-helpers.ts` | **Fatiar por risco de dado**: (1) PII/segredo (`ai_provider_credentials`, `channel_sessions`, `api_tokens`, `lgpd_requests`, `tenant_integrations`, `message_templates`, `crm_*`, `orders`, `llm_calls`) — teste comportamental real com seed; (2) tabelas operacionais — idem; (3) remover a linha de `DEBITO_CONHECIDO` **só** quando o teste existir. | Cada tabela movida de `DEBITO_CONHECIDO` para `TABLES`/`PROVA_PROPRIA` com `pnpm test:db` verde e controle positivo ≥1. Fecha quando a lista de débito estiver vazia; o número medido entra na Parte 2. |
| **6.3** (L2) | **209 de 417 handlers** citam `createAdminClient`/service role sem gate automático de `organization_id` — service role bypassa RLS. | Medido no catálogo (`06-apis.md`, `catalogo-de-apis.json`). Depende de revisão handler a handler. | Alto: gate estático mal desenhado vira catraca que ninguém consegue cumprir ou ruído ignorado. | `tests/unit/*service-role*`, `lib/supabase/admin.ts`, `app/api/v1/**` | **Fatiar**: (1) gate de catraca que congela a lista de handlers com service role e exige `organization_id` explícito em toda query nova; (2) reduzir a lista por módulo, começando por leitura cross-tenant (relatórios, usage, export). | Gate novo verde com lista medida (baseline do número), e cada PR seguinte reduz a lista. Item só fecha com a lista em 0 ou com justificativa por handler (webhook/cron que não tem org de origem). |
| **8.1** (Fase 8) | Auditoria de segurança incompleta: authn/sessão/MFA/authz/RLS/secrets/CORS/CSRF/XSS/SSRF/upload/webhooks/rate limits/dependências/logs/IA/multi-tenancy. | Já medido e corrigido: `pnpm audit --prod` 1 crítica/7 altas/20 moderadas → **0/1/1** (PR #446); rate limit e webhook HMAC auditados em `11-auditoria-visual.md` §8. **Não medido**: CORS, CSRF fora das Server Actions, SSRF em fetch de URL do usuário, upload. | Médio: achado de segurança sem exploração comprovada vira ruído; exploração não pode ser testada em produção. | `docs/auditoria/19-fase-8-*`, `app/api/**`, `lib/**` | Auditar por superfície e registrar achado com severidade; corrigir o que tiver PoC local; o resto, `[!]` com causa. | Relatório com matriz superfície × achado × estado; nenhum `critical` aberto sem `[!]` justificado. |
| **8.2** | Limites de exposição de dados e segurança administrativa: impersonação, suspensão, export, tokens. | Parcialmente auditado em `17-modulos-5.4-5.11.md` (impersonação/suspensão auditadas; scope e tenant suspenso abertos). | Médio: mudar autorização administrativa sem decisão de produto. | `app/api/v1/admin/**`, `lib/auth/**`, `docs/threat-model.md` | Fechar os dois abertos nomeados (scope de impersonação, tenant suspenso); medir export/LGPD. | Teste de rota por achado + `docs/threat-model.md` atualizado. |
| **6.A3** | Operações externas/financeiras sem idempotência provada: `Idempotency-Key` em **2** rotas. | Medido: 2 rotas (`lgpd/.../approve`, `financeiro/.../pagamentos`); contratos de criação prometem mais. | Alto: idempotência mal aplicada rejeita retry legítimo; chave sem escopo vaza entre tenants. | `lib/api/idempotency*`, `app/api/v1/financeiro/**`, `app/api/v1/fiscal/**`, `app/api/v1/commercial-orders/**` | Aplicar o helper existente nas rotas financeiras/fiscais de criação, uma por PR, com escopo por org + ator. | Teste de dois POSTs com a mesma chave → 1 efeito; teste de chave de outra org → recusa. |
| **10.2** | Item guarda-chuva do P0 no prompt. | Depende dos seis acima. | — | `PROMPT-MESTRE-AAA.md` | Marcar `[x]` só quando F-09/F-17/6.3/8.1/8.2/6.A3 estiverem fechados ou `[!]` com decisão registrada. | Estado dos seis refletido na Parte 2. |

---

## 3. P1 — jornadas, API, mobile, testes

### 3.1 Jornadas (J3, J6, J8, J13, J14, J16)

| Item | Impacto | Evidência / dependência | Estratégia | Validação / conclusão |
|---|---|---|---|---|
| **J3** captura/qualificação/atribuição de lead | Falha em 1 de 15 passos medidos (14/15). | `13-jornadas.md`; spec que falha nomeada lá. | Corrigir o passo que falha ou declarar o motivo. | Spec verde ou `[!]` com causa. |
| **J6** inbox (receber/atribuir/responder/encaminhar/encerrar) | 7/9 — 2 falhas abertas na jornada central. | `13-jornadas.md`. | Reproduzir as 2 falhas, corrigir com teste. | Specs verdes. |
| **J8** agente (criar/publicar/pausar/rollback/testar/avaliar) | 39 ✓, 4 pulados — avaliação/rollback sem prova completa. | `13-jornadas.md`. | Escrever os 4 passos que faltam com fixture. | 4 verdes ou `[!]` por dependência de provedor de IA. |
| **J13** fiscal e falhas de sincronização | 3/4 — 1 falha. | `13-jornadas.md`. | Corrigir e cobrir a falha no gate. | Verde. |
| **J14** import/export, LGPD, auditoria | 2/4 — 1 falha, 1 pulado. | `13-jornadas.md`. | Fechar os dois com fixture sintética. | Verde. |
| **J16** pedido offline (fila/sync/conflito/rejeição) | **Sem spec no `full`** — `mobile-offline` roda só no job `apk-debug`. | `13-jornadas.md`; depende de Android/emulador. | Ou roda a spec no CI web, ou `[!]` por dispositivo. | Spec no `full` verde, ou `[!]` com causa. |

### 3.2 Medições da Fase 2 (2.6–2.15)

| Item | O que falta | Estratégia | Conclusão |
|---|---|---|---|
| **2.6** cliques/digitação | Inbox e demais jornadas não medidas. | `esforco-da-tarefa.mjs` nas jornadas restantes. | Números por tarefa, com régua e data. |
| **2.7** busca/ordenação/filtros/paginação | Ordenação por coluna e seleção em massa fora de Pedidos; filtro não vai para a URL (decisão). | Medir ordenação/seleção; decisão de URL documentada. | Medição + decisão registrada. |
| **2.9** estados | Offline de escrita não medido. | Rodar `offline-e-erro.mjs` com escrita e retorno. | Evidência por estado, incluindo escrita offline. |
| **2.10** feedback/duplicidade | Nenhum teste com clique duplo; `Idempotency-Key` em 1 rota na medição. | Teste de duplo clique e retry. | Evidência de 1 efeito por clique. |
| **2.11** a11y | Leitor de tela real (NVDA/VoiceOver) não rodado. | Rodar leitor real em 3 telas. | Evidência ou `[!]` por dispositivo. |
| **2.14** idioma/moeda/data/fuso | `toFixed(2)`/`Intl.NumberFormat` manuais (33 usos) sinalizados, não corrigidos; formato de data nativo (V-04) é decisão. | Gate que exige `comoMoeda`; V-04 vai para decisão. | Gate verde + decisão escrita. |
| **2.15** desempenho | Custo de render dos gráficos por canvas; INP de campo (CrUX). | Perfilar gráfico; CrUX depende de tráfego real. | Números medidos ou `[!]` por dado indisponível. |

### 3.3 Módulos 5.1–5.11

Cada módulo já tem auditoria medida em `16`, `17` e `18-modulos-*.md`; o que falta é
o **conserto dos achados abertos** de cada um. Estratégia comum: um PR por achado
P0/P1 do módulo, com gate; achados de produto viram `[!]` com a pergunta.

| Item | Achados abertos nomeados na auditoria | Prioridade interna |
|---|---|---|
| **5.1** público/login/onboarding/legal | saúde do Google e semana em 390 (do 5.2); declaração de conexão já corrigida | P1 |
| **5.2** dashboard/meu dia/busca/agenda | saúde do Google, semana em 390 | P1 |
| **5.3** contatos/leads/funis/360 | — (duplicata, mesclados e vazamento já corrigidos) | fechar com evidência |
| **5.4** inbox/atendimento/campanhas | prioridade, SLA, macros, presença, reenvio | P1 |
| **5.5** radar/prospecção/recuperação/inteligência | explicação do score | P2 (decisão de produto) |
| **5.6** pedidos/estoque/compras/expedição | A2–A16 abertos com severidade | P0/P1 conforme severidade (A1 já corrigido) |
| **5.7** financeiro/títulos/comissões | — (mês no fuso, baixa parcial, período já corrigidos) | fechar com evidência |
| **5.8** fiscal | 8 achados, 2 corrigidos | P1 |
| **5.9** IA/agentes/follow-ups | run trace, `audit:run`, eval | P2 |
| **5.10** equipe/config/auditoria/LGPD | tokens/equipe abertos; MFA corrigido | P1 |
| **5.11** admin global | scope de impersonação, tenant suspenso | P1 (segurança) |

### 3.4 API e banco (6.2, 6.5–6.10)

| Item | Falta | Estratégia | Conclusão |
|---|---|---|---|
| **6.2** contratos | Schema de resposta por rota. | Gerar catálogo de resposta a partir dos tipos exportados. | Catálogo com 100% das rotas JSON. |
| **6.5** limites/paginação | **80 GETs sem teto**; F-30. | PR F-30: `enrollments` paginado com sinal de truncamento + `/admin/usage` sem baixar linhas para contar. Depois, os demais por ordem de crescimento. | Número de GETs sem teto cai com gate; F-30 fecha. |
| **6.6** migrations/rollback | Reversibilidade e rollback não auditados. | Escrever plano de rollback por tipo de migration; testar o do baseline. | Runbook de rollback + teste. |
| **6.7** estratégia de migração | Cadeia não reproduz (F-09). | Depende de F-09. | Ver F-09. |
| **6.8** documentação de dados | 104 de 180 tabelas sem `COMMENT ON TABLE`. | Migration aditiva com comentários + baseline + MANIFEST. | 180/180 com comentário. |
| **6.9** backup/restore/health | F-32: ensaio de restore, uploads, rotação. | Ensaio descartável (Docker): install → seed → backup → apagar → restore → health; incluir storage no backup; retenção. | Evidência bruta + `test:shell` estendido. |
| **6.10** SLIs/logs | Sem SLIs/SLOs com meta. | Definir 4 SLIs com fonte de dado já existente (health, worker, erro 5xx, latência). | Documento com SLI/SLO e consulta. |

### 3.5 Mobile/offline (7.1–7.12, 7.A1–A4)

Toda a frente depende de **dispositivo/emulador Android** para a parte nativa. O que
dá para fechar sem aparelho: 7.1 (já medido em 6 larguras), 7.2 (zoom/rotação/teclado
medidos; safe areas não), 7.4 (matriz documentada), 7.7 (medido), 7.10 (parametrização
— corrigir o domínio fixo do shell), 7.12 (iOS confirmado ausente). O resto vira `[!]`
com a causa "exige APK/emulador" até haver decisão de rodar Android no CI.

### 3.6 Segurança/performance/a11y (8.3–8.5)

| Item | Falta | Estratégia |
|---|---|---|
| **8.3** baseline | queries lentas, bundle por rota, imagens/fontes, workers | medir com `EXPLAIN` e `next build` já instrumentado |
| **8.4** otimizar | só com baseline → gargalo → resultado | aplicar nas 2 maiores (Inbox 386 KB gz; `gpt-tokenizer` 1007 KB) |
| **8.5** WCAG | axe em 8 telas, sem foco em diálogo nem reflow | 9.6 expande axe; foco em diálogo e reflow viram gate |

### 3.7 Testes (9.4, 9.6, 9.7, 9.8)

| Item | Falta | Estratégia |
|---|---|---|
| **9.4** jornadas | 7 falhas abertas (ver J3/J6/J8/J13/J14) | fechar por jornada |
| **9.6** a11y | axe em **8 de 100** specs | expandir para as 7 telas nomeadas + corrigir critical/serious |
| **9.7** mobile | fila local/conflito sem teste | depende de emulador → `[!]` ou teste de unidade do sincronizador |
| **9.8** operação | F-32 | ensaio de restore (item 6.9) |

### 3.8 Definition of Done D1–D11

D1, D2, D4, D5, D6, D7, D9, D10, D11 são **agregadores**: fecham quando os itens que
os compõem fecharem. D8 e D12 já estão `[x]`. D3 (classificar toda capacidade nos 7
estados) é P3 e fecha com o inventário classificado.

---

## 4. P2 — visual, design system, navegação

| Item | Falta | Estratégia | Conclusão |
|---|---|---|---|
| **3.1** identidade | revisão contra produto/marca real | usar `marca-propria` como fonte e revisar telas | decisão registrada |
| **3.4** aliases semânticos | aliases de gráfico/overlay incompletos | auditar tokens no CSS | lista de aliases completa |
| **3.7** tipografia | `next/font/google` é risco de build sem rede (C10) | self-host das fontes | build offline verde |
| **3.10** raios | 6/10/14 parcial | normalizar por componente | gate de classes |
| **3.13** ícones | tamanho/traço não normalizados | inventário de ícones | regra única |
| **3.14** densidade | só "Aerada" | implementar densidade compacta | toggle + teste |
| **3.15/3.16** componentes | cobertura parcial | completar por componente com doc | doc por componente |
| **4.1** navegação por papel | parcial | revisar agrupamento com uso real | mapa papel × item |
| **4.4** expandido/recolhido/tablet | parcial | medir 3 estados em 3 larguras | evidência |
| **4.5** deep links/filtros na URL | filtro não vai para URL em 2 telas | decisão + implementação | URL reproduzível |
| **4.6** busca global | parcial | teste por entidade e acesso | matriz |
| **4.A1/A3** entrada/retorno/órfãs | parcial | varrer rotas sem link de volta | 0 órfãs |
| **9.5** snapshots visuais | **zero** `toHaveScreenshot` | 3–5 telas estáveis, claro/escuro, desktop/mobile, animações desligadas | baseline + comando de update |

---

## 5. P3 — contexto, referências, inventário fino

| Item | Falta | Estratégia | Conclusão |
|---|---|---|---|
| **C4/C5/C8/C9** mobile | conteúdo de `mobile/` não auditado; PWA offline; marca no shell; manifest | auditar arquivos e documentar | doc de mobile com evidência |
| **C6** capacidades | Customer 360/Radar/score/automações não auditados por completo | ligar aos módulos 5.x | estado por capacidade |
| **C7** docs antigos | `design-overhaul`/`design-system`/`architecture` com contagens velhas | reconciliar com inventário gerado | doc corrigido |
| **C10** `next/font/google` | risco de build sem rede | self-host (com 3.7) | build offline |
| **C12** licença × README | divergência | conferir `LICENSE` e claims | decisão escrita |
| **P1–P6** referências | 6 produtos não estudados | fichamento por produto, princípios só (sem copiar UI) | 6 fichas |
| **P7** princípios | parcial | consolidar em `03-principios-de-produto.md` | princípios com decisão |
| **R2/R7** | classificação de capacidades e registro vivo | gerar tabela de capacidades × estado | planilha + doc |
| **1.2** subtelas/estados | matriz de sinais, sem execução | abrir subtelas e medir (instrumento existe) | N subtelas medidas |
| **1.5** dados | views/RPCs/filas/índices não classificados | completar inventário gerado | inventário completo |
| **1.10/1.11/1.D3** | campos narrativos por rota; status por célula | preencher com a Fase 2 | matriz preenchida |
| **10.3/10.4/10.5** | guarda-chuvas de P1/P2/P3 | marcar quando as frentes fecharem | — |
| **D3** | toda capacidade nos 7 estados | derivar do inventário + módulos | tabela final |

---

## 6. Ordem de execução (fatias)

1. **Plano** (este documento) — 10.1/10.6.
2. **F-09**: diagnóstico + recomendação + guarda do caminho errado; aviso ao dono.
3. **F-17**: prova comportamental por lote, começando por PII/segredo.
4. **6.3**: gate de catraca do service role.
5. **6.A3**: idempotência nas rotas financeiras de criação.
6. **F-30** (6.5), **F-32** (6.9/9.8), **9.6**, **9.5**.
7. Jornadas J3/J6/J8/J13/J14; medições 2.6–2.15; módulos 5.x por achado.
8. P2 e P3.

Cada fatia entra como PR próprio, com `typecheck`, `lint`, testes pertinentes,
`release:conferir` e `verificar-prompt`; a Parte 2 recebe a marca e a evidência, e o
canal de atualizações recebe o marco.

---

## 7. Registro de execução desta fila

| Data | Item | Estado | Evidência |
|---|---|---|---|
| 17/11/2026 | Plano priorizado (10.1/10.6) | **feito** | este arquivo |

> As linhas seguintes são acrescentadas a cada fatia fechada — com link de PR,
> comando medido e arquivo de evidência. Item sem linha aqui não foi executado.
