/**
 * Cliente Stripe mínimo, sobre a API REST (sem dependência nova).
 *
 * A chave live é recusada no boot por `lib/billing/config.ts`; aqui a checagem
 * é repetida na leitura da configuração para que uma rota nunca use `sk_live_`
 * mesmo que alguém a injete depois do boot.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface ConfigStripe {
  secretKey: string;
  webhookSecret: string;
  priceId: string;
  apiBase: string;
}

export function lerConfigStripe(env: Record<string, string | undefined> = process.env): ConfigStripe {
  const secretKey = env.STRIPE_SECRET_KEY ?? "";
  if (secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_")) {
    throw new Error("STRIPE_SECRET_KEY live recusada: modo de teste obrigatório.");
  }
  return {
    secretKey,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
    priceId: env.STRIPE_PRICE_ID ?? "",
    apiBase: env.STRIPE_API_BASE || "https://api.stripe.com/v1",
  };
}

/** HMAC sobre `timestamp.corpo`, com tolerância curta contra replay. */
export function verifyInboundSignature({
  corpo,
  assinatura,
  segredo,
  agoraMs = Date.now(),
  toleranciaSegundos = 300,
}: {
  corpo: string;
  assinatura: string;
  segredo: string;
  agoraMs?: number;
  toleranciaSegundos?: number;
}): boolean {
  if (!segredo || !assinatura) return false;
  const partes = assinatura.split(",").map((p) => p.trim());
  const timestamp = Number(partes.find((p) => p.startsWith("t="))?.slice(2));
  const assinaturas = partes.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!Number.isFinite(timestamp) || assinaturas.length === 0) return false;
  if (Math.abs(agoraMs / 1000 - timestamp) > toleranciaSegundos) return false;

  const esperado = createHmac("sha256", segredo).update(`${timestamp}.${corpo}`).digest();
  return assinaturas.some((valor) => {
    const recebido = Buffer.from(valor, "hex");
    return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
  });
}

export type ResultadoStripe<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; erro: string };

/** Formato `application/x-www-form-urlencoded` da API REST do Stripe. */
export function corpoForm(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === "") continue;
    qs.append(chave, String(valor));
  }
  return qs.toString();
}

export async function stripeRequest<T>(
  cfg: ConfigStripe,
  caminho: string,
  opcoes: { method?: "GET" | "POST"; corpo?: Record<string, string | number | undefined>; idempotencyKey?: string } = {},
): Promise<ResultadoStripe<T>> {
  if (!cfg.secretKey) return { ok: false, status: 503, erro: "stripe_sem_chave" };
  const method = opcoes.method ?? "GET";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (opcoes.idempotencyKey) headers["Idempotency-Key"] = opcoes.idempotencyKey;
  try {
    const resposta = await fetch(`${cfg.apiBase}${caminho}`, {
      method,
      headers,
      body: method === "POST" ? corpoForm(opcoes.corpo ?? {}) : undefined,
      cache: "no-store",
    });
    const texto = await resposta.text();
    const dados = texto ? JSON.parse(texto) : {};
    if (!resposta.ok) {
      return { ok: false, status: resposta.status, erro: dados?.error?.message ?? `stripe_${resposta.status}` };
    }
    return { ok: true, data: dados as T };
  } catch (err) {
    return { ok: false, status: 503, erro: err instanceof Error ? err.message : String(err) };
  }
}
