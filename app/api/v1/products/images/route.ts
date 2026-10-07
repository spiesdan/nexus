/**
 * GET /api/v1/products/images?ids=a,b,c — fotos de VÁRIOS produtos em UMA ida.
 *
 * Existe porque a tela de catálogo renderiza `FotosDoProduto` por linha e cada
 * um fazia `GET /api/v1/products/{id}/images`. Com 640 produtos eram 640
 * requisições — medido na VPS: 600 requests levaram 104 s (≈1 s cada, porque
 * cada uma revalida a sessão no GoTrue). Além de a página demorar minutos, a
 * rajada derrubava o GoTrue (`dial error (timeout)` / `context deadline
 * exceeded` no `auth`), o que voltava como **401** no console —Auth que estava
 * válido, infraestrutura que não aguentou.
 *
 * Aqui a lista inteira cabe numa requisição. Leitura `viewer`, igual à rota
 * individual — este não é um atalho que abre o que ela esconde: os ids são
 * filtrados pela MESMA `produtoDaOrg` e o que não é da organização não volta.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Teto de ids por requisição: acima disso a URL estoura e o ganho some. */
const MAX_IDS = 500;

function urlPublica(caminho: string): string {
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${caminho}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "product_images" });
  if (!authz.ok) return authz.response;

  const bruto = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = [
    ...new Set(
      bruto
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0) return ok({}, { requestId });
  if (ids.length > MAX_IDS) {
    return fail("validation_failed", `No máximo ${MAX_IDS} produtos por requisição.`, 422, {
      requestId,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_images")
    .select("id, product_id, storage_path, posicao")
    .eq("organization_id", authz.org.orgId)
    .in("product_id", ids)
    .order("posicao");

  if (error) return fail("internal_error", "Erro ao ler as fotos.", 500, { requestId });

  const porProduto: Record<string, { id: string; url: string; posicao: number }[]> = {};
  for (const id of ids) porProduto[id] = [];
  for (const f of (data ?? []) as unknown as {
    id: string;
    product_id: string;
    storage_path: string;
    posicao: number;
  }[]) {
    // `local:` é o prefixo do volume da VPS; o resto é bucket público.
    const url = f.storage_path.startsWith("local:")
      ? `/api/v1/products/${f.product_id}/images/${f.id}`
      : urlPublica(f.storage_path);
    porProduto[f.product_id]?.push({ id: f.id, url, posicao: f.posicao });
  }

  return ok(porProduto, { requestId });
}
