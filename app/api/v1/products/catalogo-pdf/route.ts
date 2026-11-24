/**
 * GET  /api/v1/products/catalogo-pdf — config + elegíveis + categorias + pendências.
 * POST /api/v1/products/catalogo-pdf — salva seleção/ordem/contracapa (manager).
 *
 * organization_id vem da sessão, nunca do corpo. Nenhum preço é enviado.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { carregarConfig, carregarElegiveis, carregarCategorias, montarCatalogo } from "@/lib/catalogo/dados";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const schema = z.object({
  nome: z.string().trim().min(2).max(80).optional(),
  produto_ids: z.array(z.string().uuid()).max(2000).optional(),
  ordem_categorias: z.array(z.string().trim().min(1).max(120)).max(500).optional(),
  incluir_contracapa: z.boolean().optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? undefined;
  const autorizado = await requireRole("viewer", { requestId, resource: "product_catalog_exports" });
  if (!autorizado.ok) return autorizado.response;
  const admin = createAdminClient();
  const [config, elegiveis, categorias, montagem] = await Promise.all([
    carregarConfig(admin, autorizado.org.orgId),
    carregarElegiveis(admin, autorizado.org.orgId),
    carregarCategorias(admin, autorizado.org.orgId),
    montarCatalogo(admin, autorizado.org.orgId),
  ]);
  return ok(
    {
      config,
      elegiveis,
      categorias,
      pendencias: montagem.pendencias,
      pode_gerar: montagem.podeGerar,
      contracapa_disponivel: montagem.dados.contracapa !== null,
    },
    { requestId },
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const autorizado = await requireRole("manager", { requestId, resource: "product_catalog_exports" });
  if (!autorizado.ok) return autorizado.response;
  const lido = schema.safeParse(await req.json().catch(() => null));
  if (!lido.success) return fail("validation_failed", "Dados inválidos.", 422, { requestId });

  const admin = createAdminClient();
  const atual = await carregarConfig(admin, autorizado.org.orgId);
  const proximo = {
    organization_id: autorizado.org.orgId,
    nome: lido.data.nome ?? atual.nome,
    produto_ids: lido.data.produto_ids ?? atual.produto_ids,
    ordem_categorias: lido.data.ordem_categorias ?? atual.ordem_categorias,
    incluir_contracapa: lido.data.incluir_contracapa ?? atual.incluir_contracapa,
    logo_path: atual.logo_path,
    created_by: autorizado.user.id,
  };

  // Só produtos DO TENANT podem ser selecionados — id manipulado não abre outro.
  const elegiveis = await carregarElegiveis(admin, autorizado.org.orgId);
  const permitidos = new Set(elegiveis.map((p) => p.id));
  const invalidos = proximo.produto_ids.filter((id) => !permitidos.has(id));
  if (invalidos.length > 0) {
    return fail("validation_failed", "Há produtos de outra organização na seleção.", 422, {
      requestId,
      details: { invalidos },
    });
  }

  const { data, error } = await admin
    .from("product_catalog_exports")
    .upsert(proximo, { onConflict: "organization_id" })
    .select("id, nome, logo_path, incluir_contracapa, produto_ids, ordem_categorias")
    .single();
  if (error || !data) return fail("internal_error", "Não foi possível salvar o catálogo.", 500, { requestId });

  void audit({
    organizationId: autorizado.org.orgId,
    actorUserId: autorizado.user.id,
    action: "product_catalog.updated",
    resourceType: "product_catalog_exports",
    resourceId: data.id,
    requestId,
    metadata: {
      produtos: proximo.produto_ids.length,
      categorias: proximo.ordem_categorias.length,
      contracapa: proximo.incluir_contracapa,
    },
  });
  return ok({ config: data }, { requestId });
}
