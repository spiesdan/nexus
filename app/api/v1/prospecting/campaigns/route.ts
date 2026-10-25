/**
 * GET  /api/v1/prospecting/campaigns — campanhas.
 * POST /api/v1/prospecting/campaigns — cria campanha.
 * POST /api/v1/prospecting/campaigns/[id]/executar — fã-out: uma busca
 *        queued por (cidade × categorias em blocos), vinculada à campanha.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { funisDaDescoberta } from "@/lib/prospeccao/funil-lote";
import { conflitosDeReserva, resumoDosConflitos } from "@/lib/prospeccao/reserva-de-campanha";
import {
  resumirEnvios,
  type EnvioDaCampanha,
  type ResumoDeEnvio,
} from "@/lib/prospeccao/resumo-de-envio";
import { categoriasSemModelo } from "@/lib/prospeccao/templates-por-categoria";
import {
  validarBindDaCampanha,
  validarTemplatesDaCampanha,
} from "@/lib/prospeccao/validacao-da-campanha";
import { campanhaCreateSchema } from "@/lib/schemas/prospeccao";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  // FASE 15 (§45): `com_funil=1` traz o funil de TODAS as campanhas em 5
  // queries — a aba Campanhas passou a pedir só as duas listas (N+1 morto).
  const comFunil = req.nextUrl.searchParams.get("com_funil") === "1";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospecting_campaigns")
    .select(
      "id, nome, objetivo, categorias, cidades, status, recorrencia_dias, ultima_execucao_at, created_at, fonte_publico, publico, prospect_ids, contato_ids, janelas, data_inicio, data_fim, agendada_em, mensagens, mensagem_tipo, template_name, template_language, template_contract_hash, template_values, templates_por_categoria, limite_diario, ultimo_erro, ultimo_erro_em",
    )
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    logger.error("[prospecting.campaigns] falha ao listar campanhas", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error.message,
    });
    return fail("internal_error", "Erro ao listar campanhas.", 500, { requestId });
  }
  const linhas = (data ?? []) as unknown as {
    id: string;
    created_at: string;
    prospect_ids?: string[] | null;
    contato_ids?: string[] | null;
  }[];

  // ── O resumo de envio entra na LISTA, não só no painel ───────────────────
  // O card precisa dizer "22 de 48 enviadas · 26 faltam" sem abrir a campanha.
  // A query é uma só para as 100 campanhas (sem N+1) e o cálculo é a MESMA
  // função pura do painel. Se o ledger falhar, a lista continua abrindo; o
  // card mostra a fila da lista fechada e o painel é a fonte detalhada.
  const envioPorCampanha = new Map<string, ResumoDeEnvio>();
  const ids = linhas.map((l) => l.id);
  if (ids.length > 0) {
    const { data: envios, error: erroEnvios } = await supabase
      .from("prospecting_sends")
      .select("campaign_id, prospect_id, message_id, enviado_em")
      .eq("organization_id", authz.org.orgId)
      .in("campaign_id", ids);

    if (erroEnvios) {
      logger.warn("[prospecting.campaigns] resumo de envio indisponível", {
        requestId,
        organization_id: authz.org.orgId,
        erro: erroEnvios.message,
      });
    } else {
      const porCampanha = new Map<string, EnvioDaCampanha[]>();
      for (const envio of (envios ?? []) as unknown as (EnvioDaCampanha & {
        campaign_id: string;
      })[]) {
        const lista = porCampanha.get(envio.campaign_id) ?? [];
        lista.push(envio);
        porCampanha.set(envio.campaign_id, lista);
      }
      for (const linha of linhas) {
        const publicoContatos = (linha as { publico?: string }).publico === "contatos";
        const listaFechada = publicoContatos ? linha.contato_ids : linha.prospect_ids;
        envioPorCampanha.set(
          linha.id,
          resumirEnvios({
            prospectIds: listaFechada,
            sends: porCampanha.get(linha.id) ?? [],
          }),
        );
      }
    }
  }

  const comEnvio = linhas.map((l) => ({
    ...l,
    envio:
      envioPorCampanha.get(l.id) ??
      resumirEnvios({
        prospectIds: l.prospect_ids ?? l.contato_ids,
        sends: [],
      }),
  }));

  if (comFunil && comEnvio.length > 0) {
    try {
      const funis = await funisDaDescoberta(
        supabase,
        authz.org.orgId,
        comEnvio.map((l) => ({ id: l.id, created_at: l.created_at })),
      );
      return ok(
        comEnvio.map((l) => ({ ...l, funil: funis[l.id] })),
        { requestId },
      );
    } catch (e) {
      // O funil é enfeite da lista: falhou, a lista sobrevive (mesmo silêncio
      // de antes, quando um `/painel` derrubado deixava o card sem número).
      logger.warn("[prospecting.campaigns] funil em lote falhou", {
        requestId,
        organization_id: authz.org.orgId,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return ok(comEnvio, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = campanhaCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // O 422 devolve os campos para a tela, mas o toast genérico ("Dados
    // inválidos.") não os mostra. O log é o que permite saber QUAL campo a
    // instalação recusou sem reproduzir o clique.
    logger.warn("[prospecting.campaigns] payload recusado", {
      requestId,
      organization_id: authz.org.orgId,
      campos: parsed.error.flatten().fieldErrors,
    });
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();

  // 0284 — a campanha declara COMO fala. O bind de template é conferido contra
  // o espelho ANTES de gravar: modelo reprovado/obsoleto/sem valor é campanha
  // que já nasce quebrada. Rascunho pode ser salvo sem canal; ativar não.
  //
  // 0285 — com um modelo por categoria, TODOS os binds são conferidos e a
  // cobertura é exigida: categoria escolhida sem modelo é recusada na borda,
  // não descoberta no tick com a empresa já reservada.
  const tipo = parsed.data.mensagem_tipo ?? "texto";
  const statusFinal = parsed.data.status ?? "rascunho";
  const mappings = tipo === "template" ? (parsed.data.templates_por_categoria ?? []) : [];
  const bindPadrao = mappings[0] ?? null;
  const name = parsed.data.template_name ?? bindPadrao?.name ?? null;
  const language = parsed.data.template_language ?? bindPadrao?.language ?? null;
  const contractHash = parsed.data.template_contract_hash ?? bindPadrao?.contract_hash ?? null;
  const values = parsed.data.template_values ?? bindPadrao?.values ?? {};
  const bind = { tipo, name, language, contractHash, values } as const;

  if (tipo === "template" && mappings.length > 0) {
    const semModelo = categoriasSemModelo(mappings, parsed.data.categorias);
    if (semModelo.length > 0) {
      return fail(
        "validation_failed",
        `Escolha um modelo para: ${semModelo.join(", ")}. Todas as categorias da campanha precisam de um modelo próprio.`,
        422,
        { requestId, details: { codigo: "template_da_categoria_ausente", categorias: semModelo } },
      );
    }
    const veredito = await validarTemplatesDaCampanha(
      createAdminClient(),
      authz.org.orgId,
      mappings,
      { exigirCanal: statusFinal === "ativa" },
    );
    if (!veredito.ok) {
      return fail("validation_failed", veredito.erro, 422, {
        requestId,
        details: { codigo: veredito.codigo },
      });
    }
  } else if (tipo === "template" || statusFinal === "ativa") {
    const veredito = await validarBindDaCampanha(createAdminClient(), authz.org.orgId, bind, {
      exigirCanal: statusFinal === "ativa",
    });
    if (!veredito.ok) {
      return fail("validation_failed", veredito.erro, 422, {
        requestId,
        details: { codigo: veredito.codigo },
      });
    }
  }
  if (
    statusFinal === "ativa" &&
    tipo === "texto" &&
    (parsed.data.mensagens ?? []).map((m) => m.trim()).filter(Boolean).length === 0
  ) {
    return fail(
      "validation_failed",
      "A campanha não tem nenhuma mensagem de texto salva. Salve ao menos uma variação antes de ativar.",
      422,
      { requestId },
    );
  }

  // 0277 — a lista fechada não pode reutilizar empresa de outra campanha nem
  // empresa com categoria a revisar/fora do recorte. O trigger do banco é a
  // trava final; esta checagem existe para responder QUEM e ONDE.
  if (parsed.data.prospect_ids && parsed.data.prospect_ids.length > 0) {
    try {
      const conflitos = await conflitosDeReserva(supabase, {
        organizationId: authz.org.orgId,
        campaignId: null,
        prospectIds: parsed.data.prospect_ids,
        categorias: parsed.data.categorias,
      });
      if (conflitos.length > 0) {
        return fail(
          "state_conflict",
          `Não dá para criar a campanha: ${resumoDosConflitos(conflitos)}.`,
          409,
          { requestId, details: { conflitos } },
        );
      }
    } catch (e) {
      logger.error("[prospecting.campaigns] reserva falhou", {
        requestId,
        organization_id: authz.org.orgId,
        erro: e instanceof Error ? e.message : String(e),
      });
      return fail("internal_error", "Erro ao validar as empresas da campanha.", 500, { requestId });
    }
  }

  const { data, error } = await supabase
    .from("prospecting_campaigns")
    .insert({
      organization_id: authz.org.orgId,
      nome: parsed.data.nome,
      objetivo: parsed.data.objetivo ?? null,
      categorias: parsed.data.categorias,
      cidades: parsed.data.cidades,
      recorrencia_dias: parsed.data.recorrencia_dias ?? null,
      fonte_publico: parsed.data.fonte_publico ?? "busca",
      // 0273 — a criação também aceita o agendamento; os campos ausentes ficam
      // no default da coluna (o operador que agenda pela tela usa o PATCH).
      ...(parsed.data.prospect_ids !== undefined ? { prospect_ids: parsed.data.prospect_ids } : {}),
      ...(parsed.data.mensagens !== undefined && tipo === "texto"
        ? { mensagens: parsed.data.mensagens }
        : {}),
      mensagem_tipo: tipo,
      ...(tipo === "template"
        ? {
            template_name: name,
            template_language: language,
            template_contract_hash: contractHash,
            template_values: values,
            templates_por_categoria: mappings,
            // O caminho de template não usa a rotação de texto. Guardar as
            // variações antigas não faz mal, mas zerar deixa a linha honesta
            // sobre o que a campanha usa.
            mensagens: [],
          }
        : {
            template_name: null,
            template_language: null,
            template_contract_hash: null,
            template_values: {},
            templates_por_categoria: [],
          }),
      ...(parsed.data.espaco_ms !== undefined ? { espaco_ms: parsed.data.espaco_ms } : {}),
      ...(parsed.data.limite_diario !== undefined ? { limite_diario: parsed.data.limite_diario } : {}),
      ...(parsed.data.data_inicio !== undefined ? { data_inicio: parsed.data.data_inicio } : {}),
      ...(parsed.data.data_fim !== undefined ? { data_fim: parsed.data.data_fim } : {}),
      ...(parsed.data.janelas !== undefined ? { janelas: parsed.data.janelas } : {}),
      ...(parsed.data.agendada_em !== undefined ? { agendada_em: parsed.data.agendada_em } : {}),
      status: parsed.data.status ?? "rascunho",
      created_by: authz.user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (
      error?.code === "23505" ||
      error?.message?.includes("prospect_em_outra_campanha") ||
      error?.message?.includes("contato_em_outra_campanha")
    ) {
      return fail(
        "state_conflict",
        "Uma ou mais empresas/contatos já estão reservados por outra campanha.",
        409,
        { requestId },
      );
    }
    logger.error("[prospecting.campaigns] falha ao criar campanha", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error?.message ?? "sem linha devolvida",
    });
    return fail("internal_error", "Erro ao criar campanha.", 500, { requestId });
  }

  return ok(data, { requestId, status: 201 });
}
