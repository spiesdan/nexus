/**
 * POST /api/v1/conversations/arquivar-todas — esvazia a fila do Inbox.
 *
 * ═══ O QUE "ZERAR" SIGNIFICA AQUI, E O QUE NÃO SIGNIFICA ═════════════════
 *
 * "Zerar o inbox" tem uma leitura tentadora: apagar. Não é isso, e a diferença
 * é de produto, não de estilo:
 *
 * - **Arquiva** a conversa: sai das abas Fila/Minhas/Todas, zera as não-lidas,
 *   e o histórico continua lá para quando alguém perguntar "o que você
 *   mandou para aquele número em October".
 * - **Não apaga** `messages`. Há retenção, há auditoria, e há gente que
 *   descobre uma divergência comercial semanas depois. Apagar a conversa para
 *   "limpar a tela" troca um problema pequeno (tela cheia) por um que não tem
 *   volta (prova que sumiu).
 *
 * O que muda amanhã é a FILA: começa do zero, com o que o operador escolher
 * marcar.
 *
 * ═══ POR QUE ISSO É `manager` E NÃO `agent` ══════════════════════════════
 *
 * Arquivar em lote tira do trabalho de todo mundo da organização ao mesmo
 * tempo. Um `agent` precisa da conversa que está na frente dele; ninguém
 * precisa de "limpar a fila" como parte do turno. Já `POST /conversations/[id]`
 * continua `agent` — o individual é do dia a dia, o coletivo é decisão de quem
 * responde pelo inbox.
 */
import { randomUUID } from "node:crypto";

import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { CONVERSATION_TERMINAL_STATUSES } from "@/lib/schemas/messaging";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Teto por chamada. Acima disso a operação é grande demais para um request. */
const TEETO_DE_CONVERSAS = 5000;

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  // Confirmação explícita no corpo. Sem ela, um `POST` de duplo clique — ou um
  // retry de proxy — já teria limpado a fila do time inteiro. O padrão é
  // `false`: quem quer, pede.
  let corpo: { confirmar?: boolean } = {};
  try {
    corpo = (await req.json().catch(() => ({}))) as { confirmar?: boolean };
  } catch {
    corpo = {};
  }
  if (corpo.confirmar !== true) {
    return fail(
      "validation_failed",
      'Envie {"confirmar": true} para confirmar o arquivamento em lote.',
      400,
      { requestId },
    );
  }

  const admin = createAdminClient();

  // Os ids primeiro, o update depois por `in`. Um `update` sem filtro de id
  // Rewriteria a tabela inteira e o `count` do PostgREST em update não é
  // confiável para "quantas eu mudei"; com a lista na mão, o número que a tela
  // mostra é exatamente o número de ids enviados.
  const { data: alvo, error: errAlvo } = await admin
    .from("conversations")
    .select("id")
    .eq("organization_id", orgId)
    .not("status", "in", `(${CONVERSATION_TERMINAL_STATUSES.join(",")})`)
    .limit(TEETO_DE_CONVERSAS);
  if (errAlvo) return fail("internal_error", "Erro ao ler as conversas.", 500, { requestId });

  const ids = ((alvo ?? []) as Array<{ id: string }>).map((c) => c.id);
  if (ids.length === 0) return ok({ arquivadas: 0 }, { requestId });

  // Só `status`, `status_changed_at` e as não-lidas.
  //
  // NÃO se escreve `comando_da_conversa` — ela NÃO é coluna: em
  // `supabase/baseline.sql:17146` é a FUNÇÃO `public.comando_da_conversa(c
  // conversations)`, resolvida pelo PostgREST no `?select=`. Escrever nela dá
  // "column does not exist" e derrubaria TODO o arquivamento com 500 — e,
  // pior, alguém leria o 500 como "o arquivamento está quebrado" quando o que
  // quebrou foi o campo que não devia ser escrito.
  //
  // O "quem manda" (`arquivada` → fora de todas as filas) é derivado do
  // próprio status, então mudar o status basta.
  const { error } = await admin
    .from("conversations")
    .update({
      status: "archived",
      status_changed_at: new Date().toISOString(),
      unread_count_for_assignee: 0,
    })
    .eq("organization_id", orgId)
    .in("id", ids);

  if (error) return fail("internal_error", "Erro ao arquivar as conversas.", 500, { requestId });

  const arquivadas = ids.length;

  await audit({
    action: "conversation.archived_all",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "conversation",
    requestId,
    metadata: { arquivadas },
  });

  return ok({ arquivadas }, { requestId });
}
