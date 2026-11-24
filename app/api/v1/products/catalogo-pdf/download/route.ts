/**
 * GET /api/v1/products/catalogo-pdf/download — o MESMO PDF, com download.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";

import { gerarPdfDaOrganizacao, respostaPdf } from "../_pdf";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? undefined;
  const autorizado = await requireRole("viewer", { requestId, resource: "product_catalog_exports" });
  if (!autorizado.ok) return autorizado.response;
  const resultado = await gerarPdfDaOrganizacao(autorizado.org.orgId, requestId);
  if ("status" in resultado) return resultado;
  return respostaPdf(resultado.buffer, resultado.nome, "baixar", requestId);
}
