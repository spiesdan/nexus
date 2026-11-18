/**
 * O nome automático da campanha pelas cidades selecionadas.
 *
 * Regra do dono (D-01/D-02, 18/11/2026):
 *  - `trim`, dedupe case-insensitive (mantém o casing da PRIMEIRA ocorrência),
 *    ordenação alfabética pt-BR;
 *  - 1 cidade: `Campanha {Cidade}`;
 *  - 2–4: `Campanha {C1}, {C2}, …`;
 *  - 5+: `Campanha {C1}, {C2}, {C3} +{restantes}`;
 *  - teto de 80 caracteres, truncando em limite de palavra + `…`.
 *
 * A função é pura de propósito: a UI decide QUANDO aplicar (só quando o nome
 * não é manual), e o nome nunca é sobrescrito por acidente.
 */

export interface CidadeDoNome {
  cidade: string;
  estado?: string | null;
}

const MAX = 80;

/** Chave de dedupe: caixa baixa + espaços normalizados. Acento é conteúdo. */
function chave(cidade: string): string {
  return cidade.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function limitarEmPalavra(texto: string, max = MAX): string {
  const pontos = Array.from(texto);
  if (pontos.length <= max) return texto;
  const corte = pontos.slice(0, max - 1).join("");
  const ultimoEspaco = corte.lastIndexOf(" ");
  // Palavra única maior que o limite: corta duro, mas ainda dentro do teto.
  const base = ultimoEspaco >= 20 ? corte.slice(0, ultimoEspaco) : corte;
  // Cortar num separador (`Cachoeiro, `) deixaria a vírgula pendurada antes da
  // reticência; o nome termina em palavra.
  return `${base.replace(/[\s,;:.\-]+$/, "")}…`;
}

export function gerarNomeDaCampanha(cidades: readonly CidadeDoNome[]): string {
  const vistas = new Set<string>();
  const nomes: string[] = [];
  for (const item of cidades) {
    const nome = (item.cidade ?? "").trim().replace(/\s+/g, " ");
    if (nome === "") continue;
    const k = chave(nome);
    if (vistas.has(k)) continue;
    vistas.add(k);
    nomes.push(nome);
  }
  if (nomes.length === 0) return "";

  nomes.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

  if (nomes.length === 1) return limitarEmPalavra(`Campanha ${nomes[0]}`);
  if (nomes.length <= 4) return limitarEmPalavra(`Campanha ${nomes.join(", ")}`);

  const restantes = nomes.length - 3;
  return limitarEmPalavra(`Campanha ${nomes.slice(0, 3).join(", ")} +${restantes}`);
}


/**
 * O que a UI deve fazer quando a seleção muda: `null` = não tocar no nome
 * (manual); string = nome a aplicar. Recuperação não tem cidade, então o nome
 * automático é vazio — o operador digita.
 */
export function nomeSugeridoSeAutomatico(args: {
  nomeManual: boolean;
  publico: "empresas" | "inativos";
  cidades: readonly CidadeDoNome[];
}): string | null {
  if (args.nomeManual) return null;
  if (args.publico === "inativos") return "";
  return gerarNomeDaCampanha(args.cidades);
}
