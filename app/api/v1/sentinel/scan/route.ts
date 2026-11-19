/**
 * POST /api/v1/sentinel/scan — varredura sob demanda.
 *
 * `manager+` porque a varredura é uma operação de leitura pesada (dezenas de
 * consultas) e o resultado vira ocorrência para a equipe inteira. O botão da
 * tela chama esta rota; o cron usa o executor direto, com service role.
 *
 * Nunca lança 500 por "Sentinel desligado": desligado é resposta de negócio
 * (409 `sentinel_disabled`), com o motivo visível para quem clicou.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { executarSentinela } from "@/lib/sentinel/execucao";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "sentinel" });
  if (!authz.ok) return authz.response;

  const resultado = await executarSentinela({
    organizationId: authz.org.orgId,
    origem: "manual",
    usuarioId: authz.user.id,
  });

  if (resultado.status === "ignorada") {
    if (resultado.motivo === "organizacao_suspensa") {
      return fail(
        "sentinel_org_suspensa",
        "Esta organização está suspensa. O Sentinel registrou a rodada e encerrou as ocorrências abertas sem varrer dado nenhum.",
        409,
        { requestId, details: { motivo: resultado.motivo, encerradas: resultado.encerradas } },
      );
    }
    const desligadoNaOrg = resultado.motivo === "desligado_na_organizacao";
    return fail(
      desligadoNaOrg ? "sentinel_disabled" : "sentinel_busy",
      desligadoNaOrg
        ? "O Sentinel está desligado para esta organização. Ligue em Configurações › Sentinel."
        : "Já existe uma varredura em andamento para esta organização.",
      409,
      { requestId, details: { motivo: resultado.motivo } },
    );
  }

  if (resultado.status === "erro") {
    return fail("internal_error", "A varredura não terminou.", 500, {
      requestId,
      details: { execucao_id: resultado.execucaoId, falhas: resultado.falhas },
    });
  }

  return ok(resultado, { requestId });
}
