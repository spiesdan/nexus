import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { campanhaDeRecuperacaoSchema } from "@/lib/schemas/prospeccao";
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
  const { data, error } = await supabase
    .from("prospecting_campaigns")
    .insert({
      organization_id: authz.org.orgId,
      nome: parsed.data.nome,
      // A audiência de contatos não tem recorte geográfico nem categoria: as
      // duas colunas existem para a garimpagem e ficam vazias de propósito.
      categorias: [],
      cidades: [],
      publico: "contatos",
      contato_ids: parsed.data.contato_ids,
      mensagens: parsed.data.mensagens,
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
    logger.error("[prospecting.campaigns.recuperacao] falha ao criar campanha", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error?.message ?? "sem linha devolvida",
    });
    return fail("internal_error", "Erro ao criar a campanha de recuperação.", 500, { requestId });
  }

  return ok(data, { requestId, status: 201 });
}
