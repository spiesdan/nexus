/**
 * FROTA — contrato de validação do veículo e do motorista.
 *
 * A frota é a fonte das capacidades que o otimizador multi-veículo usa. O que
 * entra aqui é o que o VRPTW pode aplicar: capacidade de peso/volume e jornada.
 * Campo sem valor não vira zero fingido na distribuição — mas no CADASTRO o
 * default é zero e a tela mostra "não informada", porque um veículo sem
 * capacidade declarada continua podendo rodar (o solver declara a restrição
 * como não aplicada).
 */

import { z } from "zod";

export const COLUNAS_DO_VEICULO =
  "id, placa, veiculo_tipo, capacidade_kg, capacidade_m3, ativo, criados_em, atualizados_em";

export const COLUNAS_DO_MOTORISTA =
  "id, nome, telefone, capacidade_jornada_min, user_id, ativo, criados_em, atualizados_em";

/**
 * Placa normalizada: maiúscula e sem espaço. "abc 1d23" e "ABC1D23" são o mesmo
 * veículo — o índice único do banco compara a forma normalizada, então a API
 * precisa comparar a mesma coisa antes de deixar gravar.
 *
 * Não valida o formato antigo/Mercosul linha a linha: placa de máquina, reboque
 * e veículo de outra região não podem ser recusados por um regex do sudeste.
 */
export function normalizarPlaca(placa: string): string {
  return placa.toUpperCase().replace(/\s+/g, "");
}

const placa = z
  .string()
  .trim()
  .min(5, "Placa curta demais")
  .max(12, "Placa longa demais")
  .transform(normalizarPlaca)
  .refine((v) => /^[A-Z0-9-]{5,10}$/.test(v), "Placa deve ter letras e números (ex.: ABC1D23)");

const capacidade = z.coerce.number().min(0).max(1_000_000);

export const veiculoCreateSchema = z.object({
  placa,
  veiculo_tipo: z.string().trim().max(60).nullable().optional(),
  capacidade_kg: capacidade.default(0),
  capacidade_m3: capacidade.default(0),
  ativo: z.boolean().optional().default(true),
});

export const veiculoPatchSchema = z.object({
  placa: placa.optional(),
  veiculo_tipo: z.string().trim().max(60).nullable().optional(),
  capacidade_kg: capacidade.optional(),
  capacidade_m3: capacidade.optional(),
  ativo: z.boolean().optional(),
});

export const motoristaCreateSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(120),
  telefone: z.string().trim().max(30).nullable().optional(),
  capacidade_jornada_min: z.coerce.number().int().min(30).max(24 * 60).default(480),
  user_id: z.string().uuid().nullable().optional(),
  ativo: z.boolean().optional().default(true),
});

export const motoristaPatchSchema = z.object({
  nome: z.string().trim().min(2).max(120).optional(),
  telefone: z.string().trim().max(30).nullable().optional(),
  capacidade_jornada_min: z.coerce.number().int().min(30).max(24 * 60).optional(),
  user_id: z.string().uuid().nullable().optional(),
  ativo: z.boolean().optional(),
});

export type VeiculoDaFrota = {
  id: string;
  placa: string;
  veiculo_tipo: string | null;
  capacidade_kg: number;
  capacidade_m3: number;
  ativo: boolean;
  criados_em: string;
  atualizados_em: string;
};

export type MotoristaDaFrota = {
  id: string;
  nome: string;
  telefone: string | null;
  capacidade_jornada_min: number;
  user_id: string | null;
  ativo: boolean;
  criados_em: string;
  atualizados_em: string;
};
