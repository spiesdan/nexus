/**
 * GET /api/v1/prospecting/campaigns/[id]/publico — QUEM a campanha alcança.
 *
 * ═══ POR QUE ESTA ROTA EXISTE ═══
 *
 * A fila da campanha vinha de `prospect_search_results`: as empresas que uma
 * BUSCA trouxe. Importação de arquivo não se liga a busca nenhuma (por decisão
 * de arquitetura), então a aba Campanhas era cega à maior parte da base.
 * Medido em 2026-10-17 nesta instalação: 21.668 empresas na base, 16 no funil
 * da campanha.
 *
 * Esta rota não envia nada. Ela devolve o público com o que saiu e por quê:
 *
 *   - `ja_clientes` — empresa que a loja JÁ atende (nome difuso, limiar 0.90,
 *     calibrado na medição: 103 casos reais). Sai da fila. Mandar proposta
 *     comercial para o próprio cliente não aparece como erro em lugar nenhum.
 *   - `duplicadas` — a mesma empresa duas vezes na base (933 grupos, 1.927
 *     linhas, medido). A segunda ocorrência sai: duas mensagens para a mesma
 *     empresa é o erro que o cliente sees.
 *   - `para_revisar` — nome parecido que não deu conta de decidir (0.80–0.90).
 *     Fica na fila, marcado, porque a decisão é do humano.
 *
 * E devolve `limite` porque o teto é honesto: 500 linhas por padrão, 5.000 no
 * máximo, e `completa: false` avisa que a base foi lida só até onde o teto
 * deixou — a tela não afirma "todas" quando não leu todas.
 */
import { randomUUID } from "node:crypto";

import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { indiceDeClientes } from "@/lib/prospeccao/ja-cadastrada";
import {
  LIMITE_MAXIMO,
  publicoDaBase,
  resumoDaBase,
  usaBase,
  type CidadeDaCampanha,
} from "@/lib/prospeccao/publico-da-base";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const CAMPANHA_COLS = "id, nome, categorias, cidades, status, fonte_publico";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const admin = createAdminClient();
  const { data: campanha, error } = await admin
    .from("prospecting_campaigns")
    .select(CAMPANHA_COLS)
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (error) throw new Error(`campanha_indisponivel: ${error.message}`);
  if (!campanha) return fail("not_found", "Campanha não encontrada.", 404, { requestId });

  const c = campanha as unknown as {
    id: string;
    nome: string;
    categorias: string[];
    cidades: CidadeDaCampanha[];
    status: string;
    fonte_publico: string | null;
  };

  if (!usaBase(c.fonte_publico)) {
    return ok(
      {
        fonte: c.fonte_publico ?? "busca",
        base: false,
        total: 0,
        linhas: [],
        aviso:
          "Esta campanha tira o público da busca no provedor ativo. Para ela usar o que já está " +
          "cadastrado, mude a fonte do público da campanha para “Base já coletada”.",
      },
      { requestId },
    );
  }

  const limiteCru = Number(req.nextUrl.searchParams.get("limite") ?? "500");
  const limite = Number.isFinite(limiteCru)
    ? Math.min(Math.max(limiteCru, 1), LIMITE_MAXIMO)
    : 500;

  // O índice de clientes só é construído quando a campanha usa a base: é a
  // leitura mais cara da rota e, em campanha de busca, não serve para nada.
  const clientes = await indiceDeClientes(admin, authz.org.orgId);
  const resultado = await publicoDaBase(admin, {
    organizationId: authz.org.orgId,
    cidades: c.cidades,
    categorias: c.categorias,
    limite,
    clientes,
  });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "prospecting_campaigns.public_read",
    resourceType: "prospecting_campaigns",
    resourceId: c.id,
    requestId,
    metadata: {
      total: resultado.total,
      ja_clientes: resultado.ja_clientes.length,
      duplicadas: resultado.duplicadas,
      para_revisar: resultado.para_revisar.length,
      varridas: resultado.varridas,
      completa: resultado.completa,
    },
  });

  return ok(
    {
      campanha_id: c.id,
      campanha: c.nome,
      fonte: c.fonte_publico,
      base: true,
      total: resultado.total,
      linhas: resultado.linhas,
      ja_clientes: resultado.ja_clientes,
      duplicadas: resultado.duplicadas,
      para_revisar: resultado.para_revisar,
      varridas: resultado.varridas,
      completa: resultado.completa,
      limite,
      resumo: resumoDaBase(resultado),
    },
    { requestId },
  );
}
