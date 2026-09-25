/**
 * NEXUS Copilot conversacional — contexto da página no prompt (§33).
 *
 * O assistente flutuante já consulta (tools) e propõe (com Confirmar).
 * Falta-lhe saber ONDE o usuário está: este módulo monta o bloco de
 * contexto a partir do resumo real da página (via `resumir*` puros).
 * Sem I/O aqui; quem chama carrega o resumo com RLS e passa pronto.
 */

/** Bloco colado ao system prompt. Vazio quando não há de onde tirar. */
export function blocoDeContexto(pagina: string, resumo: string | null): string {
  const pg = pagina.trim().slice(0, 120);
  if (!pg && !resumo) return "";
  const linhas = [`[CONTEXTO DA PÁGINA ATUAL] O usuário está em: ${pg || "—"}.`];
  if (resumo) linhas.push(`Resumo real: ${resumo.slice(0, 2000)}`);
  linhas.push("Use as ferramentas para detalhar; nunca invente número.");
  return `\n\n${linhas.join("\n")}`;
}
