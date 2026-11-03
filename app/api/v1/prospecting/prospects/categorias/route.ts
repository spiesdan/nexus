/**
 * GET /api/v1/prospecting/prospects/categorias — as categorias que EXISTEM.
 *
 * ─── Por que existe ───────────────────────────────────────────────────────
 *
 * A tela de Empresas filtra por categoria, e o campo vem da API do Google: o
 * vocabulário real é do terreno ("Auto repair shop", "Car wash", "Building
 * materials store"), não as 83 subcategorias do Radar — que são os TERMOS DE
 * BUSCA, em português. Um seletor com as 83 devolveria lista vazia para quase
 * tudo, e o operador não teria como descobrir o nome certo.
 *
 * Traz o texto exato que está gravado, com a contagem. Sem a contagem, o
 * seletor é uma lista de 900 itens indistinguíveis e não ajuda a escolher.
 *
 * ─── A contagem segue o RECORTE, não o banco inteiro ──────────────────────
 *
 * Este endpoint já contou a organização toda e ignorou os filtros da tela.
 * O efeito medido: com a cidade "Videira" selecionada, o seletor anunciava
 * "Oficina mecânica (115)" — o número da base inteira, não o da cidade. O
 * operador lia 115 oficinas onde havia punhado, e o filtro parecia quebrado
 * (ele estava: o número não respondia à pergunta que a tela fazia).
 *
 * Por isso os mesmos parâmetros da lista (`/prospects`) são aceitos aqui e
 * aplicados na contagem. A exceção é `categoria`: a contagem de cada categoria
 * é justamente o que se quer ver, então filtrar por ela devolveria só a
 * categoria já marcada. `id`/`ids` também ficam de fora — são recortes de uma
 * linha, não de um painel de facetas.
 *
 * A ordem é por contagem, não alfabética: o que o negócio mais prospecta vem
 * primeiro, e é o que a pessoa procura 90% das vezes.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { porFatias } from "@/lib/db/por-fatias";
import { traduzirCategoria } from "@/lib/prospeccao/categoria-pt";
import { STATUS_COMERCIAL } from "@/lib/schemas/prospeccao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Acima disto o seletor vira ruído — ninguém rola 900 itens para achar um. */
const LIMITE = 300;

