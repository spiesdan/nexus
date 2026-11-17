/**
 * GET /api/v1/ai/runs/:id — a TRILHA de um turno: o que entrou, com que
 * contexto, o que saiu e quais fontes foram consultadas.
 *
 * ## Por que existe (P0, medido em 17/11/2026)
 *
 * A lista de execuções responde "quanto custou e falhou?". Até a 0312 não
 * existia como responder **"por que ele disse isso?"**: `llm_calls` guardava
 * tokens/custo/erro e descartava entrada, contexto, saída e ferramentas. Este
 * endpoint lê exatamente as colunas que a 0312 passou a gravar — e devolve
 * `null` onde a linha é anterior à trilha, em vez de inventar string vazia.
 *
 * Rota separada, e não um campo da lista: prompt e mensagens somam dezenas de
 * KB por turno, e a lista de 100 execuções passaria a baixar megabytes para
 * mostrar latência.
 *
 * Guarda: `manager`, a mesma da lista (`ai_runs`). A trilha contém conversa de
 * cliente — não é leitura de viewer.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { PONTO_POR_ID } from "@/lib/ai/pontos/registro";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUNAS =
  "id, contact_id, purpose, provider, model, status, error_code, error_message, http_status, " +
  "origem_da_escolha, input_tokens, output_tokens, cost_cents, latency_ms, created_at, " +
  "prompt_system, prompt_messages, output_text, tool_calls, sources";

interface LinhaDaTrilha {
  id: string;
  contact_id: string | null;
  purpose: string;
  provider: string;
  model: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
  http_status: number | null;
  origem_da_escolha: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number | null;
  latency_ms: number | null;
  created_at: string;
  prompt_system: string | null;
  prompt_messages: unknown;
  output_text: string | null;
  tool_calls: unknown;
  sources: unknown;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ai_runs" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  if (!UUID_RX.test(id)) {
    return fail("invalid_request", "id inválido.", 400, { requestId });
  }

  const db = await createClient();
  const { data, error } = await db
    .from("llm_calls")
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .maybeSingle();

  if (error) return fail("query_failed", "Não foi possível ler a execução.", 500, { requestId });
  if (!data) return fail("not_found", "Execução não encontrada.", 404, { requestId });

  const linha = data as unknown as LinhaDaTrilha;
  const ponto = PONTO_POR_ID.get(linha.purpose);
  return ok(
    {
      ...linha,
      ponto_nome: ponto?.rotulo ?? linha.purpose,
      // A trilha só existe a partir da 0312. `tem_trilha` é o que a tela usa
      // para explicar a linha antiga em vez de desenhar um painel vazio.
      tem_trilha:
        linha.prompt_system !== null ||
        linha.prompt_messages !== null ||
        linha.output_text !== null ||
        linha.tool_calls !== null ||
        linha.sources !== null,
    },
    { requestId },
  );
}
