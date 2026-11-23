/**
 * ETAPAS D-3, D-2, D-1 — pureza antes de banco.
 *
 * Uma cobrança criada perto do vencimento NÃO dispara as etapas passadas em
 * sequência: só etapas cuja data ainda não passou são devolvidas. A execução
 * repetida do worker é idempotente porque etapas já enviadas são filtradas.
 */
export const ETAPAS = [3, 2, 1] as const;

export function etapasPendentes(
  vencimento: Date,
  agora: Date,
  jaEnviadas: ReadonlySet<number>,
): number[] {
  const diaVencimento = Date.UTC(
    vencimento.getUTCFullYear(),
    vencimento.getUTCMonth(),
    vencimento.getUTCDate(),
  );
  const hoje = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
  const diasRestantes = Math.round((diaVencimento - hoje) / 86_400_000);

  return ETAPAS.filter(
    (dias) => dias === diasRestantes && !jaEnviadas.has(dias),
  );
}
