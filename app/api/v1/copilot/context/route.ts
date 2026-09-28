/**
 * GET /api/v1/copilot/context — contexto real da página atual (NEXUS 2.0 §33).
 *
 * Fundação do Copilot: `?pagina=cliente&contact_id=` devolve contato +
 * histórico de compra real; `?pagina=radar` devolve os 12 casos de maior
 * prioridade numa varredura limitada; `?pagina=pedido` devolve as travas
 * comerciais; `?pagina=fiscal` devolve a saúde da emissão. Contagens com
 * `amostra_parcial` declarado quando limitadas.
 *
 * Leitura pura via RLS de sessão (`createClient`), `organization_id`
 * explícito. Responder em linguagem natural sobre este contexto é FASE 5.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import {
  contagemVazia,
  perguntasPara,
  resumirCliente,
  resumirFiscal,
  resumirPolitica,
  resumirRadar,
  type PaginaCopilot,
} from "@/lib/ai/copilot/context";
import {
  historicoDeCompra as historicoReal,
  type PedidoParaRadar,
} from "@/lib/comercial/radar-compras";

export const dynamic = "force-dynamic";

const PAGINAS = ["cliente", "radar", "pedido", "fiscal"] as const;
const LIMITE_VARREDURA = 5000;

type LinhaPedido = {
  id: string;
  contact_id: string | null;
  total_cents: number;
  status: string;
  origem: string;
  created_at: string;
};

function paraRadar(p: LinhaPedido): PedidoParaRadar {
  return {
    id: p.id,
    contact_id: p.contact_id,
    total_cents: p.total_cents,
    status: p.status,
    origem: p.origem,
    dia: p.created_at.slice(0, 10),
  };
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "commercial_orders" });
  if (!authz.ok) return authz.response;

  const pagina = req.nextUrl.searchParams.get("pagina")?.trim() ?? "";
  if (!(PAGINAS as readonly string[]).includes(pagina)) {
    return fail("validation_failed", "pagina aceita: cliente, radar, pedido, fiscal.", 422, { requestId });
  }
  const hoje = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const orgId = authz.org.orgId;

  if (pagina === "cliente") {
    const contactId = req.nextUrl.searchParams.get("contact_id")?.trim() ?? "";
    if (!contactId) return fail("validation_failed", "contact_id é obrigatório.", 422, { requestId });
    const { data: contato, error: erroContato } = await supabase
      .from("contacts")
      .select("id, display_name, name, phone_number")
      .eq("organization_id", orgId)
      .eq("id", contactId)
      .maybeSingle();
    if (erroContato) return fail("internal_error", "Erro ao ler o contato.", 500, { requestId });
    if (!contato) return fail("not_found", "Contato não encontrado.", 404, { requestId });

    const { data: pedidos, error: erroPedidos } = await supabase
      .from("commercial_orders")
      .select("id, contact_id, total_cents, status, origem, created_at")
      .eq("organization_id", orgId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true })
      .limit(2000);
    if (erroPedidos) return fail("internal_error", "Erro ao ler os pedidos.", 500, { requestId });

    const historico = historicoReal(
      ((pedidos ?? []) as LinhaPedido[]).map(paraRadar),
      contactId,
      hoje,
    );
    const pg: PaginaCopilot = "cliente";
    return ok(
      {
        pagina: pg,
        contato: {
          id: (contato as { id: string }).id,
          nome:
            (contato as { display_name: string | null; name: string | null }).display_name ??
            (contato as { display_name: string | null; name: string | null }).name ??
            "—",
        },
        resumo: resumirCliente(historico),
        historico: {
          situacao: historico.situacao,
          dias_sem_compra: historico.dias_sem_compra,
          atraso_dias: historico.atraso_dias,
          ultima_compra: historico.ultima_compra,
          ticket_medio_cents: historico.ticket_medio_cents,
          qtd_pedidos: historico.qtd_pedidos,
        },
        perguntas: perguntasPara(pg),
      },
      { requestId },
    );
  }

  // pagina === "pedido": travas comerciais vigentes ("o desconto cabe?").
  if (pagina === "pedido") {
    const { data: pol, error: erroPol } = await supabase
      .from("commercial_policies")
      .select("desconto_max_vendedor_pct, permite_estoque_negativo, comissao_padrao_pct")
      .eq("organization_id", orgId)
      .maybeSingle();
    if (erroPol) return fail("internal_error", "Erro ao ler as políticas.", 500, { requestId });
    const politica = {
      desconto_max_vendedor_pct: Number(
        (pol as { desconto_max_vendedor_pct: number } | null)?.desconto_max_vendedor_pct ?? 5,
      ),
      permite_estoque_negativo:
        (pol as { permite_estoque_negativo: boolean } | null)?.permite_estoque_negativo ?? false,
      comissao_padrao_pct:
        (pol as { comissao_padrao_pct: number | null } | null)?.comissao_padrao_pct ?? null,
    };
    const pg: PaginaCopilot = "pedido";
    return ok({ pagina: pg, resumo: resumirPolitica(politica), politica, perguntas: perguntasPara(pg) }, { requestId });
  }

  // pagina === "fiscal": saúde da emissão (travadas + fila + sem nota).
  // Antes do radar de propósito: o fiscal não precisa da varredura de 5000.
  if (pagina === "fiscal") {
    // Constante à direita de propósito: o gate `postgrest-nao-compara-
    // coluna-com-coluna` lê literal-vs-literal como comparação de colunas
    // (`invoices` TEM coluna `erro`), e o valor aqui é literal mesmo.
    const STATUS_NOTA_ERRO = "erro";
    const [{ count: notasErro, error: erroNotas }, { count: jobsAbertos, error: erroJobs }] = await Promise.all([
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", STATUS_NOTA_ERRO),
      supabase
        .from("fiscal_jobs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .in("status", ["pendente", "processando", "erro"]),
    ]);
    if (erroNotas || erroJobs) return fail("internal_error", "Erro ao ler a fila fiscal.", 500, { requestId });

    const { data: faturados, error: erroFat } = await supabase
      .from("commercial_orders")
      .select("id")
      .eq("organization_id", orgId)
      .in("status", ["faturado", "expedido", "entregue"])
      .order("created_at", { ascending: false })
      .limit(2000);
    if (erroFat) return fail("internal_error", "Erro ao ler os pedidos.", 500, { requestId });
    const idsFat = ((faturados ?? []) as { id: string }[]).map((p) => p.id);
    let faturadosSemNota = 0;
    const parcialFiscal = (faturados ?? []).length >= 2000;
    if (idsFat.length > 0) {
      const comNota = new Set<string>();
      for (let i = 0; i < idsFat.length; i += 100) {
        const { data: nfs } = await supabase
          .from("invoices")
          .select("order_id")
          .eq("organization_id", orgId)
          .in("order_id", idsFat.slice(i, i + 100));
        for (const n of (nfs ?? []) as { order_id: string }[]) comNota.add(n.order_id);
      }
      faturadosSemNota = idsFat.filter((id) => !comNota.has(id)).length;
    }
    const pg: PaginaCopilot = "fiscal";
    const sinal = {
      notas_erro: notasErro ?? 0,
      jobs_abertos: jobsAbertos ?? 0,
      faturados_sem_nota: faturadosSemNota,
      amostra_parcial: parcialFiscal,
    };
    return ok({ pagina: pg, resumo: resumirFiscal(sinal), ...sinal, perguntas: perguntasPara(pg) }, { requestId });
  }

  // pagina === "radar": varredura limitada dos pedidos recentes, top 12 por
  // prioridade. Parcial por desenho (rápido no Copilot); o exato está no radar.
  const { data: recentes, error: erroRecentes } = await supabase
    .from("commercial_orders")
    .select("id, contact_id, total_cents, status, origem, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(LIMITE_VARREDURA);
  if (erroRecentes) return fail("internal_error", "Erro ao ler os pedidos.", 500, { requestId });

  const linhas = ((recentes ?? []) as LinhaPedido[]).map(paraRadar);
  const parcial = linhas.length >= LIMITE_VARREDURA;
  const porContato = new Map<string, PedidoParaRadar[]>();
  for (const p of linhas) {
    if (!p.contact_id) continue;
    const lista = porContato.get(p.contact_id) ?? [];
    lista.push(p);
    porContato.set(p.contact_id, lista);
  }
  const contagem = contagemVazia();
  const casos: { contact_id: string; situacao: string; atraso_dias: number; dias_sem_compra: number }[] = [];
  for (const [contactId, lista] of porContato) {
    const h = historicoReal(lista, contactId, hoje);
    contagem[h.situacao] += 1;
    if (h.situacao !== "ok" && h.situacao !== "novo_sem_compras") {
      casos.push({
        contact_id: contactId,
        situacao: h.situacao,
        atraso_dias: h.atraso_dias,
        dias_sem_compra: h.dias_sem_compra,
      });
    }
  }
  const PESO: Record<string, number> = {
    em_risco: 0,
    recompra_atrasada: 1,
    em_voo: 2,
    cancelado_sem_nova: 3,
    oportunidade_aberta: 4,
    primeira_compra: 5,
  };
  casos.sort((a, b) => (PESO[a.situacao] ?? 6) - (PESO[b.situacao] ?? 6) || b.atraso_dias - a.atraso_dias);
  // Daqui em diante só resta o radar (cliente/pedido/fiscal retornaram acima).
  const pg: PaginaCopilot = "radar";
  return ok(
    {
      pagina: pg,
      resumo: resumirRadar(contagem, porContato.size, parcial),
      amostra_parcial: parcial,
      top_casos: casos.slice(0, 12),
      perguntas: perguntasPara(pg),
    },
    { requestId },
  );
}
