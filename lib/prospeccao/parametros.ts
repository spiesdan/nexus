/**
 * PARÂMETRO REPETIDO NA URL — `?categoria=A&categoria=B`.
 *
 * O mesmo parâmetro chega como `string` quando aparece uma vez e como
 * `string[]` quando aparece duas ou mais. Tratar só o primeiro caso é o
 * defeito silencioso clássico: um `.trim()` direto no valor dá `TypeError` —
 * e a tela inteira vira 500 — exatamente quando alguém marca a SEGUNDA
 * categoria, que é o caso novo. Aqui os dois viram a mesma coisa.
 *
 * Vale para todos os parâmetros repetidos do contrato (`categoria`,
 * `cidades`), não só categorias: o nome diz "parâmetro", não "categoria".
 */
export function valoresDoParametro(
  valor: string | string[] | undefined | null,
): string[] {
  const bruto = Array.isArray(valor) ? valor : valor ? [valor] : [];
  return bruto.map((v) => v.trim()).filter((v) => v !== "");
}
