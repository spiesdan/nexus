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
 * - `sem_solucao` NAO e' erro de infraestrutura: e' estado de negocio
 *   (capacidade/jornada/janela) e volta com motivo para a tela explicar.
 */

import { z } from "zod";

import { ApiErrorCodes } from "@/lib/api/errors";

export const pontoDoSolverSchema = z.object({
  node_id: z.string().min(1).max(64),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  peso_kg: z.number().min(0).optional(),
  volume_m3: z.number().min(0).optional(),
  tempo_servico_min: z.number().int().min(0).max(1440).optional(),
  janela_inicio_min: z.number().int().min(0).max(1440).optional(),
  janela_fim_min: z.number().int().min(0).max(1440).optional(),
});

export const veiculoDoSolverSchema = z.object({
  veiculo_id: z.string().min(1).max(64),
  motorista_id: z.string().max(64).optional(),
  capacidade_kg: z.number().min(0).optional(),
  capacidade_m3: z.number().min(0).optional(),
  tempo_jornada_min: z.number().int().min(0).max(1440).optional(),
});

export const rotaDeVeiculoSchema = z.object({
  veiculo_id: z.string().min(1).max(64),
  motorista_id: z.string().max(64).nullable().optional(),
  paradas: z.array(z.string()).default([]),
  /**
   * Chegada em cada parada, em segundos desde a saída da base — 1:1 com
   * `paradas`. Vem do solver: recalcular no cliente divergiria do relógio que
   * as janelas respeitaram.
   */
  chegadas_s: z.array(z.number().int()).default([]),
  distancia_m: z.number().default(0),
  duracao_s: z.number().default(0),
  duracao_com_paradas_s: z.number().default(0),
  carga_kg: z.number().default(0),
  carga_m3: z.number().default(0),
  geometria: z.array(z.array(z.number())).default([]),
});

export const otimizarVrptwSchema = z.object({
  org_id: z.string().min(1).max(64),
  status: z.enum(["otimizado", "sem_solucao"]),
  veiculos: z.array(rotaDeVeiculoSchema).default([]),
  total_paradas: z.number().int().default(0),
  entregas_nao_alocadas: z.array(z.string()).default([]),
  restricoes_nao_aplicadas: z.array(z.string()).default([]),
  tempo_total_s: z.number().default(0),
  tempo_execucao_ms: z.number().int().default(0),
  versao_algoritmo: z.string().default(""),
  matriz_provedor: z.string().default(""),
  motivo: z.string().nullable().optional(),
  erro: z.string().nullable().optional(),
});

export type PontoDoSolver = z.infer<typeof pontoDoSolverSchema>;
export type VeiculoDoSolver = z.infer<typeof veiculoDoSolverSchema>;
export type RotaDeVeiculo = z.infer<typeof rotaDeVeiculoSchema>;
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

function timeoutMs(): number {
  const bruto = Number(process.env.ROTA_SOLVER_TIMEOUT_MS ?? 30_000);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : 30_000;
}

interface RequisicaoOtimizacao {
  org_id: string;
  origem?: PontoDoSolver | null;
  pontos: PontoDoSolver[];
  veiculos: VeiculoDoSolver[];
  retornar_origem?: boolean;
  tempo_parada_min?: number;
  max_veiculos?: number;
  limite_busca_s?: number;
}

/**
 * Chama o servico Python OR-Tools e devolve a distribuicao de entregas por
 * veiculo com a sequencia/geometria de cada rota. Falha fechado se o servico
 * nao responder ou devolver contrato invalido.
 */
export async function otimizarVRPTW(input: {
  orgId: string;
  origem?: PontoDoSolver | null;
  pontos: PontoDoSolver[];
  veiculos: VeiculoDoSolver[];
  retornarOrigem?: boolean;
  tempoParadaMin?: number;
  maxVeiculos?: number;
  limiteBuscaS?: number;
}): Promise<OtimizacaoVrptw> {
  const corpo: RequisicaoOtimizacao = {
    org_id: input.orgId,
    ...(input.origem ? { origem: input.origem } : {}),
    pontos: input.pontos,
    veiculos: input.veiculos,
    retornar_origem: input.retornarOrigem ?? false,
    tempo_parada_min: input.tempoParadaMin ?? 30,
    ...(input.maxVeiculos ? { max_veiculos: input.maxVeiculos } : {}),
    ...(input.limiteBuscaS ? { limite_busca_s: input.limiteBuscaS } : {}),
  };

  const controle = new AbortController();
  const timeout = setTimeout(() => controle.abort(), timeoutMs());
  try {
    const res = await fetch(`${baseUrl()}/rota/otimizar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) throw new SolverIndisponivelError(`servico_respondeu_${res.status}`, json);
    const data = otimizarVrptwSchema.safeParse(json);
    if (!data.success) throw new SolverIndisponivelError("contrato_servico_invalido", json);
    return data.data;
  } catch (e) {
    if (e instanceof SolverIndisponivelError) throw e;
    throw new SolverIndisponivelError("servico_de_otimizacao_indisponivel", e);
  } finally {
    clearTimeout(timeout);
  }
}
