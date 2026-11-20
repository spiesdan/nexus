# 40 — Auditoria das ações em produção (18–19/11/2026)

> Este documento existe porque o programa AAA tocou produção em cinco ocasiões. Cada
> linha diz **o que** mudou, **sob qual autorização**, **qual backup** existe,
> **impacto** medido e **como reverter**. Sem isso, "corrigi em produção" é relato,
> não auditoria.

Ambiente em todas as linhas: VPS `vps` (200.141.17.185), projeto `crm`, Postgres
`supabase_db_selfhost`, app em `https://crm.billhigiene.tech`.

---

## 1. NF-e 4655 rejeitada (SEFAZ 176) → 4656 autorizada

| Campo | Valor |
|---|---|
| **Autorização** | Dono, no chat: *"primeiro corrija essa nota no sistema, depois corrija a causa"* e depois *"corrija essa nota dentro da vps"* |
| **O que mudou** | Sidecar fiscal da VPS passou de **1.55.0 → 1.56.0** (só esse serviço). Depois: `fiscal_jobs` ganhou um job `emitir pendente` e a nota `em_emissao` foi retomada |
| **Causa** | O sidecar 1.55.0 emitia o grupo `<entrega>` **sem IE do local de entrega** → rejeição 176. A 1.56.0 não emite o grupo (endereço vai em `<enderDest>`) |
| **Backup** | `/var/backups/nexus/pre-fix-4655-20261118-180013.sql` (tabelas `invoices`, `fiscal_jobs`, `fiscal_events`, `commercial_orders`, `catalog_products`) |
| **Resultado** | **NF-e 4656 autorizada** — cStat 100, chave `42261135233142000183550010000046561587828417`, protocolo `242260558007288`, R$ 440,00, pedido 19681 |
| **Numeração** | 4655 não foi reutilizado: o número que a SEFAZ viu numa rejeição não volta (prática fiscal) |
| **Reversão** | Refixar `FISCAL_IMAGE` em 1.55.0 e `up -d fiscal`. A nota autorizada **não** se reverte por deploy |

---

## 2. Limpeza do literal `NULL` em endereços de contato

| Campo | Valor |
|---|---|
| **Autorização** | Dono: *"corrija para nao acontecer mais"* |
| **O que mudou** | `contacts.logradouro` e `contacts.bairro` tiveram o token `NULL` removido (o export do WP/Mercos grava a ausência como texto) |
| **Escopo** | **84 cadastros** (51 na rua, 36 no bairro; 3 com os dois). Restaram **0** |
| **Backup** | tabela `public._bkp_null_addr_20261118` (84 linhas com os valores originais e `copiado_em`) |
| **Impacto** | Nenhum dado apagado além do token; endereço reconstruído com `regexp_replace` + `btrim`. A NF-e 4656 saiu com a rua limpa |
| **Reversão** | `update contacts set logradouro = b.logradouro, bairro = b.bairro from _bkp_null_addr_20261118 b where b.id = contacts.id` |
| **Código** | PR #554 — o construtor do destinatário passou a usar o mesmo limpador do formatador de endereço, com teste que reprova o literal no payload |

---

## 3. Schema: 0322 e 0326/0327 aplicados manualmente

| Campo | Valor |
|---|---|
| **Autorização** | Dono: *"quero que edite deiramente no sistema em producao"* / deploy da 1.58.0 aprovado |
| **O que mudou** | `0322` (`offline_devices`) aplicada à mão porque o baseline abortava antes dela; `0326` (devolução não concorre com a venda) e `0327` (`search_path` vazio) aplicadas para o baseline fechar |
| **Motivo do aborto** | `invoice_orders` recusava o backfill: o pedido 19560 tem venda (4634) **e devolução** (4644), e a trava da 0315 tratava as duas como duplicidade |
| **Backup** | `/var/backups/nexus/pre-1.55.0.dump` (pré-deploy) + dump do deploy da 1.58.0 (`upload.sh` do kit) |
| **Verificação** | baseline completo com `ON_ERROR_STOP`: **0 erros**; `to_regclass` das 6 tabelas novas = `t`; as duas funções de trigger contêm a regra de `finalidade` |
| **Idempotência** | as três são `create ... if not exists` / `create or replace`; reaplicar não altera |
| **Código** | PR #566 (0315 corrigida no bloco + apêndices 0326/0327) e #568 (o `update.sh` passa a **falhar alto** em DDL, em vez de seguir `healthy` com schema pela metade) |

