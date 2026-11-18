# Agente C — Fiscal e financeiro: o que foi fechado e o que depende de decisão

> Worktree `aaa-front-fiscal` · branch base `front/fiscal` · commit base `239efd32`
> (depois atualizado para `nexus/main` `f644b21c`, com #456 e #489). Medido em
> 18/11/2026. Nenhuma operação fiscal real, pagamento ou cobrança foi executada;
> nenhum acesso a produção.
>
> PRs: **#494** (importação de entrada), **#500** (corrida do produto novo da
> entrada), **#495** (recuperação de nota travada), **#496** (cancelamento ×
> drain).

## 1. Reconciliação com o que já estava merged

| Item | Estado | Evidência |
|---|---|---|
| Um pedido, uma nota viva (`0315`) | **merged** (#484) | trigger `fn_invoice_uma_viva_por_pedido`; `test:db` |
| Teto do recebível é garantia da transação (`0314`) | **merged** (#485 commit `ffca9711`) | triggers em `financial_payments`; `test:db` |
| Recebimento de compra por CAS | **merged** (#485) | `lib/compras/recebimento.ts` |
| F-09 = B (baseline canônico) | **merged** | `MANIFEST.md` + catraca |

**Correção de rota durante a rodada:** o recebível avulso (`Idempotency-Key`)
foi corrigido no PR **#456**, merged na `main` enquanto este worktree estava
aberto (`615de767`). A versão deste agente para o mesmo item foi **descartada**
— manter as duas criaria duas fontes de verdade (coluna própria + tabela
`idempotency_keys`). Ver §2.C3 para o que resta de concorrência nesse caminho.

Os três PRs deste agente não repetem essas correções; cada um ataca um caminho
que continuava aberto.

## 2. P0 fechados nesta rodada

### C1 — Importação de NF-e de entrada duplicava estoque sob concorrência

**Onde:** `app/api/v1/fiscal-entradas/[id]/importar/route.ts`.

**Defeito medido no código:** a rota lia `estoque_processado_em`, percorria os
itens somando `quantidade` ao catálogo e só no fim gravava o flag. Dois POSTs
concorrentes (duplo clique, retry, sync + clique) liam `null` os dois: o estoque
entrava duas vezes. O pagável não duplicava porque `(organization_id,
entrada_id, parcela_n)` tem unique; o estoque não tinha trava equivalente. É a
mesma classe do P0 #485 (recebimento de compra), em outra porta.

**Correção, sem mudar a regra:**
- `lib/fiscal/importacao-da-entrada.ts` reivindica o lado por CAS
  (`update … where flag is null`). Quem perde e encontra o lado em andamento
  recebe 409; quem encontra o lado concluído segue idempotente.
- A soma de estoque passa por `ajustarEstoque` (CAS em `quantidade`), então
  duas entradas/pedidos no mesmo produto não apagam a movimentação um do outro.
- Falha de ajuste vira aviso visível na resposta + log, em vez de silêncio.
- Pagável com erro diferente de `23505` também vira aviso — dinheiro que não
  nasceu não fica invisível.

**Provas:** `lib/fiscal/importacao-da-entrada.test.ts` (4 desfechos do CAS) e
`app/api/v1/fiscal-entradas/[id]/importar/route.test.ts` (reivindicação antes da
primeira escrita; perdedor não move estoque e recebe 409).

### C1b — Produto novo da entrada perdia a quantidade na corrida de código

**Onde:** mesma rota de importação (`#500`).

**Defeito medido:** o item sem produto no catálogo é inserido por `codigo`. Duas
notas com o mesmo código novo importadas ao mesmo tempo: o INSERT do segundo
perde na unique `(organization_id, codigo)`, `novoId` fica nulo e a rota seguia
sem vincular o item e sem somar a quantidade — o estoque daquela nota
desaparecia em silêncio (perda, não duplicidade).

**Correção:** no `23505`, relê o vencedor pelo código e soma a quantidade desta
nota por `ajustarEstoque` (CAS), preservando a do vencedor; se nem criar nem
achar, a resposta leva aviso e o log registra o código. O vínculo do item passa
a ser gravado nesse caminho também.

**Provas:** caso novo em `route.test.ts` (consulta nula → INSERT `23505` →
releitura 10 → estoque 12 + vínculo); 10 testes verdes entre rota e helper.

### C2 — Recuperação de nota travada em `em_emissao` não existia

**Onde:** `app/api/v1/invoices/[id]/reemitir/route.ts`.

**Defeito medido:** o drain marca o job `pendente → processando` ANTES da SEFAZ.
Worker que morre no meio deixa o job `processando` para sempre e a nota em
“Emitindo”. A rota dizia recuperar “nota `erro` **ou `em_emissao` travada**”, mas
`podeTransitar("em_emissao","em_emissao")` é `false`: a recuperação devolvia 422
sempre. A única saída era editar o banco.

**Correção, sem inventar transição:** `lib/fiscal/recuperacao.ts` decide pelo
job aberto. Job `processando` dentro do teto (15 min) → 409 “aguarde” (reenviar
cedo duplicaria transmissão); passado o teto → o MESMO job volta a `pendente`
por CAS em `status + updated_at`; sem job (nota órfã) → job novo; job
`pendente` → 200 `ja_na_fila`. Terminais (autorizada/denegada/cancelada)
continuam 422.

**Provas:** `lib/fiscal/recuperacao.test.ts` (8 casos) e
`app/api/v1/invoices/[id]/reemitir/route.test.ts` (7 casos, incluindo CAS
perdido e unique de job aberto).

### C3 — Recebível avulso e `Idempotency-Key` — **merged por outro PR**

**Estado:** fechado pelo PR **#456** (`fix/aaa-6a3-idempotencia-recebivel`,
merge `615de767`), que usa a tabela `idempotency_keys` já existente
(`lib/api/idempotencia.ts`): replay devolve os mesmos ids com
`Idempotent-Replayed: true`, mesma chave + corpo diferente vira 409.
**Não implementei de novo.** A versão deste worktree (coluna
`financial_receivables.idempotency_key` + unique parcial) foi descartada para
não criar duas fontes de verdade.

**O que ainda falta nesse caminho (não é regressão do #456, é limite):** a
leitura da chave é feita antes do efeito e a gravação é best-effort depois. Dois
POSTs **simultâneos** com a MESMA chave podem executar os dois antes de qualquer
um gravar — o segundo não vê a linha ainda, cria as parcelas e só colide no
`INSERT` da chave, que é engolido. O retry sequencial está coberto; a corrida
simultânea não. A branch `feat/d03-idempotencia-fiscal` já traz
`reservarIdempotencia` (claim com status 0) no helper — o caminho certo é a rota
de recebível passar a usar esse claim quando D-03 mergear, não uma coluna nova.
**Recomendação:** follow-up de 1 linha na rota + teste com duas conexões, depois
de D-03.

### C4 — Cancelar durante a transmissão sobrescrevia o estado fiscal

**Onde:** `POST /api/v1/invoices/[id]/cancel`.

**Defeito medido:** o drain reivindica o job e transmite; o cancelamento lia
`em_emissao`, marcava o job `concluido` (inclusive `processando`) e gravava
`cancelada`. Quando o drain voltava, `finalizar` regravava `autorizada` por
`id`, sem condição — a nota existe no fisco e o app diz que foi cancelada (ou o
inverso). O comentário da rota afirmava que “o claim condicional protege a
corrida”: ele protege dois drains, não cancel × drain.

**Correção:**
- job `processando` → 409 “transmissão em andamento” (espere o resultado;
  autorizada depois vira cancelamento formal);
- job `pendente` → encerra por CAS em `status = 'pendente'`; se o drain
  reivindicou no meio, 0 linhas → 409;
- o UPDATE da nota carrega `status = status lido` (CAS) e 0 linhas → 409.

**Provas:** `app/api/v1/invoices/[id]/cancel/route.test.ts` (4 casos).

## 3. Decisões pendentes (não implementadas de propósito)

### D1 — NF-e autorizada não gera recebíveis

Quando a SEFAZ autoriza, o drain marca o pedido `aprovado → faturado`
(`faturarPedidosDaNota`), mas **não** chama `gerarRecebiveis`. Só o PATCH do
pedido em `/api/v1/commercial-orders/[id]` gera. Resultado: um pedido faturado
pela nota aparece na conciliação como `pedido_sem_financeiro` até alguém clicar
“Gerar financeiro”.

A regra escrita no código (“chamar ao faturar”) cobre o PATCH, não o caminho da
NF. Não há regra de produto dizendo que a autorização **deve** criar o
recebível — e criar dinheiro a partir de um evento externo é decisão de negócio.

**Opções:**
1. **Gerar na autorização** (idempotente por pedido/parcela, já provado pela
   `0315`): o fato fiscal fecha o laço financeiro sem clique. Risco: o valor do
   recebível vem de `commercial_orders.total_cents`, não do total autorizado da
   nota (frete/ajustes podem divergir).
2. **Manter manual** e a conciliação/Sentinel sinalizar o pedido faturado sem
   recebível (comportamento atual, mas hoje ninguém é avisado na tela).
3. **Gerar só quando `total_cents` da nota == soma dos pedidos**, senão abrir
   ocorrência. Mais seguro, mais código e uma regra nova.

Recomendação: (1) com a condição da (3) — a nota é a prova do fato; divergência
de valor deve virar ocorrência, não recebível silenciosamente errado.

### D2 — Recebível gerado antes da edição do pedido não é recomposto

`gerarRecebiveis` só insere parcelas que faltam. Se o total do pedido mudar
depois, as parcelas antigas ficam e a soma diverge do pedido (a conciliação
mostra `valor_divergente`). Regerar/cancelar recebível existente é mudança de
regra financeira: precisa de decisão (recompor? exigir cancelamento explícito?
bloquear edição de total com recebível pago?).

### D3 — Manifestação de entrada concorrente transmite duas vezes

`POST /fiscal-entradas/[id]/manifestar` não tem CAS no status antes de chamar a
SEFAZ. Dois cliques simultâneos podem gerar dois eventos 210210 (a SEFAZ
normalmente recusa o segundo como duplicidade, e a rota grava a recusa como
`erro`). Não é corrupção de dados, mas polui a timeline e o histórico. Opções:
CAS em `manifestada_em is null` antes de transmitir (recomendado) ou aceitar o
comportamento da SEFAZ.

### D4 — Cancelamento concorrente de nota autorizada

Dois cancelamentos simultâneos de uma nota `autorizada` podem transmitir dois
eventos 110111; o segundo tende a ser recusado pela SEFAZ como duplicidade e a
rota devolve 422. O estado final é correto. Serializar exigiria uma coluna de
“cancelamento em curso” (schema novo) — não vale o custo agora.

## 4. Fora de escopo / limitações

- Nenhuma transmissão à SEFAZ, pagamento, cobrança ou emissão real foi
  executada. As provas de banco rodam em Postgres descartável (`pnpm test:db`).
- `financial_pagaveis` segue sem baixa/cancelamento (documentado como fase
  futura na própria rota); não há operação de escrita para testar além da
  importação.
- A UI do financeiro não tem (hoje) formulário de recebível avulso; a
  `Idempotency-Key` do #456 protege o contrato da API e o retry sequencial do
  `apiClient`, não a corrida de dois POSTs simultâneos (ver §2.C3).
