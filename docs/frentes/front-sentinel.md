# Frente `front/sentinel` — Nexus Sentinel v1

> Worktree: `/private/var/folders/.../aaa-front-sentinel` · branch `front/sentinel`
> Baseline: `nexus/main` @ `9ddc9005` (release 1.55.0)
> Escopo desta entrega: **v1 somente leitura** — detectar, classificar e abrir ocorrência. Nenhuma correção autônoma.

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

## 2. Regras implementadas (27)

### Fiscal (12)

| Regra | Dispara quando | Severidade |
|---|---|---|
| `fiscal.nota_rejeitada` | `invoices.status ∈ {denegada, erro}` | alta |
| `fiscal.nota_em_emissao_travada` | `em_emissao` há > 30 min | alta |
| `fiscal.nota_pendente_antiga` | `pendente` criada há > 24 h | media |
| `fiscal.nota_sem_vinculo` | autorizada com `order_id` nulo | media |
| `fiscal.nota_sem_chave` | autorizada sem `chave_acesso` | alta |
| `fiscal.nota_duplicada_por_pedido` | 2+ notas vivas no mesmo pedido | crítica |
| `fiscal.divergencia_valor_nota` | total da nota ≠ total do pedido | alta |
| `fiscal.nota_autorizada_pedido_nao_faturado` | nota autorizada + pedido em rascunho/análise/aprovado | media |
| `fiscal.pedido_com_nf_sem_nota` | `exige_nf` + status avançado sem nota ativa (janela 1 h/24 h) | crítica/alta |
| `fiscal.job_fiscal_travado` | job `processando` > 30 min ou `pendente` atrasado | alta |
| `fiscal.job_retry_excessivo` | 3+ tentativas na mesma nota | media |
| `fiscal.sincronizacao_falhou` | sync fiscal com erro/bloqueio nas últimas 24 h (agrupada por dia) | media/alta |

### Operação, financeiro e campanha (15)

| Regra | Dispara quando | Severidade |
|---|---|---|
| `operacao.estoque_negativo` | saldo < 0 com controle de estoque | alta |
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

**Falsos positivos evitados de propósito:**

- campanha de prospecção com `cidades: []` é **recuperação** (contatos sem
  recorte geográfico), não erro — a regra não dispara;
- contato tem índice único por telefone; a duplicidade real que sobra é por
  e-mail, e é essa que a view agregada detecta;
- divergência de estoque **não** foi implementada: sem saldo de abertura no
  razão, `SUM(movimentos) ≠ quantidade` acusaria todos os produtos anteriores à
  migration 0242. Estoque negativo é determinístico; divergência exigiria uma
  linha de base que o schema não tem.

## 3. Ocorrência, agrupamento e idempotência

- `fingerprint = regra|entidade_tipo|entidade_id` (id de grupo é sha256 quando a
  chave contém PII).
- Índice único **parcial** em `(organization_id, fingerprint)` para estados
  abertos (`nova`, `investigando`, `acao_necessaria`, `aprovada`, `recorrente`).
  Reexecutar atualiza `ultima_vista_em`/`vezes_vista` e grava `reafirmada`; não
  cria cópia.
