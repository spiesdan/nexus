/**
 * GET /api/v1/conversations/counts — contagens por visão do inbox (G4-02).
 *
 * Usa o client user-scoped (cookie session) → toda contagem HERDA a RLS de
 * SELECT de `conversations` (fn_can_view_conversation, migration 0035). Um agent
 * em modo own* recebe a contagem do SEU escopo, NUNCA o total da org — a mesma
 * garantia do listing.
 *
 * ═══ POR QUE UMA VARREDURA, E NÃO QUATRO CONSULTAS ═══════════════════════════
 *
 * Até a 1.52.2 esta rota disparava quatro `count: "exact", head: true` em
 * paralelo. Cada um varria `conversations` inteira, e a RLS desta tabela chama
 * `fn_can_view_conversation()` e `fn_can_view_channel()` POR LINHA — cada uma
 * com três subconsultas de papel. Medido na VPS em 2026-11-13: ~1,2 s de média,
 * pico de 7991 ms contra o `statement_timeout` de 8 s do role `authenticated`,
 * e a Inbox recebia 500 (`57014 statement timeout`).
 *
 * Agora é UM RPC (`fn_conversas_contagens`, migration 0310): a mesma varredura
 * responde as quatro perguntas com `count(*) filter`, em 799 ms. O RPC é
 * `security invoker`, então a RLS continua valendo — o ganho é não repetir a
 * varredura, não desligar a proteção.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { CONVERSATION_TERMINAL_STATUSES } from "@/lib/schemas";
import { orgTemAutomatico } from "@/lib/ai/agents/org-tem-automatico";
import { comandosDaFila } from "@/lib/inbox/comando-da-conversa";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface ContagensDoInbox {
  fila: number;
  automatico: number;
  mine: number;
  all: number;
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return fail("unauthenticated", "Auth required.", 401, { requestId });
  }

  const authUser = await loadAuthUser();
  const activeOrg = authUser ? await resolveActiveOrg(authUser) : null;
  if (!activeOrg) {
    return fail("no_active_org", "No active organization.", 403, { requestId });
  }

  // O fato ORG-WIDE resolvido ANTES da contagem, porque ele escolhe QUAL
  // conjunto de comandos a Fila pede. `undefined` (não deu para saber) segue a
  // convenção da regra: assume que há automático.
  const automaticoDaOrg = await orgTemAutomatico(supabase, activeOrg.orgId);

  const { data, error } = await supabase.rpc("fn_conversas_contagens", {
    p_org: activeOrg.orgId,
    p_me: user.id,
    // A FILA DEIXOU DE SER "sem dono + status de espera": ela conta o mesmo
    // predicado que a aba pede — e o espelhamento entre badge e aba é vigiado
    // por `tests/unit/badge-espelha-a-aba.test.ts`.
    p_comandos: comandosDaFila(automaticoDaOrg),
    // `exclude_finished` da aba "Minhas": fechar não solta o dono (histórico que
    // vale), então o badge sem os terminais precisa do mesmo conjunto da aba.
    p_terminais: [...CONVERSATION_TERMINAL_STATUSES],
  });

  if (error) {
    return fail("internal_error", error.message, 500, { requestId });
  }

  const contagens = data as unknown as ContagensDoInbox;
  return ok(
    {
      fila: contagens.fila ?? 0,
      automatico: contagens.automatico ?? 0,
      // `unassigned` continua respondendo, com o MESMO valor de `fila`. É rota
      // `/api/v1/` versionada: campo não some de uma versão para outra, e um
      // cliente com a página aberta desde antes do deploy segue lendo o nome
      // velho até recarregar.
      unassigned: contagens.fila ?? 0,
      mine: contagens.mine ?? 0,
      all: contagens.all ?? 0,
    },
    { requestId },
  );
}
