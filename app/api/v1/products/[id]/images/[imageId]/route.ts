/**
 * DELETE /api/v1/products/[id]/images/[imageId] — apaga foto (arquivo + linha).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "product_images" });
  if (!authz.ok) return authz.response;

  const { id, imageId } = await params;
  const supabase = await createClient();
  const { data: foto } = await supabase
    .from("product_images")
    .select("storage_path")
    .eq("id", imageId)
    .eq("product_id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const linha = foto as unknown as { storage_path: string } | null;
  if (!linha) return fail("not_found", "Foto não encontrada.", 404, { requestId });

  if (!linha.storage_path.startsWith("local:")) {
    return fail("validation_failed", "Esta foto não está em armazenamento local.", 422, {
      requestId,
    });
  }
  const photosRoot = process.env.PRODUCT_IMAGES_DIR ?? "/data/product-images";
  const filePath = path.join(photosRoot, linha.storage_path.replace(/^local:/, ""));
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new Response(data, {
      headers: { "Content-Type": mime, "Cache-Control": "public, max-age=3600, immutable" },
    });
  } catch {
    return fail("not_found", "Arquivo da foto não encontrado no servidor.", 404, { requestId });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "product_images" });
  if (!authz.ok) return authz.response;

  const { id, imageId } = await params;
  const supabase = await createClient();

  const { data: foto } = await supabase
    .from("product_images")
    .select("id, storage_path")
    .eq("id", imageId)
    .eq("product_id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const linha = foto as unknown as { id: string; storage_path: string } | null;
  if (!linha) return fail("not_found", "Foto não encontrada.", 404, { requestId });

  const admin = createAdminClient();
  if (linha.storage_path.startsWith("local:")) {
    const photosRoot = process.env.PRODUCT_IMAGES_DIR ?? "/data/product-images";
    const filePath = path.join(photosRoot, linha.storage_path.replace(/^local:/, ""));
    await rm(filePath, { force: true }).catch(() => {});
  } else {
    await admin.storage.from("product-images").remove([linha.storage_path]);
  }
  const { error } = await admin
    .from("product_images")
    .delete()
    .eq("id", imageId)
    .eq("organization_id", authz.org.orgId);
  if (error) return fail("internal_error", "Erro ao apagar a foto.", 500, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "catalog_product.updated",
    resourceType: "catalog_products",
    resourceId: id,
    requestId,
  });

  return ok({ id: imageId }, { requestId });
}
