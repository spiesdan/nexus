/**
 * O PRODUTO DO ITEM — quem responde NCM/CFOP/unidade quando o vínculo falta.
 *
 * ─── Por que isto existe ────────────────────────────────────────────────────
 *
 * Medido em 06/11/2026, em produção: a nota da HAYLA MORANDI (R$ 662,37) parou
 * com `Falta NCM do produto "ESPONJA COM 4 UN"` — e o NCM estava no cadastro.
 * O item do pedido é TEXTO LIVRE: `commercial_order_items.product_id` nulo
 * para 1481 dos itens da organização. A emissão só olhava
 * `product_id → catalog_products`, então item sem vínculo saía sem NCM nenhum,
 * mesmo com o produto existindo, com código e nome iguais, no catálogo.
 *
 * ─── A regra do casamento ───────────────────────────────────────────────────
 *
 * O vínculo explícito manda: `product_id` preenchido e encontrado decide.
 * Sem ele (ou com ele apontando para produto que sumiu), o item é casado pelo
 * CÓDIGO normalizado e, depois, pelo NOME normalizado — a mesma régua do
 * backfill de 06/11/2026 que religou 875 itens:
 *
 *   - um candidato só → é ele;
 *   - vários candidatos, mas todos com o MESMO NCM (ou todos sem NCM) → aceita
 *     o primeiro, preferindo `ativo`;
 *   - candidatos com NCMs diferentes → NÃO adivinha. Item sem resolução
 *     continua sem NCM, e a rejeição nomeia o produto — que é o comportamento
 *     correto: escolher um NCM no chute é erro fiscal, não conveniência.
 *
 * A normalização é `uppercase` + espaços colapsados, de propósito igual à do
 * SQL que rodou em produção. Divergir aqui faria o código resolver o que o
 * banco não resolveu (e vice-versa) sem nenhum ganho.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

/** O que a emissão precisa do cadastro do produto. */
export interface ProdutoFiscal {
  id: string;
  codigo: string | null;
  nome: string | null;
  ativo: boolean | null;
  ncm: string | null;
  cfop: string | null;
  unidade: string | null;
}

/** O que o item do pedido oferece para achar esse produto. */
export interface ItemQuePrecisaDeProduto {
  product_id: string | null;
  produto_codigo: string | null;
  produto_nome: string | null;
}

/** Catálogo indexado: por id e pelas duas chaves normalizadas. */
export interface CatalogoFiscal {
  porId: Map<string, ProdutoFiscal>;
  porCodigo: Map<string, ProdutoFiscal[]>;
  porNome: Map<string, ProdutoFiscal[]>;
  total: number;
}

