/**
 * GET /api/v1/fiscal-entradas/[id]/xml — o XML da nota, como veio da SEFAZ.
 *
 * Arquivo é arquivo: aqui a resposta não é `ok()`, é o corpo binário com
 * `Content-Disposition` — mesmo molde do PDF de pedido. O guard continua sendo
 * `viewer` + RLS, e o `organization_id` vem do JWT.
 *
 * Só existe XML depois da manifestação (regra da SEFAZ, não nossa). Sem XML a
 * rota responde 404 dizendo isso, em vez de um arquivo vazio.
 */
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "fiscal-entradas" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fiscal_entradas")
    .select("chave, xml")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) return fail("internal_error", "Erro ao ler o XML.", 500, { requestId });
  const linha = data as unknown as { chave: string; xml: string | null } | null;
  if (!linha) return fail("not_found", "Entrada não encontrada.", 404, { requestId });
  if (!linha.xml) {
    return fail(
      "not_found",
      "XML ainda não disponível — manifeste a nota e sincronize de novo.",
      404,
      { requestId },
    );
  }

  const baixar = req.nextUrl.searchParams.get("baixar") !== "0";
  const nome = `nfe-entrada-${linha.chave}.xml`;
  return new NextResponse(new Uint8Array(Buffer.from(linha.xml, "utf8")), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="${nome}"`,
      "X-Request-Id": requestId,
    },
  });
}
