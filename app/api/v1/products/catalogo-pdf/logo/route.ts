/**
 * POST   /api/v1/products/catalogo-pdf/logo — logo PRÓPRIA daquele catálogo.
 * DELETE /api/v1/products/catalogo-pdf/logo — remove só essa logo.
 *
 * Não toca a logo permanente do tenant. O arquivo vai para o MESMO storage das
 * fotos de produto, em caminho não-enumerável com prefixo da organização; só o
 * caminho é gravado. Tipos e tamanho validados antes de escrever.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { detectarTipoImagem } from "@/lib/comercial/imagem";
import { carregarConfig } from "@/lib/catalogo/dados";
import { LOGO_TAMANHO_MAXIMO } from "@/lib/catalogo/pdf/imagens";
import { urlPublicaDaFoto } from "@/lib/storage/foto";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET devolve os bytes da logo atual para prévia sem depender de URL assinada. */
export async function GET(req: NextRequest): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? undefined;
  const autorizado = await requireRole("viewer", { requestId, resource: "product_catalog_exports" });
  if (!autorizado.ok) return autorizado.response;
  const admin = createAdminClient();
  const config = await carregarConfig(admin, autorizado.org.orgId);
  if (!config.logo_path) return fail("not_found", "Este catálogo não tem logo.", 404, { requestId });

  if (!config.logo_path.startsWith("local:")) {
    return Response.redirect(urlPublicaDaFoto(config.logo_path), 302);
  }
  const alvo = caminhoLocal(config.logo_path);
  if (!alvo) return fail("internal_error", "Caminho de storage inválido.", 500, { requestId });
  try {
    const dados = await readFile(alvo);
    const ext = path.extname(alvo).slice(1).toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new Response(new Uint8Array(dados), {
      headers: { "content-type": mime, "cache-control": "no-store" },
    });
  } catch {
    return fail("not_found", "Logo não encontrada.", 404, { requestId });
  }
}

export const dynamic = "force-dynamic";

function caminhoLocal(storagePath: string): string | null {
  if (!storagePath.startsWith("local:")) return null;
  const raiz = path.resolve(process.env.PRODUCT_IMAGES_DIR ?? "/data/product-images");
  const alvo = path.resolve(raiz, storagePath.slice("local:".length));
  if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) return null;
  return alvo;
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const autorizado = await requireRole("manager", { requestId, resource: "product_catalog_exports" });
  if (!autorizado.ok) return autorizado.response;

  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("file");
  if (!(arquivo instanceof File)) {
    return fail("validation_failed", "Envie a logo em `file`.", 422, { requestId });
  }
  if (arquivo.size <= 0 || arquivo.size > LOGO_TAMANHO_MAXIMO) {
    return fail("validation_failed", "Logo de até 2 MB.", 422, { requestId });
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const ext = detectarTipoImagem(bytes);
  if (!ext) return fail("validation_failed", "Só imagem JPEG, PNG ou WebP.", 422, { requestId });

  const admin = createAdminClient();
  const atual = await carregarConfig(admin, autorizado.org.orgId);
  const relativo = `${autorizado.org.orgId}/catalogo/logo-${randomUUID()}.${ext}`;
  const alvo = caminhoLocal(`local:${relativo}`);
  if (!alvo) return fail("internal_error", "Caminho de storage inválido.", 500, { requestId });
  try {
    await mkdir(path.dirname(alvo), { recursive: true });
    await writeFile(alvo, bytes);
  } catch {
    return fail("internal_error", "Não foi possível guardar a logo.", 500, { requestId });
  }

  const { data, error } = await admin
    .from("product_catalog_exports")
    .upsert(
      {
        organization_id: autorizado.org.orgId,
        nome: atual.nome,
        logo_path: `local:${relativo}`,
        produto_ids: atual.produto_ids,
        ordem_categorias: atual.ordem_categorias,
        incluir_contracapa: atual.incluir_contracapa,
        created_by: autorizado.user.id,
      },
      { onConflict: "organization_id" },
    )
    .select("id, logo_path")
    .single();
  if (error || !data) return fail("internal_error", "Não foi possível registrar a logo.", 500, { requestId });

  // Substituir apaga o arquivo antigo DEPOIS de gravar o novo caminho.
  const anterior = caminhoLocal(atual.logo_path ?? "");
  if (anterior && anterior !== alvo) await unlink(anterior).catch(() => {});

  void audit({
    organizationId: autorizado.org.orgId,
    actorUserId: autorizado.user.id,
    action: "product_catalog.logo_uploaded",
    resourceType: "product_catalog_exports",
    resourceId: data.id,
    requestId,
  });
  return ok(
    { logo_path: data.logo_path, url: "/api/v1/products/catalogo-pdf/logo" },
    { status: 201, requestId },
  );
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const autorizado = await requireRole("manager", { requestId, resource: "product_catalog_exports" });
  if (!autorizado.ok) return autorizado.response;

  const admin = createAdminClient();
  const atual = await carregarConfig(admin, autorizado.org.orgId);
  const alvo = caminhoLocal(atual.logo_path ?? "");
  if (alvo) await unlink(alvo).catch(() => {});

  const { data, error } = await admin
    .from("product_catalog_exports")
    .update({ logo_path: null })
    .eq("organization_id", autorizado.org.orgId)
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", "Não foi possível remover a logo.", 500, { requestId });

  void audit({
    organizationId: autorizado.org.orgId,
    actorUserId: autorizado.user.id,
    action: "product_catalog.logo_removed",
    resourceType: "product_catalog_exports",
    resourceId: data?.id ?? atual.id,
    requestId,
  });
  return ok({ removida: true }, { requestId });
}
