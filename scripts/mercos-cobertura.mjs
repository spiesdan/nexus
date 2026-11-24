/**
 * COBERTURA DA RECONCILIAÇÃO — a parte que impede "zero ausentes" mentiroso.
 *
 * Uma reconciliação que não olhou todos os números NÃO pode dizer que não
 * falta nada. Aqui a cobertura é resultado, não detalhe de implementação:
 * sem meta do censo, com linha ilegível ou com registro sem data, a rodada é
 * `incompleta` e a frase autorizada é "não verificado: ...".
 */

export function avaliarCobertura({
  censoEsperado = null,
  censoLido = 0,
  linhasIlegiveis = 0,
  registrosSemData = 0,
  /**
   * O censo foi PEDIDO para a janela (o `meta.json` declara `de`/`ate`)?
   *
   * Quando é, a filtragem por data aconteceu na origem e a ausência de data na
   * linha não é falta de cobertura — o cartão da lista do ERP não traz data
   * (medido: 5.930 de 5.930). Sem este flag, uma rodada com cobertura perfeita
   * se declarava incompleta por um motivo que não existe.
   */
  censoDaJanela = false,
  erros = 0,
} = {}) {
  const motivos = [];
  if (censoEsperado == null) {
    motivos.push("sem meta do censo — não há como saber quantos pedidos a lista tinha");
  } else if (censoLido < censoEsperado) {
    motivos.push(`censo lido ${censoLido} de ${censoEsperado}`);
  }
  if (linhasIlegiveis > 0) motivos.push(`${linhasIlegiveis} linha(s) ilegível(is) no censo`);
  if (registrosSemData > 0 && !censoDaJanela) {
    motivos.push(`${registrosSemData} registro(s) sem data de emissão`);
  }
  if (erros > 0) motivos.push(`${erros} erro(s) de leitura/escrita`);

  return { status: motivos.length > 0 ? "incompleta" : "completa", motivos };
}

/**
 * Regra de ouro: `completa` E `ausentes = 0`. Qualquer outra combinação é
 * "não verificado", com o motivo escrito — nunca um zero sem rosto.
 */
export function avaliarResultado({ cobertura, ausentesDepois = 0 }) {
  const { status, motivos } = cobertura;
  const verificado = status === "completa" && ausentesDepois === 0;
  const declaracao = verificado
    ? "nenhum pedido de fora"
    : status === "incompleta"
      ? `não verificado: ${motivos.join("; ")}`
      : `não verificado: ${ausentesDepois} ausente(s) após a importação`;
  return { status, motivos, verificado, declaracao };
}
