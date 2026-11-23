/**
 * GATE DE SUSPENSÃO POR COBRANÇA — deny-by-default.
 *
 * Regra do dono: a allowlist é PEQUENA e EXATA (cobrança, suporte, logout,
 * /account-suspended, health, auth). Nada de prefixo amplo: um `/api/v1/*`
 * abriria todas as rotas de um tenant suspenso. O teste de enumeração
 * `tests/unit/billing-gate-rotas.test.ts` vigia isso.
 */
export const BILLING_GATE_ALLOWLIST: readonly string[] = [
  "/account-suspended",
  "/api/v1/health",
  "/api/v1/auth/logout",
  "/api/v1/auth/realtime-token",
  "/api/v1/billing/subscription",
  "/api/v1/billing/checkout",
  "/api/v1/billing/portal",
  "/api/v1/webhooks/stripe",
  "/api/v1/cron/billing-notices",
  "/api/v1/cron/billing-reconcile",
];

export interface EntradaGate {
  path: string;
  suspensoPorBilling: boolean;
  plataforma: boolean;
  killSwitchAtivo: boolean;
  allowlist?: readonly string[];
}

/**
 * Kill-switch DESLIGADO devolve acesso a todos sem escrever no banco — o
 * estado `suspended` continua registrado em `organizations`.
 */
export function deveBloquearPorCobranca(entrada: EntradaGate): boolean {
  if (!entrada.killSwitchAtivo) return false;
  if (!entrada.suspensoPorBilling) return false;
  if (entrada.plataforma) return false;
  return !(entrada.allowlist ?? BILLING_GATE_ALLOWLIST).includes(entrada.path);
}
