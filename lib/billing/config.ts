/**
 * Configuração da cobrança SaaS do Nexus — SOMENTE MODO DE TESTE.
 *
 * Uma chave live é recusada no boot, mesmo que alguém troque o .env: a
 * consequência de aceitar `sk_live_` aqui seria cobrar gente de verdade sem
 * que nenhuma das decisões comerciais (plano/valor/trial) tenha sido tomada.
 * A chamada acontece em `instrumentation.ts`, nos dois runtimes.
 */

export const BILLING_LIVE_KEY_ERROR =
  "STRIPE_SECRET_KEY live recusada: a cobrança do Nexus roda SOMENTE em modo de teste (sk_test_).";

export interface ConfiguracaoBilling {
  testMode: boolean;
  killSwitchGate: boolean;
  noticeDias: readonly number[];
}

function inteiros(texto: string | undefined, padrao: readonly number[]): number[] {
  if (!texto) return [...padrao];
  const nums = texto
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return nums.length > 0 ? nums : [...padrao];
}

export function lerConfiguracaoBilling(
  env: Record<string, string | undefined> = process.env,
): ConfiguracaoBilling {
  return {
    testMode: env.STRIPE_TEST_MODE !== "false",
    killSwitchGate: env.BILLING_GATE_ENABLED !== "false",
    noticeDias: inteiros(env.BILLING_NOTICE_DIAS, [3, 2, 1]),
  };
}

/** Chamada no boot. Lança com mensagem clara se houver chave live. */
export function validarConfiguracaoStripe(
  env: Record<string, string | undefined> = process.env,
): void {
  const chave = env.STRIPE_SECRET_KEY ?? "";
  if (chave.startsWith("sk_live_") || chave.startsWith("rk_live_")) {
    throw new Error(BILLING_LIVE_KEY_ERROR);
  }
  if (env.STRIPE_TEST_MODE === "false") {
    throw new Error("STRIPE_TEST_MODE=false recusado: modo de teste obrigatório nesta fatia.");
  }
}
