# Frente `front/sentinel` — Nexus Sentinel v1.3 (observabilidade)

> Worktree: `/private/var/folders/.../T/opencode/aaa-front-sentinel` · branch `front/sentinel-v13`
> Baseline desta fatia: `nexus/main` @ `9ede1d6b` (v1.1 em `2116db86`, prova em `05570d11`, v1.2 em `9ede1d6b`; a `main` anda — reconfira com `git rev-parse nexus/main` antes do PR)
> Escopo: **v1 + v1.1 + v1.2 + v1.3** — observar, recomendar, medir a rodada e executar **uma** correção de manutenção após aprovação humana, com antes/depois e reversão honesta.

## 1. O que o Sentinel é (e o que deliberadamente não é)

O Sentinel é uma função do produto: ele observa as entidades que **existem** no
Nexus, encontra inconsistências determinísticas e abre uma ocorrência com
evidência, causa provável e severidade. A decisão continua humana.

Nesta versão **não há**:

- emissão, reemissão, cancelamento ou inutilização de NF-e;
- alteração de saldo, pagamento, cobrança ou envio externo;
- uso de IA para decidir. A IA não participa da detecção; uma eventual
  explicação futura não pode derrubar o motor determinístico;
- endpoint genérico de "executar SQL" ou ferramenta arbitrária.

O único caminho de escrita do produto é `sentinel_*` (o que o Sentinel viu) e o
`api_audit_log` (quem agiu). As tabelas de negócio são lidas, nunca escritas.

## 2. Regras implementadas (35)

### Fiscal (12)

| Regra | Dispara quando | Severidade |
|---|---|---|
| `fiscal.nota_rejeitada` | `invoices.status ∈ {denegada, erro}` | alta |
| `fiscal.rejeicao_repetida` | 3+ notas com o mesmo `sefaz_cstat` de rejeição na mesma série/emitente em 24h (dia UTC) | alta |
| `fiscal.nota_em_emissao_travada` | `em_emissao` há > 30 min | alta |
| `fiscal.nota_pendente_antiga` | `pendente` criada há > 24 h | media |
| `fiscal.nota_sem_vinculo` | autorizada com `order_id` nulo | media |
| `fiscal.nota_sem_chave` | autorizada sem `chave_acesso` | alta |
| `fiscal.nota_duplicada_por_pedido` | 2+ notas **de venda** vivas no mesmo pedido (principal **ou** secundário); `finalidade=4` (devolução) não concorre, como na 0326 | crítica |
| `fiscal.divergencia_valor_nota` | total da nota ≠ **soma de todos os pedidos vinculados** (principal + `invoice_orders`) | alta |
| `fiscal.nota_autorizada_pedido_nao_faturado` | nota autorizada + pedido em rascunho/análise/aprovado | media |
| `fiscal.pedido_com_nf_sem_nota` | `exige_nf` + status avançado sem nota ativa (janela 1 h/24 h) | crítica/alta |
| `fiscal.job_fiscal_travado` | job `processando` > 30 min ou `pendente` atrasado | alta |
| `fiscal.job_retry_excessivo` | 3+ tentativas na mesma nota | media |
| `fiscal.sincronizacao_falhou` | sync fiscal com erro/bloqueio nas últimas 24 h (agrupada por dia) | media/alta |

### Operação, financeiro e campanha (21)

| Regra | Dispara quando | Severidade |
|---|---|---|
| `operacao.estoque_negativo` | saldo < 0 com controle de estoque | alta |
| `operacao.estoque_divergente` | saldo ≠ razão desde 0242; **hipótese** de baixa confiança | baixa |
| `operacao.pedido_total_incoerente` | total ≠ subtotal − desconto + frete | alta |
| `operacao.pedido_preso` | rascunho/em análise sem toque há > 7 dias | media |
| `operacao.pedido_sem_cliente` | pedido avançado sem `contact_id` | media |
| `operacao.pedido_com_nf_sem_documento` | exige NF e sem documento do destinatário | media |
| `operacao.recebivel_sem_origem` | sem pedido, nota e cliente | media |
| `operacao.recebivel_duplicado` | mesmo cliente/valor/vencimento em lançamentos manuais | alta |
| `operacao.recebivel_parcela_invalida` | `parcela_n > total_parcelas` | alta |
| `operacao.mercos_importacao_travada` | `queued/running` há > 45 min | alta |
| `operacao.mercos_importacao_falhou` | `error/partial` nas últimas 24 h | media/alta |
| `operacao.job_fila_travado` | `running` travado, `pending` atrasado, `failed` esgotado ou `dead` | crítica/alta |
| `operacao.webhook_falhas` | `error/dead` nas últimas 24 h (agrupada por dia) | media/alta/crítica |
| `campanha.cidade_invalida` | campanha ativa com cidade vazia/UF fora de 2 letras | media/alta |
| `campanha.cidade_repetida` | mesma cidade repetida no recorte ativo | baixa |
| `operacao.cliente_duplicado_email` | mesmo e-mail normalizado em 2+ clientes ativos | media |
| `operacao.lead_duplicado` | 2+ leads abertos no mesmo funil para o mesmo contato/telefone/e-mail normalizado | media |
| `operacao.correcao_sem_reversao` | correção aplicada cujo job saiu de `pending`/do `run_after` gravado — reversão não é mais honesta | media |
| `operacao.aprovacao_expirada` | ocorrência `aprovada` além da janela de 5 min do plano revisado | baixa |
| `operacao.conversa_claim_parado` | conversa `claimed` há 7+ dias sem mensagem — some da fila sem ninguém ver | media |
| `plataforma.slo_estourado` | disponibilidade <99,5% ou p95 >800 ms nas rotas quentes com ≥100 amostras na janela de 7 dias | media/alta/critica |
| `cadastro.endereco_com_lixo` | `contacts.logradouro/complemento/bairro/cidade` com `NULL`/`undefined`/`NaN` como **palavra** ou só espaços, agrupado por org; `RUA NULLS` não casa | media |

