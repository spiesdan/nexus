/**
 * GET  /api/v1/products/[id]/images — fotos do produto (URLs públicas).
 * POST /api/v1/products/[id]/images — anexa foto (máx 5 por produto).
 *
 * Leitura `viewer`, escrita `manager` (foto é catálogo, como preço). O bucket
 * é público e a rota devolve URLs prontas — sem signed URL que vence.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { detectarTipoImagem } from "@/lib/comercial/imagem";
import { urlDeExibicaoDaFoto, urlPublicaDaFoto } from "@/lib/storage/foto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const MAX_FOTOS = 5;
const MAX_BYTES = 2 * 1024 * 1024;

async function produtoDaOrg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  id: string,
) {
  const { data } = await supabase
    .from("catalog_products")
    .select("id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  return Boolean(data);
}

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "product_images" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  if (!(await produtoDaOrg(supabase, authz.org.orgId, id))) {
    return fail("not_found", "Produto não encontrado.", 404, { requestId });
  }

  const { data, error } = await supabase
    .from("product_images")
    .select("id, storage_path, posicao")
    .eq("product_id", id)
    .eq("organization_id", authz.org.orgId)
    .order("posicao");

  if (error) return fail("internal_error", "Erro ao ler as fotos.", 500, { requestId });
  return ok(
    ((data ?? []) as unknown as { id: string; storage_path: string; posicao: number }[]).map(
      (f) => ({
        id: f.id,
        url: f.storage_path.startsWith("local:")
          ? `/api/v1/products/${id}/images/${f.id}`
          : urlDeExibicaoDaFoto(f.storage_path),
        posicao: f.posicao,
      }),
    ),
    { requestId },
  );
}

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "product_images" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  if (!(await produtoDaOrg(supabase, authz.org.orgId, id))) {
    return fail("not_found", "Produto não encontrado.", 404, { requestId });
  }

  const { count } = await supabase
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id)
    .eq("organization_id", authz.org.orgId);
  if ((count ?? 0) >= MAX_FOTOS) {
    return fail("validation_failed", `Máximo de ${MAX_FOTOS} fotos por produto.`, 422, {
      requestId,
    });
  }

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("file");
  if (!(arquivo instanceof File)) {
    return fail("validation_failed", "Envie a foto em `file`.", 422, { requestId });
  }
  if (arquivo.size <= 0 || arquivo.size > MAX_BYTES) {
    return fail("validation_failed", "Foto de até 2 MB.", 422, { requestId });
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const ext = detectarTipoImagem(bytes);
  if (!ext) {
    return fail("validation_failed", "Só foto (JPEG, PNG ou WebP).", 422, { requestId });
  }

  const admin = createAdminClient();
  const caminho = `${authz.org.orgId}/${id}/${randomUUID()}.${ext}`;
  const photosRoot = process.env.PRODUCT_IMAGES_DIR ?? "/data/product-images";
  const localPath = path.join(photosRoot, caminho);
  try {
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, bytes);
  } catch {
    return fail("internal_error", "Erro ao guardar a foto no servidor.", 500, { requestId });
  }
  const storagePath = `local:${caminho}`;

  const { data, error } = await admin
    .from("product_images")
    .insert({
      organization_id: authz.org.orgId,
      product_id: id,
      storage_path: storagePath,
      posicao: count ?? 0,
      created_by: authz.user.id,
    })
    .select("id, storage_path, posicao")
    .single();

  if (error || !data) {
    return fail("internal_error", "Erro ao registrar a foto.", 500, { requestId });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "catalog_product.updated",
    resourceType: "catalog_products",
    resourceId: id,
    requestId,
  });

  const foto = data as unknown as { id: string; storage_path: string; posicao: number };
  return ok(
    // `urlDeExibicaoDaFoto` e não `urlPublicaDaFoto`: quem acabou de enviar
    // quer VER a foto agora, e é este `url` que o `FotosDoProduto` coloca no
    // `<img>`. A URL crua continua existindo para download e ampliação.
    { id: foto.id, url: urlDeExibicaoDaFoto(foto.storage_path), posicao: foto.posicao },
    { requestId, status: 201 },
  );
}
