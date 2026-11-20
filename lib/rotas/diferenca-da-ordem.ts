/**
 * O QUE MUDOU DESDE A ÚLTIMA PUBLICAÇÃO — em paradas, não em "sim/não".
 *
 * A tela já sabia responder "mudou" (`ordemMudou`). Quem despacha precisa da
 * pergunta seguinte: **quantas** e **quais**. O motorista não recebe a mudança
 * em silêncio: o servidor sobe `rota_versao` e o app dele **só aplica a nova
 * sequência depois de confirmar** (comentário da 0231 em `shipments.rota_versao`).
 * O banner da tela só precisa dizer a mesma coisa que o motorista vai ver.
 *
 * Nada aqui decide negócio: é diferença de duas listas de chaves.
 */

export interface DiferencaDaOrdem {
  /** Paradas que já existiam e mudaram de posição. */
  moveram: number;
  /** Paradas que entraram depois da publicação. */
  novas: number;
  /** Paradas que saíram depois da publicação. */
  sairam: number;
  /** `true` quando a ordem na tela difere da publicada. */
  mudou: boolean;
}

/** Compara a ordem editada com a publicada. Listas vazias = nada publicado. */
export function diferencaDaOrdem(ordem: string[], publicada: string[]): DiferencaDaOrdem {
  const posicaoPublicada = new Map(publicada.map((chave, i) => [chave, i]));
  const conjuntoAtual = new Set(ordem);

  let moveram = 0;
  let novas = 0;

  ordem.forEach((chave, i) => {
    const antes = posicaoPublicada.get(chave);
    if (antes === undefined) novas += 1;
    else if (antes !== i) moveram += 1;
  });

  const sairam = publicada.filter((chave) => !conjuntoAtual.has(chave)).length;

  return {
    moveram,
    novas,
    sairam,
    // Tamanho diferente já é mudança mesmo que todas as posições coincidam.
    mudou: moveram > 0 || novas > 0 || sairam > 0 || ordem.length !== publicada.length,
  };
}
