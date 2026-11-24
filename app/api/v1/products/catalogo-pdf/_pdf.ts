import { NextResponse } from "next/server";

import { randomUUID } from "node:crypto";

import { fail } from "@/lib/api/wrappers";
import { montarCatalogo } from "@/lib/catalogo/dados";
import { renderCatalogoPdf } from "@/lib/catalogo/pdf/CatalogoPdf";
import { createAdminClient } from "@/lib/supabase/admin";

/** Preview e download chamam exatamente esta função — o mesmo buffer. */
export async function gerarPdfDaOrganizacao(organizationId: string, requestId?: string) {
  const admin = createAdminClient();
  const montagem = await montarCatalogo(admin, organizationId);
  if (!montagem.podeGerar) {
    return fail(
      "validation_failed",
      "Há produtos sem categoria válida, nome, código ou foto.",
      422,
      {
        requestId,
        details: {
          semCategoria: montagem.pendencias.semCategoria,
          semDados: montagem.pendencias.semDados,
        },
      },
    );
  }
  const buf = await renderCatalogoPdf(montagem.dados);
  return { buffer: buf, nome: `catalogo-${new Date().getFullYear()}.pdf` };
}

export function respostaPdf(
  buffer: Buffer,
  nome: string,
  destino: "ver" | "baixar",
  requestId?: string,
): Response {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${destino === "baixar" ? "attachment" : "inline"}; filename="${nome}"`,
      "cache-control": "no-store",
      "x-request-id": requestId ?? randomUUID(),
    },
  });
}
