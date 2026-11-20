# 51 — Baixa de estoque atômica: o que a rota faz hoje e o que custa mudar

> **Status:** **proposta** (decisão do dono pendente). Nada de comportamento
> mudou. Este documento existe porque a decisão 4 do criador pediu o custo
> **antes** da implementação — e baixa de estoque é regra de negócio, não
> microcopy.
>
> **Base:** `nexus/main` @ `89fd36eb` (20/11/2026).

## 1. O que a rota faz hoje

`POST /api/v1/commercial-orders` → `criarPedidoComercial`
(`lib/comercial/criar-pedido.ts`), em ordem:

| # | Operação | Round-trips |
|---:|---|---:|
| 1 | idempotência: select por `chave_sincronizacao` | 1 |
| 2 | política comercial (`desconto_max_vendedor_pct`, `permite_estoque_negativo`) | 1 |
| 3 | tabela de preço (cabeçalho + overrides), se houver | 1–2 |
| 4 | produtos dos itens | 1 |
| 5 | contato (nome/fantasia) | 1 |
| 6 | `fn_proximo_numero_pedido` (RPC) | 1 |
| 7 | insert do pedido | 1 |
| 8 | insert dos itens | 1 |
| 9 | **por item com estoque controlado**: `select` do saldo + `update` CAS | **2 por item** (até 4 tentativas) |

Para um pedido de **3 itens**, são **~14 round-trips** no caminho feliz. O
compare-and-swap de `lib/estoque/ajustar.ts` evita baixa perdida entre duas
vendas, mas **não há transação**: pedido e itens já foram gravados quando a
baixa começa. Se o CAS esgotar as tentativas (corrida real), a falha só é
logada (`logger.error`) e o pedido **fica sem baixa** — exatamente o estado
que a decisão 4 quer proibir.

## 2. O que “atômico” exigiria

Uma função Postgres `security definer` que, **na mesma transação**:

1. valida a organização do chamador (sem confiar no body);
2. aloca o número (`fn_proximo_numero_pedido`) — ou recebe o número já alocado;
3. insere `commercial_orders` e `commercial_order_items`;
4. baixa o estoque com `update ... set quantidade = quantidade - $qtd
   where organization_id = $org and id = $prod and quantidade >= $qtd`
   (ou `select ... for update` + update);
5. se qualquer passo falhar — inclusive estoque insuficiente ou CAS perdido —
   **rollback**: o pedido não nasce;
6. devolve o pedido criado (e `ja_existia` quando a chave já existir).

Custo no caminho feliz: **1 RPC** no lugar de 2 inserts + 2N updates — para 3
itens, ~9 round-trips em vez de ~14; e **zero** estado parcial. O `insert` dos
itens e a baixa deixam de ser operações independentes.

### O que fica fora da transação (de propósito)

- **Leituras de preço, crédito e política** continuam em TS antes da chamada.
  Elas decidem o que gravar; a transação garante o **commit** do que foi
  decidido, não reimplementa a regra de aprovação.
- **Aprovação de desconto** continua no fluxo atual.
- **Idempotência** continua pela `chave_sincronizacao` (unique por org); a
  função pode devolver o pedido existente sem tocar no estoque.

## 3. Custo de implementação e riscos

- **Migration nova** (+ `baseline.sql` + `MANIFEST.md`): ~80–120 linhas de SQL,
  com `security definer`, `search_path` fechado e grants explícitos. O gate
  `test:db` cobre install/update e os invariantes de definer.
- **Testes**: um unit test da escolha pela flag; um invariante com Postgres
  efêmero provando rollback (estoque insuficiente **não** cria pedido) e
  concorrência (duas chamadas, uma baixa).
- **Flag**: `ORDER_STOCK_ATOMIC` (env, default **false**). Desligada, o caminho
  atual continua idêntico; ligada, `criarPedidoComercial` chama a RPC e não
  executa os inserts/baixas separados. A flag é lida **no servidor**, não no
  cliente.
- **Escape**: `ignorar_estoque` (decisão 3) continua sendo a saída de gerente,
  com motivo e `audit()` — a transação não elimina o override; ela só impede o
  pedido **sem** baixa quando ninguém autorizou ignorar.
- **Risco principal**: a função definer precisa validar a organização e o papel
  sem depender do cliente; qualquer caminho que aceite `p_org` do body é
  cross-tenant. O teste de isolamento entra junto.

## 4. Proposta de sequência (quando o dono aprovar)

1. migration + baseline + MANIFEST + `test:db` (função e rollback);
2. flag `ORDER_STOCK_ATOMIC=false` e o ramo na criação;
3. teste unitário da flag (off = caminho atual, on = RPC);
4. teste de concorrência/rollback no banco efêmero;
5. só então ligar em produção, com o override da decisão 3 disponível.

**O que eu não faço sem a resposta:** mover a baixa para a transação e alterar
o caminho de escrita do pedido. O custo está acima; a decisão é do dono.
