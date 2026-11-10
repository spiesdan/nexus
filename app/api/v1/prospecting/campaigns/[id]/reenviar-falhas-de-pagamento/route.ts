/**
 * POST /api/v1/prospecting/campaigns/[id]/reenviar-falhas-de-pagamento — devolve
 * à fila SÓ as mensagens que a Meta recusou por pagamento pendente (`131042`).
 *
 * ═══ POR QUE ESTA ROTA EXISTE ═══════════════════════════════════════════════
 *
 * O ledger `prospecting_sends` guarda a reserva mesmo quando o envio falha — de
 * propósito: apagar toda falha faria o tick insistir no mesmo número ruim a
 * cada minuto e queimar a cota do dia nele. Só que a recusa por PAGAMENTO não
 * fala nada sobre o contato: ela fala da fatura da Meta. Depois de paga, a
 * mesma mensagem passa — e sem esta rota as empresas recusadas nesse intervalo
 * ficam reservadas para sempre: a campanha não as reenvia, o progresso congela
 * e o operador vê "recusadas" sem nenhuma saída.
 *
 * Medido em 10/11/2026 na campanha `b4129d6b`: 113 mensagens recusadas com
 * 131042 entre 11:11Z e 14:45Z. Depois do pagamento, um envio às 14:47Z foi
 * entregue — prova de que a conta voltou a falar — e as 113 continuavam presas.
 *
 * ═══ POR QUE SÓ ESTE CÓDIGO ═════════════════════════════════════════════════
 *
 * `131026` (número inalcançável), `130472` (experimento) e `131049` (limite de
 * ecossistema) recusam de novo se repetidas; reenviar é assédio a quem nunca
 * vai receber. A allowlist é explícita e mora em `ehFalhaDePagamento` — código
 * novo que a Meta inventar NÃO entra na fila por padrão.
 *
 * ═══ A CONFIRMAÇÃO É HUMANA, DE PROPÓSITO ═══════════════════════════════════
 *
 * Ninguém aqui fala com o billing da Meta: "paguei" é um fato externo, que só
 * o operador conhece. Reenviar enquanto a fatura continua aberta gasta tentativa
 * e pode piorar a qualidade do número. Por isso a ação é um clique explícito na
 * tela de controle, com o botão desabilitado enquanto o número está num lote em
 * voo (mesma trava da `liberar-reservas`).
 *
 * Apagar a linha do ledger devolve o prospect ao `restantes` do agendador, que
 * o reenvia no ritmo do número (`espaco_ms`), dentro da janela e do limite
 * diário — nenhuma cota é furada por esta rota.
 */
import { randomUUID } from "node:crypto";

import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { porFatias } from "@/lib/db/por-fatias";
import { logger } from "@/lib/logger";
import { ehFalhaDePagamento } from "@/lib/prospeccao/resumo-de-envio";
import { disparoEmAndamento } from "@/lib/prospeccao/trava-de-disparo";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** `message_id` é o id de `messages`; só vale consultar o que parece uuid. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Params {
  params: Promise<{ id: string }>;
}

interface EnvioReservado {
  prospect_id: string;
  message_id: string | null;
}

interface MensagemDaRecusa {
  id: string;
  status: string | null;
  error_code: string | null;
}

