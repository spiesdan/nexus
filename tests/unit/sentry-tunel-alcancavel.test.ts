/**
 * O TÚNEL DO SENTRY PRECISA SER ALCANÇÁVEL SEM COOKIE DE SESSÃO.
 *
 * ─── O defeito que este arquivo existe para não deixar voltar ────────────────
 *
 * `next.config.ts` configura `tunnelRoute: "/monitoring"`: o SDK do navegador
 * manda os envelopes de erro para o NOSSO domínio e o rewrite do
 * `withSentryConfig` repassa para o ingest do Sentry. O próprio comentário do
 * `next.config.ts` repete o aviso da documentação:
 *
 *   "Check that the configured route will not match with your Next.js
 *    middleware, otherwise reporting of client-side errors will fail."
 *
 * Ele casava. O matcher do `proxy.ts` roda em tudo que não tem extensão, então
 * `/monitoring` caía na checagem de sessão e recebia `307` para `/login` antes
 * de o rewrite existir. Medido em produção em 2026-10-22:
 *
 *   POST /monitoring?o=…&p=…&r=us:1 → 307 /login?next=%2Fmonitoring…
 *
 * Consequência: erro de tela SEM sessão — a fachada `/login`, o `/signup`, a
 * página de instalação — nunca era reportado, justamente onde o cliente novo
 * mais quebra.
 *
 * ─── Por que um teste, e não um comentário ──────────────────────────────────
 *
 * Consertar o caminho de hoje conserta a INSTÂNCIA. Quem renomear o
 * `tunnelRoute` (ou trocar a opção por um route handler próprio) recria o
 * defeito em silêncio: o único sintoma é telemetria que falta, e falta de dado
 * não faz barulho. O teste amarra as duas pontas — a configuração do Sentry e a
 * allowlist do proxy — e reprova quando elas divergem.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/lib/auth/public-paths";

const NEXT_CONFIG = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

/** O caminho declarado em `tunnelRoute`, lido do arquivo — não uma cópia. */
function tunelConfigurado(): string | null {
  const match = NEXT_CONFIG.match(/tunnelRoute:\s*["']([^"']+)["']/);
  return match?.[1] ?? null;
}

describe("túnel do Sentry", () => {
  it("o next.config.ts declara um tunnelRoute", () => {
    expect(tunelConfigurado()).toBeTruthy();
  });

  it("o caminho do túnel está na allowlist do proxy (senão vira 307 para /login)", () => {
    const rota = tunelConfigurado();
    expect(rota).toBeTruthy();
    expect(isPublicPath(rota as string)).toBe(true);
  });

  it("hoje é o /monitoring, com match ancorado (sub-path não nasce público de carona)", () => {
    expect(tunelConfigurado()).toBe("/monitoring");
    expect(isPublicPath("/monitoring")).toBe(true);
    expect(isPublicPath("/monitoring/qualquer")).toBe(false);
    expect(isPublicPath("/monitoringx")).toBe(false);
  });
});
