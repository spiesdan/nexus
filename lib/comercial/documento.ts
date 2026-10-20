/**
 * Rótulo do documento no impresso — CPF ou CNPJ.
 *
 * O cadastro antigo (e o que veio da importação do Mercos) nem sempre tem
 * `tipo_pessoa` preenchido, mas o documento está lá. Sem esta inferência, um
 * CPF de 11 dígitos saía impresso como "CNPJ: 08929983936" — um rótulo
 * errado num documento comercial, e o tipo de erro que o cliente confere.
 *
 * A ordem é: o tipo declarado manda; na falta dele, o número de dígitos
 * decide. "J" com 11 dígitos continua CNPJ (dado inconsistente não é motivo
 * para trocar o rótulo que o cadastro afirmou).
 */
export function rotuloDoDocumento(
  tipoPessoa: string | null | undefined,
  documento: string | null | undefined,
): "CPF" | "CNPJ" {
  if (tipoPessoa === "F") return "CPF";
  if (tipoPessoa === "J") return "CNPJ";
  return (documento ?? "").replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ";
}
