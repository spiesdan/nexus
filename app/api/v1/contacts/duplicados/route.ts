/**
 * GET /api/v1/contacts/duplicados — a fila de decisão humana.
 *
 * Devolve os grupos candidatos (mesmo nome normalizado + mesma cidade, sem
 * CNPJ, com histórico), já SEM os que alguém descartou como "não é a mesma
 * pessoa". O agrupamento e os contadores moram em `fn_contatos_duplicados`
 * (0355): a tela nunca decide o que é duplicata, só mostra e coleta a decisão.
 *
 * A lista tem teto explícito (`meta.limite`) e diz quando truncou — fila que
 * termina sem avisar faz o operador achar que não há mais nada.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import type { GrupoDuplicado } from "@/lib/contacts/duplicados";
import { createAdminClient } from "@/lib/supabase/admin";

import { comMetricas } from "@/lib/observabilidade/rotas";

export const dynamic = "force-dynamic";

const LIMITE_PADRAO = 200;

type ResultadoRpc = {
  grupos: GrupoDuplicado[];
  total_grupos: number;
  total_fichas: number;
  limite: number;
  truncado: boolean;
};

async function get(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;

  const url = new URL(req.url);
  const limiteBruto = url.searchParams.get("limite");
  const limite = limiteBruto === null ? LIMITE_PADRAO : Number(limiteBruto);
  if (!Number.isInteger(limite) || limite < 1 || limite > 500) {
    return fail("validation_failed", "Limite deve ser um inteiro entre 1 e 500.", 422, {
      requestId,
    });
  }

  // A função é `security definer` e só tem grant para service_role. A
  // organização vem do `authz` (cookie/JWT revalidado), nunca do body.
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("fn_contatos_duplicados", {
    p_org: authz.org.orgId,
    p_limite: limite,
  });

  if (error) {
    return fail("internal_error", "Não foi possível carregar os clientes duplicados.", 500, {
      requestId,
    });
  }

  const resultado = (data ?? {}) as Partial<ResultadoRpc>;
  return ok<GrupoDuplicado[]>(resultado.grupos ?? [], {
    requestId,
    meta: {
      total_grupos: resultado.total_grupos ?? 0,
      total_fichas: resultado.total_fichas ?? 0,
      limite: resultado.limite ?? limite,
      truncado: resultado.truncado ?? false,
      aviso: resultado.truncado
        ? "A fila tem mais grupos do que o teto desta tela; decida os exibidos que os próximos aparecem."
        : null,
    },
  });
}

export const GET = comMetricas("/api/v1/contacts/duplicados", get);