**Falsos positivos evitados de propósito:**

- campanha de prospecção com `cidades: []` é **recuperação** (contatos sem
  recorte geográfico), não erro — a regra não dispara;
- contato tem índice único por telefone; a duplicidade real que sobra é por
  e-mail, e é essa que a view agregada detecta;
- divergência de estoque **é detectada como hipótese**: `inventory_movements`
  não tem saldo de abertura, então a regra só olha produtos criados a partir da
  0242, exige um piso de diferença e nasce com confiança baixa. A 0324 passou a
  incluir produto **sem nenhuma movimentação** (razão vazio × saldo cacheado);
  o plano manda contar fisicamente antes de ajustar e a limitação vai na
  evidência;
- lead duplicado usa a identidade que o produto já normaliza — `contact_id`,
  `phone_number` E.164 e `email_normalized` — com confiança alta para o mesmo
  contato e média para telefone/e-mail entre contatos. Lead sem contato fica de
  fora: não há identidade para comparar.

## 3. Ocorrência, agrupamento e idempotência

- `fingerprint = regra|entidade_tipo|entidade_id` (id de grupo é sha256 quando a
  chave contém PII).
- Índice único **parcial** em `(organization_id, fingerprint)` para estados
  abertos (`nova`, `investigando`, `acao_necessaria`, `aprovada`, `recorrente`).
  Reexecutar atualiza `ultima_vista_em`/`vezes_vista` e grava `reafirmada`; não
  cria cópia.
- Quando o evento volta depois de fechado, nasce uma ocorrência `recorrente`,
  com `recorrencias` = quantas fechadas da mesma fingerprint já existiam.
- O plano do Nível 1 é persistido em `recomendacao` junto da ocorrência. A
  reexecução atualiza o plano enquanto a linha está aberta; quando ela fecha, o
  plano daquele desfecho deixa de ser reescrito. O evento guarda a execução e a
  regra, não uma cópia do plano anterior.
- Rodada **truncada** (teto de coleta, teto de ocorrências ou falha de regra)
  **não** encerra ocorrências por ausência: lista incompleta não é prova.
- O encerramento automático grava evento `auto_encerrada` com motivo
  `nao_detectada_na_execucao`; a linha e o histórico continuam existindo.

## 4. Estados e autonomia

```
nova/recorrente ─┬─> investigando ─> acao_necessaria ─> aprovada ─> corrigida
                 ├─> ignorada (motivo obrigatório, gestor)
                 └─> encerrada (gestor)
terminal ─> nova/recorrente (reabrir, gestor)
```

- **Nível 0 — observar** (implementado): detectar, classificar, abrir ocorrência.
- **Nível 1 — recomendar** (implementado na v1.1): cada ocorrência carrega um
  plano revisável com passos, campos pendentes, risco da ação, reversibilidade,
  fonte, limitação e confiança. O plano é persistido junto da ocorrência e
  exibido no detalhe; **nada é executado**.
- **Nível 2 — corrigir após aprovação** (v1.3, restrito): **um** caso — antecipar job `watchdog` pendente e atrasado. Dry-run obrigatório, hash do plano, CAS no `run_after`, antes/depois no histórico, reversão só enquanto o worker não reclamou. Nota, saldo, pagamento, recebível, campanha e job de atendimento continuam fora.
- **Nível 3 — automação restrita** (não implementado; e emissão/pagamento/envio
  externo nunca serão nível 3).

`agent+` assume e leva para ação necessária/corrigida; `manager+` ignora,
encerra, aprova e reabre. A validação está em `lib/sentinel/estado.ts` (testada)
e é aplicada na rota; a função do banco grava estado + evento na mesma
transação.

## 5. Controles operacionais

