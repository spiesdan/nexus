/**
 * O ESTADO DE UMA SESSÃO DE CANAL, perguntado ao banco — não ao transporte.
 *
 * ─── Por que este módulo existe ───────────────────────────────────────────
 *
 * O onboarding precisa responder uma pergunta antes de dar um passo por cumprido:
 * "este número está conectado AGORA?". A resposta não pode vir do clique nem do
 * que o navegador afirma: o wizard já marcou conexão com a loja desconectada e
 * com um número nunca pareado, e o efeito só aparecia depois, como mensagem que
 * não sai.
 *
 * A fonte de verdade é `channel_sessions.status`, que o polling da própria tela
 * mantém atualizado a partir do transporte. Ler a linha evita uma segunda ida ao
 * transporte no meio de uma Server Action e mantém a resposta coerente com o que
 * a tela acabou de mostrar.
 *
 * ─── Por que mora em lib/channels/ ────────────────────────────────────────
 *
 * O nome da coluna que amarra a sessão ao transporte (`waha_session_name`) é
 * detalhe de provider. O invariante 1 da doutrina de restrição de canal proíbe
 * que uma FEATURE o nomeie (`pnpm lint:channels`) — e `lib/channels/` é o único
 * lugar autorizado a conhecê-lo. Quem precisa da resposta pergunta a este
 * módulo, não ao schema.
 */
import type { createClient } from "@/lib/supabase/server";

import { ARCHIVED_AT, queryTolerantToMissingArchived } from "./archived";

export interface SessaoDoCanal {
  id: string;
  status: string;
}

type ClienteDeSessao = Awaited<ReturnType<typeof createClient>>;

/**
 * A sessão ATIVA (não arquivada) desta organização com este nome, ou `null`.
 *
 * A sessão do onboarding tem nome derivado da organização, então há no máximo
 * uma linha viva por nome. `status` é o enum do CHECK de `channel_sessions`.
 */
export async function lerSessaoDoCanal(
  supabase: ClienteDeSessao,
  organizationId: string,
  nomeDaSessao: string,
): Promise<{ sessao: SessaoDoCanal | null; schemaOutdated: boolean }> {
  const base = () =>
    supabase
      .from("channel_sessions")
      .select("id, status")
      .eq("organization_id", organizationId)
      .eq("waha_session_name", nomeDaSessao);

  const { data, error, schemaOutdated } = await queryTolerantToMissingArchived(
    () => base().is(ARCHIVED_AT, null).maybeSingle(),
    () => base().maybeSingle(),
  );

  if (error) throw new Error(error.message);
  return { sessao: (data as SessaoDoCanal | null) ?? null, schemaOutdated };
}
