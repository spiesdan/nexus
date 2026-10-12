/**
 * POST /api/v1/fiscal-ibpt/importar-siscomex — nomenclatura federal pelo portal
 * público do Siscomex (manager+).
 *
 * ─── Por que uma segunda porta, quando já existe `/importar` ────────────────
 *
 * `/importar` lê o CSV do IBPT: traz a descrição do IBGE (boa para casar nome
 * de produto) E o ICMS por estado. O Siscomex é outra coisa: nomenclatura
 * federal pura, com endpoint público e atualizada por ato. Convivem na mesma
 * tabela porque um traz o nome, o outro a vigência.
 *
 * ─── O que a porta NÃO faz ─────────────────────────────────────────────────
 *
 * Não busca o JSON sozinha. Recebe o corpo — como o `/importar` recebe o CSV —
 * porque uma importação que depende de rede de terceiro não é reproduzível, e
 * o operador precisa poder reimportar o mesmo arquivo quando algo der errado.
 *
 * ─── Sem alarme por produto novo ───────────────────────────────────────────
 *
 * A vigência entra de verdade (`vigencia_inicio` do ato), então a tabela cresce
 * com o tempo sem duplicar: o upsert é por
 * `(organization_id, tipo, codigo, ex, uf, vigencia_inicio)`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { lerJsonSiscomex, URL_DO_SISCOMEX } from "@/lib/fiscal/ncm-siscomex";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_JSON = 40_000_000;
const MAX_LINHAS = 30_000;
const LOTE = 500;

const corpoSchema = z.object({
  json: z.string().min(1).max(MAX_JSON),
  /** A UF do ICMS. A nomenclatura é federal, mas a linha mora por UF. */
  uf: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "UF com 2 letras")
    .transform((v) => v.toUpperCase()),
});

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "fiscal-ibpt" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "JSON do Siscomex ou UF inválidos.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const leitura = lerJsonSiscomex(parsed.data.json);
  if (!leitura.valido) {
    // Falha ABERTA: um portal fora do ar, um HTML de login ou um `{}` precisam
    // dizer que não deu. Devolver "0 importadas" faria o operador acreditar que
    // a tabela foi esvaziada de propósito.
    return fail("validation_failed", leitura.erro ?? "JSON do Siscomex inválido.", 422, {
      requestId,
    });
  }
  if (leitura.linhas.length === 0) {
    return fail("validation_failed", "O JSON não trouxe nenhum item de 8 dígitos.", 422, {
      requestId,
    });
  }
  if (leitura.linhas.length > MAX_LINHAS) {
    return fail("validation_failed", `JSON com mais de ${MAX_LINHAS} itens.`, 422, { requestId });
  }

  const admin = createAdminClient();
  const uf = parsed.data.uf;
  for (let i = 0; i < leitura.linhas.length; i += LOTE) {
    const lote = leitura.linhas.slice(i, i + LOTE).map((l) => ({
      organization_id: authz.org.orgId,
      tipo: "produto",
      uf,
      ex: "",
      descricao: l.descricao,
      // A nomenclatura federal não traz alíquota: quem calcula é o ICMS/IBPT
      // do estado. Zeros explícitos, para a linha não parecer "sem dado" e sim
      // "fonte que não traz isso".
      nacional_federal: 0,
      importados_federal: 0,
      estadual: 0,
      municipal: 0,
      vigencia_inicio: l.vigencia_inicio,
      vigencia_fim: l.vigencia_fim,
      codigo: l.codigo,
    }));
    const { error } = await admin.from("fiscal_ibpt").upsert(lote, {
      onConflict: "organization_id,tipo,codigo,ex,uf,vigencia_inicio",
      ignoreDuplicates: false,
    });
    if (error) {
      return fail("internal_error", "Erro ao gravar a tabela do NCM.", 500, { requestId });
    }
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fiscal.ibpt_importado",
    resourceType: "fiscal_ibpt",
    resourceId: null,
    requestId,
    metadata: { origem: "siscomex", ato: leitura.ato, itens: leitura.linhas.length, uf },
  });

  return ok(
    {
      uf,
      ato: leitura.ato,
      atualizacao: leitura.atualizacao,
      lidas: leitura.lidas,
      importadas: leitura.linhas.length,
      ignoradas: leitura.ignoradas,
      sem_descricao: leitura.sem_descricao,
      fonte: URL_DO_SISCOMEX,
    },
    { requestId, status: 201 },
  );
}
