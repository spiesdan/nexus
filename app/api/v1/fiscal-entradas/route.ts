/**
 * GET  /api/v1/fiscal-entradas — entradas da organização ativa.
 * POST /api/v1/fiscal-entradas — sincroniza com a SEFAZ (distribuição DF-e).
 *
 * A sincronização NÃO mora mais nesta rota: ela é `sincronizarEntrada()`
 * (`lib/fiscal/entrada-sync.ts`), a MESMA função que o cron chama. Aqui só
 * resolvemos o ator (guard), traduzimos o resultado em status HTTP e auditamos.
 *
 * O que mudou de comportamento, e por quê:
 *   - o cursor só avança até o último NSU persistido (antes avançava mesmo com
 *     insert falhando — nota perdida para sempre);
 *   - duas execuções concorrentes não consultam a SEFAZ em paralelo (lease no
 *     cursor; a perdedora recebe 409);
 *   - cada execução grava `fiscal_sync_logs`, inclusive a que falhou.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { sincronizarEntrada } from "@/lib/fiscal/entrada-sync";
import {
  COLUNAS_DA_ENTRADA,
  SITUACOES_FISCAIS,
  STATUS_DA_CONFERENCIA,
  STATUS_DA_ENTRADA,
} from "@/lib/schemas/fiscal-entrada";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const LIMITE_PADRAO = 100;
const LIMITE_MAXIMO = 200;

function inteiro(valor: string | null, queda: number, min: number, max: number): number {
  const n = Number(valor);
  if (!Number.isFinite(n)) return queda;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "fiscal-entradas" });
  if (!authz.ok) return authz.response;

  const p = req.nextUrl.searchParams;
  const status = (p.get("status") ?? "").trim();
  const conferencia = (p.get("conferencia") ?? "").trim();
  const situacao = (p.get("situacao") ?? "").trim();
  const fornecedor = (p.get("fornecedor") ?? "").trim();
  const de = (p.get("de") ?? "").trim();
  const ate = (p.get("ate") ?? "").trim();
  const busca = (p.get("busca") ?? "").trim();
  const limite = inteiro(p.get("limite"), LIMITE_PADRAO, 1, LIMITE_MAXIMO);
  const offset = inteiro(p.get("offset"), 0, 0, 1_000_000);
  const ordenar = (p.get("ordenar") ?? "dh_emi").trim();
  const direcao = (p.get("direcao") ?? "desc").trim() === "asc";

  const supabase = await createClient();
  let q = supabase
    .from("fiscal_entradas")
    .select(COLUNAS_DA_ENTRADA, { count: "exact" })
    .eq("organization_id", authz.org.orgId);

  if (status !== "" && (STATUS_DA_ENTRADA as readonly string[]).includes(status)) {
    q = q.eq("status", status);
  }
  if (
    conferencia !== "" &&
    (STATUS_DA_CONFERENCIA as readonly string[]).includes(conferencia)
  ) {
    q = q.eq("conferencia_status", conferencia);
  }
  if (situacao !== "" && (SITUACOES_FISCAIS as readonly string[]).includes(situacao)) {
    q = q.eq("situacao_fiscal", situacao);
  }
  if (fornecedor !== "") q = q.eq("supplier_id", fornecedor);
  if (/^\d{4}-\d{2}-\d{2}$/.test(de)) q = q.gte("dh_emi", `${de}T00:00:00.000Z`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ate)) q = q.lte("dh_emi", `${ate}T23:59:59.999Z`);

  if (busca !== "") {
    // `,` e `%` são sintaxe do filtro `or` do PostgREST: deixá-los no texto
    // livre muda a consulta (ou a quebra). Trocar por espaço mantém a busca
    // previsível sem abrir mão de achar por nome/CNPJ/chave/número.
    const texto = busca.replace(/[%,()]/g, " ").trim();
    const digitos = texto.replace(/\D/g, "");
    const partes = [`emitente_nome.ilike.%${texto}%`];
    if (digitos !== "") {
      partes.push(`chave.ilike.%${digitos}%`, `emitente_cnpj.ilike.%${digitos}%`);
      if (/^\d{1,9}$/.test(digitos)) partes.push(`numero.eq.${Number(digitos)}`);
    }
    q = q.or(partes.join(","));
  }

  const coluna =
    ordenar === "valor" ? "valor_total_cents" : ordenar === "created_at" ? "created_at" : "dh_emi";

  const { data, error, count } = await q
    .order(coluna, { ascending: direcao, nullsFirst: false })
    .range(offset, offset + limite - 1);
  if (error) return fail("internal_error", "Erro ao listar as entradas.", 500, { requestId });
  return ok(data ?? [], {
    requestId,
    meta: { total: count ?? null, has_more: (count ?? 0) > offset + (data?.length ?? 0) },
  });
}

export async function POST(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "fiscal-entradas" });
  if (!authz.ok) return authz.response;

  // Service role DEPOIS do guard: o sync grava em tabelas cuja escrita é só
  // service_role (log/item/evento), e o `organization_id` vem do guard — nunca
  // do body. É o mesmo caminho do cron, o que elimina a divergência entre
  // sincronização manual e automática.
  const admin = createAdminClient();
  const resultado = await sincronizarEntrada({
    admin,
    organizationId: authz.org.orgId,
    usuarioId: authz.user.id,
    origem: "manual",
    requestId,
  });

  if (resultado.codigo === "lock") {
    return fail("state_conflict", resultado.motivo ?? "Sincronização em andamento.", 409, {
      requestId,
    });
  }
  if (resultado.codigo === "config") {
    return fail("fiscal_nao_configurado", resultado.motivo ?? "Fiscal não configurado.", 422, {
      requestId,
    });
  }
  if (!resultado.ok && resultado.importados + resultado.atualizados === 0) {
    return fail("upstream_unavailable", resultado.motivo ?? "SEFAZ inalcançável.", 502, {
      requestId,
    });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "fiscal_entrada.sincronizada",
    resourceType: "fiscal_entradas",
    resourceId: authz.org.orgId,
    requestId,
  });

  return ok(
    {
      novas: resultado.importados,
      atualizadas: resultado.atualizados,
      erros: resultado.erros,
      ultNSU: resultado.nsuFinal,
      maxNSU: resultado.maxNsu,
      aviso: resultado.aviso,
      cstat: resultado.cstat,
      proximaTentativa: resultado.proximaTentativa,
    },
    { requestId },
  );
}
