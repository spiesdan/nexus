-- 0263_pedido_chave_sincronizacao — o celular manda o pedido duas vezes e o
-- servidor cria uma vez.
--
-- ┌── O defeito que isto impede ──────────────────────────────────────────
--
-- O sincronizador offline manda o pedido, o timeout estoura, e ele manda de
-- novo — sem saber se o primeiro chegou. Sem chave de idempotência, o segundo
-- POST cria um SEGUNDO pedido: mesmo cliente, mesmos itens, outro número.
--
-- O vendedor descobre no fechamento do mês, com dois romaneios e um cliente
-- dizendo que recebeu dobrado. E não há como distinguir "duplicou no sync" de
-- "o vendedor lançou duas vezes" — exceto pela chave que o celular mandou.
--
-- ─── Por que a chave é do CLIENTE e não do servidor ──────────────────────
--
-- Só quem manda sabe que está repetindo. Um `Idempotency-Key` de header morre
-- no retry de outra sessão; um campo no corpo sobrevive a app fechado, reboot e
-- troca de rede — que é exatamente quando o retry acontece.
--
-- ─── Por que `(organization_id, chave)` e não só `chave` ──────────────────
--
-- UUID v4 não colide na prática, mas "na prática" não é garantia. Dois
-- dispositivos com gerador quebrado gerando a mesma sequência colidiriam entre
-- orgs — e uma colisão entre orgs é vazamento de dado (o POST devolveria o
-- pedido da OUTRA org com `ja_existia: true`). O escopo por org torna a
-- colisão impossível de atravessar a parede do tenant.
--
-- ─── Por que unique COMUM e não parcial ───────────────────────────────────
--
-- `NULL` não conflita em unique do Postgres: dez mil pedidos sem chave
-- convivem, e duas chaves iguais não. Não há `where` porque não há estado a
-- filtrar — diferente de `operational_alerts`, onde a unique é sobre
-- `status = 'aberto'` porque a linha resolvida precisa sair do alcance.
--
-- ─── O que NÃO muda ───────────────────────────────────────────────────────
--
-- Nada no fluxo online. A chave é opcional; sem ela, o POST se comporta como
-- antes. E o número continua do servidor (`fn_proximo_numero_pedido`) — o
-- celular nunca numera, porque dois celulares numerando quebram a sequência.

-- ─── 1. A coluna ─────────────────────────────────────────────────────────
--
-- `text` e não `uuid`: o Postgres validaria o formato, mas a validação de
-- formato é do zod na rota — e uma chave futura que não seja UUID (IMEI +
-- contador, por exemplo) não deveria quebrar o banco.
alter table commercial_orders
  add column if not exists chave_sincronizacao text;

comment on column commercial_orders.chave_sincronizacao is
  'UUID gerado no dispositivo que capturou o pedido offline. Retry com a mesma '
  'chave devolve o pedido existente em vez de criar outro. NULL = pedido criado '
  'online, sem sincronização.';

-- ─── 2. A trava ───────────────────────────────────────────────────────────
--
-- Nome explícito no lugar do default: um índice com nome gerado (`..._key`)
-- não diz o que protege quando aparece num log de erro às 3h da manhã.
drop index if exists commercial_orders_org_chave_sincronizacao_uidx;
create unique index if not exists commercial_orders_org_chave_sincronizacao_uidx
  on commercial_orders (organization_id, chave_sincronizacao);
