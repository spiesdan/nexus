/**
 * GET /api/v1/fiscal-inutilizacoes/puladas — relatório "Numerações puladas
 * por série" em PDF (paridade com o menu Emissor do Odivix).
 *
 * `?serie=` restringe a uma série (sem parâmetro, todas as séries com
 * lacunas); `?destino=baixar` força download. A lacuna é contagem pura:
 * número entre o primeiro e o último emitido de cada série que não tem nota
 * em `invoices` — e cada uma diz se está coberta por faixa inutilizada
 * (com o motivo) ou não.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { nomeDoPdfPuladas, renderPuladasPdf, type LacunaPulada, type SeriePuladas } from "@/lib/fiscal/puladas-pdf";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const LOTE = 1000;
/** Teto de números percorridos numa série (a faixa emitida é contígua na prática). */
const TETO_FAIXA = 200_000;

async function selecionarEmLotes(
  consulta: (
    de: number,
    ate: number,
  ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<{ linhas: Record<string, unknown>[]; erro: string | null }> {
  const linhas: Record<string, unknown>[] = [];
  for (let desde = 0; ; desde += LOTE) {
    const { data, error } = await consulta(desde, desde + LOTE - 1);
    if (error) return { linhas: [], erro: error.message };
    linhas.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < LOTE) break;
  }
  return { linhas, erro: null };
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "invoices" });
  if (!authz.ok) return authz.response;

  const serieFiltro = (req.nextUrl.searchParams.get("serie") ?? "").trim().slice(0, 10);
  const destino = req.nextUrl.searchParams.get("destino") === "baixar" ? "baixar" : "ver";

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("display_name, legal_name, cnpj")
    .eq("id", authz.org.orgId)
    .maybeSingle();

  const admin = createAdminClient();

  const notas = await selecionarEmLotes(async (de, ate) =>
    admin
      .from("invoices")
      .select("serie, numero")
      .eq("organization_id", authz.org.orgId)
      .not("numero", "is", null)
      .order("serie")
      .order("numero")
      .range(de, ate),
  );
  if (notas.erro) return fail("internal_error", "Erro ao ler as notas emitidas.", 500, { requestId });

  const inut = await selecionarEmLotes(async (de, ate) =>
    admin
      .from("fiscal_inutilizacoes")
      .select("serie, numero_inicial, numero_final, motivo, status")
      .eq("organization_id", authz.org.orgId)
      .order("serie")
      .order("numero_inicial")
      .range(de, ate),
  );
  if (inut.erro) return fail("internal_error", "Erro ao ler as inutilizações.", 500, { requestId });

  const numeros = new Set<string>();
  const porSerie = new Map<string, { min: number; max: number; emitidas: number }>();
  for (const n of notas.linhas) {
    const serie = String(n.serie ?? "");
    const numero = typeof n.numero === "number" ? n.numero : Number(n.numero);
    if (!serie || !Number.isFinite(numero)) continue;
    numeros.add(`${serie}|${numero}`);
    const atual = porSerie.get(serie) ?? { min: numero, max: numero, emitidas: 0 };
    atual.min = Math.min(atual.min, numero);
    atual.max = Math.max(atual.max, numero);
    atual.emitidas += 1;
    porSerie.set(serie, atual);
  }

  const faixas = inut.linhas
    .map((f) => ({
      serie: String(f.serie ?? ""),
      ini: Number(f.numero_inicial),
      fim: Number(f.numero_final),
      motivo: typeof f.motivo === "string" ? f.motivo : null,
      status: typeof f.status === "string" ? f.status : null,
    }))
    .filter((f) => f.serie !== "" && Number.isFinite(f.ini) && Number.isFinite(f.fim));

  const series: SeriePuladas[] = [];
  for (const [serie, faixa] of porSerie) {
    if (serieFiltro !== "" && serie !== serieFiltro) continue;
    const lacunas: LacunaPulada[] = [];
    const de = Math.min(faixa.min, faixa.max);
    const ate = Math.max(faixa.min, faixa.max);
    if (ate - de <= TETO_FAIXA) {
      for (let numero = de; numero <= ate; numero += 1) {
        if (numeros.has(`${serie}|${numero}`)) continue;
        const coberta = faixas.find((f) => f.serie === serie && numero >= f.ini && numero <= f.fim);
        lacunas.push({
          numero,
          inutilizada: !!coberta,
          motivo: coberta?.motivo ?? null,
          status: coberta?.status ?? null,
        });
      }
    }
    series.push({ serie, primeiro: faixa.min, ultimo: faixa.max, emitidas: faixa.emitidas, lacunas });
  }
  series.sort((a, b) => a.serie.localeCompare(b.serie));

  const o = (org ?? {}) as unknown as { display_name: string | null; legal_name: string | null; cnpj: string | null };
  const buf = await renderPuladasPdf(
    { nome: o.legal_name ?? o.display_name ?? "Empresa", documento: o.cnpj },
    series,
    serieFiltro === "" ? null : serieFiltro,
  );

  const nome = nomeDoPdfPuladas(serieFiltro === "" ? null : serieFiltro);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${destino === "baixar" ? "attachment" : "inline"}; filename="${nome}"`,
      "X-Request-Id": requestId,
    },
  });
}
