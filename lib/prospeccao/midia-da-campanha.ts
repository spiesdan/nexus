/**
 * A MÍDIA DA CAMPANHA — o arquivo enviado pela tela vira link na hora do envio.
 *
 * ─── Por que NÃO guardar a URL assinada na campanha ─────────────────────────
 *
 * O bucket `whatsapp-media` é privado (migration 0055), e a Meta precisa
 * BAIXAR o arquivo para entregar o template. A rota de upload devolve uma URL
 * assinada — mas campanha não é envio único: ela pode durar semanas, e uma URL
 * gravada hoje expira no meio da fila. O sintoma seria o pior possível: as
 * primeiras mensagens saem, a campanha pausa com erro de link e ninguém liga o
 * erro à configuração feita dias antes.
 *
 * Então o valor guardado é uma REFERÊNCIA estável (`bucket://whatsapp-media/…`)
 * e a assinatura acontece em `enviarParaProspect`, imediatamente antes do POST
 * para a Meta. O arquivo continua fechado para o mundo e o link nunca vence
 * dentro da campanha.
 *
 * ─── A fronteira da organização ─────────────────────────────────────────────
 *
 * A referência carrega um caminho de storage. Assinar o caminho que vier no
 * jsonb sem conferir o prefixo deixaria uma campanha apontar para a mídia de
 * OUTRA organização (e o service role assinaria sem reclamar). A checagem de
 * `${orgId}/` é a única coisa que separa os dois.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { BUCKET_DE_MIDIA, caminhoDaReferencia } from "@/lib/channels/templates/midia";

/**
 * TTL da URL assinada no envio. Curto de propósito: a URL existe para o POST
 * da Meta, que acontece segundos depois — não para ser guardada em lugar nenhum.
 */
const VALIDADE_SEGUNDOS = 60 * 60;

export type ResolucaoDaMidia =
  | { ok: true; values: Record<string, string> }
  | { ok: false; erro: string };

/**
 * Troca as referências de storage por URLs assinadas. Valores que já são link
 * `https://` passam intactos — o operador pode usar uma imagem pública sem
 * subir arquivo nenhum.
 *
 * Falha de assinatura interrompe o envio: mandar a referência crua faria a Meta
 * recusar com link inválido DEPOIS de aceitar a chamada, e o erro chegaria como
 * falha de template, não como falha de storage.
 */
export async function resolverReferenciasDeMidia(
  admin: SupabaseClient,
  orgId: string,
  values: Record<string, string>,
): Promise<ResolucaoDaMidia> {
  const saida: Record<string, string> = { ...values };

  for (const [chave, valor] of Object.entries(values)) {
    const caminho = caminhoDaReferencia(valor);
    if (!caminho) continue;

    if (!caminho.startsWith(`${orgId}/`)) {
      return {
        ok: false,
        erro: `midia_fora_da_organizacao: o arquivo do parâmetro ${chave} não pertence a esta organização.`,
      };
    }

    const { data, error } = await admin.storage
      .from(BUCKET_DE_MIDIA)
      .createSignedUrl(caminho, VALIDADE_SEGUNDOS);
    if (error || !data?.signedUrl) {
      return {
        ok: false,
        erro: `midia_indisponivel: não foi possível preparar o link do arquivo ${
          caminho.split("/").pop() ?? caminho
        } (${error?.message ?? "sem url"}). Envie o arquivo novamente pela tela da campanha.`,
      };
    }
    saida[chave] = data.signedUrl;
  }

  return { ok: true, values: saida };
}
