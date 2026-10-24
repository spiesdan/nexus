/**
 * CLIENTE DO SERVIÇO DE OCR — a foto vira linhas, sem gastar IA.
 *
 * O serviço (`ocr/`) roda na rede interna do compose e devolve texto e
 * confiança por linha. Ele NÃO conhece o catálogo e NÃO decide se a leitura
 * presta: isso é `lerPedidoComOcr`, em `pedido-ocr.ts`, que casa as linhas com
 * os produtos e recusa o resultado fraco.
 *
 * ─── Por que toda falha vira `null` ─────────────────────────────────────────
 *
 * Porque o OCR é o caminho BARATO, não o único. Serviço fora do ar, timeout,
 * resposta em formato inesperado: o pedido não pode falhar por isso — a rota
 * cai na IA como antes. O que não pode acontecer é o OCR derrubar a leitura
 * que já funcionava. Por isso este módulo nunca lança e sempre registra o
 * motivo no log.
 */
import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/** Teto de linhas que aceitamos de uma resposta. Acima disso é ruído. */
const MAX_LINHAS = 500;

const linhaSchema = z.object({
  texto: z.string().min(1),
  confianca: z.number().min(0).max(1).default(0),
  // A caixa é opcional no contrato: o app usa o texto, não a geometria.
  caixa: z.array(z.tuple([z.number(), z.number()])).optional(),
});

const leituraSchema = z.object({
  linhas: z.array(linhaSchema).max(MAX_LINHAS),
  texto: z.string().optional(),
  motor: z.string().optional(),
  lang: z.string().optional(),
  duracao_ms: z.number().optional(),
});

export type LinhaOcr = z.infer<typeof linhaSchema>;
export type LeituraOcr = z.infer<typeof leituraSchema>;

/** O OCR está configurado nesta instalação? */
export function ocrConfigurado(): boolean {
  return env.OCR_SERVICE_URL.trim() !== "";
}

/**
 * Lê uma imagem no serviço de OCR.
 *
 * `null` significa "não deu para usar o OCR" — desligado, fora do ar, lento ou
 * resposta inválida. Quem chama deve seguir para a IA; não é erro do pedido.
 */
export async function lerComOcr(
  bytes: Buffer,
  mediaType: string,
): Promise<LeituraOcr | null> {
  const base = env.OCR_SERVICE_URL.trim();
  if (base === "") return null;

  const url = `${base.replace(/\/+$/, "")}/ocr`;
  const inicio = Date.now();

  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        imagem_base64: bytes.toString("base64"),
        mime: mediaType,
      }),
      signal: AbortSignal.timeout(env.OCR_TIMEOUT_MS),
    });

    if (!resposta.ok) {
      logger.warn("[ocr] serviço respondeu erro — seguindo para a IA", {
        http_status: resposta.status,
        duracao_ms: Date.now() - inicio,
      });
      return null;
    }

    const corpo: unknown = await resposta.json();
    const validado = leituraSchema.safeParse(corpo);
    if (!validado.success) {
      logger.warn("[ocr] resposta fora do contrato — seguindo para a IA", {
        motivo: validado.error.issues[0]?.message ?? "formato inválido",
        duracao_ms: Date.now() - inicio,
      });
      return null;
    }

    return validado.data;
  } catch (err) {
    // Timeout, DNS, conexão recusada e JSON quebrado caem todos aqui. O
    // `name` distingue timeout de rede no log; nenhum dos dois muda o fluxo.
    logger.warn("[ocr] leitura indisponível — seguindo para a IA", {
      motivo: err instanceof Error ? err.name : "erro desconhecido",
      duracao_ms: Date.now() - inicio,
    });
    return null;
  }
}