| Controle | Onde |
|---|---|
| Kill switch da instalação | `SENTINEL_ENABLED=false` no `.env` |
| Kill switch por organização | `sentinel_settings.ativo` (tela Configurações › Sentinel) |
| Cadência | `intervalo_minutos` (default 360; piso 15) |
| Teto de ocorrências por execução | `limite_ocorrencias` (default 500; 50–2000) |
| Orçamento da detecção | `ORCAMENTO_DETECCAO_PADRAO_MS` = 8 s (29 regras em 7 ms medidos); estouro trunca a rodada e impede encerramento por ausência |
| Teto de coleta | 500 notas/pedidos/jobs, 1000 recebíveis, 500 fila/webhooks; cada consulta pede teto+1 |
| Organizações por tick do cron | 3 (drena nos ticks seguintes) |
| Retenção | `retencao_dias` (default 180, piso 30 no corpo da função); rodadas terminais saem em 90 dias fixos |
| Concorrência | índice único parcial em `sentinel_runs (organization_id)` para `status='executando'`; execução órfã > 30 min vira `erro` |
| Trilha | `sentinel_occurrence_events` (append-only) + `api_audit_log` (`sentinel.run`, `sentinel.occurrence_state`, `sentinel.settings_changed`, `sentinel.correction_applied`, `sentinel.correction_reverted`) |
| Correção aprovada | Só `operacao.job_fila_travado` + `job_queue` + `watchdog`/`pending`/atrasado; `manager+`, ocorrência `aprovada`, dry-run + confirmação, hash e CAS; reversão só com job ainda `pending` no valor gravado |
| Observabilidade da correção | `operacao.correcao_sem_reversao` (mesmo CAS: pending + run_after gravado) e `operacao.aprovacao_expirada` (janela de 5 min); só leitura, nenhuma ação |

Rodada vazia **não** audita — o próprio `sentinel_runs` é o registro de que o
cron rodou. Rodada com achado, encerramento ou falha audita.

## 6. LGPD e isolamento

- `organization_id` em toda tabela, policy `tenant_isolation` via
  `fn_user_org_ids()` / `fn_is_platform_admin()`.
- Ocorrência e histórico são **somente leitura** para sessão (nem UPDATE/INSERT
  direto por PostgREST). A mudança de estado passa pela rota PATCH, que valida a
  transição e chama `fn_sentinel_aplicar_mudanca` com service role: a máquina de
  estados não é contornável com a anon key.
- Coleta usa service role e filtra `organization_id` explicitamente em **todas**
  as 15 consultas; o id vem do guard de cookie ou da agenda do cron, nunca do
  body.
- Evidência não carrega conversa, documento, telefone ou e-mail completo. Erro
  de terceiro passa por `higienizar()` (e-mail → `[email]`, sequência de dígitos
  → `[numero]`); e-mail de cliente duplicado entra mascarado e a fingerprint é
  sha256.
- Retenção só alcança estados terminais, com piso de 30 dias dentro da função
  `security definer` (nem a service key apaga rastro recente).
- Funções novas: `revoke execute from public, anon, authenticated` e `grant` só
  a `service_role`; a view usa `security_invoker`.

## 7. Arquivos