/** Mesmo teto de vínculos da lista — a contagem não pode olhar mais que ela. */
const LIMITE_CRUZAMENTO = 2000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "business_prospects" });
  if (!authz.ok) return authz.response;

  const p = req.nextUrl.searchParams;
  const termo = p.get("busca")?.trim() ?? "";
  const cidade = p.get("cidade")?.trim() ?? "";
  const estado = p.get("estado")?.trim() ?? "";
  const status = p.get("status")?.trim() ?? "";
  const origem = p.get("origem")?.trim() ?? "";
  const buscaId = p.get("busca_id")?.trim() ?? "";
  const comTelefone = p.get("com_telefone") === "true";
  const comWebsite = p.get("com_website") === "true";
  const comWhatsapp = p.get("com_whatsapp") === "true";
  const notaMin = Number(p.get("nota_min") ?? 0) || 0;
  const diasAtras = Number(p.get("prospectado_ha") ?? 0) || 0;
  const soSemCliente = p.get("so_sem_cliente") === "true";
  const minhaFila = p.get("minha_fila") === "true";

  const admin = createAdminClient();

  // `busca_id` (o "Ver empresas" de uma busca) é um recorte de ids: sem
  // resolver os vínculos, as contagens seriam as da base e não as da busca.
  let idsDaBusca: string[] | null = null;
  if (buscaId) {
    if (!UUID_RE.test(buscaId)) {
      return fail("validation_failed", "busca_id inválido.", 400, { requestId });
    }
    const { data: buscaRow } = await admin
      .from("prospecting_searches")
      .select("id")
      .eq("organization_id", authz.org.orgId)
      .eq("id", buscaId)
      .maybeSingle();
    if (!buscaRow) return ok({ categorias: [], total_distintas: 0, truncado: false }, { requestId });

    const { data: vinculos } = await admin
      .from("prospect_search_results")
      .select("prospect_id")
      .eq("organization_id", authz.org.orgId)
      .eq("search_id", buscaId)
      .limit(LIMITE_CRUZAMENTO);
    idsDaBusca = ((vinculos ?? []) as { prospect_id: string }[]).map((v) => v.prospect_id);
    if (idsDaBusca.length === 0) {
      return ok({ categorias: [], total_distintas: 0, truncado: false }, { requestId });
    }
  }

  // Os MESMOS filtros da lista, menos `categoria` (ver o cabeçalho) e os
  // recortes de uma linha só (`id`/`ids`). O recorte por ids vira uma função
  // porque ele é aplicado em FATIAS: `busca_id` pode trazer 2.000 ids, e 500
  // já bastam para o PostgREST responder `414 URI too long`.
  const montar = (fatia?: string[]) => {
    let q = admin
      .from("business_prospects")
      .select("categoria, categoria_canonica")
      .eq("organization_id", authz.org.orgId)
      .eq("bloqueado", false)
      .not("categoria", "is", null);
    if (fatia) q = q.in("id", fatia);
    if (cidade) q = q.ilike("cidade", `%${cidade}%`);
    if (estado) q = q.eq("estado", estado.toUpperCase());
    if (status !== "") {
      const statuses = status
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "" && (STATUS_COMERCIAL as readonly string[]).includes(s));
      if (statuses.length > 0) q = q.in("status_comercial", statuses);
    }
    if (origem) q = q.eq("provider", origem);
    // `.filter(..., "not.is", null)` e não `.not(...)`: com o select de UMA
    // coluna, o builder tipado do Supabase estoura a profundidade de
    // instanciação (TS2589). A semântica no PostgREST é a mesma.
    if (comTelefone) q = q.filter("telefone_normalizado", "not.is", null);
    if (comWebsite) q = q.filter("website", "not.is", null);
    if (comWhatsapp) q = q.eq("whatsapp_potencial", true);
    if (notaMin > 0) q = q.gte("nota", notaMin);
    if (diasAtras > 0) {
      const desde = new Date(Date.now() - diasAtras * 86_400_000).toISOString();
      q = q.gte("discovered_at", desde);
    }
    if (soSemCliente) q = q.is("contact_id", null);
    if (minhaFila) q = q.eq("owner_user_id", authz.user.id);
    // A busca textual da lista olha nome/telefone/cidade/website — o mesmo
    // `or` aqui mantém a contagem respondendo ao que está digitado na tela.
    if (termo) {
      q = q.or(
        `nome.ilike.%${termo}%,telefone.ilike.%${termo}%,cidade.ilike.%${termo}%,website.ilike.%${termo}%`,
      );
    }
    return q;
  };

  let linhas: Array<{ categoria?: string | null; categoria_canonica?: string | null }> = [];
  if (idsDaBusca) {
    const { linhas: lidas, falhas } = await porFatias(idsDaBusca, async (fatia) => {
      const { data, error } = await montar(fatia).limit(20_000);
      return {
        linhas: (data ?? []) as never[],
        erro: error ?? undefined,
      };
    });
    if (falhas > 0 && lidas.length === 0) {
      return fail("internal_error", "Erro ao ler as categorias.", 500, { requestId });
    }
    linhas = lidas as unknown as typeof linhas;
  } else {
    const { data, error } = await montar().limit(20_000);
    if (error) return fail("internal_error", "Erro ao ler as categorias.", 500, { requestId });
    linhas = (data ?? []) as unknown as typeof linhas;
  }

  // A contagem sai aqui em vez de um group-by no PostgREST: ele não devolve
  // agregado por campo sem view, e trazer 20k linhas é barato contra a
  // complexidade de uma view nova.
  const contagem = new Map<string, number>();
  for (const linha of linhas) {
    const l = linha as { categoria?: string | null; categoria_canonica?: string | null };
    // 0277 — a faceta conta a categoria EFETIVA. O café dentro do posto deixa
    // de inflar "Posto de combustível" e aparece em "Café"; o token devolvido
    // (`nome`) é o mesmo que o filtro da lista entende.
    const c = String(l.categoria_canonica?.trim() || l.categoria?.trim() || "").trim();
    if (c === "") continue;
    contagem.set(c, (contagem.get(c) ?? 0) + 1);
  }

  const categorias = [...contagem.entries()]
    // O `nome` continua sendo o valor GRAVADO — é ele que a API filtra com `in`.
    // O que a tela mostra é o `rotulo`, em português. Enviar o rótulo em vez do
    // valor gravado faria o filtro não casar com nada, e nenhum erro apareceria.
    .map(([nome, total]) => ({ nome, rotulo: traduzirCategoria(nome), total }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, LIMITE);

  return ok({ categorias, total_distintas: contagem.size, truncado: contagem.size > LIMITE }, { requestId });
}
