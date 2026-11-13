/**
 * POST /api/v1/shipments/[id]/rota/otimizar/veiculos — F5 (VRPTW multi-veículo).
 *
 * Delega ao servico Python independente (`services/rota`, Google OR-Tools) a
 * distribuição de entregas por veículo com sequência rodoviária. O backend
 * carrega a carga com paradas (fonte única), monta o contrato e devolve a
 * distribuição pronta para a tela confirmar.
 *
 * Sem o servico no ar → `upstream_unavailable` (fail-closed): a heurística
 * antiga (NN + 2-opt, veículo único) NÃO é devolvida como solução OR-Tools.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { otimizarVRPTW, type PontoDoSolver, type VeiculoDoSolver } from "@/lib/expedicao/roteador-vrptw";
import { createClient } from "@/lib/supabase/server";

import { carregarCargaComParadas } from "../../_carga";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  veiculos: z
    .array(
      z.object({
        veiculo_id: z.string().min(1).max(64),
        motorista_id: z.string().max(64).optional(),
        capacidade_kg: z.number().min(0).optional(),
        capacidade_m3: z.number().min(0).optional(),
        tempo_jornada_min: z.number().int().min(0).optional(),
      }),
    )
    .min(1)
    .optional(),
  tempo_parada_min: z.number().int().min(0).max(600).optional(),
  max_veiculos: z.number().int().min(1).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "shipments" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const { id } = await params;
  const supabase = await createClient();
  const d = await carregarCargaComParadas(supabase, authz.org.orgId, id);
  if (!d) return fail("not_found", "Carga não encontrada.", 404, { requestId });
  if (d.paradas.length === 0) return fail("validation_failed", "Carga sem pedidos.", 422, { requestId });

  const pontos: PontoDoSolver[] = d.paradas
    .filter((p) => p.latitude != null && p.longitude != null)
    .map((p) => ({
      node_id: p.chave,
      latitude: p.latitude as number,
      longitude: p.longitude as number,
      ...(p.itens?.length ? { peso_kg: 0 } : {}),
    }));

  if (pontos.length === 0) {
    return fail("validation_failed", "Nenhuma parada geocodificada. Geocodifique antes de otimizar.", 422, { requestId });
  }

  const veiculos: VeiculoDoSolver[] = (parsed.data.veiculos ?? []).map((v) => ({
    veiculo_id: v.veiculo_id,
    motorista_id: v.motorista_id,
    capacidade_kg: v.capacidade_kg,
    capacidade_m3: v.capacidade_m3,
    tempo_jornada_min: v.tempo_jornada_min,
  }));

  let resultado;
  try {
    resultado = await otimizarVRPTW({
      orgId: authz.org.orgId,
      pontos,
      veiculos,
      tempoParadaMin: parsed.data.tempo_parada_min,
      maxVeiculos: parsed.data.max_veiculos,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "SolverIndisponivelError") {
      return fail("upstream_unavailable", "Servico de otimizacao de rotas indisponivel.", 503, { requestId });
    }
    return fail("internal_error", "Falha ao consultar otimizacao de rotas.", 500, { requestId });
  }

  if (resultado.erro) {
    return fail("upstream_unavailable", "Servico de otimizacao retornou erro.", 502, { requestId });
  }

  return ok(
    {
      veiculos: resultado.veiculos,
      total_paradas: resultado.total_paradas,
      org_id: resultado.org_id,
      status: resultado.status,
    },
    { requestId },
  );
}
