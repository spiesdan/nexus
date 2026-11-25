/**
 * "O Stripe está configurado NESTA instalação?" — pergunta que a tela de
 * plataforma precisa responder sem derrubar a página.
 *
 * `lerConfigStripe()` LANÇA quando a chave é live sem confirmação dupla (é a
 * trava de `config.ts`). Chamar aquilo direto no render de `/admin/billing`
 * transformaria uma instalação mal configurada em 500 — e quem administra não
 * veria nem a lista nem o motivo. Aqui a exceção vira estado.
 */

import { lerConfiguracaoBilling, validarConfiguracaoStripe } from "./config";

export type MotivoStripeIndisponivel = "sem_chave" | "configuracao_recusada" | null;

export interface EstadoStripe {
  /** Há chave utilizável? Falso = a tela mostra a faixa, não 30 linhas de erro. */
  configurado: boolean;
  /** `STRIPE_TEST_MODE` em vigor. O produto só cobra em teste por decisão. */
  modoTeste: boolean;
  motivo: MotivoStripeIndisponivel;
  /** Mensagem para quem opera — a mesma do boot, sem stack. */
  detalhe: string | null;
}

export function estadoStripe(env: Record<string, string | undefined> = process.env): EstadoStripe {
  const modoTeste = lerConfiguracaoBilling(env).testMode;
  try {
    validarConfiguracaoStripe(env);
  } catch (erro) {
    return {
      configurado: false,
      modoTeste,
      motivo: "configuracao_recusada",
      detalhe: erro instanceof Error ? erro.message : "Configuração do Stripe recusada.",
    };
  }
  const chave = (env.STRIPE_SECRET_KEY ?? "").trim();
  if (!chave) {
    return {
      configurado: false,
      modoTeste,
      motivo: "sem_chave",
      detalhe: "STRIPE_SECRET_KEY não definida nesta instalação.",
    };
  }
  return { configurado: true, modoTeste, motivo: null, detalhe: null };
}
