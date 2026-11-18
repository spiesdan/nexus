# 6.A3 — idempotência, auditoria e repetição nas operações externas/financeiras

> Medido em 17/11/2026 no checkout `nexus/main` @ `b63a8a60`. O critério do prompt é
> "operações externas e financeiras têm idempotência, auditoria e tratamento de
> repetição apropriado". Este documento responde **operação por operação**, com o
> mecanismo e o teste que o prova — não com a afirmação de que "o produto é
> idempotente".

## 1. O que é idempotência aqui

Três mecanismos diferentes resolvem repetição, e confundi-los produz falsa segurança:

| Mecanismo | O que garante | Onde |
|---|---|---|
| **Chave do cliente** (`Idempotency-Key`) | o mesmo POST, repetido por retry, devolve a resposta original e não cria de novo | `idempotency_keys` (unique `org, key, endpoint`, TTL 24 h) |
| **Unique de negócio** | duas tentativas do mesmo fato colidem no banco | índices parciais (`(order_id, parcela_n)`, `chave_sincronizacao`, sobreposição de faixa) |
| **Guarda de estado** | a operação já terminal recusa repetir | `status = transmitida/cancelada`, `ja_existia` |

`audit()` cobre as mutações; repetição **recusada** também é auditada quando muda
estado. Nenhum mecanismo substitui o outro: chave protege o retry do cliente, unique
protege a corrida de dois cliques, guarda de estado protege a operação já concluída.

## 2. Matriz por operação

| Operação | Rota | Mecanismo de repetição | Prova |
|---|---|---|---|
| Criar pedido (inclusive offline) | `POST /api/v1/commercial-orders` | unique `chave_sincronizacao` + `ja_existia` | E2E `pedido-idempotencia.spec.ts` — dois POSTs, um pedido, mesmo id/número (ao vivo) |
| Gerar recebíveis do pedido | `POST /api/v1/financeiro/gerar` | unique parcial `(order_id, parcela_n)`; parcela feita é pulada | `lib/comercial/financeiro.ts` `gerarRecebiveis`; 23505 conta como existente |
| **Criar recebível avulso** | `POST /api/v1/financeiro/recebiveis` | **`Idempotency-Key`** (novo em 17/11/2026) | `tests/unit/recebiveis-idempotencia-route.test.ts` — replay devolve os mesmos ids e não insere; mesma chave com outro corpo → 409 |
| Registrar recebimento | `POST /financeiro/recebiveis/[id]/pagamentos` | `Idempotency-Key` gravada em `financial_payments.idempotency_key`; corrida relê o vencedor | `lib/comercial/financeiro.ts` `registrarPagamento`; rota devolve `ja_existia` |
| Aprovar solicitação LGPD | `POST /lgpd/requests/[id]/approve` | `Idempotency-Key` **obrigatória** (400 sem ela) | rota + `idempotency_keys` |
| Inutilizar faixa da SEFAZ | `POST /fiscal-inutilizacoes` | sobreposição de faixa recusada (409) + status `registrada` → `transmitida` | `tests/unit`/`tests/api` de inutilização; rota recusa faixa com nota viva |
| Retransmitir inutilização | `POST /fiscal-inutilizacoes/[id]/retransmitir` | guarda de estado (só `registrada`/erro retransmite) | rota |
| Retransmitir evento fiscal | `POST /fiscal-events/[id]/retransmitir` | guarda de estado + protocolo persistido | rota; PR #440 fechou a reemissão de autorizada |
| Emitir NF-e | pipeline `faturamento` + `fiscal_jobs` | trava de reemissão (autorizada não reemite) | PR #440 (`fix/fiscal-nao-reemite-autorizada`) |
| Enviar mensagem por MCP | ferramenta `send_whatsapp` | `idempotency_keys` + `request_hash` | `lib/mcp/tools/messages.ts` |
| Receber webhook Nuvemshop | `POST /webhooks/nuvemshop/[event]` | dedupe por id de evento no log | rota + `webhook_events_log` |
| Duplicar pedido | `POST /commercial-orders/[id]/duplicar` | **não é idempotente por desenho**: cada clique cria um pedido novo, com `chave_sincronizacao` própria | rota (documentado) |
| Importar do Mercos / por IA | `POST /commercial-orders/importar-*` | cada importação é uma operação nova; a unique de `chave_sincronizacao` protege o que já existe | rota |
| Gerar proposta/orçamento | `POST /commercial-orders/[id]/orcamento`, `/mercos` | efeito é arquivo/link, não linha financeira; repetir regrava o mesmo caminho | rota |

## 3. O que mudou nesta fatia

`POST /api/v1/financeiro/recebiveis` era o pior caso restante: **N parcelas de uma
vez, sem chave**. Um retry de timeout criava as N de novo — duas dívidas do mesmo
cliente no mesmo pedido. Agora:

1. `lib/api/idempotencia.ts` concentra o uso da tabela `idempotency_keys`
   (`request_hash` estável, replay, conflito 409, gravação best-effort);
2. a rota lê o corpo como texto (o hash descreve o que o cliente mandou, não o
   objeto normalizado pelo Zod), consulta a chave e grava a resposta;
3. replay devolve `Idempotent-Replayed: true` com os **mesmos ids**.

## 4. Lacunas declaradas (não maquiadas)

- **TTL de 24 h**: retry depois disso recria. É o contrato atual da tabela
  (`idx_idem_expiry`); mudar exige decisão de produto e job de limpeza.
- **`financeiro/gerar` não usa chave**: a unique por parcela já impede duplicata;
  o retry devolve sucesso sem distinguir "criei agora" de "já existia" no corpo.
- **Rotas de retransmissão não aceitam chave**: são guardadas por estado, e a
  segunda chamada depois de `transmitida` devolve conflito — não há efeito duplo.
- **Webhooks**: o dedupe depende do id do evento; evento sem id estável (se algum
  provedor mudar) volta a poder duplicar. Não medido por provedor nesta fatia.

## 5. Critério de conclusão (6.A3)

| Pergunta | Resposta |
|---|---|
| Toda operação financeira de **criação** honra retry? | Sim para pedido, recebível, recebimento e geração por pedido; gerar por pedido usa unique em vez de chave (documentado) |
| Toda operação **externa irreversível** tem guarda? | Sim para inutilização, retransmissão, emissão e envio por MCP (guardas de estado/chave) |
| Repetição é **auditada**? | Mutações chamam `audit()`; recusa por estado não gera efeito a auditar |
| Existe teste para o mecanismo? | Sim por linha da matriz; onde o teste é de unidade, está citado |

O item fecha como `[~]` no prompt: a matriz está medida e a lacuna de TTL é conhecida;
`[x]` exigiria provar cada webhook por provedor e decidir a política de expiração.
