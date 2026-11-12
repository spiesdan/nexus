/**
 * CAMPANHA POR REGIÃO ≠ CAMPANHA DE PROSPECÇÃO — uma decisão, um lugar.
 *
 * As duas moram na mesma tabela (`prospecting_campaigns`) e as duas podem ter
 * `cidades` preenchidas, então o nome da coluna não responde sozinho. O que
 * separa as duas é a AUDIÊNCIA:
 *
 *   prospecção  `publico: "prospects"` — empresas da base B2B (Google), com
 *               `prospect_ids`. O recorte de `cidades` é onde procurar empresa,
 *               não onde a loja já vendeu.
 *   recuperação `publico: "contatos"`  — conversa parada, sem recorte
 *               geográfico: `cidades` fica vazio de propósito.
 *   região      `publico: "contatos"`  — a audiência é a cidade + histórico de
 *               compra, e por isso `cidades` é o próprio recorte e vem cheio.
 *
 * Logo: contatos + cidades preenchidas = campanha por região. É a mesma regra
 * que a rota de criação grava (`app/api/v1/prospecting/campaigns/regiao`).
 *
 * Por que isto existe: a aba Campanha mostrava a lista inteira da prospecção, e
 * campanha de garimpagem de empresa aparecia no lugar de "quem já comprou na
 * minha região" — dois públicos diferentes na mesma tela, com o operador tendo
 * que adivinhar qual era qual.
 */
export interface CampanhaParaClassificar {
  publico?: string | null;
  cidades?: unknown;
}

/** A campanha é da aba Campanha (região), não da Prospecção? */
export function ehCampanhaPorRegiao(campanha: CampanhaParaClassificar): boolean {
  if (campanha.publico !== "contatos") return false;
  const cidades = campanha.cidades;
  return Array.isArray(cidades) && cidades.length > 0;
}
