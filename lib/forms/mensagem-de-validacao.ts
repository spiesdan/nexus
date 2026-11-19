/**
 * "Salvar" que falha precisa dizer QUAL campo.
 *
 * O formulário valida no cliente e a Server Action valida de novo no servidor.
 * Nos dois caminhos o Zod devolve `flatten()` com `fieldErrors`; a tela antiga
 * jogava isso fora e mostrava só "Dados inválidos." — a pessoa ficava sem saber
 * o que corrigir. Este helper escolhe a primeira mensagem de campo, com o
 * rótulo que a tela usa, e só cai no texto genérico quando não há campo.
 */
export interface DetalhesDeValidacao {
  formErrors?: unknown;
  fieldErrors?: Record<string, unknown>;
}

export function primeiraMensagemDeCampo(
  detalhes: unknown,
  rotulos: Record<string, string>,
  padrao: string,
): string {
  if (!detalhes || typeof detalhes !== "object") return padrao;
  const d = detalhes as DetalhesDeValidacao;

  for (const [campo, bruto] of Object.entries(d.fieldErrors ?? {})) {
    const lista = Array.isArray(bruto) ? bruto : [];
    const mensagem = lista.find((m): m is string => typeof m === "string" && m.trim() !== "");
    if (mensagem) return `${rotulos[campo] ?? campo}: ${mensagem}`;
  }

  const formErrors = Array.isArray(d.formErrors) ? d.formErrors : [];
  const geral = formErrors.find((m): m is string => typeof m === "string" && m.trim() !== "");
  return geral ?? padrao;
}
