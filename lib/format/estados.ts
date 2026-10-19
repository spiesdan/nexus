/**
 * O NOME do estado, não a sigla.
 *
 * A impressão do Mercos mostra `Estado: Santa Catarina` — o nome por extenso,
 * nunca "SC". Como nós gravamos a sigla em `contacts.uf`, a tradução vive
 * aqui, num lugar só, em vez de espalhada pelo desenho do documento.
 *
 * São os nomes oficiais do IBGE (o mesmo vocabulário que o Mercos imprime).
 * Sigla desconhecida devolve `null` de propósito: quem imprime decide o que
 * fazer (no pedido, cai na própria sigla) — inventar um nome seria pior.
 */
export const NOMES_DOS_ESTADOS: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

/** "sc" → "Santa Catarina"; sigla desconhecida ou vazia → `null`. */
export function nomeDoEstado(uf: string | null | undefined): string | null {
  const sigla = uf?.trim().toUpperCase();
  if (!sigla) return null;
  return NOMES_DOS_ESTADOS[sigla] ?? null;
}
