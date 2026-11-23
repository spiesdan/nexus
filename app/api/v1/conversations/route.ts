/**
 * GET /api/v1/conversations — list inbox (handler em ./_handler.ts).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { listConversationsQuerySchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { comNomeDoAtendente } from "@/lib/users/com-nome-do-atendente";

import { listConversationsHandler } from "./_handler";


import { comMetricas } from "@/lib/observabilidade/rotas";
export const dynamic = "force-dynamic";

async function get(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const supabase = await createClient();

  // UM getUser por request, não dois. Antes esta rota chamava
  // `supabase.auth.getUser()` e DEPOIS `loadAuthUser()`, que chama `getUser()`
  // de novo — duas idas ao GoTrue + duas queries de membership só para abrir a
  // lista. `AuthUser` já traz id/email; não há segunda verdade a buscar.
  const authUser = await loadAuthUser();
  if (!authUser) {
    return fail("unauthenticated", "Auth required.", 401, { requestId });
  }
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) {
    return fail("no_active_org", "No active organization.", 403, { requestId });
  }

  const url = new URL(req.url);
  const qsParsed = listConversationsQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    exclude_finished: url.searchParams.get("exclude_finished") === "true" ? true : undefined,
    assigned_to: url.searchParams.get("assigned_to") ?? undefined,
    // QUEM MANDA na conversa (migration 0203) — o filtro das abas Fila e
    // Automático. Faltar aqui é a MESMA rotura que o `tag` teve logo abaixo: o
    // schema aceita, o hook serializa, o handler implementa, e esta linha não lê
    // — a lista volta INTEIRA, sem erro nenhum. Como o badge vem de OUTRA rota
    // (que leu o filtro certo), a tela chega a se contradizer sozinha: medido no
    // CI em 2026-08-31, a aba dizia "Fila 1" e listava 5 conversas embaixo.
    // Agora `tests/unit/rota-le-todo-filtro-do-schema.test.ts` reprova o próximo
    // esquecimento, em vez de este comentário pedir atenção.
    comando: url.searchParams.get("comando") ?? undefined,
    // O `tag` era o único param que o schema aceitava, o hook serializava e o
    // handler implementava — e que esta linha não lia. A cadeia rompia AQUI, no
    // meio: `InboxFilters` mostra o select "Filtrar por tag" sempre que a org tem
    // vocabulário, o browser manda `?tag=vip`, e a lista voltava inteira, sem erro.
    // Achado por @jmpo, no cabeçalho do teste que ele escreveu no PR #199.
    tag: url.searchParams.get("tag") ?? undefined,
    channel_session_id: url.searchParams.get("channel_session_id") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!qsParsed.success) {
    return fail("validation_failed", "Query inválida.", 422, {
      details: qsParsed.error.flatten().fieldErrors as Record<string, unknown>,
      requestId,
    });
  }

  try {
    const { conversations, cursor, has_more } = await listConversationsHandler(
      supabase,
      {
        organization_id: activeOrg.orgId,
        actor: { type: "user", id: authUser.id },
        requestId,
      },
      qsParsed.data,
    );
    // O nome de quem atende entra AQUI, na borda HTTP, e não no handler: o
    // handler é compartilhado com as tools MCP, que já resolvem o nome por conta
    // própria (`lib/mcp/tools/conversations.ts`) — enriquecer lá faria a mesma
    // leitura duas vezes por chamada do agente.
    return ok(await comNomeDoAtendente(conversations), {
      requestId,
      meta: { cursor, has_more },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    return fail("internal_error", "Erro interno.", 500, { requestId });
  }
}

export const GET = comMetricas("/api/v1/conversations", get);
