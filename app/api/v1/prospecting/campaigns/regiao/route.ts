/**
 * POST /api/v1/prospecting/campaigns/regiao — campanha para os clientes de uma
 * região.
 *
 * ═══ POR QUE ESTA ROTA É PRÓPRIA ═════════════════════════════════════════
 *
 * O contrato é outro: a audiência é `contacts` (cliente, nunca prospect), o
 * recorte é a CIDADE do cadastro cruzada com o endereço dos pedidos não
 * cancelados, e o número é escolhido pelo operador (0303). Reaproveitar a
 * criação da prospecção faria o schema virar um "ou" de dois recursos — e o
 * defeito apareceria como campanha de garimpo mandando para cliente próprio.
 *
 * ═══ A AUDIÊNCIA É RECALCULADA AQUI, NÃO VEM DO CORPO ════════════════════
 *
 * O corpo traz as CIDADES, nunca a lista de contatos. O servidor lê o cadastro
 * e os pedidos com `listarClientesPorRegiao` — a mesma função da prévia.
 * Cliente cadastrado na cidade entra mesmo sem pedido; aceitar `contato_ids` da
 * tela deixaria mandar para quem não é da região.
 *
 * Contato já reservado por outra campanha sai da lista (0277). O trigger do
 * banco continua sendo a trava final; a 23505 vira 409 com mensagem humana.
 *
 * Nasce `ativa` e agendada: o formulário da tela É a agenda. As três travas
 * (janela/período/cota, espaçamento por número, ledger idempotente) são as
 * mesmas do motor de prospecção — uma mensagem por minuto.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { listarClientesPorRegiao } from "@/lib/comercial/clientes-por-regiao";
import { logger } from "@/lib/logger";
import {
  mensagemDoNumeroInvalido,
  validarNumeroDaCampanha,
} from "@/lib/prospeccao/numero-da-campanha";
import { idsReservadosPorOutras } from "@/lib/prospeccao/reserva-de-campanha";
import { campanhaPorRegiaoSchema } from "@/lib/schemas/prospeccao";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** A campanha por região fala texto livre — é o que o número não oficial faz. */
const TIPO_DA_MENSAGEM = "texto" as const;

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const parsed = campanhaPorRegiaoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const admin = createAdminClient();

  // 0303 — o número escolhido precisa ser DESTA organização, estar WORKING e
  // aceitar texto livre fora da janela de 24h. Validar antes de gravar evita a
  // campanha que nasce ativa e pausa no primeiro tick "sem canal".
  try {
    const veredito = await validarNumeroDaCampanha(
      admin,
      authz.org.orgId,
      parsed.data.session_id,
      TIPO_DA_MENSAGEM,
    );
    if (!veredito.ok) {
      return fail("validation_failed", mensagemDoNumeroInvalido(veredito.motivo), 422, {
        requestId,
        details: { codigo: veredito.motivo },
      });
    }
  } catch (e) {
    logger.error("[prospecting.campaigns.regiao] falha ao validar o número", {
      requestId,
      organization_id: authz.org.orgId,
      erro: e instanceof Error ? e.message : String(e),
    });
    return fail("internal_error", "Erro ao validar o número escolhido.", 500, { requestId });
  }

  let contatoIds: string[] = [];
  let semTelefone = 0;
  let pedidosLidos = 0;
  let contatosLidos = 0;
  let completa = true;
  try {
    const [clientes, reservados] = await Promise.all([
      listarClientesPorRegiao(admin, {
        organizationId: authz.org.orgId,
        cidades: parsed.data.cidades,
      }),
      idsReservadosPorOutras(admin, authz.org.orgId, null),
    ]);

    semTelefone = clientes.lista.filter((c) => c.telefone_e164 === null).length;
    contatoIds = clientes.lista
      .filter((c) => c.telefone_e164 !== null && !reservados.has(c.contact_id))
      .map((c) => c.contact_id);
    pedidosLidos = clientes.pedidos_lidos;
    contatosLidos = clientes.contatos_lidos;
    completa = clientes.completa;
  } catch (e) {
    logger.error("[prospecting.campaigns.regiao] falha ao montar o público", {
      requestId,
      organization_id: authz.org.orgId,
      erro: e instanceof Error ? e.message : String(e),
    });
    return fail("internal_error", "Erro ao montar os clientes da região.", 500, { requestId });
  }

  if (contatoIds.length === 0) {
    return fail(
      "validation_failed",
      "Nenhum cliente desta região pode receber agora: todos estão sem telefone ou já em outra campanha.",
      422,
      { requestId, details: { sem_telefone: semTelefone } },
    );
  }

  const supabase = await createClient();
  const cidades = parsed.data.cidades.map((c) => ({
    cidade: c.cidade.trim(),
    ...(c.estado !== undefined ? { estado: c.estado.trim() } : {}),
  }));

  const { data, error } = await supabase
    .from("prospecting_campaigns")
    .insert({
      organization_id: authz.org.orgId,
      nome: parsed.data.nome,
      objetivo: parsed.data.objetivo ?? null,
      // A audiência é a CIDADE + histórico de compra: não há categoria na
      // garimpagem. `cidades` fica preenchida porque é o recorte que o operador
      // vê e que a tela usa para identificar a campanha por região.
      categorias: [],
      cidades,
      publico: "contatos",
      contato_ids: contatoIds,
      // 0303 — o número escolhido. Sem ele o motor escolheria por capability e
      // a campanha poderia sair por um número que não é o da operação.
      session_id: parsed.data.session_id,
      mensagem_tipo: TIPO_DA_MENSAGEM,
      mensagens: parsed.data.mensagens,
      template_name: null,
      template_language: null,
      template_contract_hash: null,
      template_values: {},
      // Uma mensagem por minuto é a regra do produto; explícito no banco para a
      // campanha não depender do default da coluna.
      espaco_ms: parsed.data.espaco_ms ?? 60_000,
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
    logger.error("[prospecting.campaigns.regiao] falha ao criar campanha", {
      requestId,
      organization_id: authz.org.orgId,
      erro: error?.message ?? "sem linha devolvida",
    });
    return fail("internal_error", "Erro ao criar a campanha por região.", 500, { requestId });
  }

  return ok(
    {
      id: data.id,
      contatos: contatoIds.length,
      sem_telefone: semTelefone,
      pedidos_lidos: pedidosLidos,
      contatos_lidos: contatosLidos,
      completa,
    },
    { requestId, status: 201 },
  );
}