| Path | O que |
|---|---|
| `supabase/migrations/20261121140000_0316_sentinel_ocorrencias.sql` | schema, RLS, funções, view |
| `supabase/migrations/20261123140000_0321_sentinel_recomendacoes.sql` | plano revisável + `sentinel_estoque_razao` |
| `supabase/migrations/20261123170000_0324_sentinel_estoque_sem_movimento.sql` | view com `left join`: razão vazio também é divergência |
| `supabase/migrations/20261123180000_0325_sentinel_correcao_aprovada.sql` | Nível 2 restrito: antecipar/reverter job watchdog com CAS |
| `supabase/migrations/20261123210000_0328_sentinel_liberar_conversa.sql` | segundo caso: liberar/reverter claim de conversa com CAS |
| `supabase/migrations/20261123220000_0329_sentinel_org_suspensa.sql` | org suspensa: encerrar abertas com motivo, sem coletar |
| `supabase/baseline.sql` (apêndices 0316/0321/0324/0325/0328/0329) | o que o self-host aplica |
| `supabase/migrations/MANIFEST.md` | linhas da 0316/0321/0324/0325/0328/0329 |
| `lib/sentinel/tipos.ts` | contrato do snapshot/achado/plano |
| `lib/sentinel/regras-fiscal.ts` | 13 detectores fiscais |
| `lib/sentinel/regras-operacao.ts` | 19 detectores de operação/financeiro/campanha (inclui endereço com lixo e claim parado) |
| `lib/sentinel/regras.ts` | registry (fonte única dos ids) |
| `lib/sentinel/motor.ts` | execução isolada, dedup, ordenação |
| `lib/sentinel/coleta.ts` | 19 consultas com teto e filtro de org (inclui correção e endereços) |
| `lib/sentinel/recomendacoes.ts` | plano revisável por regra (Nível 1) |
| `lib/sentinel/regras-correcao.ts` | observa reversão honesta e aprovação vencida — sem executar nada |
| `lib/sentinel/execucao.ts` | rodada, upsert, encerramento, retenção, corte de org suspensa, audit |
| `lib/sentinel/agenda.ts` | quais orgs o cron varre e quais estão suspensas (`organizacoes_puladas`) |
| `lib/sentinel/estado.ts` | máquina de estados + gate de gestor |
| `lib/sentinel/config.ts` | defaults, kill switch, "devida?" |
| `lib/sentinel/correcao.ts` / `correcao-constantes.ts` | elegibilidade pura, hash do plano e allowlist do único caso corrigível |
| `app/api/v1/sentinel/occurrences/[id]/correcao/**` | simular, executar e reverter job (manager+) |
| `app/api/v1/sentinel/occurrences/[id]/correcao/conversa/**` | simular, executar e reverter claim de conversa (manager+, motivo) |
| `app/app/sentinel/_correcao_conversa.tsx` | tela do segundo caso: antes/depois, motivo, confirmação e reversão |
| `app/api/v1/sentinel/{occurrences,scan,settings}` | API |
| `app/api/v1/cron/sentinel/route.ts` | cron (15 min) |
| `app/app/sentinel/` | painel |
| `docs/architecture/sentinel.architecture.json` | mapa (23 peças, 31 arestas) |
| `tests/invariants/rls-isolation.test.ts` | seed + TABLES das 4 tabelas |
| `tests/invariants/sentinel-idempotencia.test.ts` | upsert, recorrência, retenção (10 dias fica, 31 apaga) e cross-tenant |
| `tests/invariants/sentinel-estoque-razao.test.ts` | left join, `ultimo_movimento` null e `security_invoker` entre orgs |
| `tests/e2e/sentinel-painel.spec.ts` | painel: filtros, plano, histórico, kill switch e papéis (roda no CI `critical`/`full`) |
| `tests/unit/sentinel-painel-revisavel.test.tsx` | prova de componente do painel quando o E2E não é executável (ver §8) |
| `tests/api/sentinel-permissoes.test.ts` | régua de papel no fio: agent assume/pede ação; gestor ignora/encerra; platform admin; motivo obrigatório |
| `lib/sentinel/somente-leitura.test.ts` | catraca: escrita só em `sentinel_*`, RPC só `fn_sentinel_*`, plano sem função/chave de execução |
| `tests/invariants/sentinel-correcao.test.ts` | RPC 0325: antecipa, reverte, recusa running/flywheel/outra org |
| `tests/invariants/sentinel-conversa-correcao.test.ts` | RPC 0328: libera, reverte, não rouba claim de outro, recusa org/regra/motivo |
| `tests/invariants/sentinel-suspensao.test.ts` | RPC 0329: encerra com motivo, preserva histórico, duas rodadas sem evento extra, isolamento |
| `lib/sentinel/agenda-suspensas.test.ts` | suspensa fora da fila de detecção e sem consumir vaga |
| `lib/sentinel/execucao-suspensa.test.ts` | suspensa não coleta; ativa continua |
| `app/api/v1/cron/sentinel/route.test.ts` | `organizacoes_puladas` + ordem ativas→suspensas |
| `tests/api/sentinel-conversa-correcao.test.ts` | rota: manager, motivo, hash, CAS, alvo proibido |
| `tests/unit/sentinel-correcao-conversa-tela.test.tsx` | simular → motivo+confirmação → liberar; reverter |
| `lib/sentinel/regras-correcao.test.ts` | observabilidade: CAS de reversão e janela de 5 min, com negativos |
| `lib/sentinel/regras-operacao.test.ts` | endereço com literal/espaço: UMA ocorrência por org, sem PII |
| `tests/api/sentinel-correcao.test.ts` | simular/executar/reverter: papel, aprovação, hash, audit |
| `tests/unit/sentinel-correcao-tela.test.tsx` | executar só após confirmação explícita; reverter |
| `scripts/medir-sentinel-carga.ts` | 50k pedidos + 200k mensagens, scan medido e orçamento forçado |
| `tests/unit` (via `lib/sentinel/*.test.ts`) | positivos/negativos, motor, planos, estados, config |

## 8. Prova executada

Nesta sessão (v1.2), rodando **dirigido** — não a suíte completa:

```bash
pnpm exec vitest run lib/sentinel
#   8 arquivos, 63 testes verdes (inclui orçamento, estoque sem movimento
#   e a catraca de somente leitura)

pnpm test:db
#   170 arquivos, 2300 testes verdes | 1 esperado | 1 pulado
#   install+update do baseline, RLS, retenção (10 dias fica, 31 apaga) e a
#   view left join com/sem movimentação entre duas organizações

pnpm exec vitest run tests/api/sentinel-permissoes.test.ts tests/unit/sentinel-painel-revisavel.test.tsx
#   18 testes verdes: papéis na rota, gestor, kill switch salvando ativo:false,
#   plano/histórico e ocorrência sem plano

pnpm exec vitest run tests/unit/migrations-numero-unico.test.ts \
  tests/unit/manifest-x-migrations.test.ts \
  tests/unit/kind-check-migration-x-baseline.test.ts \
  tests/unit/baseline-reaplicavel.test.ts \
  tests/unit/varredura-anon-e-o-ultimo-bloco.test.ts
#   5 arquivos, 21 testes verdes

pnpm typecheck   # zerado
pnpm exec eslint lib/sentinel app/app/sentinel app/api/v1/sentinel \
  tests/api/sentinel-permissoes.test.ts tests/invariants/sentinel-estoque-razao.test.ts \
  tests/invariants/sentinel-idempotencia.test.ts
#   zero erros
```

### v1.3 — correção aprovada, carga e E2E

