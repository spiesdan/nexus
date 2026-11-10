/**
 * GET /api/v1/shipments/[id]/fechamento/pdf — o fechamento da carga em PDF, e SÓ o fechamento.
 *
 * ═══ DE ONDE ISTO VEIO ════════════════════════════════════════════════════
 *
 * O PDF de romaneio imprimia a conferência de caixa como OITO LINHAS VAZIAS
 * (dinheiro, PIX, cartão, cheques, boletos, −vale, −combustível, −despesas).
 * O papel era preenchido à mão, guardado num arquivo físico, e a diferença
 * era conferida de olho. A rota `/romaneio` agora imprime SÓ o romaneio; o
 * fechamento vive AQUI, no sistema.
 *
 * Este endpoint nasceu da MESMA demanda, na ordem contrária: quem fecha o caixa
 * já tem a conta feita no sistema (a tela `PUT /api/v1/shipments/[id]/fechamento`
 * grava o que foi contado e calcula as somas). O papel não serve para preencher
 * — serve para LEVAR a conta fechada. Por isso este PDF é só o fechamento: a
 * conta, as linhas contadas, a conferência e a cobrança — não o romaneio (lista
 * do que carregar/entregar, que é a frente do `/romaneio`).
 *
 * Leitura (`viewer`): quem gera o documento não muda estado — o fechamento vem
 * do banco e do que foi conferido, nunca é reescrito aqui.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { lerCarga, montarFechamento } from "@/lib/comercial/fechamento";
import { renderFechamentoPdf, type EmitenteDoFechamentoPdf } from "@/lib/comercial/fechamento-pdf";
import { numeroDaCarga } from "@/lib/schemas/expedicao";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "shipments" });
  if (!authz.ok) return authz.response;

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return fail("validation_failed", "id inválido.", 400, { requestId });
  }

  const admin = createAdminClient();
  const carga = await lerCarga(admin, authz.org.orgId, id);
  if (!carga) return fail("not_found", "Carga não encontrada.", 404, { requestId });

  try {
    const payload = await montarFechamento(admin, authz.org.orgId, carga);
    const [{ data: org }] = await Promise.all([
      admin
        .from("organizations")
        .select("display_name, legal_name")
        .eq("id", authz.org.orgId)
        .maybeSingle(),
    ]);
    const o = (org ?? {}) as unknown as { display_name: string | null; legal_name: string | null };
    const emitente: EmitenteDoFechamentoPdf = { nome: o.legal_name ?? o.display_name ?? "Empresa" };

    const buf = await renderFechamentoPdf(emitente, payload);
    const nome = `fechamento-${numeroDaCarga(carga.numero).replace(/\s+/g, "-").toLowerCase()}.pdf`;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nome}"`,
        "X-Request-Id": requestId,
      },
    });
  } catch (e) {
    logger.error("fechamento: falha ao gerar o pdf", {
      cargaId: id,
      erro: e instanceof Error ? e.message : String(e),
      requestId,
    });
    return fail("internal_error", "Erro ao gerar o fechamento.", 500, { requestId });
  }
}
