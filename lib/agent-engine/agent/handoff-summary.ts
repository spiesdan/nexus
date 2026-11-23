/**
 * O resumo do handoff — CÓDIGO PURO, migrado de `human-handoff.ts`.
 *
 * Morava junto do motor, que importa `pg`, cron e logger. Quando o Inbox
 * começou a usar `buildHandoffSummary` direto no cliente, o Turbopack tentou
 * empacotar `node:timers/promises` no bundle do navegador e o `/app/inbox`
 * virou 500. A função não tem nada de servidor: só zod + `declaracao.ts`.
 * Aqui ela pode ser chamada dos dois lados sem arrastar o motor.
 */
import { renderDeclaracaoParaHumano, type DeclaracaoDoTurno } from "./declaracao";

export function buildHandoffSummary(
  previous: {
    commitments: string[];
    objections: string[];
    next_action: string | null;
    rolling_summary: string;
    declaracao?: DeclaracaoDoTurno | null;
  } | null,
): string {
  if (previous === null) {
    return "Sem resumo acumulado ainda (conversa recente) — abra a conversa no CRM para o contexto completo.";
  }
  const parts: string[] = [];
  if (previous.rolling_summary.trim() !== "") parts.push(previous.rolling_summary.trim());
  const declarado = renderDeclaracaoParaHumano(previous.declaracao ?? null);
  if (declarado !== "") parts.push(declarado);
  if (previous.commitments.length > 0) parts.push(`Compromissos: ${previous.commitments.join("; ")}`);
  if (previous.objections.length > 0) parts.push(`Objeções: ${previous.objections.join("; ")}`);
  if (previous.next_action) parts.push(`Próxima ação: ${previous.next_action}`);
  return parts.length === 0
    ? "Sem resumo acumulado ainda (conversa recente) — abra a conversa no CRM para o contexto completo."
    : parts.join("\n");
}