```bash
pnpm exec vitest run lib/sentinel tests/api/sentinel-correcao.test.ts \
  tests/unit/sentinel-correcao-tela.test.tsx
#   correção: elegibilidade/hash, 12 testes de rota e 3 de tela

# O test:db completo estourou 25 min sob carga nesta máquina; o invariante novo
# rodou no MESMO container/molde do baseline já aplicado:
TEST_DB_CONTAINER=<container> TEST_DB_TEMPLATE=inv_baseline \
  pnpm exec vitest run --config vitest.db.config.ts \
  tests/invariants/sentinel-correcao.test.ts
#   4 testes verdes: antecipa, reverte, recusa running/flywheel/outra org

set -a; . ./.env.e2e; set +a
SENTINEL_CARGA_OK=1 pnpm exec tsx scripts/medir-sentinel-carga.ts
#   seed 50k pedidos + 200k mensagens: 7.759 ms
#   scan completo: 1.125 ms | detecção: 37 ms | 29 regras | truncado pela coleta
#   orçamento forçado 0 ms: truncado_por_tempo=true, 0 regras avaliadas
#   detecção normal no mesmo snapshot: 1 ms, 29 regras
```

O E2E foi reescrito para semear **dados de negócio** (produto sem movimentação
e job na dead-letter) e criar as ocorrências pelo próprio `Executar agora`, sem
INSERT manual em `sentinel_occurrences`. Rodou **localmente e passou 5/5 em
8,9 s** contra um build de produção na 3023:

```bash
pnpm e2e:env                 # .env.e2e local (127.0.0.1:54321)
pnpm e2e:build               # build de produção com o env local
pnpm exec next start -p 3023 # o app de dev não hidratava sob a carga da máquina
E2E_BASE_URL=http://127.0.0.1:3023 \
  pnpm exec playwright test tests/e2e/sentinel-painel.spec.ts
# 5 passed (8.9s): scan/KPIs/filtros, detalhe, viewer, agent, gestor ignora/encerra
```

O login desta spec é por cookie de sessão (`sb-nexus-auth`), não pelo formulário:
o formulário tem specs próprias (`auth`, `password-recovery`, `reset-password-mfa`)
e acoplá-lo aqui só adicionaria a hidratação da tela de login à prova do painel.
As migrations 0324/0325 foram aplicadas no Supabase local antes da execução; no
CI, o `critical`/`full` usa o baseline completo.

