/**
 * GET /api/v1/alertas — o que o Meu Dia mostra, e nada mais.
 *
 * ─── Por que uma API e não a tela lendo direto ──────────────────────────────
 *
 * Porque a mesma linha tem que aparecer no Meu Dia, na agenda e nas
 * notificações — e o pedido original proíbe três pendências independentes para o
 * mesmo evento. Uma API só, lida pelos três, é o que garante que resolver em um
 * resolve nos outros.
 *
 * ─── O que a API NÃO faz ─────────────────────────────────────────────────────
 *
 * Não resolve alerta, não cria e não recalcula. Ela lê o que a rotina gravou. Se
 * o alerta sumiu, é porque a rotina rodou e a condição deixou de valer — e não
 * porque a tela decidiu que já passou.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  origem: z
    .enum(["nf_pendente", "fora_da_carga", "vencimento_proximo", "vencimento_vencido"])
    .optional(),
  prioridade: z.enum(["baixa", "normal", "alta", "critica"]).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(50),
});

const COLUNAS =
  "id, chave, origem_tipo, origem_id, titulo, descricao, acao_recomendada, " +
  "href, prioridade, repeticoes, created_at, updated_at";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("viewer", { requestId, resource: "operational_alerts" });
  if (!authz.ok) return authz.response;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    origem: url.searchParams.get("origem") ?? undefined,
    prioridade: url.searchParams.get("prioridade") ?? undefined,
    limite: url.searchParams.get("limite") ?? undefined,
  });
  if (!parsed.success) {
    return fail("validation_failed", "Filtros inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();

  // `viewer` é o papel mínimo: ver um aviso não é agir sobre ele. Quem resolve
  // precisa de mais, e essa verificação fica no PATCH — que é outro arquivo.
  let q = supabase
    .from("operational_alerts")
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .eq("status", "aberto")
    .order("updated_at", { ascending: false })
    .limit(parsed.data.limite);

  if (parsed.data.origem) q = q.eq("origem_tipo", parsed.data.origem);
  if (parsed.data.prioridade) q = q.eq("prioridade", parsed.data.prioridade);

  const { data, error } = await q;
  if (error) {
    return fail("internal_error", "Erro ao ler os alertas.", 500, { requestId });
  }

  const alertas = (data ?? []) as unknown as {
    id: string;
    chave: string;
    origem_tipo: string;
    origem_id: string | null;
    titulo: string;
    descricao: string | null;
    acao_recomendada: string | null;
    href: string | null;
    prioridade: string;
    repeticoes: number;
    created_at: string;
    updated_at: string;
  }[];

  // A contagem por origem vem da MESMA consulta, no backend — três queries no
  // cliente seriam três renderizações com três estados de "carregando".
  const porOrigem: Record<string, number> = {};
  for (const a of alertas) {
    porOrigem[a.origem_tipo] = (porOrigem[a.origem_tipo] ?? 0) + 1;
  }

  return ok(
    {
      alertas: alertas.map((a) => ({
        id: a.id,
        chave: a.chave,
        origem: a.origem_tipo,
        origem_id: a.origem_id,
        titulo: a.titulo,
        descricao: a.descricao,
        acao_recomendada: a.acao_recomendada,
        href: a.href,
        prioridade: a.prioridade,
        repeticoes: a.repeticoes,
        atualizado_em: a.updated_at,
        criado_em: a.created_at,
      })),
      por_origem: porOrigem,
      total: alertas.length,
    },
    { requestId },
  );
}
