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

## 3. Decisões do dono (18/11/2026) — implementadas

### D1 — SIM: NF-e autorizada gera recebíveis

Quando a SEFAZ autoriza e o pedido `aprovado` vira `faturado`, o drain agora
chama o **mesmo** `gerarRecebiveis` do PATCH de faturamento
(`gerarRecebiveisDaNotaAutorizada`, em `lib/fiscal/drain.ts`). A regra “faturar
gera os recebíveis” passa a valer para o fato que fatura de verdade.

- Idempotente por `(organização, pedido, parcela)`: retry ou crash não duplica;
  parcela existente é pulada e `23505` da corrida conta como existente.
- Cobre os pedidos secundários do agrupamento (`invoice_orders`).
- Origem registrada na auditoria: `financial_receivable.generated` com
  `origem: nfe_autorizada`, `invoice_id`, série/número e contagem.
- Roda para todo pedido da nota em `faturado` (inclusive os que já estavam),
  fechando o intervalo entre “marcou faturado” e “gerou” depois de um crash.
- Falha de um pedido não derruba os outros nem a autorização; fica no log e a
  conciliação mostra. Nada é gerado para pedido fora de `faturado`.
- O valor usa `commercial_orders.total_cents` — o mesmo do PATCH. Divergência
  entre nota e pedido continua visível na conciliação como `valor_divergente`;
  não foi escondida nem “corrigida” com um valor inventado.

**Provas:** `drain.test.ts` (geração, retry sem auditoria nova, agrupamento,
falha parcial, falha de leitura) + `financeiro.test.ts` (pula existente e trata
`23505`) + invariante Postgres `financeiro-recebivel-gerado-idempotente`
(unique com duas conexões simultâneas).

### D2 — NÃO recompor automaticamente (decisão)

Total do pedido alterado depois do recebível **não** recalcula em silêncio. A
conciliação continua apontando `valor_divergente`; a correção é explícita
(ajuste/cancelamento/reemissão, conforme a regra financeira vigente). Nenhum
código novo para recomposição.

### D3 — SIM: manifestação concorrente não transmite duas vezes

`POST /fiscal-entradas/[id]/manifestar` agora:

1. devolve **200 replay** se o mesmo evento já tem `resultado = 'sucesso'`
   (protocolo/cStat originais), sem chamar a SEFAZ;
2. reivindica a transmissão por claim em
   `fiscal_entradas.manifestacao_em_andamento_em` (UPDATE condicional,
   `NULL OR < now() - 5 min`); o concorrente recebe **409**;
3. libera o claim logo após a resposta da SEFAZ (sucesso ou erro), então um
   retry explícito não espera o TTL; processo morto é recuperado em 5 min.

**Provas:** `manifestar/route.test.ts` (replay, claim livre, claim perdido 409,
falha libera) + invariante Postgres `fiscal-claims-nao-transmitem-duas-vezes`
(duas conexões, retomada de claim velho, claim não muda status).

### D4 — SIM: cancelamento concorrente de autorizada não duplica evento

`POST /invoices/[id]/cancel` de nota `autorizada` agora reivindica
`invoices.cancelamento_em_andamento_em` **antes** de transmitir o 110111. A
segunda chamada concorrente recebe **409**; se a primeira já terminou e a nota
já está `cancelada`, recebe **200 replay** (`ja_cancelada: true`) sem novo
evento. Falha da SEFAZ libera o claim; claim morto é retomado em 5 min. A nota
só vira `cancelada` com protocolo do fisco, como antes.

**Provas:** `cancel/route.test.ts` (claim livre, claim perdido 409, replay 200,
falha libera) + o mesmo invariante Postgres.

### Migration `0318` — isolada, sem tocar a `0317` do D-03

Duas colunas `timestamptz` (`fiscal_entradas.manifestacao_em_andamento_em`,
`invoices.cancelamento_em_andamento_em`), apêndice idempotente no `baseline`,
linha no `MANIFEST` e tipos. Nenhuma policy/grant novo; nenhum status muda
durante o claim. A `0317` (D-03) segue reservada e intocada.

## 4. Fora de escopo / limitações

- Nenhuma transmissão à SEFAZ, pagamento, cobrança ou emissão real foi
  executada. As provas de banco rodam em Postgres descartável (`pnpm test:db`).
- `financial_pagaveis` segue sem baixa/cancelamento (documentado como fase
  futura na própria rota); não há operação de escrita para testar além da
  importação.
- A UI do financeiro não tem (hoje) formulário de recebível avulso; a
  `Idempotency-Key` do #456 protege o contrato da API e o retry sequencial do
  `apiClient`, não a corrida de dois POSTs simultâneos (ver §2.C3).
