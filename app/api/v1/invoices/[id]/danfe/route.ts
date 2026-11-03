/**
 * GET /api/v1/invoices/[id]/danfe — gera o DANFE em PDF via sidecar.
 *
 * O PDF é DERIVADO do XML na hora (nunca armazenado como fonte). Sem o
 * pacote `sped-da` no sidecar, 422 honesto com DANFE_INDISPONIVEL — nunca um
 * PDF inventado.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { baseDoStorage, urlPublicaDoLogo } from "@/lib/branding/logo";
import { marcaDaOrganizacaoDeSettings } from "@/lib/branding/organizacao";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "invoices" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("numero, serie, xml")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const nota = data as unknown as { numero: number | null; serie: string; xml: string | null } | null;
  if (!nota) return fail("not_found", "Nota não encontrada.", 404, { requestId });
  if (!nota.xml) {
    return fail("validation_failed", "Nota ainda sem XML autorizado.", 422, { requestId });
  }

  const base = process.env.FISCAL_SIDECAR_URL?.trim();
  const segredo = process.env.FISCAL_SIDECAR_SECRET?.trim();
  if (!base || !segredo) {
    return fail("validation_failed", "DANFE indisponível: sidecar fiscal não configurado.", 422, { requestId });
  }
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 120000);
  try {
    // O LOGO DO EMITENTE, quando ele existe. É o arquivo que a própria
    // organização subiu no bucket público — nunca a marca de quem revende o
    // produto. Falha aqui não impede o DANFE: o `sped-da` centraliza os dados
    // do emitente quando não há imagem.
    let logoBase64: string | null = null;
    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", authz.org.orgId)
      .maybeSingle();
    const caminho = marcaDaOrganizacaoDeSettings(
      (org as unknown as { settings: unknown } | null)?.settings,
    )?.logo_path;
    if (caminho) {
      const base = baseDoStorage();
      if (base) {
        const imagem = await fetch(urlPublicaDoLogo(caminho, base), { signal: controle.signal }).catch(
          () => null,
        );
        if (imagem?.ok) {
          const bytes = Buffer.from(await imagem.arrayBuffer());
          // O bucket limita 512 KB; recusar acima disso é só não colocar logo.
          if (bytes.byteLength > 0 && bytes.byteLength <= 512 * 1024) {
            logoBase64 = bytes.toString("base64");
          }
        }
      }
    }
    const res = await fetch(`${base.replace(/\/$/, "")}/danfe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Fiscal-Secret": segredo },
      body: JSON.stringify({ xml: nota.xml, ...(logoBase64 ? { logo_base64: logoBase64 } : {}) }),
      signal: controle.signal,
    });
    const corpo = (await res.json().catch(() => null)) as {
      ok: boolean;
      pdf_base64?: string;
      mensagem?: string;
    } | null;
    if (!corpo?.ok || !corpo.pdf_base64) {
      return fail("validation_failed", corpo?.mensagem ?? "DANFE indisponível.", 422, { requestId });
    }
    const pdf = Buffer.from(corpo.pdf_base64, "base64");
    return new NextResponse(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="danfe-${nota.serie}-${nota.numero ?? "s-numero"}.pdf"`,
        "x-request-id": requestId,
      },
    });
  } catch {
    return fail("internal_error", "Sidecar fiscal inalcançável.", 500, { requestId });
  } finally {
    clearTimeout(limite);
  }
}
