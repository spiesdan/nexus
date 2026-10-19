import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { assinarOrcamento } from "@/lib/comercial/orcamento-link";
import { normalizaTelefone } from "@/lib/contacts/csv";
import { env } from "@/lib/env";
import { formatCentsBRL } from "@/lib/money";
import { enviarParaProspect } from "@/lib/prospeccao/envio";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GERA O LINK DO ORÇAMENTO — e, se pedido, manda no WhatsApp do cliente.
 *
 * O link é a parte que funciona SEMPRE: ele não depende de WhatsApp conectado,
 * então o operador pode copiar e colar na conversa que já tem aberta. O envio
 * automático é conveniência, e quando não dá (sem sessão, cliente sem telefone)
 * a resposta diz o MOTIVO em vez de fingir que enviou.
 *
 * Só pedido no estágio de orçamento (`rascunho`/`em_analise`) ganha link: um
 * pedido já faturado não é proposta, é documento fiscal — e o link público não
 * pode mexer nele.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "commercial_orders" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const corpo = (await req.json().catch(() => null)) as { enviar?: unknown } | null;
  const enviar = corpo?.enviar === true;

  const admin = createAdminClient();
  const { data: pedidoDb } = await admin
    .from("commercial_orders")
    .select("id, numero, status, contact_id, cliente_nome, total_cents")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!pedidoDb) return fail("not_found", "Pedido não encontrado.", 404, { requestId });

  const pedido = pedidoDb as unknown as {
    id: string;
    numero: number;
    status: string;
    contact_id: string | null;
    cliente_nome: string;
    total_cents: number;
  };

  if (pedido.status !== "rascunho" && pedido.status !== "em_analise") {
    return fail(
      "conflict",
      "Este pedido já saiu do orçamento. O link só vale para rascunho ou pedido em análise.",
      409,
      { requestId },
    );
  }

  const token = assinarOrcamento({ orderId: pedido.id, orgId: authz.org.orgId });
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/o/${token}`;

  // O contato é lido SEMPRE (e não só no caminho de envio): a tela precisa do
  // telefone dele para abrir a conversa com o link pronto quando o envio
  // automático não é possível. Normalizar aqui, com a regra da casa, evita o
  // `wa.me/49…` sem DDI — que disca para outro país.
  let contato: {
    id: string;
    name: string | null;
    display_name: string | null;
  } | null = null;
  let telefone: string | null = null;
  if (pedido.contact_id) {
    const { data: contatoDb } = await admin
      .from("contacts")
      .select("id, name, display_name, phone_number")
      .eq("id", pedido.contact_id)
      .eq("organization_id", authz.org.orgId)
      .maybeSingle();
    const c = contatoDb as unknown as {
      id: string;
      name: string | null;
      display_name: string | null;
      phone_number: string | null;
    } | null;
    if (c) {
      contato = { id: c.id, name: c.name, display_name: c.display_name };
      telefone = c.phone_number ? normalizaTelefone(c.phone_number) : null;
    }
  }

  if (!enviar) {
    return ok({ url, enviado: false, motivo: null, telefone }, { requestId });
  }

  // ── Envio pelo WhatsApp ──────────────────────────────────────────────────
  const { data: sessao } = await admin
    .from("channel_sessions")
    .select("id")
    .eq("organization_id", authz.org.orgId)
    .eq("status", "WORKING")
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  const sessaoId = (sessao as unknown as { id?: string } | null)?.id ?? null;
  if (!sessaoId) {
    return ok({ url, enviado: false, motivo: "sem_sessao", telefone }, { requestId });
  }

  if (!contato) {
    return ok({ url, enviado: false, motivo: "sem_cliente", telefone }, { requestId });
  }

  if (!telefone) {
    return ok({ url, enviado: false, motivo: "sem_telefone", telefone }, { requestId });
  }

  const { data: org } = await admin
    .from("organizations")
    .select("display_name")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  const nomeDaEmpresa =
    (org as unknown as { display_name?: string } | null)?.display_name ?? "Orçamento";

  const mensagem =
    `Orçamento #${pedido.numero} — ${nomeDaEmpresa}\n` +
    `Total: ${formatCentsBRL(pedido.total_cents)}\n` +
    `Veja os itens e aprove por aqui: ${url}`;

  const resultado = await enviarParaProspect(admin, {
    orgId: authz.org.orgId,
    usuarioId: authz.user.id,
    requestId,
    sessaoId,
    prospect: {
      id: contato.id,
      nome: contato.display_name ?? contato.name ?? pedido.cliente_nome,
      telefone_normalizado: telefone,
    },
    mensagem,
  });

  if (!resultado.ok) {
    return ok({ url, enviado: false, motivo: "falha_envio" }, { requestId });
  }
  return ok({ url, enviado: true, motivo: null }, { requestId });
}
