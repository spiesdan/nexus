/**
 * GET /api/v1/commercial-orders/[id]/pdf — o pedido em PDF.
 *
 * `?destino=ver` (padrão) abre no navegador; `?destino=baixar` força download.
 * Render server-side via @react-pdf/renderer (mesmo molde do PDF de LGPD).
 *
 * Os DADOS vêm de `montarPedidosPdf` e o CABEÇALHO de `emitenteDoPdf` — os
 * mesmos módulos do lote, para um pedido impresso sozinho nunca sair
 * diferente do mesmo pedido dentro de um lote.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { emitenteDoPdf } from "@/lib/comercial/emitente-pdf";
import { idsDoLote } from "@/lib/comercial/ids-do-lote";
import { montarPedidosPdf } from "@/lib/comercial/montar-pedidos";
import { numeroDoPedidoPdf, renderPedidoPdf } from "@/lib/comercial/pedido-pdf";
import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "commercial_orders" });
  if (!authz.ok) return authz.response;

  const destino = req.nextUrl.searchParams.get("destino") === "baixar" ? "baixar" : "ver";
  const { id } = await params;

  // Um id malformado vira 404 e não chega ao Postgres: `.in("id", …)` com
  // texto que não é UUID é erro de cast, não "linha não encontrada".
  const ids = idsDoLote(id);
  if (ids.length === 0) return fail("not_found", "Pedido não encontrado.", 404, { requestId });

  const supabase = await createClient();
  const [emitente, pedidos] = await Promise.all([
    emitenteDoPdf(supabase, authz.org.orgId),
    montarPedidosPdf(supabase, authz.org.orgId, ids),
  ]);
  const pedido = pedidos[0];
  if (!pedido) return fail("not_found", "Pedido não encontrado.", 404, { requestId });

  const buf = await renderPedidoPdf(emitente, pedido);

  const nome = `${numeroDoPedidoPdf(pedido.numero)}.pdf`;
  // Nome ASCII no header: acento em filename quebra download em alguns
  // navegadores — o título dentro do PDF leva o nome real.
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${destino === "baixar" ? "attachment" : "inline"}; filename="${nome}"`,
      "X-Request-Id": requestId,
    },
  });
}
