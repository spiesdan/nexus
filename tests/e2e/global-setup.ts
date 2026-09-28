/**
 * Global setup do Playwright: mede o deslocamento do relógio do host contra o
 * GoTrue e publica em `E2E_CLOCK_OFFSET_MS` ANTES de qualquer worker nascer.
 *
 * Sem isto, os12 specs que digitam TOTP com o relógio local (marca-logo,
 * rbac-roles, system-update, qa-agente-usa-as-maos, followup*, gatilho*,
 * invite-lifecycle, reset-password-mfa, olhar-telas-do-epico,
 * vps-fresh-onboarding) recusam todo código quando a máquina anda à frente
 * (medido: +47s) — e o sintoma lê como bug de MFA. O mecanismo é o mesmo que
 * `helpers/login-admin.ts` usava sozinho; mover para cá (junto do `generateTotp`,
 * que é a única função afetada) tornou-o uma medida só por run, herdada por
 * ambiente. Em CI os dois relógios batem: offset ~0, no-op.
 */
import { medirDeslocamentoRelogio } from "./utils/totp";

export default async function globalSetup(): Promise<void> {
  const deslocamento = await medirDeslocamentoRelogio();
  if (Math.abs(deslocamento) > 2_000) {
    console.warn(
      `[e2e] relógio do host a ${Math.round(deslocamento / 1000)}s do GoTrue — ` +
        `TOTP compensado via E2E_CLOCK_OFFSET_MS=${deslocamento}. ` +
        `Correção definitiva: w32tm /resync como administrador.`,
    );
  }
}
