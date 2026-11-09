/**
 * A FOTO DO TEMPLATE NO INBOX.
 *
 * ─── Por que ela NÃO mora em `media_storage_path` ──────────────────────────
 *
 * O arquivo de um template é da CAMPANHA, não da mensagem: as 251 mensagens
 * apontam para o mesmo objeto. `fn_lgpd_cascade_redact_contact` enfileira TODO
 * `messages.media_storage_path` para deleção (`storage_redaction_queue`), então
 * gravar o caminho do template ali faria a primeira anonimização de contato
 * apagar a imagem de todas as outras mensagens — inclusive das que ainda vão
 * sair.
 *
 * Então a referência viaja em `messages.metadata.template_media` (`{ path,
 * mime }`): a cascata não a vê, o arquivo compartilhado sobrevive, e a rota de
 * mídia resolve o caminho na hora de servir. É a mesma ideia de
 * `metadata.shared_contact`: o que é dado da mensagem sem ser anexo dela.
 */
import { caminhoDaReferencia } from "@/lib/channels/templates/midia";

export interface TemplateMedia {
  path: string;
  mime: string;
}

const MIME_POR_EXTENSAO: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  "3gp": "video/3gpp",
  pdf: "application/pdf",
};

/** Extensão → mime. Sem extensão conhecida cai em `application/octet-stream`. */
export function mimeDaMidiaDoTemplate(caminho: string): string {
  const ext = caminho.split(".").pop()?.toLowerCase() ?? "";
  return MIME_POR_EXTENSAO[ext] ?? "application/octet-stream";
}

/**
 * Deriva a mídia dos VALORES DO TEMPLATE — antes da assinatura, quando ainda
 * são referências `bucket://whatsapp-media/…`.
 *
 * Depois de `resolverReferenciasDeMidia` o valor vira uma URL assinada que
 * expira em 1h; gravá-la no inbox daria uma foto que some no dia seguinte.
 * Quem chama precisa capturar antes, como faz `lib/prospeccao/envio.ts`.
 */
export function templateMediaDosValores(
  values: Record<string, string>,
): TemplateMedia | null {
  for (const valor of Object.values(values)) {
    const caminho = caminhoDaReferencia(valor);
    if (caminho) return { path: caminho, mime: mimeDaMidiaDoTemplate(caminho) };
  }
  return null;
}

/** Lê a mídia que o envio gravou em `messages.metadata.template_media`. */
export function templateMediaDoMetadata(
  metadata: Record<string, unknown> | null | undefined,
): TemplateMedia | null {
  const raw = metadata?.template_media;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const path = typeof obj.path === "string" ? obj.path.trim() : "";
  if (!path) return null;
  const mime = typeof obj.mime === "string" && obj.mime.length > 0
    ? obj.mime
    : mimeDaMidiaDoTemplate(path);
  return { path, mime };
}
