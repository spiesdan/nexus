/**
 * GET /api/v1/prospecting/mercado — análise de mercado e penetração (§§22–24).
 *
 * Totais (empresas, com telefone/site, prospects, clientes), por cidade e por
 * categoria, e penetração: clientes existentes (contatos com pedido) vs
 * descobertas. "Cliente" aqui = contato que já comprou — medido, não
 * declarado.
 *
 * FASE 15 (B15, §45): o custo por request caiu de `10000×3 + 5000` para
 * 1 varredura de business_prospects + 1 de pedidos + (se houver telefone) 1
 * de contacts — a antiga 3ª varredura da mesma tabela ("vinculados") era
 * derivável das linhas que já vêm na primeira e sumiu. O modo lote
 * `?cidades=A&cidades=B…` responde N cidades num request só (compartilhando
 * pedidos e contacts), que é o que o wizard da campanha pede — eram
 * `4 queries × 1 request por cidade`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { canonicalPhoneBR } from "@/lib/channels/phone-variants";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface LinhaMercado {
  id: string;
  cidade: string | null;
  estado: string | null;
  categoria: string | null;
  telefone_normalizado: string | null;
  website: string | null;
  contact_id: string | null;
}

interface Agregado {
  empresas: number;
  comTelefone: number;
  comWebsite: number;
  prospects: number;
  clientesVinculados: number;
}

const AGREGADO_VAZIO = (): Agregado => ({
  empresas: 0,
  comTelefone: 0,
  comWebsite: 0,
  prospects: 0,
  clientesVinculados: 0,
});

const penetracao = (empresas: number, clientes: number): number =>
  empresas === 0 ? 0 : Math.round((clientes / empresas) * 1000) / 10;

/** A contagem por linha — a MESMA de sempre, sem query extra (FASE 15). */
function agregar(linhas: LinhaMercado[], contatosClientes: Set<string>): Agregado {
  const a = AGREGADO_VAZIO();
  for (const l of linhas) {
    a.empresas++;
    if (l.telefone_normalizado) a.comTelefone++;
    if (l.website) a.comWebsite++;
    if (!l.contact_id) a.prospects++;
    else if (contatosClientes.has(l.contact_id)) a.clientesVinculados++;
  }
  return a;
}

