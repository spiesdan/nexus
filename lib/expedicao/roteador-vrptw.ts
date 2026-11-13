/**
 * F5 — Roteador VRPTW (serviço Python / Google OR-Tools).
 *
 * Contrato de ida/volta com o servico independente em `services/rota/`
 * (FastAPI + ortools), via `POST {ROTA_SOLVER_URL}/rota/otimizar`.
 *
 * - O contrato chega aqui tipado e validado por Zod ANTES de sair pelo fetch
 *   (o servico e Python/Pydantic na outra ponta — dupla validacao, sem fio
 *   não tipado).
 * - O servico e a unica fonte do solver; sem ele no ar, este modulo FALHA
 *   fechado (`upstream_unavailable`) — nunca devolve heurística como se fosse
 *   otimizacao OR-Tools (a heurística antiga vive em `lib/rotas/roteamento.ts`).
 */

import { z } from "zod";

import { ApiErrorCodes } from "@/lib/api/errors";

export const pontoDoSolverSchema = z.object({
  node_id: z.string().min(1).max(64),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  peso_kg: z.number().min(0).optional(),
  volume_m3: z.number().min(0).optional(),
});

export const veiculoDoSolverSchema = z.object({
  veiculo_id: z.string().min(1).max(64),
  motorista_id: z.string().max(64).optional(),
  capacidade_kg: z.number().min(0).optional(),
  capacidade_m3: z.number().min(0).optional(),
  tempo_jornada_min: z.number().int().min(0).optional(),
});

export const otimizarVrptwSchema = z.object({
  org_id: z.string().min(1).max(64),
  status: z.string(),
  veiculos: z
    .array(
      z.object({
        veiculo_id: z.string().min(1).max(64),
        motorista_id: z.string().max(64).nullable().optional(),
        paradas: z.array(z.string()).default([]),
        distancia_m: z.number().default(0),
        duracao_s: z.number().optional(),
        custo: z.number().optional(),
        geometria: z.array(z.array(z.number())).default([]),
      }),
    )
    .default([]),
  total_paradas: z.number().int().default(0),
  tempo_total_s: z.number().default(0),
  erro: z.string().nullable().optional(),
});

export type PontoDoSolver = z.infer<typeof pontoDoSolverSchema>;
export type VeiculoDoSolver = z.infer<typeof veiculoDoSolverSchema>;
export type OtimizacaoVrptw = z.infer<typeof otimizarVrptwSchema>;

export class SolverIndisponivelError extends Error {
  readonly code = ApiErrorCodes.upstream_unavailable;

  constructor(message = "servico de otimizacao indisponivel", readonly cause?: unknown) {
    super(message);
    this.name = "SolverIndisponivelError";
  }
}

function baseUrl(): string {
  const url = (process.env.ROTA_SOLVER_URL ?? "http://127.0.0.1:8000").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(url)) throw new SolverIndisponivelError("ROTA_SOLVER_URL_invalido");
  return url;
}

interface RequisicaoOtimizacao {
  org_id: string;
  origem?: PontoDoSolver | null;
  pontos: PontoDoSolver[];
  veiculos: VeiculoDoSolver[];
  tempo_parada_min?: number;
  max_veiculos?: number;
}

/**
 * Chama o servico Python OR-Tools e devolve a distribuicao de entregas por
 * veiculo com a sequencia de cada rota. Falha fechado se o servico nao
 * responder ou retornar contrato invalido.
 */
export async function otimizarVRPTW(input: {
  orgId: string;
  pontos: PontoDoSolver[];
  veiculos: VeiculoDoSolver[];
  tempoParadaMin?: number;
  maxVeiculos?: number;
}): Promise<OtimizacaoVrptw> {
  const corpo: RequisicaoOtimizacao = {
    org_id: input.orgId,
    pontos: input.pontos,
    veiculos: input.veiculos,
    tempo_parada_min: input.tempoParadaMin ?? 30,
    ...(input.maxVeiculos ? { max_veiculos: input.maxVeiculos } : {}),
  };

  const controle = new AbortController();
  const timeout = setTimeout(() => controle.abort(), 30_000);
  try {
    const res = await fetch(`${baseUrl()}/rota/otimizar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
    const json = (await res.json().catch(() => null)) as unknown;
    const data = otimizarVrptwSchema.safeParse(json);
    if (!data.success) throw new SolverIndisponivelError("contrato_servico_invalido", json);
    if (data.data.erro) throw new SolverIndisponivelError(data.data.erro, data.data);
    return data.data;
  } catch (e) {
    if (e instanceof SolverIndisponivelError) throw e;
    throw new SolverIndisponivelError("servico_de_otimizacao_indisponivel", e);
  } finally {
    clearTimeout(timeout);
  }
}
