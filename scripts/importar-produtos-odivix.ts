/**
 * Importa os produtos do Odivix (exportados via Exportar → Excel) para o
 * `catalog_products` da org bill-higiene-limpeza.
 *
 *   pnpm exec tsx --env-file=.env.local scripts/importar-produtos-odivix.ts <manifesto.json> [--confirmar]
 *
 * Sem `--confirmar`, só mostra o que faria. Nenhuma escrita acontece.
 *
 * O QUE ENTRA E O QUE NÃO ENTRA (decisões, não acidentes):
 *
 * 1. Só o que FALTA. Código que já existe no catálogo da org não é tocado —
 *    nem preço, nem nome. Atualizar preço por cima do que o vendedor já ajustou
 *    à mão seria corrupção silenciosa de dado.
 *
 * 2. `controla_estoque = false, quantidade = 0`. O estoque do Odivix não é
 *    confiável (negativos e placeholders como 10.000.000, medidos no export de
 *    2026-10-14) e o banco tem `CHECK (quantidade >= 0)` — importar o número
 *    cru ou quebra o CHECK ou zera/limita venda à toa. "Não controlamos ainda"
 *    é o estado honesto até o backfill de estoque.
 *
 * 3. `origem = 'odivix'`. Não há CHECK em `origem`, e marcar como `manual`
 *    mentiria sobre a procedência — a origem é o que permite auditar e
 *    reimportar sem duplicar.
 *
 * 4. NCM só entra com 8 dígitos (`^\d{8}$`, o CHECK da tabela). O resto vira
 *    NULL e é contado no relatório — não "corrigido" na mão.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const ORGANIZATION_SLUG = "bill-higiene-limpeza";
const ORIGEM = "odivix";

const ProdutoSchema = z.object({
  id_odivix: z.number().int(),
  codigo: z.string().min(1),
  codigo_novo: z.boolean(),
  referencia: z.string(),
  descricao: z.string().min(1),
  un: z.string(),
  ean: z.string(),
  preco: z.number().nonnegative(),
  estoque: z.number().nullable(),
  ncm: z.string(),
  ep: z.string(),
});

type Produto = z.infer<typeof ProdutoSchema>;

function log(m: string): void {
  process.stderr.write(`${m}\n`);
}

/**
 * NCM canônico ou NULL. O CHECK exige 8 dígitos exatos.
 *
 * Detalhe do export do Odivix: o Excel serializa o NCM como float, então
 * "52079000" chega como "52079000.0" — e extrair dígitos do texto cru dá 9
 * ("520790000"), o que jogaria 914 NCMs válidos para NULL. Converte para
 * número primeiro e só aceita 8 dígitos (medido em 2026-10-14: 914 nessa
 * forma, 9 curtos de verdade, 4 vazios).
 */
function limparNcm(bruto: string): string | null {
  const comoNumero = Number(bruto);
  const base = Number.isFinite(comoNumero) ? String(Math.trunc(comoNumero)) : bruto;
  const digitos = base.replace(/\D/g, "");
  return /^\d{8}$/.test(digitos) ? digitos : null;
}

async function main(): Promise<void> {
  const arquivo = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const confirmar = process.argv.includes("--confirmar");
  if (!arquivo) {
    log("uso: tsx scripts/importar-produtos-odivix.ts <manifesto.json> [--confirmar]");
    process.exit(2);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no env");
  const admin = createClient(url, chave, { auth: { persistSession: false } });

  const { data: org, error: errOrg } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", ORGANIZATION_SLUG)
    .maybeSingle();
  if (errOrg) throw errOrg;
  if (!org) throw new Error(`organização "${ORGANIZATION_SLUG}" não encontrada`);
  const organizationId = org.id as string;

  const brutos = JSON.parse(readFileSync(arquivo, "utf8")) as unknown[];
  const produtos: Produto[] = brutos.map((b, i) => {
    const parsed = ProdutoSchema.safeParse(b);
    if (!parsed.success) throw new Error(`linha ${i} inválida: ${parsed.error.message}`);
    return parsed.data;
  });
  log(`lendo ${basename(arquivo)}: ${produtos.length} produtos`);

  const { data: existentes, error: errExist } = await admin
    .from("catalog_products")
    .select("codigo")
    .eq("organization_id", organizationId);
  if (errExist) throw errExist;
  const temNoCrm = new Set((existentes ?? []).map((r) => r.codigo as string));

  const novos = produtos.filter((p) => !temNoCrm.has(p.codigo));
  const pulados = produtos.length - novos.length;
  log(`já no CRM (não tocados) ... ${pulados}`);
  log(`a importar ................. ${novos.length} (${novos.filter((p) => p.codigo_novo).length} com código novo)`);

  let ncmNulo = 0;
  const linhas = novos.map((p) => {
    const ncm = limparNcm(p.ncm);
    if (p.ncm && !ncm) ncmNulo++;
    return {
      organization_id: organizationId,
      codigo: p.codigo,
      nome: p.descricao,
      unidade: p.un || null,
      preco_cents: Math.round(p.preco * 100),
      moeda: "BRL",
      ncm,
      controla_estoque: false,
      quantidade: 0,
      ativo: true,
      origem: ORIGEM,
    };
  });
  log(`NCM fora do padrão (entra NULL) ... ${ncmNulo}`);
  const precoZero = linhas.filter((l) => l.preco_cents === 0).length;
  if (precoZero) log(`com preço zero ................ ${precoZero} (mantidos: preço do Odivix, não chute)`);

  if (!confirmar) {
    log("");
    log("SEM GRAVAR. rode de novo com --confirmar para inserir.");
    log("amostra dos 5 primeiros a inserir:");
    for (const l of linhas.slice(0, 5)) log(`  ${l.codigo} | ${l.nome} | R$ ${(l.preco_cents / 100).toFixed(2)} | NCM ${l.ncm ?? "(null)"}`);
    return;
  }

  const LOTE = 200;
  let gravados = 0;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const { error } = await admin.from("catalog_products").insert(linhas.slice(i, i + LOTE));
    if (error) throw error;
    gravados += Math.min(LOTE, linhas.length - i);
    log(`  ${gravados}/${linhas.length}`);
  }
  log(`inseridos ${gravados} produtos (origem=${ORIGEM}, organization_id=${organizationId})`);
}

main().catch((e: unknown) => {
  log(`erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
