/**
 * Vocabulário e transições de uma atualização disparada pela UI.
 *
 * Os valores de RunStatus e RunStep são os MESMOS do CHECK em
 * `system_update_runs` (migration 0089). O invariante
 * `tests/invariants/vocabulario-banco-x-typescript.test.ts` compara os dois —
 * mudar um lado sem o outro fica vermelho.
 */

export type RunStatus = "dispatched" | "success" | "failed" | "failed_rolled_back";
export type RunStep = "backup" | "codigo" | "banco";

/**
 * Depois disso sem notícia, a UI trata o run como desfecho desconhecido.
 * 15 min é folgado: uma atualização real leva ~2 min, e o agente ainda tenta
 * reportar por ~2 min após o reinício do app.
 */
export const RUN_STALE_AFTER_MS = 15 * 60 * 1000;

const TERMINAL: readonly RunStatus[] = ["success", "failed", "failed_rolled_back"];

/**
 * Só existe uma transição legítima: de `dispatched` para um desfecho. Um run
 * que já terminou é imutável — se o agente reportar duas vezes (retry após o
 * reinício do app), a segunda é recusada em vez de reescrever a história.
 */
export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return from === "dispatched" && TERMINAL.includes(to);
}

/**
 * `unknown` é DERIVADO na leitura, nunca gravado: um agente morto não consegue
 * anunciar a própria morte.
 */
export function isRunStale(dispatchedAt: string, now: Date): boolean {
  const started = Date.parse(dispatchedAt);
  if (Number.isNaN(started)) return true;
  return now.getTime() - started > RUN_STALE_AFTER_MS;
}

/**
 * A falha de uma atualização ainda DESCREVE a instalação?
 *
 * A tela de falha diz "tentei X e não deu certo — aqui está o log e o comando
 * de saída", e ela só é verdade enquanto o host continua onde a tentativa
 * deixou: na versão de onde saiu (rollback) ou na para onde tentou ir (checkout
 * feito, app que não subiu). Um heartbeat mostrando OUTRA versão significa que
 * a instalação foi adiante por fora — update manual pelo terminal, release
 * aplicada por outro caminho — e aquela tela passa a ser mentira.
 *
 * Medido em produção (2026-10-02): o run de rollback de 27/09 segurou a tela
 * de atualização por dias depois de um update manual — a 1.18.0 publicada
 * ficou sem botão, atrás de uma falha que já não descrevia nada.
 *
 * `agentOnline` faz parte da regra, não é detalhe: sem heartbeat recente, a
 * "versão instalada" que temos é velha e compará-la provaria pouco — nesse caso
 * a falha fica de pé, que é o lado seguro.
 */
export function falhaObsoleta(args: {
  status: string;
  agentOnline: boolean;
  versaoInstalada: string;
  fromVersion: string;
  toVersion: string;
}): boolean {
  const ehFalha =
    args.status === "failed" || args.status === "failed_rolled_back" || args.status === "unknown";
  if (!ehFalha) return false;
  if (!args.agentOnline) return false;

  const instalada = normalizarVersao(args.versaoInstalada);
  if (!instalada) return false;

  const pegadas = [args.fromVersion, args.toVersion].map(normalizarVersao).filter(Boolean);
  if (pegadas.length === 0) return false;

  return !pegadas.includes(instalada);
}

/** A tela fala "1.1.0", o host anuncia "v1.1.0"; SHA não leva "v" nenhum. */
function normalizarVersao(versao: string): string {
  return versao.trim().replace(/^v/i, "");
}
