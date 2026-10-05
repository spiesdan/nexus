/** Sonda SOMENTE LEITURA: orgs, produtos parecidos com Solubill, fontes FAQ existentes. */
import pg from "pg";
import { carregarEnvLocal } from "./lib/env-de-teste";

const dbUrl = carregarEnvLocal().SUPABASE_DB_URL;
if (!dbUrl) throw new Error("SUPABASE_DB_URL ausente");

const pool = new pg.Pool({ connectionString: dbUrl });

(async () => {
  const orgs = await pool.query(
    `select id, name, slug, created_at from public.organizations order by created_at limit 20`,
  );
  console.log("— organizations —");
  for (const o of orgs.rows) console.log(o.id, "|", o.name, "|", o.slug);

  const prods = await pool.query(
    `select organization_id, codigo, nome, marca, categoria, preco_cents, quantidade, ativo
       from public.catalog_products
      where lower(nome) ~ 'solub|solup|solupa|desengrax|limpa.?chassi|hepta'
         or lower(coalesce(marca,'')) ~ 'solub|solup'
      order by organization_id, nome
      limit 100`,
  );
  console.log(`— catalog_products (${prods.rowCount}) —`);
  for (const p of prods.rows)
    console.log(
      p.organization_id, "|", p.codigo, "|", p.nome, "|", p.marca, "|",
      p.categoria, "| R$", (p.preco_cents / 100).toFixed(2), "| qtd", p.quantidade, "| ativo", p.ativo,
    );

  const fontes = await pool.query(
    `select s.organization_id, s.id, s.name, s.source_type, s.status, s.last_index_status,
            s.chunks_count, s.last_indexed_at,
            (select count(*) from public.ai_faq_items f where f.knowledge_source_id = s.id) as itens
       from public.ai_knowledge_sources s
      where s.source_type = 'faq'
      order by s.organization_id, s.name`,
  );
  console.log(`— ai_knowledge_sources tipo faq (${fontes.rowCount}) —`);
  for (const f of fontes.rows)
    console.log(
      f.organization_id, "|", f.id, "|", f.name, "|", f.status, "| idx:",
      f.last_index_status, "| chunks:", f.chunks_count, "| itens:", f.itens,
    );

  await pool.end();
})().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
