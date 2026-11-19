/**
 * CUSTO É DADO DE MARGEM — não viaja para quem não pode ver margem.
 *
 * A tela já escondia margem/comissão quando o papel não tinha permissão, mas o
 * `custo_cents` dos produtos ia inteiro no payload do Server Component. Quem
 * abrisse o DevTools lia o custo de cada item mesmo sem o número na tela.
 *
 * Esta função zera o custo ANTES de o objeto atravessar a fronteira servidor →
 * cliente. `null` (e não `0`) é deliberado: 0 seria "custo zero" e permitiria
 * calcular uma margem falsa se algum caminho esquecesse a permissão.
 */
export function custoSomenteParaQuemVeMargem<T extends { custo_cents: number | null }>(
  produtos: readonly T[],
  verMargem: boolean,
): T[] {
  if (verMargem) return [...produtos];
  return produtos.map((p) => ({ ...p, custo_cents: null }));
}