const chaveDaCidade = (l: LinhaMercado): string =>
  `${l.cidade ?? "?"}${l.estado ? `/${l.estado}` : ""}`;

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "business_prospects" });
  if (!authz.ok) return authz.response;

  const p = req.nextUrl.searchParams;
  const cidade = p.get("cidade")?.trim() ?? "";
  const cidadesLote = [...new Set(p.getAll("cidades").map((c) => c.trim()).filter(Boolean))];
  const emLote = cidadesLote.length > 0;
  const org = authz.org.orgId;
  const supabase = await createClient();

  const varredura = (filtroCidade?: string) => {
    let q = supabase
      .from("business_prospects")
      .select("id, cidade, estado, categoria, telefone_normalizado, website, contact_id")
      .eq("organization_id", org)
      .eq("bloqueado", false)
      .limit(10000);
    if (filtroCidade) q = q.ilike("cidade", `%${filtroCidade}%`);
    return q;
  };

  // Clientes: contatos com pedido (medido via commercial_orders) — UMA query
  // para o request inteiro, inclusive no modo lote.
  const pedidosQuery = supabase
    .from("commercial_orders")
    .select("contact_id")
    .eq("organization_id", org)
    .neq("status", "cancelado")
    .not("contact_id", "is", null)
    .limit(10000);

  const listasPorCidade: LinhaMercado[][] = [];
  let linhas: LinhaMercado[] = [];
  let pedidos: { contact_id: string | null }[] = [];
  try {
    if (emLote) {
      const resultados = await Promise.all(cidadesLote.map((c) => varredura(c)));
      for (const r of resultados) {
        if (r.error) throw r.error;
        listasPorCidade.push((r.data ?? []) as unknown as LinhaMercado[]);
      }
      const pr = await pedidosQuery;
      if (pr.error) throw pr.error;
      pedidos = (pr.data ?? []) as unknown as { contact_id: string | null }[];
      // Uma linha que casa com duas cidades pedidas conta uma vez no total.
      linhas = [...new Map(listasPorCidade.flat().map((l) => [l.id, l])).values()];
    } else {
      const [r, pr] = await Promise.all([varredura(cidade || undefined), pedidosQuery]);
      if (r.error) throw r.error;
      if (pr.error) throw pr.error;
      linhas = (r.data ?? []) as unknown as LinhaMercado[];
      pedidos = (pr.data ?? []) as unknown as { contact_id: string | null }[];
    }
  } catch (e) {
    logger.error("[prospecting.mercado] falha ao agregar o mercado", {
      requestId,
      organization_id: org,
      erro: e instanceof Error ? e.message : String(e),
    });
    return fail("internal_error", "Erro ao agregar o mercado.", 500, { requestId });
  }

  const contatosClientes = new Set(
    pedidos.map((x) => x.contact_id).filter((v): v is string => !!v),
  );

  // Telefones de prospects que batem com comprador sem vínculo formal —
  // UMA query de contacts, compartilhada (no lote: união das cidades).
  const fonesProspects = [...new Set(linhas.map((l) => l.telefone_normalizado).filter(Boolean))] as string[];
  let clientesExtras = 0;
  if (fonesProspects.length > 0) {
    const { data: contatos } = await supabase
      .from("contacts")
      .select("id, phone_number")
      .eq("organization_id", org)
      .in("phone_number", fonesProspects.map((f) => canonicalPhoneBR(f)))
      .limit(5000);
    const idsCompradores = new Set(
      ((contatos ?? []) as { id: string }[]).map((c) => c.id).filter((id) => contatosClientes.has(id)),
    );
    clientesExtras = idsCompradores.size;
  }

  const porCategoria = new Map<string, number>();
  for (const l of linhas) {
    if (l.categoria) porCategoria.set(l.categoria, (porCategoria.get(l.categoria) ?? 0) + 1);
  }
  const categoriaResposta = [...porCategoria.entries()]
    .map(([categoria, empresas]) => ({ categoria, empresas }))
    .sort((a, b) => b.empresas - a.empresas)
    .slice(0, 30);

  // --- Modo lote: uma resposta por cidade PEDIDA (o que o wizard consome).
  if (emLote) {
    const total = agregar(linhas, contatosClientes);
    return ok(
      {
        totais: {
          empresas: total.empresas,
          com_telefone: total.comTelefone,
          com_website: total.comWebsite,
          prospects: total.prospects,
          clientes_vinculados: total.clientesVinculados,
          clientes_extras_por_telefone: clientesExtras,
        },
        por_cidade: cidadesLote.map((nome, i) => {
          const a = agregar(listasPorCidade[i] ?? [], contatosClientes);
          return {
            cidade: nome,
            empresas: a.empresas,
            clientes: a.clientesVinculados,
            penetracao_pct: penetracao(a.empresas, a.clientesVinculados),
            potencial: Math.max(0, a.empresas - a.clientesVinculados),
          };
        }),
        por_categoria: categoriaResposta,
      },
      { requestId },
    );
  }

  // --- Modo simples: agregação por "Cidade/UF" das linhas, como sempre.
  const porCidade = new Map<string, Agregado>();
  for (const l of linhas) {
    const chave = chaveDaCidade(l);
    const atual = porCidade.get(chave) ?? AGREGADO_VAZIO();
    atual.empresas++;
    if (l.telefone_normalizado) atual.comTelefone++;
    if (l.website) atual.comWebsite++;
    if (!l.contact_id) atual.prospects++;
    else if (contatosClientes.has(l.contact_id)) atual.clientesVinculados++;
    porCidade.set(chave, atual);
  }
  const total = agregar(linhas, contatosClientes);

  const cidades = [...porCidade.entries()]
    .map(([nome, v]) => ({
      cidade: nome,
      empresas: v.empresas,
      clientes: v.clientesVinculados,
      penetracao_pct: penetracao(v.empresas, v.clientesVinculados),
      potencial: Math.max(0, v.empresas - v.clientesVinculados),
    }))
    .sort((a, b) => b.empresas - a.empresas)
    .slice(0, 50);

  return ok(
    {
      totais: {
        empresas: linhas.length,
        com_telefone: total.comTelefone,
        com_website: total.comWebsite,
        prospects: total.prospects,
        clientes_vinculados: total.clientesVinculados,
        clientes_extras_por_telefone: clientesExtras,
      },
      por_cidade: cidades,
      por_categoria: categoriaResposta,
    },
    { requestId },
  );
}
