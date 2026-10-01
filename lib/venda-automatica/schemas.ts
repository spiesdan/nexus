/**
 * O contrato de entrada da Venda Automática (spec 18 §3) — Zod, fora de
 * `lib/schemas/` de propósito: esta é a superfície interna do módulo (as rotas
 * `/api/v1/automatic-sales/*`), e o resto de lá é o vocabulário compartilhado do
 * produto.
 *
 * As formas espelham os CHECKs da migration 0246 — o banco é a última trincheira,
 * este arquivo é a primeira (mensagem de erro em vez de violação de constraint).
 */
import { z } from "zod";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const campanhaVaCreateSchema = z
  .object({
    nome: z.string().trim().min(1, "Informe o nome da campanha.").max(120),
    cidade: z.string().trim().min(1, "Informe a cidade.").max(120),
    uf: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, "UF com 2 letras.")
      .transform((v) => v.toUpperCase())
      .nullable()
      .optional(),
    categorias: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    limite_diario: z
      .number()
      .int()
      .min(1, "Mínimo de 1 contato por dia.")
      .max(500, "Máximo de 500 por dia."),
    janela_inicio: z.string().regex(HHMM, "Horário no formato HH:MM."),
    janela_fim: z.string().regex(HHMM, "Horário no formato HH:MM."),
    oferta_produtos: z.array(z.uuid()).max(50).default([]),
    perfil_abordagem: z.string().trim().max(120).nullable().default(null),
    followup_horas: z
      .array(z.number().int().min(1).max(720))
      .max(5)
      .default([24, 48]),
    followup_textos: z.array(z.string().trim().min(1).max(500)).max(5).default([]),
    responsavel_user_id: z.uuid().nullable().default(null),
  })
  .refine((v) => v.janela_inicio < v.janela_fim, {
    message: "A janela não pode atravessar a meia-noite.",
    path: ["janela_fim"],
  })
  .refine(
    (v) => v.followup_horas.every((h, i) => i === 0 || h > v.followup_horas[i - 1]!),
    { message: "Os horários de follow-up devem estar em ordem crescente.", path: ["followup_horas"] },
  );

export type CampanhaVaCreate = z.infer<typeof campanhaVaCreateSchema>;

/** PATCH: o que a tela pode mudar depois de criada. */
export const campanhaVaUpdateSchema = z
  .object({
    nome: z.string().trim().min(1).max(120),
    status: z.enum(["active", "paused", "completed"]),
    limite_diario: z.number().int().min(1).max(500),
    janela_inicio: z.string().regex(HHMM),
    janela_fim: z.string().regex(HHMM),
    oferta_produtos: z.array(z.uuid()).max(50),
    perfil_abordagem: z.string().trim().max(120).nullable(),
    followup_horas: z.array(z.number().int().min(1).max(720)).max(5),
    followup_textos: z.array(z.string().trim().min(1).max(500)).max(5),
    responsavel_user_id: z.uuid().nullable(),
  })
  .partial()
  .refine((v) => v.janela_inicio === undefined || v.janela_fim === undefined || v.janela_inicio < v.janela_fim, {
    message: "A janela não pode atravessar a meia-noite.",
    path: ["janela_fim"],
  });

export type CampanhaVaUpdate = z.infer<typeof campanhaVaUpdateSchema>;

/**
 * As ações humanas na fila (§4/§18): ignorar apaga a linha (o prospect não é
 * apagado — ele volta na próxima varredura se ainda for elegível), bloquear
 * grava o opt-out e apaga, reenfileirar devolve uma `failed` ao trabalho e
 * assumir pausa os follow-ups dessa linha (o humano assumiu a conversa).
 */
export const acaoDaFilaSchema = z.object({
  acao: z.enum(["ignorar", "bloquear", "reenfileirar", "assumir"]),
  motivo: z.string().trim().max(300).optional(),
});

export type AcaoDaFila = z.infer<typeof acaoDaFilaSchema>;