export async function POST(_req: NextRequest, { params }: Params): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "prospecting_campaigns" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: campanha, error: erroCampanha } = await admin
    .from("prospecting_campaigns")
    .select("id")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();

  if (erroCampanha) {
    logger.error("[prospecting.campaign.reenviar-pagamento] falha ao ler a campanha", {
      requestId,
      organization_id: authz.org.orgId,
      campanha_id: id,
      erro: erroCampanha.message,
    });
    return fail("internal_error", "Erro ao abrir a campanha.", 500, { requestId });
  }
  if (!campanha) return fail("not_found", "Campanha não encontrada.", 404, { requestId });

  // Mesma trava da `liberar-reservas`: durante um "Enviar agora" o número tem
  // lease e as reservas sem comprovante são a VEZ na fila, não órfãs. Aqui as
  // linhas têm comprovante (por isso casam com `messages`), mas devolver 100
  // prospects à fila no meio de um lote mudaria o público debaixo do disparo.
  const disparo = await disparoEmAndamento(admin, { orgId: authz.org.orgId });
  if (disparo.ativo) {
    return fail(
      "state_conflict",
      "O número está enviando um lote agora. Espere terminar para reenviar as mensagens.",
      409,
      { requestId, details: { disparo_ate: disparo.ate } },
    );
  }

  const { data: envios, error: erroEnvios } = await admin
    .from("prospecting_sends")
    .select("prospect_id, message_id")
    .eq("organization_id", authz.org.orgId)
    .eq("campaign_id", id);

  if (erroEnvios) {
    logger.error("[prospecting.campaign.reenviar-pagamento] falha ao ler o ledger", {
      requestId,
      organization_id: authz.org.orgId,
      campanha_id: id,
      erro: erroEnvios.message,
    });
    return fail("internal_error", "Erro ao ler os envios da campanha.", 500, { requestId });
  }

  const reservas = (envios ?? []) as unknown as EnvioReservado[];
  const idsDeMensagem = [
    ...new Set(
      reservas
        .map((e) => e.message_id)
        .filter((m): m is string => typeof m === "string" && UUID.test(m)),
    ),
  ];

  const { linhas, falhas } = await porFatias(idsDeMensagem, async (fatia) => {
    const { data, error } = await admin
      .from("messages")
      .select("id, status, error_code")
      .eq("organization_id", authz.org.orgId)
      .in("id", fatia);
    return { linhas: (data ?? []) as unknown as MensagemDaRecusa[], erro: error ?? undefined };
  });

  // Fail-closed: com uma fatia ilegível não dá para saber quais recusas foram
  // por pagamento. Liberar "as que deram" misturaria `131026` na fila — e o
  // operador veria uma contagem menor do que a real sem saber por quê.
  if (falhas > 0) {
    logger.warn("[prospecting.campaign.reenviar-pagamento] recusas ilegíveis", {
      requestId,
      organization_id: authz.org.orgId,
      campanha_id: id,
      fatias_com_falha: falhas,
    });
    return fail(
      "internal_error",
      "Não foi possível conferir todas as recusas. Tente de novo em instantes.",
      500,
      { requestId },
    );
  }

  const porMensagem = new Map(linhas.map((m) => [m.id, m]));
  const prospectsParaReenviar: string[] = [];
  for (const reserva of reservas) {
    if (!reserva.message_id) continue;
    const mensagem = porMensagem.get(reserva.message_id);
    // `status: failed` E código de pagamento. Uma linha `sent` com código
    // antigo não entra: o desfecho atual é o que manda.
    if (mensagem?.status === "failed" && ehFalhaDePagamento(mensagem.error_code)) {
      prospectsParaReenviar.push(reserva.prospect_id);
    }
  }

  let liberadas = 0;
  // Em fatias: `.in()` vira query string e a lista pode ser longa (medido:
  // 500 UUIDs = 18 KB, HTTP 414).
  for (let i = 0; i < prospectsParaReenviar.length; i += 100) {
    const fatia = prospectsParaReenviar.slice(i, i + 100);
    const { data, error } = await admin
      .from("prospecting_sends")
      .delete()
      .eq("organization_id", authz.org.orgId)
      .eq("campaign_id", id)
      .in("prospect_id", fatia)
      .select("id");

    if (error) {
      logger.error("[prospecting.campaign.reenviar-pagamento] falha ao liberar", {
        requestId,
        organization_id: authz.org.orgId,
        campanha_id: id,
        liberadas_antes_da_falha: liberadas,
        erro: error.message,
      });
      return fail(
        "internal_error",
        liberadas > 0
          ? `${liberadas} mensagens voltaram para a fila, mas o restante não pôde ser liberado. Tente de novo.`
          : "Não foi possível devolver as mensagens para a fila.",
        500,
        { requestId, details: { liberadas } },
      );
    }
    liberadas += data?.length ?? 0;
  }

  if (liberadas > 0) {
    await audit({
      organizationId: authz.org.orgId,
      actorUserId: authz.user.id,
      action: "prospecting_campaign.updated",
      resourceType: "prospecting_campaigns",
      resourceId: id,
      requestId,
      metadata: { reenviar_falhas_de_pagamento: liberadas, codigo: "131042" },
    });
  }

  // Nada a reenviar não é erro: as recusas por pagamento já foram tratadas (ou
  // nunca existiram). A tela recarrega e o card some sozinho.
  return ok({ liberadas }, { requestId });
}
