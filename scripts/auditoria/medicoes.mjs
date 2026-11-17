/**
 * O ARQUIVO DE MEDIÇÕES DO INSTRUMENTO — medir de novo não pode apagar o que já
 * foi medido.
 *
 * ─── O DEFEITO QUE ISTO CORRIGE ────────────────────────────────────────────
 *
 * `captura-visual.mjs` gravava `medicoes-<grupo>.json` com `writeFileSync` puro:
 * toda rodada substituía o arquivo inteiro. Medir uma rota avulsa
 * (`--rotas /app/notas`) com o grupo padrão (`inicio`) reescreveu o artefato de
 * **5 rotas** com **1** — e as outras 4 sumiram sem aviso. O número publicado no
 * relatório deixou de fechar com o artefato, que é exatamente o que a doutrina
 * desta auditoria proíbe.
 *
 * ─── A REGRA ───────────────────────────────────────────────────────────────
 *
 * O arquivo é o **último resultado por rota × largura**, não o da última
 * execução: o que foi remedido é atualizado, o que não foi permanece. Se a
 * mesma rota for medida em outra largura, entra como outra chave. Nada é
 * removido — apagar medição é decisão de quem lê o relatório, não do script.
 */

/** Chave estável: a mesma rota em outra largura é outra medição. */
const chave = (r) => `${r.rota}|${r.largura}`;

/**
 * Mescla as medições novas no artefato anterior.
 *
 * @param {{resultados?: Array<Record<string, unknown>>}} anterior
 * @param {Array<Record<string, unknown>>} novas
 * @returns {Array<Record<string, unknown>>} anteriores na ordem original, com
 *   as remedidas substituídas e as inéditas no fim.
 */
export function mesclarMedicoes(anterior, novas) {
  const antigas = Array.isArray(anterior?.resultados) ? anterior.resultados : [];
  const porChave = new Map();
  for (const r of antigas) {
    if (r && typeof r === "object" && typeof r.rota === "string") porChave.set(chave(r), r);
  }
  for (const r of novas) porChave.set(chave(r), r);
  return [...porChave.values()];
}

/**
 * O artefato inteiro: metadados da execução nova + medições mescladas.
 *
 * `atualizado_em` é o único campo que muda de formato entre execuções, e existe
 * para responder "quando esta linha foi medida?" sem `git log`.
 */
export function montarArtefato({ base, grupo, perfil, urlDepoisDoLogin, puladas, novas, anterior }) {
  const resultados = mesclarMedicoes(anterior, novas);
  return {
    base,
    grupo,
    perfil,
    url_depois_do_login: urlDepoisDoLogin,
    atualizado_em: new Date().toISOString(),
    puladas: puladas ?? anterior?.puladas ?? [],
    resultados,
  };
}
