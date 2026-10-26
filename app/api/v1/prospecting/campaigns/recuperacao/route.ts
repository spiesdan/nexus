import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { conflitosDeReserva, resumoDosConflitos } from "@/lib/prospeccao/reserva-de-campanha";
import { validarBindDaCampanha } from "@/lib/prospeccao/validacao-da-campanha";
import { campanhaDeRecuperacaoSchema } from "@/lib/schemas/prospeccao";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * A CAMPANHA DE RECUPERAÇÃO — quem comprava e parou, agora com relógio.
 *
 * Rota própria, e não um ramo da criação de campanha de prospecção, porque o
 * CONTRATO é outro: aqui não há `categorias`/`cidades` (o recorte é o radar de
 * inativos, não uma busca), e a audiência é `contacts` — cliente, nunca
 * prospect. Deixar as duas na mesma rota faria o schema virar um "ou" de dois
 * recursos, e o defeito apareceria como campanha de garimpo mandando para
 * cliente próprio (ou o contrário).
 *
 * Nasce `ativa` e `agendada_em` preenchida: o formulário da tela É a agenda.
 * Os compromissos do tick (janela, período, cota da campanha, cota do número,
 * espaçamento global) valem iguais aos da prospecção — o motor é o mesmo.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = campanhaDeRecuperacaoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();

  // 0284 — o mesmo contrato da prospecção: a campanha DECLARA como fala e o
  // bind é conferido contra o espelho ANTES de gravar. Cliente inativo está
  // quase sempre fora da janela de 24h; um modelo reprovado aqui só apareceria
  // no tick, com a lista já reservada.
  const tipo = parsed.data.mensagem_tipo ?? "texto";
  if (tipo === "template") {
    const veredito = await validarBindDaCampanha(
      createAdminClient(),
      authz.org.orgId,
      {
        tipo,
        name: parsed.data.template_name ?? null,
        language: parsed.data.template_language ?? null,
        contractHash: parsed.data.template_contract_hash ?? null,
        values: parsed.data.template_values ?? {},
      },
      { exigirCanal: true },
    );
    if (!veredito.ok) {
      return fail("validation_failed", veredito.erro, 422, {
        requestId,
        details: { codigo: veredito.codigo },
      });
    }
  }

  // 0277 — a lista de contatos também é reserva exclusiva. O trigger do banco
  // é a trava final, mas ele responde "23505"; a checagem aqui devolve QUEM já
  // está em qual campanha, com a mesma resposta 409 da campanha de prospecção.
  try {
    const conflitos = await conflitosDeReserva(supabase, {
      organizationId: authz.org.orgId,
      campaignId: null,
      contatoIds: parsed.data.contato_ids,
    });
    if (conflitos.length > 0) {
      return fail(
        "state_conflict",
        `Não dá para criar a campanha de recuperação: ${resumoDosConflitos(conflitos)}.`,
        409,
        { requestId, details: { conflitos } },
      );
    }
  } catch (e) {
    logger.error("[prospecting.campaigns.recuperacao] reserva falhou", {
      requestId,
      organization_id: authz.org.orgId,
      erro: e instanceof Error ? e.message : String(e),
    });
    return fail("internal_error", "Erro ao validar os contatos da campanha.", 500, { requestId });
  }

  const { data, error } = await supabase
    .from("prospecting_campaigns")
    .insert({
      organization_id: authz.org.orgId,
      nome: parsed.data.nome,
      objetivo: parsed.data.objetivo ?? null,
      // A audiência de contatos não tem recorte geográfico nem categoria: as
      // duas colunas existem para a garimpagem e ficam vazias de propósito.
      categorias: [],
      cidades: [],
      publico: "contatos",
      contato_ids: parsed.data.contato_ids,
      mensagem_tipo: tipo,
      ...(tipo === "template"
        ? {
            mensagens: [],
            template_name: parsed.data.template_name ?? null,
            template_language: parsed.data.template_language ?? null,
            template_contract_hash: parsed.data.template_contract_hash ?? null,
            template_values: parsed.data.template_values ?? {},
          }
        : {
            mensagens: parsed.data.mensagens ?? [],
            template_name: null,
            template_language: null,
            template_contract_hash: null,
            template_values: {},
          }),
      ...(parsed.data.espaco_ms !== undefined ? { espaco_ms: parsed.data.espaco_ms } : {}),
      ...(parsed.data.limite_diario !== undefined
        ? { limite_diario: parsed.data.limite_diario }
        : {}),
      ...(parsed.data.data_inicio !== undefined ? { data_inicio: parsed.data.data_inicio } : {}),
      ...(parsed.data.data_fim !== undefined ? { data_fim: parsed.data.data_fim } : {}),
      ...(parsed.data.janelas !== undefined ? { janelas: parsed.data.janelas } : {}),
      agendada_em: new Date().toISOString(),
      status: "ativa",
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
        "Um ou mais contatos já estão reservados por outra campanha.",
        409,
        { requestId },
      );
    }
    logger.error("[prospecting.campaigns.recuperacao] falha ao criar campanha", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error?.message ?? "sem linha devolvida",
    });
    return fail("internal_error", "Erro ao criar a campanha de recuperação.", 500, { requestId });
  }

  return ok(data, { requestId, status: 201 });
}
