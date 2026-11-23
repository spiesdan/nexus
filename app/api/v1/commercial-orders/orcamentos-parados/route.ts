/**
 * GET /api/v1/commercial-orders/orcamentos-parados — a fila que a tela do D lê.
 *
 * Recorte escrito (doc 40 §16, medido em 20/11/2026): `origem='mercos'` E
 * `status='rascunho'`. A régua de idade vem de
 * `organizations.settings->'orcamentos_parados'->>'dias_limite'` (padrão 60),
 * lida com admin client e filtro explícito de org — a leitura por sessão pode
 * casar zero e derrubar a régua no default em silêncio (molde `/metrics/atrito`).
 * A LISTA em si usa o client de sessão e herda a RLS de `commercial_orders`.
 *
 * Toda linha leva `proximo_passo`: sem isso seria lista morta (invariante 4).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  diasDaRégua,
  filaParaCsv,
  montarFila,
  type OrcadorParado,
} from "@/lib/comercial/orcamentos-parados";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Teto de página: a fila é de trabalho, não um despejo sem fim. */
const LIMITE = 1000;

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? undefined;
  const autorizado = await requireRole("agent", { requestId, resource: "commercial_orders" });
  if (!autorizado.ok) return autorizado.response;
  const orgId = autorizado.org.orgId;

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  const diasLimite = diasDaRégua(org?.settings);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commercial_orders")
    .select("id, numero, cliente_nome, total_cents, created_at, created_by")
    .eq("organization_id", orgId)
    .eq("origem", "mercos")
    .eq("status", "rascunho")
    .order("created_at", { ascending: true })
    .limit(LIMITE);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const linhas: OrcadorParado[] = (data ?? []).map((pedido) => ({
    id: String(pedido.id),
    numero: Number(pedido.numero),
    cliente: String(pedido.cliente_nome ?? ""),
    valor_cents: Number(pedido.total_cents ?? 0),
    criado_em: String(pedido.created_at),
    criado_por_humano: pedido.created_by != null,
  }));
  const fila = montarFila(linhas, new Date(), diasLimite);
  const recorte = { origem: "mercos", status: "rascunho" };

  // `?formato=csv` exporta a MESMA fila (não uma segunda consulta), com o
  // próximo passo de cada linha — nunca lista morta em planilha.
  if (req.nextUrl.searchParams.get("formato") === "csv") {
    return new Response(filaParaCsv(fila), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="orcamentos-parados-${new Date().toISOString().slice(0, 10)}.csv"`,
        "x-request-id": requestId ?? randomUUID(),
      },
    });
  }

  return ok(
    {
      orcamentos_parados: fila,
      dias_limite: diasLimite,
      total: fila.length,
      total_cents: fila.reduce((soma, linha) => soma + linha.valor_cents, 0),
      // O recorte está no corpo para quem lê a resposta não ter que adivinhar
      // por que 119 e 124 não são o mesmo número.
      recorte,
    },
    { requestId },
  );
}
