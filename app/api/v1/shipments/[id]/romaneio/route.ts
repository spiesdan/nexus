/**
 * GET /api/v1/shipments/[id]/romaneio — o romaneio em PDF, e SÓ o romaneio.
 *
 * O motorista leva um papel só, e esse papel é a lista do que carregar e
 * entregar. O fechamento de caixa NÃO sai mais aqui: ele vive no sistema, na
 * tela da carga (`PUT /api/v1/shipments/[id]/fechamento`), porque fechar caixa
 * no papel é conferir de olho e guardar em arquivo físico.
 *
 * Antes esta rota imprimia romaneio na frente e fechamento atrás, mesma folha
 * (`renderRomaneioEFechamentoPdf`). A metade do fechamento foi removida junto
 * com o componente que a desenhava — código que ninguém chama apodrece, e
 * apodrecer justo na conta do caixa é o pior lugar.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  carregarContatosDaEntrega,
  cidadeDaEntrega,
  enderecoDaEntrega,
  nomeDaEntrega,
} from "@/lib/expedicao/endereco-da-entrega";
import { numeroDaCarga } from "@/lib/schemas/expedicao";
import { renderRomaneioPdf, type ItemDaParada } from "@/lib/comercial/romaneio-pdf";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "shipments" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();

  const [{ data: carga }, { data: org }] = await Promise.all([
    supabase
      .from("shipments")
      .select("numero, placa, veiculo_tipo, motorista_nome")
      .eq("id", id)
      .eq("organization_id", authz.org.orgId)
      .single(),
    supabase
      .from("organizations")
      .select("display_name, legal_name")
      .eq("id", authz.org.orgId)
      .single(),
  ]);

  if (!carga) return fail("not_found", "Carga não encontrada.", 404, { requestId });

  const { data: itens } = await supabase
    .from("shipment_orders")
    .select("sequencia, status, order_id")
    .eq("shipment_id", id)
    .eq("organization_id", authz.org.orgId)
    .order("sequencia");

  const ids = ((itens ?? []) as unknown as { order_id: string }[]).map((i) => i.order_id);
  interface LinhaPedido {
    id: string;
    numero: number;
    cliente_nome: string;
    endereco_entrega: string | null;
    contact_id: string | null;
    cliente_documento: string | null;
    total_cents: number;
    condicao_pagamento: string | null;
    created_at: string | null;
  }
  const pedidos: Record<string, LinhaPedido> = {};
  const itensPorPedido: Record<string, ItemDaParada[]> = {};
  if (ids.length > 0) {
    // Sem recebíveis aqui de propósito: o "pago antecipado" era insumo da
    // metade do fechamento, que não sai mais neste PDF. Menos uma query, e
    // nenhuma coluna de dinheiro que ninguém lê.
    const [{ data }, { data: itensPedidos }] = await Promise.all([
      supabase
        .from("commercial_orders")
        .select("id, numero, cliente_nome, endereco_entrega, contact_id, cliente_documento, total_cents, condicao_pagamento, created_at")
        .eq("organization_id", authz.org.orgId)
        .in("id", ids),
      supabase
        .from("commercial_order_items")
        .select("order_id, produto_codigo, produto_nome, quantidade, posicao, preco_unit_cents, product_id")
        .eq("organization_id", authz.org.orgId)
        .in("order_id", ids)
        .order("posicao"),
    ]);
    for (const p of ((data ?? []) as unknown as LinhaPedido[])) {
      pedidos[p.id] = p;
    }
    // Peso do produto: o Odvix imprime peso por item. Só buscamos quando o item
    // aponta para um produto do catálogo — item digitado à mão não tem ficha.
    const idsProdutos = [
      ...new Set(
        ((itensPedidos ?? []) as unknown as { product_id: string | null }[])
          .map((i) => i.product_id)
          .filter((v): v is string => !!v),
      ),
    ];
    const pesos: Record<string, number> = {};
    if (idsProdutos.length > 0) {
      const { data: prods } = await supabase
        .from("catalog_products")
        .select("id, peso_bruto_kg")
        .eq("organization_id", authz.org.orgId)
        .in("id", idsProdutos);
      for (const pr of (prods ?? []) as unknown as { id: string; peso_bruto_kg: number | null }[]) {
        if (pr.peso_bruto_kg != null) pesos[pr.id] = pr.peso_bruto_kg;
      }
    }
    for (const it of ((itensPedidos ?? []) as unknown as {
      order_id: string; produto_codigo: string; produto_nome: string; quantidade: number;
      preco_unit_cents: number | null; product_id: string | null;
    }[])) {
      const lista = itensPorPedido[it.order_id] ?? [];
      lista.push({
        codigo: it.produto_codigo,
        nome: it.produto_nome,
        quantidade: it.quantidade,
        preco_unit_cents: it.preco_unit_cents,
        peso_kg: it.product_id ? (pesos[it.product_id] ?? null) : null,
      });
      itensPorPedido[it.order_id] = lista;
    }
  }

  // O endereço de entrega raramente está no pedido (medido na carga 022: 0 de
  // 22) e quase sempre está no cadastro do cliente (21 de 22). Resolver aqui é
  // o que impede o papel de dizer "sem endereço" para quem tem endereço.
  const contatos = await carregarContatosDaEntrega(
    supabase,
    authz.org.orgId,
    Object.values(pedidos),
  );

  const c = carga as unknown as {
    numero: number;
    placa: string | null;
    veiculo_tipo: string | null;
    motorista_nome: string | null;
  };
  const o = (org ?? {}) as unknown as { display_name: string | null; legal_name: string | null };

  const buf = await renderRomaneioPdf(
    { nome: o.legal_name ?? o.display_name ?? "Empresa" },
    {
      numero: c.numero,
      placa: c.placa,
      veiculo_tipo: c.veiculo_tipo,
      motorista_nome: c.motorista_nome,
      paradas: ((itens ?? []) as unknown as {
        sequencia: number; status: string; order_id: string;
      }[]).map((i) => {
        const ped = pedidos[i.order_id];
        return {
          sequencia: i.sequencia,
          numero: ped?.numero ?? 0,
          // Nome e cidade saem do MESMO contato que o endereço: o nome
          // congelado no pedido envelhece (109 de 393 pedidos abertos já
          // divergiam do cadastro) e a cidade é o que agrupa a folha.
          cliente_nome: ped ? nomeDaEntrega(ped, contatos) || "—" : "—",
          endereco_entrega: ped ? enderecoDaEntrega(ped, contatos) : null,
          cidade: ped ? cidadeDaEntrega(ped, contatos) : null,
          total_cents: ped?.total_cents ?? 0,
          status: i.status,
          condicao_pagamento: ped?.condicao_pagamento ?? null,
          emissao: ped?.created_at ?? null,
          itens: itensPorPedido[i.order_id] ?? [],
        };
      }),
    },
  );

  const nome = `romaneio-${numeroDaCarga(c.numero).replace(/\s+/g, "-").toLowerCase()}.pdf`;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome}"`,
      "X-Request-Id": requestId,
    },
  });
}