---

## 4. Suspensão das organizações de teste (E2E)

| Campo | Valor |
|---|---|
| **Autorização** | Dono, escolha explícita entre opções: *"Suspender agora, apagar depois"* |
| **Motivo** | A produção continha **9 organizações de teste** (`E2E Test Org`, `Loja E2E Recovery`, …). Uma delas tinha **62 contatos**, **7 jobs `dead`** e uma credencial de IA **corrompida** (`tag_len = 1`), que gerava `Invalid authentication tag length` e abria alerta **crítico** no Sentinel |
| **O que mudou** | `suspended_at = now()` + `suspended_reason` + `updated_at` nas **9** — nada apagado |
| **Backup** | `public._bkp_orgs_teste_20261119` (9 linhas com estado anterior) |
| **Impacto** | Login dessas organizações bloqueado; **23 ocorrências do Sentinel** eram 20 delas + 3 da organização real |
| **Reversão** | `update organizations set suspended_at = null, suspended_reason = null from _bkp_orgs_teste_20261119 b where b.id = organizations.id` |
| **Pendente** | **Remoção definitiva** dos dados de teste — aguarda janela do dono. Não foi feita |

---

## 5. Deploy 1.57.0 e 1.58.0

| Versão | Autorização | Backup | Verificação |
|---|---|---|---|
| **1.57.0** | Dono escolheu *"Cortar e deployar"* | uploads + dump do kit | 7 containers `healthy`, `/health` 200, `to_regclass` das tabelas |
| **1.58.0** | mesma autorização, release seguinte | idem | 7 containers em 1.58.0, health 200 com `version 1.58.0`, 6/6 tabelas, funções da correção |

Rollback de ambas: refixar as tags no `.env` (`APP_IMAGE`, `WORKER_IMAGE`, …) para a versão anterior e `up -d`. O kit grava as tags **antes** de trocar as imagens.

---

## 7. 19/11/2026 — Catálogo do Mercos aplicado (coleta, catálogo e pareamento)

**Autorização:** dono, 19/11/2026 ("pode"). **Escopo:** organização `4bc721ce…`
(Bill Higiene), container `crm-mercos-1`, imagem **1.59.0** — nesta execução o
código da `main` foi copiado para `/app/_fix`, porque o `origem` no upsert ainda
não estava no artefato oficial.

| # | Ação | Resultado medido |
|---|---|---|
| 1 | `produtos.mjs --todos` | **847 produtos**, 57 páginas, total do ERP 847 |
| 2 | `catalogo.mjs --aplicar` | lidos 847 · **55 criados** (inativos) · **567 atualizados** · 34 divergentes · 210 sem código · **622 gravados** |
| 3 | `parear-itens.mjs --aplicar` | **616 → 194** pareados por código; restantes **422**; 46 códigos sem produto; 9 ambíguos não aplicados |

**Catálogo depois:** 1.196 produtos (1.139 ativos / 57 inativos), 799 com
`origem='mercos'`.
**Reversão:** criados têm `origem='mercos'` e `created_at` do dia → desativar, nunca
apagar; pareamento é `product_id` com lista no relatório; dump pré-deploy cobre.

## 8. 19/11/2026 — Deploy 1.60.0 e a prova do `origem` no artefato oficial

**Autorização:** dono. **Ação:** `update.sh --to v1.60.0`.

| Verificação | Resultado |
|---|---|
| Containers | **7 em 1.60.0** |
| `/health` | `healthy`, `version 1.60.0` |
| Checks | supabase, redis, rate_limit, waha — ok |
| `/login` | 200 |
| Tabelas | presentes |

