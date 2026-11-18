/**
 * PAREAMENTO DOS ITENS HISTÓRICOS — por CÓDIGO exato, e só.
 *
 * ─── O PROBLEMA MEDIDO (produção, 18/11/2026) ─────────────────────────────
 *
 * **616 itens** de pedido com `product_id IS NULL`, em **72 códigos**. A nota
 * fiscal precisa de NCM/CFOP/unidade, e o resolvedor cai no catálogo; item sem
 * vínculo vira "Falta NCM do produto X".
 *
 * O que NÃO resolve o problema: casar por nome. Dos 616, apenas **3** casariam
 * por nome normalizado — e de forma ambígua: dois produtos "ESPONJA COM 4 UN",
 * códigos **806** e **8147**. Escolher um dos dois no chute é escolher o NCM
 * errado: erro fiscal, não conveniência.
 *
 * O que resolve: o código. O item guarda `produto_codigo` (o mesmo que veio do
 * ERP) e `catalog_products.codigo` é único por organização. Quando o produto
 * existir no catálogo, o vínculo é fato, não inferência.
 *
 * ─── O QUE ESTE SCRIPT FAZ, E O QUE ELE SE RECUSA A FAZER ─────────────────
 *
 * Aplica: `produto_codigo` (trim) **igual** a `catalog_products.codigo`.
 *
 * Só relata: candidatos por código sem zeros à esquerda (`411` × `0411`),
 * candidatos por nome único e nomes ambíguos. Nenhum dos três é aplicado —
 * todos exigem confirmação humana, e o relatório diz exatamente o que confirmar.
 *
 * Uso:
 *   node workers/mercos/parear-itens.mjs --org <uuid>            # dry-run
 *   node workers/mercos/parear-itens.mjs --org <uuid> --aplicar
 */
import { writeFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { indexarCatalogo, planejarPareamento } from "./catalogo-logica.mjs";

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? process.argv[i + 1] : padrao;
};

const ORG = arg("org", process.env.MERCOS_ORG_ID || "");
const APLICAR = process.argv.includes("--aplicar");
const SAIDA = arg("relatorio", "/tmp/mercos/pareamento-relatorio.json");
const PAGINA = 1000;

const log = (evento, dados = {}) =>
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), pareamento: "mercos-itens", evento, ...dados }) + "\n",
  );

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_URL || !SERVICE_KEY || !ORG) {
  log("config", { detalhe: "faltam SUPABASE_URL/SERVICE_ROLE_KEY/--org" });
  process.exit(2);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Pagina em páginas de 1000 — o teto do PostgREST é 1000, e cortar calado é o defeito V-33. */
async function paginar(tabela, colunas, filtro) {
  const saida = [];
  for (let de = 0; ; de += PAGINA) {
    let query = admin.from(tabela).select(colunas).eq("organization_id", ORG).range(de, de + PAGINA - 1);
    if (filtro) query = filtro(query);
    const { data, error } = await query;
    if (error) throw new Error(`${tabela}: ${error.message}`);
    saida.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return saida;
}

async function main() {
  const itens = await paginar(
    "commercial_order_items",
    "id, produto_codigo, produto_nome",
    (q) => q.is("product_id", null),
  );
  const produtos = await paginar("catalog_products", "id, codigo, nome");
  const catalogo = indexarCatalogo(produtos);

  const plano = planejarPareamento(itens, catalogo);

  let aplicados = 0;
  if (APLICAR && plano.porCodigo.length > 0) {
    // Agrupa por produto: uma atualização por produto, não uma por item.
    const porProduto = new Map();
    for (const par of plano.porCodigo) {
      const ids = porProduto.get(par.produtoId) ?? [];
      ids.push(par.itemId);
      porProduto.set(par.produtoId, ids);
    }
    for (const [produtoId, ids] of porProduto) {
      for (let i = 0; i < ids.length; i += 200) {
        const lote = ids.slice(i, i + 200);
        const { error } = await admin
          .from("commercial_order_items")
          .update({ product_id: produtoId })
          .eq("organization_id", ORG)
          .in("id", lote)
          .is("product_id", null); // guarda: só preenche o vazio
        if (error) throw new Error(`update de itens: ${error.message}`);
        aplicados += lote.length;
      }
    }
  }

  const relatorio = {
    organization_id: ORG,
    aplicado: APLICAR,
    itens_sem_produto: itens.length,
    produtos_no_catalogo: catalogo.total,
    pareados_por_codigo: plano.porCodigo.length,
    aplicados,
    // Os três abaixo NUNCA são aplicados por este script.
    candidatos_por_zero: plano.porZero.length,
    candidatos_por_nome: plano.porNome.length,
    ambiguos: plano.ambiguos.length,
    sem_produto: plano.semProduto.length,
    detalhe: {
      // O que foi aplicado, item a item: sem isto, desfazer exige adivinhar
      // quais itens ganharam vínculo. Auditabilidade é parte do backfill.
      pareados: plano.porCodigo.slice(0, 2000),
      candidatos_por_zero: plano.porZero.slice(0, 100),
      candidatos_por_nome: plano.porNome.slice(0, 100),
      ambiguos: plano.ambiguos.slice(0, 100),
      // A lista de compras da coleta: quais códigos faltam no catálogo.
      codigos_sem_produto: [...new Set(plano.semProduto.map((s) => s.codigo).filter(Boolean))].sort(),
    },
  };

  writeFileSync(SAIDA, JSON.stringify(relatorio, null, 2) + "\n");
  log("fim", {
    aplicado: relatorio.aplicado,
    itens_sem_produto: relatorio.itens_sem_produto,
    pareados_por_codigo: relatorio.pareados_por_codigo,
    aplicados: relatorio.aplicados,
    candidatos_por_zero: relatorio.candidatos_por_zero,
    candidatos_por_nome: relatorio.candidatos_por_nome,
    ambiguos: relatorio.ambiguos,
    codigos_sem_produto: relatorio.detalhe.codigos_sem_produto.length,
    relatorio: SAIDA,
  });
}

main().catch((erro) => {
  log("erro", { detalhe: String(erro).slice(0, 400) });
  process.exitCode = 1;
});
