import type { SupabaseClient } from "@supabase/supabase-js";

import { historicoDeCompra, type PedidoParaRadar } from "@/lib/comercial/radar-compras";
import { resumirCliente, resumirPolitica } from "@/lib/ai/copilot/context";

/**
 * Resumo real da página para o Copilot conversacional.
 *
 * Leituras focadas e baratas (contato + pedidos dele, ou travas): o
 * radar/fiscal têm varredura própria no endpoint de contexto e não
 * entram no caminho do chat. NULL = sem o que resumir (o modelo usa
 * as tools). RLS vale (client da sessão, `organization_id` explícito).
 */
export async function resumoDaPagina(
  supabase: SupabaseClient,
  orgId: string,
  pagina: string,
  contactId?: string,
): Promise<string | null> {
  const hoje = new Date().toISOString().slice(0, 10);

  if (contactId) {
    const { data: contato } = await supabase
      .from("contacts")
      .select("id, display_name, name")
      .eq("organization_id", orgId)
      .eq("id", contactId)
      .maybeSingle();
    if (!contato) return null;
    const c = contato as { id: string; display_name: string | null; name: string | null };
    const { data: pedidos } = await supabase
      .from("commercial_orders")
      .select("id, contact_id, total_cents, status, origem, created_at")
      .eq("organization_id", orgId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true })
      .limit(2000);
    const linhas = ((pedidos ?? []) as {
      id: string;
      contact_id: string | null;
      total_cents: number;
      status: string;
      origem: string;
      created_at: string;
    }[]).map(
      (p): PedidoParaRadar => ({
        id: p.id,
        contact_id: p.contact_id,
        total_cents: p.total_cents,
        status: p.status,
        origem: p.origem,
        dia: p.created_at.slice(0, 10),
      }),
    );
    const h = historicoDeCompra(linhas, contactId, hoje);
    return `Cliente ${c.display_name ?? c.name ?? "—"}: ${resumirCliente(h)}`;
  }

  if (pagina.includes("pedido")) {
    const { data: pol } = await supabase
      .from("commercial_policies")
      .select("desconto_max_vendedor_pct, permite_estoque_negativo, comissao_padrao_pct")
      .eq("organization_id", orgId)
      .maybeSingle();
    const p = pol as unknown as {
      desconto_max_vendedor_pct: number;
      permite_estoque_negativo: boolean;
      comissao_padrao_pct: number | null;
    } | null;
    return resumirPolitica({
      desconto_max_vendedor_pct: Number(p?.desconto_max_vendedor_pct ?? 5),
      permite_estoque_negativo: p?.permite_estoque_negativo ?? false,
      comissao_padrao_pct: p?.comissao_padrao_pct ?? null,
    });
  }

  return null;
}
