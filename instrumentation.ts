import * as Sentry from "@sentry/nextjs";
import { validarConfiguracaoStripe } from "@/lib/billing/config";

export async function register() {
  // Cobrança SaaS: chave live derruba o boot nos DOIS runtimes, antes de
  // qualquer request. Nenhuma decisão comercial foi tomada — não cobrar.
  validarConfiguracaoStripe();
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