**E2E de navegador não rodou nesta máquina**: o worktree não tem `.env.e2e` e a
spec do painel continua no `e2e` `critical`/`full` da main. A prova de tela é
componente + rota (PR #538, mergeado) e a de banco é o `test:db` acima.

### v1.3 — observabilidade das correções aprovadas

```bash
pnpm exec vitest run lib/sentinel
#   10 arquivos, 73 testes verdes (inclui os 6 da observabilidade)

# coleta real contra o Supabase local: ocorrência corrigida + evento nota +
# job running → snapshot.correcoes preenchido e 1 achado de sem_reversao
pnpm exec tsx scripts/probe-obs.ts
#   (script descartável; o caminho de produção é coleta.ts)
```

Os dois detectores são **somente leitura**: leem as ocorrências/eventos do
próprio Sentinel e o `job_queue` atual. Não executam, não revertem e não
aprovam; a correção continua sendo da rota de Nível 2.

### P2 — endereço com lixo

```bash
pnpm exec vitest run lib/sentinel/regras-operacao.test.ts
#   21 testes verdes; os dois novos cobrem literal (NULL/undefined/NaN),
#   só espaços, null real (não dispara) e agrupamento por org sem PII

# coleta real contra o Supabase local: contato com logradouro "NULL" e cidade
# "  " → contatosEndereco inclui o id e enderecoComLixo devolve 1 achado
pnpm exec tsx scripts/probe-endereco.ts
```

Contexto medido: 84 cadastros históricos em produção. O escritor que gravava o
literal não está mais no código; a regra observa o passado e impede regressão
silenciosa no futuro.

### v1.4 — rejeição de SEFAZ repetida

```bash
pnpm exec vitest run lib/sentinel/regras-fiscal.test.ts
#   18 verdes: 3 do mesmo cStat/série abrem com limiar 3; 2 não; cStat de
#   sucesso não; 25h atrás não; séries diferentes são grupos; duas orgs, uma
#   cada; fingerprint estável com a contagem crescendo de 3 para 4.

# coleta real contra o Supabase local:
# 3 notas cStat 539/série P<ts> → 1 achado (total 3, primeiro 900000,
# último 900002); 4ª nota → MESMO fingerprint e total 4.
```

Limiar declarado em `LIMIAR_REJEICAO_REPETIDA = 3`; janela deslizante de 24h,
agrupada pelo dia UTC da rejeição. O grupo é `organization_id + sefaz_cstat +
série + dia`; a fingerprint é estável, então reexecutar atualiza a mesma
ocorrência e o histórico mostra a contagem crescendo. Sem escrita em `invoices`.

### v1.5 — segundo caso de correção: conversa parada

```bash
pnpm exec vitest run tests/api/sentinel-conversa-correcao.test.ts \
  tests/unit/sentinel-correcao-conversa-tela.test.tsx \
  lib/sentinel/regras-operacao.test.ts lib/sentinel/correcao.test.ts
#   rota 8, tela 3, regras 22, planos 7 (inclui claim 6/10 dias)

pnpm test:db
#   175 arquivos, 2323 testes verdes | 1 esperado | 1 pulado
#   o invariante 0328 libera, reverte e recusa claim de outro agente/motivo vazio
```

O **webhook em dead-letter foi recusado**: `webhook_events_log` é arquivo
forense, não fila de trabalho — mudar `dead` para `pending` não faz ninguém
processar, e reenviar o HTTP é ação externa que pode tocar nota/financeiro, sem
reversão honesta. O caso escolhido foi o claim de conversa parada (7 dias sem
mensagem), que devolve a conversa para a fila e só reverte enquanto ninguém
assumiu.

### Correção — devolução não é duplicidade

O detector passou a usar a mesma regra da 0326 no banco:
`coalesce(nullif(extras_fiscais->>'finalidade','')::int, 1) <> 4`. Venda + devolução
e devolução + devolução não abrem; duas vendas continuam abrindo. A evidência
ganhou `finalidades` para o operador saber por que o grupo existe.

Regressão do pedido 19560 (4634 venda / 4644 devolução, `ref_nfe`) em
`lib/sentinel/regras-fiscal.test.ts`; coleta real no Supabase local confirmou 0
para venda+devolução.

O falso positivo em produção fecha no próximo ciclo **completo**: a regra é
avaliada, não devolve o pedido, e `fn_sentinel_encerrar_ausentes` encerra a
ocorrência aberta com motivo `nao_detectada_na_execucao` — o histórico fica. Se a
rodada estiver truncada (coleta/regra), o encerramento não acontece por desenho;
a próxima rodada limpa fecha.

### v1.6 — organização suspensa não alimenta o painel

Medido em produção em 19/11/2026: das 23 ocorrências abertas, **20 eram de
`E2E Test Org`**, já suspensa; só 3 eram da organização real. O Sentinel não
pode gastar atenção em organização suspensa.

O corte é na **origem**: `organizations.suspended_at is not null` pula a coleta,
então nenhum detector roda, nenhuma ocorrência nasce e nenhuma existente é
reafirmada. A rodada continua registrada em `sentinel_runs` (`ignorada`, motivo
`organizacao_suspensa`) e o cron responde `organizacoes_puladas` com a contagem
honesta. As ocorrências **abertas** da suspensa são encerradas por
`fn_sentinel_encerrar_org_suspensa` com motivo declarado
`organizacao_suspensa` — encerrar, não apagar: linha e histórico append-only
ficam. A suspensa não consome as 3 vagas do tick; ela é processada depois das
ativas.

```bash
pnpm exec vitest run lib/sentinel/agenda-suspensas.test.ts \
  lib/sentinel/execucao-suspensa.test.ts \
  app/api/v1/cron/sentinel/route.test.ts
#   agenda 2 (suspensa fora da fila, kill switch), execução 2 (não coleta,
#   org ativa continua), cron 2 (organizacoes_puladas e vazio)

pnpm test:db
#   invariante 0329: encerra com motivo, preserva histórico, duas rodadas
#   não duplicam evento, ativa intocada, isolamento por organização
```

### v1.7 — encerramento por regra avaliada e tetos de coleta medidos

Produção (19/11/2026): a organização real sempre fechava a rodada com
`truncado = t`; `encerrar_ausentes` nunca rodava e o falso positivo da devolução
ficava aberto para sempre. A medição local com o volume real mostrou **onde**
estava o corte:

| Volume | Coleta | Detecção | Truncados (antes) |
|---|---:|---:|---|
| 1,2k produtos · 32k itens/movimentos · 14k contatos · 1,5k pedidos | **5,2 s** | **65 ms** | `pedidos`, `estoque_razao` |

O orçamento de 8 s **não** era o gargalo: a detecção levava 65 ms. O corte era
**teto de coleta** — `TETO_PEDIDOS=500` para 1,5k pedidos e
`TETO_ESTOQUE_RAZAO=500` para 1,2k produtos com diferença. Aumentar o teto no
escuro não era opção; os valores novos foram medidos:

- `TETO_PEDIDOS` 500 → **2.000**; `TETO_ESTOQUE_RAZAO` 500 → **2.000**;
  `TETO_PRODUTOS` 200 → **1.000**; `TETO_CONTATOS_ENDERECO` 1.000 → **15.000**.
  `TETO_PRODUTOS` **não** foi o gargalo medido (a coleta de produtos só lê
  `controla_estoque = true and quantidade < 0`; os 1,2k produtos da fixture não
  entram nessa consulta) — 1.000 é o valor que o código tem, não um número
  apresentado como medido.
- Com os tetos novos, o mesmo volume: coleta **4,2 s**, detecção **262 ms**,
  `truncados = []` — total abaixo dos 8 s, sem aumento de orçamento.
- Regras mais lentas (ms): `operacao.lead_duplicado` 25,1;
  `cadastro.endereco_com_lixo` 8,4; `fiscal.nota_rejeitada` 6,4;
  `operacao.estoque_divergente` 4,2. Nenhuma perto de 8 s.

**Encerramento por regra**, não por rodada completa:

- `executarDetectores` devolve `regrasAvaliadas`, `regrasNaoAvaliadas` e
  `temposPorRegra`; `sentinel_runs.detalhe` grava as listas e os tempos.
- `fn_sentinel_encerrar_ausentes` recebe só as regras avaliadas e sem falha de
  registro; regra que não rodou fica intocada. O corte por **coleta** continua
  bloqueando tudo (snapshot incompleto para todas); achado que não coube no teto
  da org protege a própria regra.
- Rodada truncada por **tempo** (não por coleta) agora fecha as regras que
  rodaram — a garantia “não fechar sem avaliar” continua, e o acúmulo para de
  crescer.

**Efeito em produção:** com o volume real e os tetos novos, a próxima varredura
completa avalia todas as regras e `encerrar_ausentes` fecha a ocorrência da
devolução como `nao_detectada_na_execucao`, preservando o histórico. Sem
migration (0330 não foi necessária): a função já aceitava a lista de regras.

### v1.8 — truncamento por fonte, não por rodada

Produção 1.61.0: `status=sucesso achados=21 ... truncado=t`,
`coletas_truncadas=["importacoes_mercos"]`. A coleta Mercos lia 30 dias para
alimentar regras de 45 min/24 h; 137 execuções em 30 dias (42 em 7) estouravam
`TETO_MERCOS=100` e bloqueavam **todo** o encerramento.

- A janela passou a ser **7 dias** — o horizonte das duas regras — e o teto
  **500**. 137 em 30 dias não truncam; 600 em 7 ainda truncam (teste no banco).
- O bloqueio passou a ser **por fonte**: `lib/sentinel/fontes.ts` mapeia regra →
  coletas. `importacoes_mercos` truncada bloqueia só as duas regras Mercos;
  `fiscal.*`, `operacao.lead_duplicado` etc. encerram normalmente.
- Regra sem mapa de fontes bloqueia (nunca fecha no escuro); `fontes.test.ts`
  exige entrada para toda regra do registry.

**Prova:** 102 testes de `lib/sentinel` (Mercos truncado não impede fiscal/lead;
fonte truncada impede a regra dependente) + `test:db` com 137/42 e 600/501.

### v1.9 — agrupamento fiscal não é divergência

Produção 1.61.0: a NF 4629 (13.400) fatura os pedidos 19594 (9.200) e 19597
(4.200); a soma fecha. `divergenciaDeValorDaNota` comparava com **um** pedido via
`n.order_id` e acusava 4.200 de diferença.

- A regra soma `n.order_id` + todos os vínculos de `notasPedidos`; nota com N
  pedidos só diverge se a soma diferir.
- Evidência traz cada pedido (`numero: total`), `soma_pedidos_cents`, total da
  nota e diferença. Pedido vinculado ausente do snapshot **não abre** (coleta
  incompleta).
- O mesmo 1:1 foi corrigido em `fiscal.nota_autorizada_pedido_nao_faturado`,
  `fiscal.nota_sem_vinculo` e `fiscal.pedido_com_nf_sem_nota`.

**Prova:** `lib/sentinel/regras-fiscal.test.ts` — 25 verdes, incluindo o caso real
9.200+4.200=13.400 (não abre), soma divergente (abre), vínculo ausente (não
abre) e os três outros detectores.

### v1.10 — evidência legível: natureza fiscal e contato do lead

O mesmo defeito-raiz apareceu em dois lugares: a evidência guardava o ID, não o
campo que identifica.

- **Nota duplicada:** a evidência passa a trazer `naturezas` legíveis
  (`venda`, `complementar`, `ajuste`, `devolução`) além dos números; título e
  resumo dizem “(2 vendas)” ou “(1 venda + 1 complementar)”. A recomendação
  manda conferir a natureza antes e **não** cancela devolução/complementar como
  duplicidade.
- **Lead duplicado:** cada lead vira uma linha legível
  `nome → telefone (mascarado) → e-mail (mascarado) → id curto`, com `etapa` e
  `criado_em`. Título/resumo nomeiam o contato; o UUID deixa de ser a única
  pista.
- **Regra geral:** toda evidência que aponta para uma entidade precisa de **um
  campo legível por humano**, não só o id. Vale para leads, pedidos, notas e
  contatos.

**Prova:** `regras-fiscal.test.ts` 25 verdes (venda+devolução não abre; duas
vendas abre `(2 vendas)`; venda+complementar abre `(1 venda + 1
complementar)`); `regras-operacao.test.ts` cobre nome→telefone→e-mail→id curto.

**Proposta, não criada:** `fiscal.devolucao_sem_referencia` — hoje uma
devolução sem `ref_nfe` não tem regra própria e não é duplicidade. Criar a
regra exige decidir o que é referência válida (chave da original, série/número
ou vínculo explícito); fica registrada como próxima fatia, sem inventar
critério.

### v1.12 — lead duplicado: identificar e linkar, nunca mesclar

Decisão de 20/11 (`docs/business-rules/pendencias-do-sentinel.md` §2): as 5
ocorrências medidas são reais (mesmo contato, dois leads abertos), mas mesclar
funil é operação comercial — perde histórico e muda dono.

- A evidência de `operacao.lead_duplicado` ganhou `leads_links`
  (`/app/leads/<id>`), na mesma ordem de `leads_detalhe`
  (`nome → telefone → e-mail → id curto · etapa · criado_em`).
- A tela renderiza qualquer string de evidência que comece em `/app/` como link;
  para uma lista, “abrir 1”, “abrir 2”… A pessoa decide, em dois cliques.
- **Nenhum merge automático**, nenhum dado tocado. Reversão: remover os links.

**Prova:** `regras-operacao.test.ts` — `leads_links` com o caminho de cada lead,
na mesma ordem da evidência legível.

**Nada foi implantado** — sem deploy, sem escrita em produção/VPS, sem operação
fiscal/financeira real.

## 9. Limitações declaradas (v1.3 + observabilidade + conversa)

1. **Divergência de estoque** é hipótese de confiança baixa: o razão não tem
   saldo de abertura e a comparação só vale para produtos criados a partir da
   0242. Confirmação exige contagem física.
2. **Duplicidade de lead** só compara leads com contato vinculado. Lead sem
   contato não tem identidade normalizada — ficar de fora é decisão, não
   omissão.
3. **Campos fiscais sugeridos a partir de fonte confiável** continuam fora: a
   v1.2 recomenda passos, não inventa valor fiscal.
4. **Não há correção automática.** O plano é persistido e revisável; os estados
   `aprovada`/`corrigida` registram a decisão humana, mas nada é executado pela
   máquina.
5. O cron processa **3 organizações por tick**; instalação com muitas orgs
   drena ao longo dos ticks (15 min cada).
6. A view de e-mail duplicado olha `email_normalized`; e-mail vazio/anonimizado
   fica de fora de propósito.
7. O painel entrega 500 ocorrências por render; a API pagina até 200 por
   chamada. Acima disso, filtros são a forma de recorte.
8. O plano é uma recomendação textual/determinística; não há simulação de
   impacto nem execução assistida na v1.2.
9. O orçamento de detecção é checado **entre** regras: uma regra já iniciada
   termina; o que não começa é a seguinte. O teto protege contra regra
   patológica, não contra uma única regra que bloqueie a CPU para sempre.
10. **E2E de navegador pendente nesta máquina** (sem `.env.e2e`): a prova de
    banco veio de `pnpm test:db`; a de tela é componente + rota (PR da prova).
11. **A correção do Nível 2 é deliberadamente estreita:** dois casos — job
    `watchdog` `pending` atrasado e claim de conversa parado; job de atendimento
    (envio externo), `running`/`dead`, nota, saldo, pagamento, recebível,
    pedido e campanha são recusa dura. Os demais exigem fatia própria com
    antes/depois comprovado.
12. **Reversão honesta ou nenhuma:** se o worker reclamou o job, a RPC devolve
    zero linhas e a tela responde 409; não existe "desfiz" que não desfez.
13. **O segundo caso corrigível é só claim de conversa parado:** 7 dias sem
    mensagem, `claimed`. Libera para a fila; não envia mensagem, não mexe em
    nota/pagamento/recebível/campanha. Reverter só vale enquanto ninguém
    assumiu — se outro agente assumiu, 409.
14. **`operacao.aprovacao_expirada` conta da aprovação, não do dry-run:** o
    dry-run não é persistido; a janela de 5 min da RPC é aplicada à aprovação.
    Um gestor que simulou de novo sem executar ainda pode ver o alerta — ele
    pede revalidação, não bloqueia nada.
14. **`operacao.correcao_sem_reversao` só enxerga correções de job watchdog
    feitas pela 0325.** Correção manual de estado (`corrigida` sem evento de
    antecipação) não entra, porque não há antes/depois para comparar.
15. **`cadastro.endereco_com_lixo` é observação, não correção:** o escritor
    histórico não existe mais; o achado agrupa ids por organização e não leva
    o endereço (dado pessoal) na evidência. A borda é de PALAVRA: `RUA NULL`
    casa, `RUA NULLS` não. Medido no Supabase local após a limpeza: **0**.
16. **`fiscal.rejeicao_repetida` conta o dia UTC, não uma janela móvel de 24h
    a cada scan:** a janela de coleta é de 24h, mas o grupo é o dia da rejeição;
    é o que mantém a fingerprint estável e evita ocorrência nova a cada rodada.
17. **`operacao.estoque_negativo` é defensivo, não operante:** a constraint
    `catalog_products_quantidade_nao_negativa` impede saldo negativo em escrita
    normal, então a regra herdada da v1 não dispara na base atual. A regra de
    estoque que esta versão acrescenta é a divergência saldo × razão. Remover a
    regra morta ou afrouxar a constraint é decisão de produto, não desta frente.

## 10. Próximas fatias seguras

1. v1.4 — ampliar a correção aprovada para outros casos **com antes/depois
   honesto**, um por vez; nunca em nota, saldo, pagamento ou envio externo.
2. Explicação por IA **opcional** sobre a evidência já sanitizada, com fallback
   imediato para o texto determinístico.
3. Exposição no Meu Dia: uma ocorrência `acao_necessaria` vira item da rotina
   (hoje a porta é o ⌘K, porque a dobra do sidebar é medida).
4. Saldo de abertura explícito no razão (`abertura`/snapshot mensal) para elevar
   a confiança da divergência de estoque.
5. Ampliar o E2E visual para outras resoluções/dispositivos.

## 11. Onde retomar (v1.7, 19/11/2026)

- **Esta fatia** (`sentinel/encerrar-por-regra`): encerramento por regra
  avaliada; `regrasNaoAvaliadas`/`temposPorRegra` no detalhe; tetos de coleta
  medidos (pedidos 2.000, estoque 2.000, produtos 1.000, contatos 15.000) para
  o volume real não truncar. Sem migration.
- **Próxima**: medir `contatos_endereco`/`leads` em produção e, se a coleta
  voltar a truncar, decidir entre teto maior ou agregação SQL — com número, não
  no escuro.