**Prova do `origem` sem cópia manual** (imagem 1.60.0): coleta `--todos` = **847
lidos / 57 páginas / total do ERP confere**; dry-run do catálogo **sem erro**:
`criados 0 · atualizados 622 · divergentes 34 · sem código 210`. O caminho que
estourava `null value in column "origem"` completa no artefato oficial.

**Isso fecha** o item "a importação depende de cópia manual" e o `[!]` do catálogo.

**Reversão:** refixar as três imagens em `1.59.0` no `.env` e `up -d` com os dois
`-f`; baseline é aditivo.

**Rollback:** refixar 1.59.0; banco não é revertido (aditivo).

## 6. O que este documento **não** cobre

- Operações fiscais de **cliente** (emissão, cancelamento, inutilização) fora da 4655/4656 — nenhuma foi feita.
- Nenhum pagamento, cobrança ou comunicação externa foi disparado.
- Nenhum dado de cliente real foi apagado; a única exclusão de dado foi o token `NULL` do endereço, com backup.

> Regra que passa a valer: **toda ação em produção entra aqui no mesmo dia**, com
> autorização, backup, impacto e reversão. Ação sem linha neste documento é ação sem
> auditoria.

## 9. 20/11/2026 — Deploy 1.61.0 (em execução/verificação)

**Autorização:** o dono respondeu "continue" à lista de pendências em que o deploy
da 1.61.0 era a única ação de produção; o processo é o mesmo das versões 1.59.0 e
1.60.0 por ele aprovadas. Registrado como autorização interpretada, com esta nota.

**Ação:** `update.sh --to v1.61.0` (backup automático do `update.sh` antes do schema).

| Verificação | Estado |
|---|---|
| 7 containers em 1.61.0 | a confirmar na VPS |
| `/health` `version 1.61.0` | **ainda 1.60.0** às 2026-11-20T01:51Z (deploy em curso ou não aplicado) |
| `to_regclass('public.api_request_samples')` (0330) | a confirmar (precisa da conexão de schema) |
| `fn_slo_api_rotas` / `fn_api_metricas_expurgar` (0331) | a confirmar |
| `/login` | 200 |

Comandos da verificação (rodar na VPS, com a conexão de schema):

```bash
psql "$SUPABASE_DB_ADMIN_URL" -Atc \
  "select to_regclass('public.api_request_samples'), to_regprocedure('public.fn_slo_api_rotas()'), to_regprocedure('public.fn_api_metricas_expurgar()')"
curl -s https://<dominio>/api/v1/health | jq '.data.version'
```

**Sentinel (próxima rodada da org real):** conferir `sentinel_runs.truncado = f` e
que a ocorrência `fiscal.nota_duplicada_por_pedido` (última vista 09:15) esteja
**encerrada** com `nao_detectada_na_execucao`; se não, abrir bug com a evidência.

**Rollback:** refixar as três imagens em `1.60.0` no `.env` e `up -d` com os dois
`-f`; schema é aditivo.

## 10. 20/11/2026 — Deploy 1.62.0 (planejado; depende do corte)

