/**
 * AS CIDADES QUE EXISTEM NA ORGANIZAÇÃO — para o filtro da lista.
 *
 * ─── Por que deduplicar em código, e não no Postgres ───────────────────────
 *
 * `contacts.cidade` é texto livre: a mesma cidade entra como "São Paulo",
 * "são paulo" e " São Paulo " conforme quem digitou. Um `distinct` cru
 * devolveria três opções para a mesma cidade. A chave é `lower(trim())` e o
 * valor exibido é o da PRIMEIRA ocorrência (o banco devolve ordenado por
 * `cidade`, então a primeira é determinística) — o seletor não inventa casing.
 *
 * ─── Ordem ─────────────────────────────────────────────────────────────────
 *
 * `Intl.Collator("pt-BR", { sensitivity: "base" })`: "Água" antes de "Ave",
 * "Zé" no fim, e acentos não jogam a palavra para depois de "z" (comparação
 * por code point faria isso). Empate de base ("Ave" × "Áve") desempata pelo
 * texto, para a lista não mudar entre renders.
 *
 * ─── O que NÃO entra ───────────────────────────────────────────────────────
 *
 * `null`, string vazia e só-espaços. Uma opção em branco no seletor filtraria
 * por "cidade vazia" — que não é uma cidade.
 */

export interface LinhaComCidade {
  cidade?: string | null;
}

export function cidadesUnicas(linhas: LinhaComCidade[]): string[] {
  const porChave = new Map<string, string>();

  for (const linha of linhas) {
    if (typeof linha.cidade !== "string") continue;
    // Espaços internos repetidos também são digitação, não cidade diferente.
    const nome = linha.cidade.trim().replace(/\s+/g, " ");
    if (!nome) continue;
    const chave = nome.toLocaleLowerCase("pt-BR");
    if (!porChave.has(chave)) porChave.set(chave, nome);
  }

  const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
  return [...porChave.values()].sort(
    (a, b) => collator.compare(a, b) || a.localeCompare(b, "pt-BR"),
  );
}
