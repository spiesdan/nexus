import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import {
  aprovarOrcamentoPublico,
  carregarOrcamentoPublico,
} from "@/lib/comercial/orcamento-publico";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A SUPERFÍCIE PÚBLICA DO ORÇAMENTO — sem cookie, a identidade é a assinatura.
 *
 * Autenticação aqui é o TOKEN assinado (`lib/comercial/orcamento-link.ts`), que
 * prova pedido + organização. É por isso que a rota está em `PUBLIC_PATHS`: o
 * `proxy` deixa passar, e quem barra o resto é a verificação da assinatura.
 *
 * O `organization_id` de toda query sai da CARGA ASSINADA, nunca do body nem do
 * path — é a mesma regra do service role em qualquer rota deste repositório.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { token } = await params;
  const admin = createAdminClient();
  const orcamento = await carregarOrcamentoPublico(admin, token);
  if (!orcamento) {
    return fail("not_found", "Link inválido ou vencido.", 404, { requestId });
  }
  return ok(orcamento, { requestId });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { token } = await params;

  const corpo = (await req.json().catch(() => null)) as { acao?: unknown } | null;
  if (!corpo || corpo.acao !== "aprovar") {
    return fail("validation_failed", "Ação inválida.", 422, { requestId });
  }

  const admin = createAdminClient();
  const resultado = await aprovarOrcamentoPublico(admin, { token, requestId });

  if (!resultado.ok) {
    switch (resultado.motivo) {
      case "cancelado":
        return fail("conflict", "Este pedido foi cancelado.", 409, { requestId });
      case "link_invalido":
        return fail("not_found", "Link inválido ou vencido.", 404, { requestId });
      default:
        return fail("not_found", "Orçamento não encontrado.", 404, { requestId });
    }
  }

  return ok(
    {
      aprovado: !resultado.aguardandoGerente,
      ja_aprovado: resultado.jaAprovado,
      aguardando_aprovacao: resultado.aguardandoGerente,
    },
    { requestId },
  );
}
