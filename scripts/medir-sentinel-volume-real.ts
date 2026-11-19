/**
 * Mede o Sentinel com o volume REAL da organização (aproximado, local):
 * ~1.2k produtos, 32k itens/movimentos, 14k contatos, 1.5k pedidos.
 *
 * Responde "por que trunca?": separa TEMPO de detecção de TETO de coleta,
 * mostrando `truncados` (quais consultas cortaram) e o tempo por regra.
 * Só roda em loopback e com SENTINEL_VOLUME_OK=1; limpa tudo no finally.
 */
/* eslint-disable no-console */
import { Pool } from "pg";

import { coletarSnapshot } from "@/lib/sentinel/coleta";
import { executarDetectores } from "@/lib/sentinel/motor";
import { destinoEhLocal } from "@/scripts/lib/env-de-teste";

const PRODUTOS = 1_200;
const MOVIMENTOS = 32_000;
const CONTATOS = 14_000;
const PEDIDOS = 1_500;
const ITENS = 32_000;

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const DB = process.env.SUPABASE_DB_URL ?? "";
if (process.env.SENTINEL_VOLUME_OK !== "1") throw new Error("Defina SENTINEL_VOLUME_OK=1");
if (!destinoEhLocal(URL) || !destinoEhLocal(DB)) throw new Error("Só loopback");

const pool = new Pool({ connectionString: DB, max: 2 });
let orgId = "";

async function limpar(): Promise<void> {
  if (!orgId) return;
  await pool.query("begin");
  await pool.query("set local session_replication_role = replica");
  await pool.query(`delete from public.inventory_movements m using public.catalog_products p where m.organization_id = $1 and m.product_id = p.id and p.codigo like 'CARGA-VOL-%'`, [orgId]);
  await pool.query(`delete from public.commercial_order_items where organization_id = $1 and produto_codigo like 'CARGA-VOL-%'`, [orgId]);
  await pool.query(`delete from public.commercial_orders where organization_id = $1 and numero between 9500000 and $2`, [orgId, 9500000 + PEDIDOS]);
  await pool.query(`delete from public.catalog_products where organization_id = $1 and codigo like 'CARGA-VOL-%'`, [orgId]);
  await pool.query(`delete from public.contacts where organization_id = $1 and name like 'Carga Volume %'`, [orgId]);
  await pool.query("commit");
}

async function main(): Promise<void> {
  const org = await pool.query<{ id: string }>(
    `select id from public.organizations where slug = 'e2e-test-org' limit 1`,
  );
  orgId = org.rows[0]?.id ?? "";
  if (!orgId) throw new Error("org e2e-test-org ausente");

  const contato = await pool.query<{ id: string }>(
    `select id from public.contacts where organization_id = $1 limit 1`,
    [orgId],
  );
  const contactId = contato.rows[0]?.id;
  if (!contactId) throw new Error("contato base ausente");

  await limpar();
  const t0 = Date.now();
  await pool.query("begin");
  await pool.query("set local session_replication_role = replica");

  await pool.query(
    `insert into public.catalog_products
       (organization_id, codigo, nome, preco_cents, controla_estoque, quantidade, ativo, created_at)
     select $1, 'CARGA-VOL-' || g, 'Carga Volume ' || g, 1000, true, 10, true, now()
       from generate_series(1, $2) g`,
    [orgId, PRODUTOS],
  );
  await pool.query(
    `with p as (
       select id, row_number() over (order by codigo) as rn
         from public.catalog_products
        where organization_id = $1 and codigo like 'CARGA-VOL-%'
     )
     insert into public.inventory_movements
       (organization_id, product_id, tipo, quantidade, origem, created_at)
     select $1, p.id, 'entrada', 1, 'inventario', now() - (g || ' seconds')::interval
       from generate_series(1, $2) g
       join p on p.rn = ((g - 1) % $3) + 1`,
    [orgId, MOVIMENTOS, PRODUTOS],
  );
  await pool.query(
    `insert into public.contacts (organization_id, name, cidade)
     select $1, 'Carga Volume ' || g, 'Carga' from generate_series(1, $2) g`,
    [orgId, CONTATOS],
  );
  await pool.query(
    `insert into public.commercial_orders
       (organization_id, numero, contact_id, cliente_nome, status, subtotal_cents,
        desconto_cents, frete_cents, total_cents, created_at, updated_at)
     select $1, 9500000 + g, $2, 'Carga Volume', 'faturado', 1000, 0, 0, 1000,
            now() - (g || ' seconds')::interval, now()
       from generate_series(1, $3) g`,
    [orgId, contactId, PEDIDOS],
  );
  await pool.query(
    `with o as (
       select id, row_number() over (order by numero) as rn
         from public.commercial_orders
        where organization_id = $1 and numero between 9500001 and $2
     ), p as (
       select id, codigo, nome, row_number() over (order by codigo) as rn
         from public.catalog_products
        where organization_id = $1 and codigo like 'CARGA-VOL-%'
     )
     insert into public.commercial_order_items
       (organization_id, order_id, product_id, produto_codigo, produto_nome,
        quantidade, preco_unit_cents, subtotal_cents, posicao, created_at)
     select $1, o.id, p.id, p.codigo, p.nome, 1, 1000, 1000, 1, now()
       from generate_series(1, $3) g
       join o on o.rn = ((g - 1) % $4) + 1
       join p on p.rn = ((g - 1) % $5) + 1`,
    [orgId, 9500000 + PEDIDOS, ITENS, PEDIDOS, PRODUTOS],
  );
  await pool.query("commit");
  console.log(`seed em ${Date.now() - t0} ms`);

  const c0 = Date.now();
  const coleta = await coletarSnapshot(orgId);
  console.log(
    `coleta em ${Date.now() - c0} ms · truncado=${coleta.truncado} · truncados=${JSON.stringify(coleta.truncados)}`,
  );

  const d0 = Date.now();
  const deteccao = executarDetectores(coleta.snapshot);
  const top = Object.entries(deteccao.temposPorRegra).sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log(
    `detecção em ${Date.now() - d0} ms · truncadoPorTempo=${deteccao.truncadoPorTempo} · regras=${deteccao.regrasAvaliadas.length}`,
  );
  console.log("top regras (ms):", JSON.stringify(top));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await limpar().catch((e) => console.error("limpeza falhou", e));
    await pool.end().catch(() => undefined);
  });