/** Chave de casamento: maiúsculas e espaços colapsados (igual ao backfill). */
export function normalizarChave(bruto: string | null | undefined): string {
  return (bruto ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

function primeiraCandidata(candidatos: ProdutoFiscal[]): ProdutoFiscal {
  // Mesmo desempate do SQL: ativo primeiro, depois id — determinístico entre
  // duas execuções, para o NCM do XML não depender da ordem que o Postgres
  // devolveu as linhas.
  return [...candidatos].sort((a, b) => {
    if (!!a.ativo !== !!b.ativo) return a.ativo ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0]!;
}

/**
 * A regra de aceitação da ambiguidade: só vale quando não há escolha fiscal em
 * jogo. Vários produtos com o MESMO NCM são o mesmo NCM; vários com NCMs
 * diferentes seriam um chute.
 */
function escolher(candidatos: ProdutoFiscal[] | undefined): ProdutoFiscal | null {
  if (!candidatos || candidatos.length === 0) return null;
  if (candidatos.length === 1) return candidatos[0]!;
  const ncms = new Set(candidatos.map((p) => (p.ncm ?? "").trim()));
  return ncms.size === 1 ? primeiraCandidata(candidatos) : null;
}

export function indexarCatalogo(produtos: ProdutoFiscal[]): CatalogoFiscal {
  const catalogo: CatalogoFiscal = {
    porId: new Map(),
    porCodigo: new Map(),
    porNome: new Map(),
    total: produtos.length,
  };
  for (const produto of produtos) {
    catalogo.porId.set(produto.id, produto);
    const codigo = normalizarChave(produto.codigo);
    if (codigo) {
      const lista = catalogo.porCodigo.get(codigo) ?? [];
      lista.push(produto);
      catalogo.porCodigo.set(codigo, lista);
    }
    const nome = normalizarChave(produto.nome);
    if (nome) {
      const lista = catalogo.porNome.get(nome) ?? [];
      lista.push(produto);
      catalogo.porNome.set(nome, lista);
    }
  }
  return catalogo;
}

/** Resolve um item: vínculo explícito → código → nome. */
export function resolverProdutoDoItem(
  catalogo: CatalogoFiscal,
  item: ItemQuePrecisaDeProduto,
): { produto: ProdutoFiscal; por: "id" | "codigo" | "nome" } | null {
  if (item.product_id) {
    const porId = catalogo.porId.get(item.product_id);
    if (porId) return { produto: porId, por: "id" };
  }
  const porCodigo = escolher(catalogo.porCodigo.get(normalizarChave(item.produto_codigo)));
  if (porCodigo) return { produto: porCodigo, por: "codigo" };
  const porNome = escolher(catalogo.porNome.get(normalizarChave(item.produto_nome)));
  if (porNome) return { produto: porNome, por: "nome" };
  return null;
}

const COLUNAS_DO_PRODUTO = "id, codigo, nome, ativo, ncm, cfop, unidade";

/** O PostgREST corta a resposta em 1000 linhas: sem paginar, o catálogo
 *  mentiria por omissão — e um catálogo pela metade resolve menos do que
 *  deveria, exatamente nos itens antigos que motivaram este módulo. */
const TAMANHO_DA_PAGINA = 1000;

async function carregarCatalogoInteiro(
  supabase: SupabaseClient,
  orgId: string,
): Promise<CatalogoFiscal> {
  const produtos: ProdutoFiscal[] = [];
  for (let inicio = 0; ; inicio += TAMANHO_DA_PAGINA) {
    const { data, error } = await supabase
      .from("catalog_products")
      .select(COLUNAS_DO_PRODUTO)
      .eq("organization_id", orgId)
      .order("id")
      .range(inicio, inicio + TAMANHO_DA_PAGINA - 1);
    if (error) {
      logger.error("fiscal: catálogo não carregou para resolver produto do item", {
        organization_id: orgId,
        erro: error.message,
      });
      break;
    }
    const lote = (data ?? []) as unknown as ProdutoFiscal[];
    produtos.push(...lote);
    if (lote.length < TAMANHO_DA_PAGINA) break;
  }
  return indexarCatalogo(produtos);
}

/**
 * Resolve o produto de cada item, na mesma ordem da entrada.
 *
 * Caminho barato primeiro (uma query pelos `product_id`), catálogo paginado
 * só quando algum item ficou sem resposta — catálogo grande não paga o custo
 * de duas páginas a cada emissão quando todos os itens estão vinculados.
 */
export async function resolverProdutosDosItens(
  supabase: SupabaseClient,
  orgId: string,
  itens: ItemQuePrecisaDeProduto[],
): Promise<(ProdutoFiscal | null)[]> {
  if (itens.length === 0) return [];

  const ids = [...new Set(itens.map((i) => i.product_id).filter((v): v is string => !!v))];
  const vinculados = new Map<string, ProdutoFiscal>();
  if (ids.length > 0) {
    const { data, error } = await supabase
      .from("catalog_products")
      .select(COLUNAS_DO_PRODUTO)
      .eq("organization_id", orgId)
      .in("id", ids);
    if (error) {
      logger.error("fiscal: produtos vinculados não carregaram", {
        organization_id: orgId,
        erro: error.message,
      });
    }
    for (const produto of (data ?? []) as unknown as ProdutoFiscal[]) {
      vinculados.set(produto.id, produto);
    }
  }

  const resolvidos = itens.map(
    (item) => (item.product_id ? (vinculados.get(item.product_id) ?? null) : null),
  );
  if (resolvidos.every((r) => r !== null)) return resolvidos;

  const catalogo = await carregarCatalogoInteiro(supabase, orgId);
  return resolvidos.map((jaResolvido, pos) => {
    if (jaResolvido) return jaResolvido;
    return resolverProdutoDoItem(catalogo, itens[pos]!)?.produto ?? null;
  });
}
