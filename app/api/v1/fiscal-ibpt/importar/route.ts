/**
 * POST /api/v1/fiscal-ibpt/importar — tabela oficial do IBPT em CSV (manager+).
 *
 * Paridade com o Odivix (`wpconsultaimpostoibpt`): o operador baixa o CSV
 * público do IBPT (decisão de 2026-10-04 — sem API com token) e importa aqui.
 * O arquivo é POR UF e a linha não traz a UF, então ela vem da config fiscal
 * (ou do corpo); `tipo` diz se é o NCM de produtos ou a tabela de serviços.
 *
 * Upsert na unique `(organization_id, tipo, codigo, ex, uf, vigencia_inicio)`:
 * reimportar o MESMO exercício atualiza as linhas, importar o exercício novo
 * coexiste (a consulta escolhe a vigência que cobre hoje). Nada de linha
 * duplicada e nada de tabela apagada no caminho.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { lerCsvIbpt, type LinhaIbpt } from "@/lib/fiscal/ibpt";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_CSV = 10_000_000;
const MAX_LINHAS = 60_000;
const LOTE = 500;

const corpoSchema = z.object({
  csv: z.string().min(1).max(MAX_CSV),
  tipo: z.enum(["produto", "servico"]).default("produto"),
  uf: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "UF com 2 letras")
    .transform((v) => v.toUpperCase())
    .optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fiscal-ibpt" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "CSV, tipo ou UF inválidos.", 422, { requestId });
  }
  const { csv, tipo } = parsed.data;

  const supabase = await createClient();
  let uf = parsed.data.uf ?? null;
  if (!uf) {
    const { data: config } = await supabase
      .from("fiscal_settings")
      .select("uf")
      .eq("organization_id", authz.org.orgId)
      .maybeSingle();
    uf = ((config as unknown as { uf?: string | null } | null)?.uf ?? "").trim().toUpperCase() || null;
  }
  if (!uf || uf.length !== 2) {
    return fail(
      "validation_failed",
      "Sem UF: informe no corpo ou configure o UF na configuração fiscal.",
      422,
      { requestId },
    );
  }

  const leitura = lerCsvIbpt(csv);
  if (!leitura.valido) {
    return fail(
      "validation_failed",
      "O arquivo não é o CSV do IBPT: o cabeçalho não bate (esperado: codigo;ex;tipo;descricao;…).",
      422,
      { requestId },
    );
  }
  if (leitura.linhas.length === 0) {
    return fail("validation_failed", "Nenhuma linha válida no CSV.", 422, { requestId });
  }
  if (leitura.linhas.length > MAX_LINHAS) {
    return fail("validation_failed", `CSV com mais de ${MAX_LINHAS} linhas.`, 422, { requestId });
  }

  const admin = createAdminClient();
  for (let i = 0; i < leitura.linhas.length; i += LOTE) {
    const lote = leitura.linhas.slice(i, i + LOTE).map((l: LinhaIbpt) => ({
      organization_id: authz.org.orgId,
      tipo,
      uf,
      ...l,
    }));
    const { error } = await admin.from("fiscal_ibpt").upsert(lote, {
      onConflict: "organization_id,tipo,codigo,ex,uf,vigencia_inicio",
      ignoreDuplicates: false,
    });
    if (error) {
      return fail("internal_error", "Erro ao gravar a tabela IBPT.", 500, { requestId });
    }
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fiscal.ibpt_importado",
    resourceType: "fiscal_ibpt",
    resourceId: null,
    requestId,
  });

  return ok(
    {
      tipo,
      uf,
      lidas: leitura.lidas,
      importadas: leitura.linhas.length,
      ignoradas: leitura.ignoradas,
    },
    { requestId, status: 201 },
  );
}