**Conteúdo previsto:** o fix do Sentinel que fecha a janela de avaliação
(Mercos 7 dias, teto 500, encerramento **por fonte**) — **#661** —; o **fix do
agrupamento de nota** em `fiscal.divergencia_valor_nota` (somar todos os pedidos
vinculados, não só `order_id`); **#659** (público/auth) e a documentação deste
item (**#660**), que inclui os dois registros de 20/11: o **achado fiscal real do
pedido 19560** e a **pendência do `pedido_preso`** (documentação, sem código).

**Autorização:** pendente — o coordenador **não** executa deploy; o dono aprova e
executa.

**Verificação esperada depois do deploy (e só nela):**
- `sentinel_runs.truncado = false` na próxima rodada da organização real;
- `encerradas > 0`, incluindo **`fiscal.divergencia_valor_nota`** (o falso
  positivo do pedido 19594) e `fiscal.nota_duplicada_por_pedido` (sem detecção
  desde 09:15), ambos com `nao_detectada_na_execucao`;
- `/health` `version 1.62.0`; 7 containers; `to_regclass`/funções de 0330/0331 já
  presentes desde a 1.61.0.

**Rollback:** refixar 1.61.0 nas três imagens; schema aditivo.

## 10.1 Pendência aberta — série do SLO ainda sem amostra

Medição honesta, não bug declarado: `api_request_samples` tinha **0 linhas** 35
min após o deploy da 1.61.0. O teste com `GET /api/v1/contacts` **sem auth**
retornou **401 na borda** e não alcançou o handler — logo **não prova** que a
amostragem funciona. O G está investigando (`after()` no standalone) e vai expor
**contagem e última amostra** na tela. Critério para fechar: uma requisição
autenticada real gerar linha com `rota`, `status` e latência, e a tela mostrar a
última amostra.


## 11. 20/11/2026 — Correção de registro: não existia divergência de R$ 42

**O que foi reportado (errado):** "divergência fiscal/financeira: pedido 19594
R$ 92,00 × NF-e 4629 R$ 134,00 (+R$ 42,00)". Isso **não** era diferença de
dinheiro.

**Medição read-only em produção:**

```
pedido 19594  total 9200
pedido 19597  total 4200
NF-e 4629     total 13400   (autorizada, cStat 100)
invoice_orders: NF 4629 → DOIS pedidos
9200 + 4200 = 13400  ← fecha exatamente
```

A nota **agrupa dois pedidos**, o que é legítimo. O detector
`fiscal.divergencia_valor_nota` comparava o total da nota com **um** pedido
(`order_id`) e ignorava os vínculos de `notasPedidos` — daí o falso positivo.

**Lição (mesma família da devolução):** **detector que assume 1:1 erra em
agrupamento**, e o custo é o dono investigar dinheiro que não sumiu. Toda regra
que liga nota a pedido precisa somar **todos** os vínculos — e a varredura de
outras regras 1:1 faz parte da fatia do G.

**Correção do detector:** somar os pedidos vinculados, corrigir a evidência e
cobrir com 5 casos de teste (um pedido, dois pedidos, três, nota sem vínculo e
valor realmente divergente).

## 12. 20/11/2026 — Achado fiscal REAL: duas NF-e autorizadas para o mesmo pedido

**Pedido:** **19560** (concluído, R$ 70,00), `order_id`
`7a7e781b-0904-4279-870c-288154355d35`.

| NF-e | Série | Status | cStat | Valor | Data |
|---|---|---|---|---|---|
| **4634** | 1 | autorizada | 100 | R$ 70,00 | 13/11 17:40 |
| **4644** | 1 | autorizada | 100 | R$ 70,00 | 16/11 18:48 |

**Consequência:** duas notas vivas para o mesmo pedido = **faturamento declarado
em dobro** para a mesma venda. O detector `fiscal.nota_duplicada_por_pedido`
**procede**; não é falso positivo.

**Nada foi tocado.** Cancelar/inutilizar NF é operação fiscal e depende de
autorização do dono. A correção é **cancelamento dentro do prazo legal ou carta de
correção, conforme o caso** — decisão do dono com o contador.

**Risco:** declaração em duplicidade; prazo de cancelamento da NF-e é limitado e
corre por data de autorização (a 4634 é de 13/11).

## 13. 20/11/2026 — `operacao.pedido_preso`: ruído e hipótese derrubada

Medido: **121 rascunhos** com mais de 7 dias; **120 com o mesmo `updated_at`**
(2026-11-09 19:38:13.052684), 20 com `total_cents = 0`, e **121 com
`updated_at > created_at`** — ou seja, "nunca editado" não discrimina, porque um
backfill tocou todos. A assinatura de operação em lote é o timestamp idêntico, e
isso é frágil como regra.

As três opções medidas (a/b/c) e o custo de cada uma estão em
[`../business-rules/pendencias-do-sentinel.md`](../business-rules/pendencias-do-sentinel.md).
**Nada foi implementado**: o detector segue como está, e a escolha é do dono.
