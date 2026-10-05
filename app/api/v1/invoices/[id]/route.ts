/**
 * GET /api/v1/invoices/[id] — detalhe da nota com timeline de eventos.
 *
 * Junta invoice + eventos (ordem cronológica) + job aberto (tentativas).
 * É o que a tela de detalhe e a conciliação leem.
 *
 * Quando a nota veio de um pedido, calcula o **imposto aproximado (IBPT)**
 * dos itens: NCM do produto + tabela importada (0254) na UF do emitente, com
 * a alíquota federal NACIONAL — a origem (nacional x importado) não está no
 * pedido, então o detalhe usa o caso-base e a tela de consulta IBPT deixa
 * escolher. Nota importada sem pedido não tem itens: `ibpt` fica null.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { impostoAproximadoCents, percentualTotal } from "@/lib/fiscal/ibpt";
import { COLUNAS_DA_NOTA } from "@/lib/schemas/fiscal";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Supabase = Awaited<ReturnType<typeof createClient>>;

type IbptDaNota = {
  total_cents: number;
  origem: "nacional";
  itens_com_ncm: number;
  itens_sem_ncm: number;
  fonte: string | null;
  versao: string | null;
  vigencia_inicio: string | null;
};

type LinhaIbptCrua = {
  codigo: string;
  nacional_federal: string | number;
  importados_federal: string | number;
  estadual: string | number;
  municipal: string | number;
  vigencia_inicio: string;
  fonte: string | null;
  versao: string | null;
};

/**
 * Imposto aproximado dos itens do pedido da nota, pela tabela IBPT importada.
 * `null` quando não há o que somar (sem pedido, sem NCM, sem tabela, sem UF).
 */
async function impostoAproximadoDaNota(
  supabase: Supabase,
  orgId: string,
  orderId: string | null,
): Promise<IbptDaNota | null> {
  if (!orderId) return null;

  const { data: itens } = await supabase
    .from("commercial_order_items")
    .select("product_id, quantidade, preco_unit_cents, desconto_pct")
    .eq("organization_id", orgId)
    .eq("order_id", orderId)
    .order("posicao");
  if (!itens || itens.length === 0) return null;

  const ids = [...new Set(itens.map((i) => i.product_id).filter((v): v is string => !!v))];
  const ncmPorProduto = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: produtos } = await supabase
      .from("catalog_products")
      .select("id, ncm")
      .eq("organization_id", orgId)
      .in("id", ids);
    for (const p of produtos ?? []) ncmPorProduto.set(p.id, p.ncm);
  }

  const codigos = [
    ...new Set(
      ids
        .map((id) => ncmPorProduto.get(id))
        .filter((v): v is string => !!v && /^\d{1,16}$/.test(v)),
    ),
  ];
  if (codigos.length === 0) return null;

  const { data: config } = await supabase
    .from("fiscal_settings")
    .select("uf")
    .eq("organization_id", orgId)
    .maybeSingle();
  const uf = ((config as unknown as { uf?: string | null } | null)?.uf ?? "").trim().toUpperCase();
  if (uf.length !== 2) return null;

  const hoje = new Date().toISOString().slice(0, 10);
  const { data: linhas } = await supabase
    .from("fiscal_ibpt" as never)
    .select("codigo, nacional_federal, importados_federal, estadual, municipal, vigencia_inicio, versao, fonte")
    .eq("organization_id", orgId)
    .eq("tipo", "produto")
    .eq("uf", uf)
    .in("codigo", codigos)
    .lte("vigencia_inicio", hoje)
    .or(`vigencia_fim.is.null,vigencia_fim.gte.${hoje}`)
    .order("vigencia_inicio", { ascending: false });
  if (!linhas || linhas.length === 0) return null;

  // `numeric` vem como string do PostgREST — normaliza antes da conta.
  const porCodigo = new Map<
    string,
    {
      codigo: string;
      nacional_federal: number;
      importados_federal: number;
      estadual: number;
      municipal: number;
      vigencia_inicio: string;
      versao: string | null;
      fonte: string | null;
    }
  >();
  for (const l of linhas as unknown as LinhaIbptCrua[]) {
    if (porCodigo.has(l.codigo)) continue;
    porCodigo.set(l.codigo, {
      codigo: l.codigo,
      nacional_federal: Number(l.nacional_federal),
      importados_federal: Number(l.importados_federal),
      estadual: Number(l.estadual),
      municipal: Number(l.municipal),
      vigencia_inicio: l.vigencia_inicio,
      versao: l.versao ?? null,
      fonte: l.fonte ?? null,
    });
  }

  let total = 0;
  let comNcm = 0;
  let semNcm = 0;
  for (const i of itens) {
    const ncm = i.product_id ? (ncmPorProduto.get(i.product_id) ?? null) : null;
    const linha = ncm ? porCodigo.get(ncm) : undefined;
    if (!linha) {
      semNcm += 1;
      continue;
    }
    comNcm += 1;
    const desconto = Number(i.desconto_pct) || 0;
    const valorCents = Math.round(i.quantidade * i.preco_unit_cents * (1 - desconto / 100));
    total += impostoAproximadoCents(valorCents, percentualTotal(linha, "nacional"));
  }
  if (comNcm === 0) return null;

  const primeira = [...porCodigo.values()][0]!;
  return {
    total_cents: total,
    origem: "nacional",
    itens_com_ncm: comNcm,
    itens_sem_ncm: semNcm,
    fonte: primeira.fonte ?? null,
    versao: primeira.versao ?? null,
    vigencia_inicio: primeira.vigencia_inicio ?? null,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "invoices" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  const supabase = await createClient();
  const { data: nota, error } = await supabase
    .from("invoices")
    .select(`${COLUNAS_DA_NOTA}, xml`)
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao ler a nota.", 500, { requestId });
  if (!nota) return fail("not_found", "Nota não encontrada.", 404, { requestId });

  const [eventos, jobs, ibpt] = await Promise.all([
    supabase
      .from("fiscal_events")
      .select("id, tipo, status, protocolo, mensagem, created_at")
      .eq("organization_id", authz.org.orgId)
      .eq("invoice_id", id)
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("fiscal_jobs")
      .select("id, status, tentativas, max_tentativas, proxima_tentativa, ultimo_erro")
      .eq("organization_id", authz.org.orgId)
      .eq("invoice_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
    impostoAproximadoDaNota(supabase, authz.org.orgId, (nota as unknown as { order_id: string | null }).order_id),
  ]);

  return ok(
    {
      ...(nota as unknown as Record<string, unknown>),
      tem_xml: Boolean((nota as unknown as { xml?: string | null }).xml),
      ibpt,
      eventos: eventos.data ?? [],
      jobs: jobs.data ?? [],
    },
    { requestId },
  );
}
