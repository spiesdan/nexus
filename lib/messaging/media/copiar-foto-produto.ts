/**
 * Foto do catálogo → pasta da conversa (storage-first com escopo).
 *
 * O handler de envio só aceita `media_storage_path` sob `{org}/{conversa}/`
 * (isMediaPathOwnedBy) — caminho de catálogo (`{org}/{produto}/...`) é
 * recusado lá. Em vez de afrouxar a checagem, COPIA-SE a foto para a pasta da
 * conversa: o invariante "só sai o que está sob a conversa" continua valendo
 * para todo remetente. Destino determinístico (mesma foto + conversa = mesmo
 * caminho) para o retry não duplicar arquivo nem envio.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET_CATALOGO = "product-images";
export const BUCKET_CONVERSA = "whatsapp-media";

function mimeDaExtensao(caminho: string): string {
  const ext = caminho.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export interface FotoCopiada {
  destino: string;
  mime: string;
}

export async function copiarFotoParaConversa(
  supabase: SupabaseClient,
  input: { organizationId: string; conversationId: string; storagePath: string },
): Promise<FotoCopiada> {
  const origem = input.storagePath;
  // Caminho precisa ser de foto REAL do catálogo desta org — nunca string
  // inventada pelo modelo. A checagem é por existência, não por prefixo:
  // prefixo sozinho aceitaria "{org}/qualquer-coisa".
  if (origem.includes("..") || origem.startsWith("local:") || origem.trim() === "") {
    throw new Error("caminho_de_foto_invalido: fora do formato do catálogo");
  }
  const { data: linhas, error: errFoto } = await supabase
    .from("product_images")
    .select("product_id")
    .eq("organization_id", input.organizationId)
    .eq("storage_path", origem)
    .limit(1);
  if (errFoto) throw new Error(`foto_nao_confirmada: ${errFoto.message}`);
  if (!linhas || linhas.length === 0) {
    throw new Error("foto_nao_confirmada: caminho não é foto cadastrada desta organização");
  }
  const base = origem.split("/").pop() || "foto.jpg";
  const destino = `${input.organizationId}/${input.conversationId}/catalogo/${base}`;
  const { data: blob, error: errBaixar } = await supabase.storage
    .from(BUCKET_CATALOGO)
    .download(origem);
  if (errBaixar || !blob) throw new Error(`foto_nao_baixada: ${errBaixar?.message ?? "sem_bytes"}`);
  const { error: errSubir } = await supabase.storage
    .from(BUCKET_CONVERSA)
    .upload(destino, blob, { upsert: true, contentType: mimeDaExtensao(origem) });
  if (errSubir) throw new Error(`foto_nao_copiada: ${errSubir.message}`);
  return { destino, mime: mimeDaExtensao(origem) };
}
