/**
 * GET   /api/v1/prospecting/searches/[id] — detalhe com progresso.
 * PATCH /api/v1/prospecting/searches/[id] — {acao: pause|resume|cancel}.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { estadoDeParada, PARADA_MAXIMA_S } from "@/lib/prospeccao/parada";
import {
  criarProgresso,
  resumo,
  type ProgressoDaBusca,
} from "@/lib/prospeccao/checkpoint";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const COLUNAS =
  "id, categorias, cidade, estado, pais, latitude, longitude, raio_km, max_empresas, " +
  "provider, status, grid_size_km, grid_overlap_pct, total_celulas, celulas_processadas, " +
  "encontradas, novas, duplicadas, erros, requisicoes, detalhes, custo_estimado_cents, " +
  "progresso, motivo_zero, degradada, degradacao_motivo, parada_solicitada_em, " +
  "ultimo_erro, created_at, started_at, finished_at";

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "prospecting_searches" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospecting_searches")
    .select(COLUNAS)
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .single();

  if (error || !data) return fail("not_found", "Busca não encontrada.", 404, { requestId });
  const busca = data as unknown as Record<string, unknown> & {
    total_celulas: number;
    celulas_processadas: number;
    provider: string;
    categorias: string[];
    progresso: ProgressoDaBusca | null;
    status: string;
    parada_solicitada_em: string | null;
    degradada: boolean;
    degradacao_motivo: string | null;
  };
  const mapa = busca.provider === "maps_browser";
  const progresso =
    mapa && busca.progresso && typeof busca.progresso.termos_total === "number"
      ? busca.progresso
      : criarProgresso(busca.categorias ?? []);
  const r = resumo(progresso, busca.categorias ?? []);
  return ok(
    {
      ...busca,
      progresso_pct: mapa
        ? r.percentual
        : busca.total_celulas > 0
          ? Math.round((busca.celulas_processadas / busca.total_celulas) * 100)
          : 0,
      parcial_motivo: mapa
        ? busca.degradada
          ? `Descoberta degradada: ${busca.degradacao_motivo ?? "Maps indisponível."}`
          : r.motivo
        : null,
      parcial: mapa ? r.parcial : null,
      estado_parada: estadoDeParada(busca.status, busca.parada_solicitada_em),
      parada_maxima_s: PARADA_MAXIMA_S,
    },
    { requestId },
  );
}

const acaoSchema = z.object({ acao: z.enum(["pause", "resume", "cancel"]) });

export async function PATCH(req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_searches" });
  if (!authz.ok) return authz.response;

  const parsed = acaoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Dados inválidos.", 422, { requestId });

  const { id } = await params;
  const supabase = await createClient();
  const { data: atual } = await supabase
    .from("prospecting_searches")
    .select("id, status")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  const linha = atual as unknown as { id: string; status: string } | null;
  if (!linha) return fail("not_found", "Busca não encontrada.", 404, { requestId });

  if (linha.status === "completed" || linha.status === "failed" || linha.status === "cancelled") {
    return fail("validation_failed", "Busca encerrada não muda de estado.", 422, { requestId });
  }

  const agora = new Date().toISOString();
  const acao = parsed.data.acao;
  // Pause em busca RUNNING não finge ser instantâneo: grava o pedido e deixa o
  // status running até o motor fechar o termo (a rota mostra "parando").
  const patch =
    acao === "pause"
      ? linha.status === "running"
        ? { parada_solicitada_em: agora }
        : { status: "paused" as const, parada_solicitada_em: null }
      : acao === "resume"
        ? { status: "queued" as const, parada_solicitada_em: null }
        : { status: "cancelled" as const, parada_solicitada_em: null };

  const { data, error } = await supabase
    .from("prospecting_searches")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select("id, status, parada_solicitada_em, degradada, degradacao_motivo")
    .single();

  if (error || !data) {
    logger.error("[prospecting.searches] falha ao mudar estado", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error?.message ?? "sem linha devolvida",
    });
    return fail("internal_error", "Erro ao mudar estado.", 500, { requestId });
  }

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "prospecting_search.state_changed",
    resourceType: "prospecting_searches",
    resourceId: id,
    requestId,
  });

  const resposta = data as unknown as {
    status: string;
    parada_solicitada_em: string | null;
  };
  return ok(
    {
      ...(data as unknown as Record<string, unknown>),
      estado_parada: estadoDeParada(resposta.status, resposta.parada_solicitada_em),
      parada_maxima_s: PARADA_MAXIMA_S,
    },
    { requestId },
  );
}
