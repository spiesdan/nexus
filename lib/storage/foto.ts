/**
 * URL de exibição de uma foto do Storage.
 *
 * Existe por causa de um serviço que só existe na NUVEM. O caminho
 * `/storage/v1/render/image/public/…` é o redimensionador do Supabase **Cloud**
 * (imgproxy). Na instalação self-host ele não é servido: o CLI entrega o stack
 * com `IMAGE_TRANSFORMATION_ENABLED=false`, e a rota responde
 *
 *     404 {"message":"Route GET:/render/image/public/… not found"}
 *
 * E o jeito como isso aparecia era o pior possível: o `<img>` recebia 404,
 * a tela mostrava a coluna de fotos vazia — e TODA a API respondia 200. Nada
 * no log de erro apontava para o defeito; só a tela, e só para quem olhasse.
 *
 * Por isso a decisão fica AQUI, no servidor, e não em `.replace(...)` dentro do
 * componente. Cliente que monta URL de Storage precisa saber da topologia da
 * instalação — e o lugar que já a conhece é a rota que entrega a foto.
 *
 * Ligar de volta (só faz sentido no Cloud): `SUPABASE_IMAGE_TRANSFORM=on`.
 */
import { env } from "@/lib/env";

export const BUCKET_DE_FOTOS = "product-images";

export const PREFIXO_DE_FOTO_LOCAL = "local:";

/**
 * A URL do arquivo, sem transformation nenhuma. É a que serve para
 * download, para a ampliação e para `local:` (que sai pela API do app).
 */
export function urlPublicaDaFoto(caminho: string): string {
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${BUCKET_DE_FOTOS}/${caminho.replace(/^\/+/, "")}`;
}

/**
 * O que o `<img>` deve pedir.
 *
 * Só desvia para o redimensionador quando o operador pede explicitamente — o
 * default é o arquivo original, que é o que funciona em toda instalação.
 */
export function urlDeExibicaoDaFoto(
  caminho: string,
  alvo?: { productId: string; fotoId: string },
): string {
  // Foto em ARQUIVO do servidor, não no bucket. O upload do produto grava em
  // disco (`storage_path` com prefixo `local:`) e o bucket público não conhece
  // esse caminho: servi-la por lá dava **400**, e o `<img>` ficava quebrado
  // sem erro no log — a mesma falha silenciosa das outras duas vezes.
  //
  // A rota `GET /api/v1/products/{id}/images/{fotoId}` existe para isso e
  // exige o ID DA FOTO, não o `storage_path` — daí o par de ids.
  if (caminho.startsWith(PREFIXO_DE_FOTO_LOCAL)) {
    if (!alvo) {
      // Sem o par de ids não há rota local possível. Devolver o caminho cru
      // seria pior: o `<img>` pediria o bucket e receberia 400 sem explicação.
      throw new Error("foto local precisa de productId e fotoId para montar a URL");
    }
    return `/api/v1/products/${alvo.productId}/images/${alvo.fotoId}`;
  }
  if (env.SUPABASE_IMAGE_TRANSFORM !== "on") return urlPublicaDaFoto(caminho);
  return (
    urlPublicaDaFoto(caminho).replace(
      "/storage/v1/object/public/",
      "/storage/v1/render/image/public/",
    ) + "?width=96&quality=70&resize=cover"
  );
}

/** Marca de foto guardada em disco pelo app, e não no bucket do Storage. */
