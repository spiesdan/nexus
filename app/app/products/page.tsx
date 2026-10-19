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
import { POR_PAGINA_DO_CATALOGO, lerPagina, sanitizarBuscaParaIlike } from "@/lib/catalogo/paginacao";

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
  searchParams: Promise<{
    busca?: string;
    pagina?: string;
    sem_foto?: string;
    categoria?: string;
    status?: string;
    promo?: string;
    destaque?: string;
    config?: string;
  }>;
}) {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const {
    busca,
    pagina: paginaBruta,
    sem_foto: semFotoBruto,
    categoria: categoriaBruta,
    status: statusBruto,
    promo: promoBruto,
    destaque: destaqueBruto,
    config: configBruto,
  } = await searchParams;

  const podeEditar = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  // Capturado aqui porque o `redirect` acima já provou que existe: dentro dos
  // closures o narrowing não alcança e o `orgId` viraria `possibly null`.
  const orgId = activeOrg.orgId;
  const supabase = await createClient();

  // IDS PRIMEIRO, PÁGINA DEPOIS. O filtro "sem foto" (NOT EXISTS) não se
  // expressa no PostgREST: `!left + is.null` filtra o embed, não o pai
  // (medido: devolveu os 1139 com `product_images: []`), e `in` com 700 UUIDs
  // estoura a URL. Duas consultas leves resolvem sem mudar o schema: a
  // primeira traz só ids em ordem (paginável e contável com exatidão — sem
  // depender do `count`, que some atrás de proxy), a segunda traz as 50
  // linhas da página. O navegador continua recebendo só a fatia.
  //
  // A busca filtra no SERVIDOR pelo mesmo motivo: a página entrega 50 por vez
  // e o filtro local nunca alcançaria o resto (medido: "saco de lixo" mora
  // nas posições 904–958 de 1141). O predicado é o mesmo da rota
  // GET /api/v1/products — nome, código ou marca como substring.
  const termo = sanitizarBuscaParaIlike(busca ?? "");
  const semFoto = semFotoBruto === "1";
  // A barra de filtros do Mercos, do lado do SERVIDOR: com 50 por página, filtro
  // local responderia sobre a fatia, não sobre o catálogo (o mesmo defeito que a
  // busca tinha). A situação default é `todos` — nunca sumir com produto
  // desativado sem a pessoa ter pedido.
  const categoria = (categoriaBruta ?? "").trim();
  const status: "todos" | "ativos" | "inativos" =
    statusBruto === "ativos" || statusBruto === "inativos" ? statusBruto : "todos";
  const promo = promoBruto === "1";
  const destaque = destaqueBruto === "1";
  const config: "categorias" | "tabelas" | null =
    configBruto === "tabelas" ? "tabelas" : configBruto === "categorias" ? "categorias" : null;

  function consultaDeIds() {
    let consulta = supabase
      .from("catalog_products")
      .select("id")
      .eq("organization_id", orgId)
      .order("ativo", { ascending: false })
      .order("nome");
    if (termo !== "") {
      consulta = consulta.or(
        `nome.ilike.%${termo}%,codigo.ilike.%${termo}%,marca.ilike.%${termo}%`,
      );
    }
    if (categoria !== "") consulta = consulta.eq("categoria", categoria);
    if (status !== "todos") consulta = consulta.eq("ativo", status === "ativos");
    if (promo) consulta = consulta.not("preco_promocional_cents", "is", null);
    if (destaque) consulta = consulta.eq("destaque", true);
    return consulta;
  }

  const { data: linhasDeIds } = await consultaDeIds();
  let ids = ((linhasDeIds ?? []) as unknown as { id: string }[]).map((l) => l.id);

  if (semFoto) {
    const { data: comFoto } = await supabase
      .from("product_images")
      .select("product_id")
      .eq("organization_id", orgId);
    const temFoto = new Set(
      ((comFoto ?? []) as unknown as { product_id: string }[]).map((r) => r.product_id),
    );
    ids = ids.filter((id) => !temFoto.has(id));
  }

  const total = ids.length;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA_DO_CATALOGO));
  // URL com página além do fim (digitado à mão): volta para a última em vez
  // de mostrar lista vazia sem saída.
  const pagina = Math.min(lerPagina(paginaBruta), totalPaginas);
  const idsDaPagina = ids.slice(
    (pagina - 1) * POR_PAGINA_DO_CATALOGO,
    pagina * POR_PAGINA_DO_CATALOGO,
  );

  // `in=()` vazio é inválido no PostgREST: página vazia não consulta.
  const { data: produtos } =
    idsDaPagina.length === 0
      ? { data: [] }
      : await supabase
          .from("catalog_products")
          .select(COLUNAS_DO_PRODUTO)
          .eq("organization_id", orgId)
          .in("id", idsDaPagina)
          .order("ativo", { ascending: false })
          .order("nome");

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
      semFoto={semFoto}
      categoriaInicial={categoria}
      statusInicial={status}
      promoInicial={promo}
      destaqueInicial={destaque}
      configInicial={config}
      total={total}
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
