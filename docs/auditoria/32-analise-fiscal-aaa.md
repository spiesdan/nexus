# 32 — Análise fiscal e financeira do programa AAA

> Base: `docs/auditoria/17-modulos-5.4-5.11.md` (medido em 17/11/2026) + leitura do
> checkout em 18/11/2026 (`nexus/main` @ `126f4bb3`). Separa **fato medido**,
> **correção em PR** e **decisão pendente**. Nenhuma operação fiscal real foi
> executada.

## 1. O que já está corrigido nesta rodada

| Item | Antes (medido no código) | Correção | Onde |
|---|---|---|---|
| Receber acima do saldo sob concorrência | `registrarPagamento` lia a soma, validava e inseria; duas chaves diferentes passavam as duas | Trigger `BEFORE` trava o recebível (`for update`), soma e recusa; `AFTER` recalcula status na mesma transação | #480, migration 0314 |
| Duas notas vivas para o mesmo pedido | "um pedido, uma nota viva" era SELECT + INSERT; clique duplo/retry concorrente criava duas notas com dois jobs | Advisory lock por organização+pedido no INSERT de `invoices`; `invoice_orders` cobre pedido secundário; nota cancelada libera reemissão | branch `fix/aaa-p0-nota-viva`, migration 0315 |
| Status financeiro regredindo | App gravava `status` com a soma lida ANTES do insert, podendo sobrescrever `pago` com `parcial` | Status lido do banco depois do trigger; app não compete mais | #480 |

Regra preservada: `pagamento > saldo` continua erro (422); `cancelado` continua
fechado; estorno continua permitido; emissão continua recusando pedido não
faturável e mais de um destinatário por nota.

## 2. O que continua aberto (com opções, sem invenção)

### F5 — rotas fiscais sem `Idempotency-Key`

**Fato:** nenhuma rota `app/api/v1/fiscal*`/`invoices/**` lê o header. A emissão
hoje é protegida pela trava de nota viva (0315), mas um retry depois de timeout
recebe **409**, não a nota original. Inutilização e manifestação não têm trava
equivalente.

**Opções:**

| Opção | Comportamento | Custo | Risco |
|---|---|---|---|
| **A. Chave persistida por rota** (recomendada) | `Idempotency-Key` grava em `invoices.idempotency_key` (unique por org) / `fiscal_jobs.idempotency_key`; retry devolve o recurso original com 200 | migration + coluna + índice parcial; mesma mecânica do financeiro | baixo: chave ausente mantém o comportamento atual |
| B. Só 409 nomeando a nota | Não muda schema; cliente trata conflito | zero migration | retry deixa de ser transparente; inutilização/manifestação continuam sem proteção |
| C. Chave genérica em tabela `idempotency_keys` | Uma tabela para todas as rotas | reutiliza infra existente (`idempotency_keys`) | exige TTL/limpeza e escopo por rota; mais superfície |

**Decisão necessária (D-03):** A ou B. Recomendação: **A** para `POST /invoices`
e `POST /fiscal-inutilizacoes` (as duas com efeito externo irreversível), B para
as demais até haver demanda.

### F2/F3/F4 — confirmação de operações irreversíveis

**Fato:** inutilização em um clique; importar entrada move estoque e cria
pagáveis sem confirmação; desconhecimento/não-realizada idem.

**Não é regra de negócio** — é UX de confirmação. O prompt (§ Fase 4) exige
"ações destrutivas com explicação de impacto e confirmação adequada". Pode ser
feito por Agente D/E sem mudar o servidor. Critério: diálogo nomeia faixa,
quantidade de notas, estoque e pagáveis afetados; cancelar não escreve nada.

### F6 — listas fiscais com `limit 300` silencioso

**Fato:** `fiscal/{eventos,manifestacoes,produtos,fornecedores}` cortam em 300
sem "há mais". O padrão já existe no repo (`meta.has_more`/`next_offset`, F-30).
Correção mecânica, sem decisão.

### F7 — sincronização sem retry por linha

**Fato:** erro de sincronização é só leitura; uma linha ruim não é reprocessada.
**Opção:** registrar a falha por linha em `fiscal_sync_logs` e oferecer
"tentar de novo" idempotente (mesma chave). Depende de D-03.

## 3. Fora de escopo por decisão

- **Emissão, reemissão, cancelamento, inutilização e transmissão reais**: o
  programa não executa. Testes usam stub/sidecar local; nenhuma SEFAZ real.
- **Pagamento/cobrança real**: idem.
- **Mudar o teto, a régua de status ou a política de numeração**: são regras
  existentes; qualquer mudança exige decisão do dono, não deste programa.

## 4. Evidência desta análise

```text
lib/comercial/financeiro.ts            registrarPagamento / estornarPagamento
lib/fiscal/emitir-nota.ts              trava de nota viva (leitura + insert)
app/api/v1/invoices/route.ts           POST sem Idempotency-Key
app/api/v1/purchase-orders/[id]/receber/route.ts  CAS de estoque + recebido_qtd
supabase/baseline.sql                  0233 (recebíveis), 0234 (fila fiscal), 0294 (invoice_orders)
```
