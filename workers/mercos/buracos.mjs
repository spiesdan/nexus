/**
 * BURACOS DO MERCOS — o cursor `numero > A_PARTIR_DE` já passou, então um
 * pedido pulado por colisão nunca era revisitado. Com `numero_mercos` gravado,
 * dá para comparar "o que o coletor já viu" com "o que chegou ao banco".
 *
 * Puro e com LIMITE: nunca varre o histórico inteiro numa rodada.
 */
export function buracosParaReprocessar({
  vistosNoColetor,
  numerosNoBanco,
  limite = 50,
  aPartirDe = 0,
}) {
  const noBanco = new Set(numerosNoBanco);
  return [...new Set(vistosNoColetor)]
    .filter((n) => Number.isInteger(n) && n > aPartirDe && !noBanco.has(n))
    .sort((a, b) => b - a)
    .slice(0, limite);
}
