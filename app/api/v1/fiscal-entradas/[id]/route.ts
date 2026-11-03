/**
 * GET /api/v1/fiscal-entradas/[id] — a nota com tudo que pende dela.
 *
 * A tela de detalhe não faz cinco requisições: itens, eventos, manifestações e
 * contas a pagar vêm juntos, na mesma resposta, todos filtrados pela
 * organização do JWT. `viewer` lê; quem escreve é a rota de cada ação.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { COLUNAS_DA_ENTRADA, type EntradaFiscal } from "@/lib/schemas/fiscal-entrada";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "fiscal-entradas" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();

  const { data: entradaRaw, error } = await supabase
    .from("fiscal_entradas")
    .select(COLUNAS_DA_ENTRADA)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao ler a entrada.", 500, { requestId });
  if (!entradaRaw) return fail("not_found", "Entrada não encontrada.", 404, { requestId });
  const entrada = entradaRaw as unknown as EntradaFiscal;

  const [itens, eventos, manifestacoes, pagaveis, fornecedor] = await Promise.all([
    supabase
      .from("fiscal_document_items")
      .select(
        "id, numero_item, codigo, ean, descricao, ncm, cfop, unidade, quantidade, " +
          "valor_unitario_cents, valor_total_cents, icms_cents, ipi_cents, pis_cents, " +
          "cofins_cents, cst, produto_id",
      )
      .eq("organization_id", authz.org.orgId)
      .eq("entrada_id", id)
      .order("numero_item", { ascending: true }),
    supabase
      .from("fiscal_document_events")
      .select(
        "id, chave, nsu, tipo, tp_evento, descricao, protocolo, dh_evento, sequencia, created_at",
      )
      .eq("organization_id", authz.org.orgId)
      .eq("chave", entrada.chave)
      .order("dh_evento", { ascending: false, nullsFirst: false }),
    supabase
      .from("fiscal_manifestations")
      .select("id, evento, justificativa, protocolo, cstat, resultado, mensagem, created_at")
      .eq("organization_id", authz.org.orgId)
      .eq("entrada_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("financial_pagaveis")
      .select(
        "id, entrada_id, parcela_n, total_parcelas, valor_original_cents, vencimento, status",
      )
      .eq("organization_id", authz.org.orgId)
      .eq("entrada_id", id)
      .order("parcela_n", { ascending: true }),
    entrada.supplier_id
      ? supabase
          .from("suppliers")
          .select("id, nome, cnpj, ie, email, telefone, endereco_json, total_notas, total_comprado_cents")
          .eq("organization_id", authz.org.orgId)
          .eq("id", entrada.supplier_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  return ok(
    {
      entrada,
      itens: itens.data ?? [],
      eventos: eventos.data ?? [],
      manifestacoes: manifestacoes.data ?? [],
      pagaveis: pagaveis.data ?? [],
      fornecedor: fornecedor.data ?? null,
    },
    { requestId },
  );
}
