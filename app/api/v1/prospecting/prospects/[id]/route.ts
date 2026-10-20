/**
 * PATCH  /api/v1/prospecting/prospects/[id] — status, não-contatar, bloquear.
 * DELETE /api/v1/prospecting/prospects/[id] — excluir (LGPD §26).
 *
 * FASE 12 (§31/D7): PATCH também espelha a PRÓXIMA AÇÃO em
 * `commercial_tasks` — é por lá que o Meu Dia recebe as tarefas da
 * prospecção. Prospect salva primeiro (fonte da verdade); o espelho é
 * best-effort, mesmo critério do claim da FASE 9.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { categoriaEfetiva } from "@/lib/prospeccao/categoria-efetiva";
import { tarefaEspelhadaParaAtualizar, tarefaEspelhadaParaCriar, type ProspectDaTarefa } from "@/lib/prospeccao/tarefa";
import { COLUNAS_DO_PROSPECT, prospectPatchSchema } from "@/lib/schemas/prospeccao";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** A tarefa espelhada deste prospect (uma só — índice parcial por org). */
async function tarefaDoProspect(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  prospectId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("commercial_tasks")
    .select("id")
    .eq("organization_id", orgId)
    .eq("prospect_id", prospectId)
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "business_prospects" });
  if (!authz.ok) return authz.response;

  const parsed = prospectPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return fail("validation_failed", "Dados inválidos.", 422, { requestId });
  }

  const { id } = await params;
  const supabase = await createClient();

  // 0277 — corrigir/confirmar a categoria é mais que trocar `categoria`.
  // `categoria_canonica` é o que manda na leitura; sem gravá-la, a heurística
  // marcaria a linha como `revisar` de novo no próximo GET.
  const dados: {
    status_comercial?: (typeof parsed.data)["status_comercial"];
    do_not_contact?: boolean;
    bloqueado?: boolean;
    categoria?: string;
    categoria_revisar?: boolean;
    categoria_canonica?: string | null;
    categoria_confianca?: "alta" | "media" | "baixa" | null;
    owner_user_id?: string | null;
    proximo_passo?: string | null;
  } = { ...parsed.data };

  if (dados.categoria !== undefined || dados.categoria_revisar !== undefined) {
    const { data: atual, error: errAtual } = await supabase
      .from("business_prospects")
      .select("nome, categoria, categorias, website, categoria_canonica, categoria_revisar")
      .eq("id", id)
      .eq("organization_id", authz.org.orgId)
      .maybeSingle();
    if (errAtual) {
      return fail("internal_error", "Erro ao ler a categoria atual.", 500, { requestId });
    }
    if (!atual) return fail("not_found", "Prospect não encontrado.", 404, { requestId });

    const efetiva = categoriaEfetiva(
      atual as unknown as {
        nome: string;
        categoria: string | null;
        categorias: string[] | null;
        website: string | null;
        categoria_canonica: string | null;
        categoria_revisar: boolean | null;
      },
    );
    if (dados.categoria !== undefined) {
      // O rótulo escolhido pelo operador é a verdade — e ele confirmou.
      dados.categoria_canonica = dados.categoria;
      dados.categoria_confianca = "alta";
      if (dados.categoria_revisar === undefined) dados.categoria_revisar = false;
    } else if (dados.categoria_revisar === false) {
      // "Confirmo que está certo": congela o rótulo efetivo atual.
      dados.categoria_canonica = efetiva.rotulo;
      dados.categoria_confianca = "alta";
    } else if (dados.categoria_revisar === true) {
      dados.categoria_confianca = "baixa";
    }
  }

  const { data, error } = await supabase
    .from("business_prospects")
    .update(dados)
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select(COLUNAS_DO_PROSPECT)
    .single();

  if (error || !data) return fail("not_found", "Prospect não encontrado.", 404, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "prospect.updated",
    resourceType: "business_prospects",
    resourceId: id,
    requestId,
  });

  // FASE 12: espelho em commercial_tasks. O passo (quando veio) manda no
  // texto; o dono (quando veio sozinho) só arruma o responsável da espelhada.
  const passo = "proximo_passo" in parsed.data ? parsed.data.proximo_passo : undefined;
  const tocouDono = "owner_user_id" in parsed.data;
  if (passo !== undefined || tocouDono) {
    try {
      const existente = await tarefaDoProspect(supabase, authz.org.orgId, id);
      const linha = data as unknown as ProspectDaTarefa;

      if (passo !== undefined && (!passo || !passo.trim())) {
        // Passo limpo: a espelhada vira histórico (cancelada), não some —
        // concluir é decisão do vendedor, apagar seria apagar trabalho feito.
        if (existente) {
          await supabase
            .from("commercial_tasks")
            .update({ status: "cancelada" })
            .eq("id", existente.id)
            .eq("organization_id", authz.org.orgId)
            .eq("status", "pendente");
        }
      } else if (passo !== undefined) {
        // Passo (re)definido: reabre a espelhada ou nasce uma. `data` já é a
        // linha depois do update, então texto/dono/contato vêm da fonte.
        const corpo = { organizationId: authz.org.orgId, usuarioId: authz.user.id, hoje: new Date().toISOString().slice(0, 10) };
        if (existente) {
          await supabase
            .from("commercial_tasks")
            .update(tarefaEspelhadaParaAtualizar(linha, passo, corpo))
            .eq("id", existente.id)
            .eq("organization_id", authz.org.orgId);
        } else {
          const { data: criada } = await supabase
            .from("commercial_tasks")
            .insert(tarefaEspelhadaParaCriar(linha, passo, corpo))
            .select("id")
            .maybeSingle();
          if (criada) {
            await audit({
              organizationId: authz.org.orgId,
              actorUserId: authz.user.id,
              action: "commercial_task.created",
              resourceType: "commercial_tasks",
              resourceId: (criada as { id: string }).id,
              requestId,
            });
          }
        }
      } else if (existente) {
        // Só o dono mudou: a tarefa acompanha o vendedor (§16: vendedor é
        // atributo do prospect, e a tarefa é dele).
        await supabase
          .from("commercial_tasks")
          .update({ responsavel_user_id: linha.owner_user_id ?? authz.user.id })
          .eq("id", existente.id)
          .eq("organization_id", authz.org.orgId);
      }
    } catch {
      // best-effort: o prospect já salvou; a próxima edição do passo refaz.
    }
  }

  const linhaSalva = data as unknown as {
    nome: string;
    categoria: string | null;
    categorias: string[] | null;
    website: string | null;
    categoria_canonica: string | null;
    categoria_revisar: boolean | null;
  } & Record<string, unknown>;

  return ok(
    {
      ...linhaSalva,
      categoria_efetiva: categoriaEfetiva(linhaSalva).rotulo,
    },
    { requestId },
  );
}

export async function DELETE(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "business_prospects" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();

  // FASE 12: cancela a espelhada ANTES de apagar — depois o FK 'on delete set
  // null' já teria desvinculado e a tarefa ficaria pendente órfã na rotina de
  // quem não tem mais o que fazer. Best-effort: falhou, o set null cobre.
  await supabase
    .from("commercial_tasks")
    .update({ status: "cancelada" })
    .eq("organization_id", authz.org.orgId)
    .eq("prospect_id", id)
    .eq("status", "pendente");

  const { data, error } = await supabase
    .from("business_prospects")
    .delete()
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select("id")
    .maybeSingle();

  if (error || !data) return fail("not_found", "Prospect não encontrado.", 404, { requestId });

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "prospect.deleted",
    resourceType: "business_prospects",
    resourceId: id,
    requestId,
  });

  return ok({ id }, { requestId });
}
