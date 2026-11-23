/**
 * O QUE O HUMANO PRECISA SABER QUANDO A IA ENTREGA A CONVERSA (P1-26).
 *
 * `buildHandoffSummary` já existe no motor e produz o resumo a partir do
 * checkpoint durável. O Inbox ainda não tem rota para esse checkpoint, então
 * a superfície usa a mesma função com `null`: o texto honesto de "sem resumo
 * acumulado" — nunca um resumo inventado a partir do último preview.
 *
 * Esta camada é pura: quem decide formato de data e idioma é o componente.
 */
import { buildHandoffSummary } from "@/lib/agent-engine/agent/handoff-summary";

export interface PainelDeHandoff {
  /** ISO-8601 do banco — formats à parte, no componente. */
  quando: string;
  /** Motivo gravado na transferência; `null` quando em branco. */
  motivo: string | null;
  /** Resumo curto, sempre não vazio. */
  resumo: string;
}

export function painelDeHandoff(conversa: {
  last_handoff_at?: string | null;
  last_handoff_reason?: string | null;
}): PainelDeHandoff | null {
  if (!conversa.last_handoff_at) return null;
  const motivo = conversa.last_handoff_reason?.trim();
  return {
    quando: conversa.last_handoff_at,
    motivo: motivo ? motivo : null,
    resumo: buildHandoffSummary(null),
  };
}
