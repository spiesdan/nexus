/**
 * GET/PUT /api/v1/prospecting/mensagens-por-categoria
 *
 * O PADRÃO DE MENSAGENS QUE A CAMPANHA HERDA DA CATEGORIA.
 *
 * ═══ O DEFEITO QUE ESTA ROTA CORRIGE ═══════════════════════════════════════
 *
 * Toda campanha nova começava com três caixas em branco, mesmo quando o
 * recorte era o de sempre ("oficina mecânica"). O operador reescrevia o mesmo
 * texto — ou pior, mandava o texto de outra categoria, porque o único lugar
 * onde aquele texto existia era uma campanha antiga.
 *
 * Agora o padrão mora na categoria, na organização, e a campanha nasce
 * preenchida. A campanha CONTINUA guardando a própria cópia em `mensagens`:
 * editar a campanha não altera o padrão, e mudar o padrão não reescreve o que
 * já foi enviado.
 *
 * Leitura: qualquer membro (atendente precisa ver o texto para usar).
 * Escrita: gerente para cima — o padrão decide o que TODA campanha nova daquela
 * categoria vai dizer.
 */
import { randomUUID } from "node:crypto";

import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { CATEGORIAS_COMERCIAIS } from "@/lib/prospeccao/categorias";
import { mensagensPorCategoriaSchema } from "@/lib/schemas/prospeccao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const COLUNAS = "id, categoria, mensagens, updated_at";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", {
    requestId,
    resource: "prospecting_message_presets",
  });
  if (!authz.ok) return authz.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("prospecting_message_presets")
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .order("categoria", { ascending: true });

  if (error) {
    logger.error("[prospecting.message-presets] falha ao listar", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error.message,
    });
    return fail("internal_error", "Erro ao carregar as mensagens por categoria.", 500, {
      requestId,
    });
  }

  return ok(data ?? [], { requestId });
}

export async function PUT(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", {
    requestId,
    resource: "prospecting_message_presets",
  });
  if (!authz.ok) return authz.response;

  const parsed = mensagensPorCategoriaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const { categoria } = parsed.data;
  // A categoria é a chave canônica da biblioteca. Salvar um padrão para uma
  // chave que não existe criaria uma linha que a tela nunca mostra e a campanha
  // nunca usa — sucesso que não chega a lugar nenhum. Recusa cedo.
  const conhecidas = new Set(
    CATEGORIAS_COMERCIAIS.flatMap((m) => m.subcategorias.map((s) => s.busca)),
  );
  if (!conhecidas.has(categoria)) {
    return fail("validation_failed", "Categoria desconhecida.", 422, { requestId });
  }
  // Vazio nas pontas é ruído de textarea, não conteúdo. E caixa vazia não vira
  // mensagem: o disparo já descarta vazios, mas guardar vazio aqui faria a tela
  // oferecer "usar as mensagens de X" com menos de três opções.
  const mensagens = parsed.data.mensagens
    .map((m) => m.trim())
    .filter((m) => m !== "")
    .slice(0, 3);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("prospecting_message_presets")
    .upsert(
      {
        organization_id: authz.org.orgId,
        categoria,
        mensagens,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,categoria" },
    )
    .select(COLUNAS)
    .single();

  if (error || !data) {
    logger.error("[prospecting.message-presets] falha ao salvar", {
      requestId,
      organization_id: authz.org.orgId,
      categoria,
      erro: error?.message ?? "sem linha devolvida",
    });
    return fail("internal_error", "Erro ao salvar as mensagens da categoria.", 500, {
      requestId,
    });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action:
      mensagens.length > 0
        ? "prospecting_message_preset.saved"
        : "prospecting_message_preset.cleared",
    resourceType: "prospecting_message_preset",
    // `resource_id` é uuid no log: a categoria vai no metadata, não no id.
    resourceId: data.id,
    metadata: { categoria, quantidade: mensagens.length },
    requestId,
  });

  return ok(data, { requestId });
}