- Quando o evento volta depois de fechado, nasce uma ocorrência `recorrente`,
  com `recorrencias` = quantas fechadas da mesma fingerprint já existiam.
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
- **Nível 1 — recomendar** (v1.1, não implementado): plano de correção revisável.
- **Nível 2 — corrigir após aprovação** (v1.2, não implementado).
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
| Teto de coleta | 500 notas/pedidos/jobs, 1000 recebíveis, 500 fila/webhooks; cada consulta pede teto+1 |
| Organizações por tick do cron | 3 (drena nos ticks seguintes) |
| Retenção | `retencao_dias` (default 180, piso 30 no corpo da função); rodadas terminais saem em 90 dias fixos |
| Concorrência | índice único parcial em `sentinel_runs (organization_id)` para `status='executando'`; execução órfã > 30 min vira `erro` |
| Trilha | `sentinel_occurrence_events` (append-only) + `api_audit_log` (`sentinel.run`, `sentinel.occurrence_state`, `sentinel.settings_changed`) |

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
  as 12 consultas; o id vem do guard de cookie ou da agenda do cron, nunca do
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
| `supabase/migrations/20261121130000_0315_sentinel_ocorrencias.sql` | schema, RLS, funções, view |
| `supabase/baseline.sql` (apêndice 0315) | o que o self-host aplica |
| `supabase/migrations/MANIFEST.md` | linha da 0315 |
| `lib/sentinel/tipos.ts` | contrato do snapshot/achado |
| `lib/sentinel/regras-fiscal.ts` | 12 detectores fiscais |
| `lib/sentinel/regras-operacao.ts` | 15 detectores de operação/financeiro/campanha |
| `lib/sentinel/regras.ts` | registry (fonte única dos ids) |
| `lib/sentinel/motor.ts` | execução isolada, dedup, ordenação |
| `lib/sentinel/coleta.ts` | 12 consultas com teto e filtro de org |
| `lib/sentinel/execucao.ts` | rodada, upsert, encerramento, retenção, audit |
| `lib/sentinel/agenda.ts` | quais orgs o cron deve varrer |
| `lib/sentinel/estado.ts` | máquina de estados + gate de gestor |
| `lib/sentinel/config.ts` | defaults, kill switch, "devida?" |
| `app/api/v1/sentinel/{occurrences,scan,settings}` | API |
| `app/api/v1/cron/sentinel/route.ts` | cron (15 min) |
| `app/app/sentinel/` | painel |
| `docs/architecture/sentinel.architecture.json` | mapa (21 peças, 24 arestas) |
| `tests/invariants/rls-isolation.test.ts` | seed + TABLES das 4 tabelas |
| `tests/unit` (via `lib/sentinel/*.test.ts`) | positivos/negativos, motor, estados, config |

## 8. Prova executada

```bash
pnpm vitest run lib/sentinel      # 45 testes (positivo/negativo por regra)
pnpm test:db                      # install+update do baseline, RLS, invariantes
pnpm typecheck
pnpm lint
pnpm test:unit
```

Resultados desta sessão ficam no relatório do PR. **Nada foi implantado** — sem
deploy, sem escrita em produção/VPS, sem operação fiscal/financeira real.

## 9. Limitações declaradas (v1)

1. **Divergência de estoque** não é detectada (falta saldo de abertura no
   razão); estoque negativo é.
2. **Duplicidade de lead** não é detectada; contato duplicado por e-mail é
   (telefone já tem índice único). Lead duplicado exige uma chave de negócio
   que o schema não declara.
3. **Campos sugeridos a partir de fonte confiável** (item fiscal do prompt)
   pertencem ao v1.1 (recomendação). O v1 não sugere valor fiscal.
4. **Não há correção automática nem aprovação de plano** — estados `aprovada`
   existem para o v1.2, mas nenhuma ação é executada.
5. O cron processa **3 organizações por tick**; instalação com muitas orgs
   drena ao longo dos ticks (15 min cada).
6. A view de e-mail duplicado olha `email_normalized`; e-mail vazio/anonimizado
   fica de fora de propósito.
7. O painel entrega 500 ocorrências por render; a API pagina até 200 por
   chamada. Acima disso, filtros são a forma de recorte.

## 10. Próximas fatias seguras

1. v1.1 — plano de correção revisável, sem executar (texto + campos + risco).
2. Explicação por IA **opcional** sobre a evidência já sanitizada, com fallback
   imediato para o texto determinístico.
3. Exposição no Meu Dia: uma ocorrência `acao_necessaria` vira item da rotina
   (hoje a porta é o ⌘K, porque a dobra do sidebar é medida).
4. Detector de divergência de estoque **quando** houver saldo de abertura
   (`inventory_movements` com tipo `abertura` ou snapshot mensal).
5. Teste visual/E2E do painel em ambiente fresco (a doutrina de QA visual não
   foi executada nesta sessão; é dívida declarada).
