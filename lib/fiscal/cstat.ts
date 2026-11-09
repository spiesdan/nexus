/**
 * O `cStat` CHEGA COM DOIS FORMATOS — e comparar os dois literais esconde bug.
 *
 * O sidecar devolve `codigo: "SEFAZ_232"`, e é isso que o dreno grava em
 * `invoices.sefaz_cstat`. Já as respostas diretas da SEFAZ e os testes usam o
 * número puro, `"232"`. Quem compara `"232"` contra o banco nunca casa — foi
 * assim que a inutilização automática deixou de reconhecer as rejeições reais
 * (4580/4581/4583/4587 só foram inutilizadas pelo botão de lacunas).
 *
 * A regra aqui é única e explícita: extrai os três dígitos, com ou sem o
 * prefixo `SEFAZ_`/`SEFAZ-`. Qualquer outra coisa (validação local, timeout,
 * `LOTE_RECEBIDO`) devolve string vazia e NÃO pode ser tratada como cStat.
 */
export function cstatNumerico(valor: string | null | undefined): string {
  const bruto = (valor ?? "").trim().toUpperCase();
  const casado = /^(?:SEFAZ[_-])?(\d{3})$/.exec(bruto);
  return casado?.[1] ?? "";
}
