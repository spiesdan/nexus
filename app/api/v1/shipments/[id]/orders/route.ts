/**
 * GET  /api/v1/shipments/[id]/orders — pedidos que ainda podem entrar nesta carga.
 * POST /api/v1/shipments/[id]/orders — põe pedido numa carga que já existe.
 *
 * A carga nasce com os pedidos escolhidos em `/expedicao/nova`, mas a doca não
 * para: chega pedido depois do romaneio impresso, e antes disto a única saída
 * era excluir a carga inteira e montar outra. Só vale com a carga em
 * `montando` — depois que o caminhão saiu, a lista de paradas é o que a rota
 * já leu e o motorista já recebeu; mexer nela seria reescrever a viagem.
 *
 * O GET serve à tela ("Adicionar pedido"): a mesma fila da nova carga, já sem
 * os que estão em outra carga, com cidade e valor para a pessoa reconhecer o
 * pedido sem abrir um por um.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  carregarContatosDaEntrega,
  cidadeDaEntrega,
  nomeDaEntrega,
} from "@/lib/expedicao/endereco-da-entrega";
import { STATUS_EMBARCAVEIS } from "@/lib/schemas/expedicao";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const corpoSchema = z.object({
  order_ids: z.array(z.string().uuid()).min(1).max(200),
});

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "shipments" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();

  const { data: carga } = await supabase
    .from("shipments")
    .select("id, status")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!carga) return fail("not_found", "Carga não encontrada.", 404, { requestId });
  if ((carga as unknown as { status: string }).status !== "montando") {
    return ok({ carga_status: (carga as unknown as { status: string }).status, pedidos: [] }, { requestId });
  }

  const [{ data: pedidos }, { data: ocupados }] = await Promise.all([
    supabase
      .from("commercial_orders")
      .select("id, numero, cliente_nome, cliente_documento, contact_id, endereco_entrega, total_cents, status")
      .eq("organization_id", authz.org.orgId)
      .in("status", [...STATUS_EMBARCAVEIS])
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("shipment_orders")
      .select("order_id")
      .eq("organization_id", authz.org.orgId),
  ]);

  const emAlgumaCarga = new Set(
    ((ocupados ?? []) as unknown as { order_id: string }[]).map((o) => o.order_id),
  );
  const disponiveis = ((pedidos ?? []) as unknown as Record<string, unknown>[]).filter(
    (p) => !emAlgumaCarga.has(p.id as string),
  );

  // Cidade resolvida como na ficha da carga e no romaneio: endereço do pedido
  // primeiro, cadastro depois — a tela não pode chamar de "sem cidade" um
  // pedido cuja parada o papel mostra com destino.
  const contatos = await carregarContatosDaEntrega(supabase, authz.org.orgId, disponiveis);

  return ok(
    {
      carga_status: "montando",
      pedidos: disponiveis.map((p) => ({
        id: p.id,
        numero: p.numero,
        cliente_nome: nomeDaEntrega(
          { ...p, cliente_nome: p.cliente_nome as string | null },
          contatos,
        ),
        cidade: cidadeDaEntrega(p, contatos),
        total_cents: p.total_cents,
        status: p.status,
      })),
    },
    { requestId },
  );
}

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "shipment_orders" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const { id } = await params;
  const ids = [...new Set(parsed.data.order_ids)];
  const supabase = await createClient();

  const { data: carga } = await supabase
    .from("shipments")
    .select("id, numero, status")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!carga) return fail("not_found", "Carga não encontrada.", 404, { requestId });
  const statusDaCarga = (carga as unknown as { status: string }).status;
  if (statusDaCarga !== "montando") {
    return fail(
      "validation_failed",
      "Só carga em montagem aceita pedido novo — a que já saiu tem a rota lida pelo motorista.",
      422,
      { requestId },
    );
  }

  // Elegibilidade um a um, antes de gravar qualquer coisa: carga pela metade
  // faria a pessoa achar que levou junto o que ficou para trás.
  const { data: pedidos } = await supabase
    .from("commercial_orders")
    .select("id, numero, status")
    .eq("organization_id", authz.org.orgId)
    .in("id", ids);
  const porId = new Map(
    ((pedidos ?? []) as unknown as { id: string; numero: number; status: string }[]).map((p) => [
      p.id,
      p,
    ]),
  );
  for (const orderId of ids) {
    const ped = porId.get(orderId);
    if (!ped) {
      return fail("validation_failed", "Um dos pedidos não existe.", 422, { requestId });
    }
    if (!(STATUS_EMBARCAVEIS as readonly string[]).includes(ped.status)) {
      return fail(
        "validation_failed",
        `Pedido PED-${String(ped.numero).padStart(4, "0")} está "${ped.status}" — só embarcável aprovado/concluído/faturado.`,
        422,
        { requestId },
      );
    }
  }
  const { data: jaEmCarga } = await supabase
    .from("shipment_orders")
    .select("order_id")
    .eq("organization_id", authz.org.orgId)
    .in("order_id", ids);
  if (jaEmCarga && jaEmCarga.length > 0) {
    return fail("validation_failed", "Um dos pedidos já está em outra carga.", 409, { requestId });
  }

  const { data: ultimo } = await supabase
    .from("shipment_orders")
    .select("sequencia")
    .eq("shipment_id", id)
    .eq("organization_id", authz.org.orgId)
    .order("sequencia", { ascending: false })
    .limit(1)
    .maybeSingle();
  const base = (ultimo as unknown as { sequencia: number } | null)?.sequencia ?? 0;

  const { data: inseridos, error: erroItens } = await supabase
    .from("shipment_orders")
    .insert(
      ids.map((orderId, i) => ({
        organization_id: authz.org.orgId,
        shipment_id: id,
        order_id: orderId,
        sequencia: base + i + 1,
        status: "na_carga",
      })),
    )
    .select("id, order_id, sequencia");
  if (erroItens) {
    return fail("internal_error", "Erro ao pôr os pedidos na carga.", 500, { requestId });
  }

  // Mesma regra da criação da carga: quem embarcou sai da fila de embarque.
  // Só avança (`in` com os status embarcáveis), nunca regride.
  await supabase
    .from("commercial_orders")
    .update({ status: "expedido" })
    .eq("organization_id", authz.org.orgId)
    .in("id", ids)
    .in("status", [...STATUS_EMBARCAVEIS]);

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "shipment_order.added",
    resourceType: "shipments",
    resourceId: id,
    requestId,
  });

  // O aviso ao cliente NÃO sai aqui: o pedido entrou na carga, mas ela ainda
  // pode estar `montando`. O gatilho é o "Sair para rota" (`rota/iniciar`).

  return ok({ adicionados: inseridos ?? [], shipment_id: id }, { requestId, status: 201 });
}
