import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { COLUNAS_DO_PRODUTO, type Produto } from "@/lib/schemas/produtos";
import {
  COLUNAS_DA_CATEGORIA,
  COLUNAS_DA_TABELA,
  type Categoria,
  type TabelaDePreco,
} from "@/lib/schemas/precos";
import { createClient } from "@/lib/supabase/server";
import { fotosDosProdutos } from "@/lib/comercial/fotos-dos-produtos";
import {
  POR_PAGINA_DO_CATALOGO,
  faixaDaPagina,
  lerPagina,
  sanitizarBuscaParaIlike,
  totalDePaginas,
} from "@/lib/catalogo/paginacao";

import { CatalogoClient } from "./_catalogo";

export const dynamic = "force-dynamic";

/**
 * O CATÁLOGO DA LOJA — onde o preço que a IA responde é cadastrado.
 *
 * ─── Por que esta tela precisa existir ───────────────────────────────────
 *
 * A ferramenta `crm_search_products` já vinha ligada em todo agente novo, e
 * lia uma tabela que ninguém nunca preencheu. O efeito não era silêncio: era o
 * agente respondendo "não tenho nada com esse nome no catálogo" para uma loja
 * com o estoque cheio. Ferramenta que devolve vazio para 100% das lojas é pior
 * que ferramenta ausente — ela mente com autoridade.
 *
 * ─── Quem pode o quê ─────────────────────────────────────────────────────
 *
 * `viewer` VÊ o catálogo: saber quanto custa é informação de operação, e quem
 * atende precisa dela. Cadastrar e alterar preço é `manager`, e a rota cobra de
 * novo — a tela esconder o botão é cortesia, não autorização.
 */
export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; pagina?: string }>;
}) {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const { busca, pagina: paginaBruta } = await searchParams;

  const podeEditar = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  // Capturado aqui porque o `redirect` acima já provou que existe: dentro do
  // `buscarProdutos` o narrowing não alcança e o `orgId` viraria `possibly null`.
  const orgId = activeOrg.orgId;
  const supabase = await createClient();

  // A busca filtra no SERVIDOR, não no navegador: a página entrega 50 por vez
  // e o filtro local nunca alcançaria o resto do catálogo (medido: "saco de
  // lixo" mora nas posições 904–958 de 1141). O predicado é o mesmo da rota
  // GET /api/v1/products — nome, código ou marca como substring.
  const termo = sanitizarBuscaParaIlike(busca ?? "");
  async function buscarProdutos(pagina: number) {
    const { de, ate } = faixaDaPagina(pagina, POR_PAGINA_DO_CATALOGO);
    let consulta = supabase
      .from("catalog_products")
      .select(COLUNAS_DO_PRODUTO, { count: "exact" })
      .eq("organization_id", orgId)
      .order("ativo", { ascending: false })
      .order("nome");
    if (termo !== "") {
      consulta = consulta.or(
        `nome.ilike.%${termo}%,codigo.ilike.%${termo}%,marca.ilike.%${termo}%`,
      );
    }
    return consulta.range(de, ate);
  }

  const pedida = lerPagina(paginaBruta);
  let { data: produtos, count: total } = await buscarProdutos(pedida);
  const totalPaginas = totalDePaginas(total ?? null, POR_PAGINA_DO_CATALOGO);
  // URL com página além do fim (digitado à mão): volta para a última em vez
  // de mostrar lista vazia sem saída.
  let pagina = pedida;
  if (totalPaginas !== null && pedida > totalPaginas) {
    pagina = totalPaginas;
    ({ data: produtos, count: total } = await buscarProdutos(pagina));
  }

  const [{ data: categorias }, { data: tabelas }] = await Promise.all([
    supabase
      .from("product_categories")
      .select(COLUNAS_DA_CATEGORIA)
      .eq("organization_id", activeOrg.orgId)
      .order("posicao")
      .order("nome")
      .limit(500),
    supabase
      .from("price_tables")
      .select(COLUNAS_DA_TABELA)
      .eq("organization_id", activeOrg.orgId)
      .order("nome")
      .limit(100),
  ]);

  // As fotos entram JUNTAS com os produtos, no HTML inicial. Buscá-las depois,
  // no client, fazia a coluna aparecer vazia e só preencher segundos mais
  // tarde — o piscar que o dono descreveu ("aparece os produtos sem foto e
  // depois carrega as imagens"). Aqui é o mesmo lote, feito antes da página
  // existir, e sem uma requisição a mais.
  const idsDosProdutos = ((produtos ?? []) as unknown as { id: string }[]).map((p) => p.id);
  const fotosPorProduto = await fotosDosProdutos(activeOrg.orgId, idsDosProdutos);

  return (
    <CatalogoClient
      produtos={(produtos ?? []) as unknown as Produto[]}
      fotosPorProduto={fotosPorProduto}
      categorias={(categorias ?? []) as unknown as Categoria[]}
      tabelas={(tabelas ?? []) as unknown as TabelaDePreco[]}
      podeEditar={podeEditar}
      buscaInicial={busca ?? ""}
      total={total ?? null}
      pagina={pagina}
      porPagina={POR_PAGINA_DO_CATALOGO}
      textosProdutos={{
        titulo: t("Produtos"),
        subtitulo: t(
          "O catálogo da loja. É daqui que o atendente de IA tira o preço quando alguém pergunta.",
        ),
        vazio: t("Nenhum produto cadastrado ainda"),
        vazioDica: t(
          "Enquanto o catálogo estiver vazio, o atendente responde que não encontrou o produto — mesmo que a loja tenha.",
        ),
      }}
    />
  );
}
