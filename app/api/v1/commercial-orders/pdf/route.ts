/**
 * GET /api/v1/commercial-orders/pdf — o LOTE em PDF.
 *
 * `?ids=a,b,c` (até 50) · `?destino=ver` (padrão) ou `?destino=baixar`.
 * Um arquivo só, um pedido por página — é o que o botão "Imprimir pedidos"
 * da lista entrega, em vez de 50 abas.
 *
 * É a porta do botão Imprimir: a rota NÃO é alcançada direto da UI, mas sim
 * pelo redirecionamento de `/app/pedidos/imprimir?ids=…`. Manter a página
 * no meio não é enfeite — `tests/unit/navegacao-completude.test.ts` justifica
 * aquela rota com "alcançada pelo botão Imprimir da barra de massa", e
 * apontar o botão direto para aqui tornaria essa justificativa falsa. O
 * redirecionamento acontece no servidor, antes de qualquer dado ser pintado,
 * então a página intermediária nunca aparece no papel.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { emitenteDoPdf } from "@/lib/comercial/emitente-pdf";
import { idsDoLote } from "@/lib/comercial/ids-do-lote";
import { montarPedidosPdf } from "@/lib/comercial/montar-pedidos";
import { numeroDoPedidoPdf, renderPedidosPdf } from "@/lib/comercial/pedido-pdf";
import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "commercial_orders" });
  if (!authz.ok) return authz.response;

  const destino = req.nextUrl.searchParams.get("destino") === "baixar" ? "baixar" : "ver";
  const ids = idsDoLote(req.nextUrl.searchParams.get("ids"));
  if (ids.length === 0) {
    return fail("validation_failed", "Informe ao menos um pedido em `ids`.", 400, { requestId });
  }

  const supabase = await createClient();
  const [emitente, pedidos] = await Promise.all([
    emitenteDoPdf(supabase, authz.org.orgId),
    montarPedidosPdf(supabase, authz.org.orgId, ids),
  ]);
  // Ids desconhecidos ou de outra organização não voltam (o filtro de
  // `organization_id` é explícito). Lote totalmente vazio = 404, não PDF em
  // branco: um arquivo sem página nenhuma é um download que engana.
  if (pedidos.length === 0) {
    return fail("not_found", "Nenhum pedido encontrado.", 404, { requestId });
  }

  const buf = await renderPedidosPdf(emitente, pedidos);

  // Um pedido no lote ganha o nome dele (`PED-0007.pdf`); mais de um, um
  // nome de lote. ASCII sempre — acento em filename quebra download em
  // alguns navegadores; o título dentro do PDF leva o nome real.
  const unico = pedidos[0];
  const nome = pedidos.length === 1 && unico ? `${numeroDoPedidoPdf(unico.numero)}.pdf` : "Pedidos.pdf";

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${destino === "baixar" ? "attachment" : "inline"}; filename="${nome}"`,
      "X-Request-Id": requestId,
    },
  });
}
