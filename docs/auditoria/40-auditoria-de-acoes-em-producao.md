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

## 6. O que este documento **não** cobre

- Operações fiscais de **cliente** (emissão, cancelamento, inutilização) fora da 4655/4656 — nenhuma foi feita.
- Nenhum pagamento, cobrança ou comunicação externa foi disparado.
- Nenhum dado de cliente real foi apagado; a única exclusão de dado foi o token `NULL` do endereço, com backup.

> Regra que passa a valer: **toda ação em produção entra aqui no mesmo dia**, com
> autorização, backup, impacto e reversão. Ação sem linha neste documento é ação sem
> auditoria.
