import { type NextRequest } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const querySchema = z.object({
  range: z.enum(["7d", "30d", "90d"]).default("30d"),
  tenant_id: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsageTenantRow {
  organization_id: string;
  tenant_name: string;
  tenant_slug: string;
  messages_count: number;
  ai_invocations_count: number;
  ai_tokens_total: number;
  ai_cost_cents: number;
  conversations_count: number;
}

export interface DailyPoint {
  date: string;
  count: number;
}

export interface DailyCostPoint {
  date: string;
  cents: number;
}

export interface DailyTokensPoint {
  date: string;
  tokens: number;
}

export interface UsageSeries {
  messages: DailyPoint[];
  ai_cost: DailyCostPoint[];
  ai_tokens: DailyTokensPoint[];
}

export interface UsageData {
  range: "7d" | "30d" | "90d";
  tenants: UsageTenantRow[];
  series: UsageSeries;
}

// ---------------------------------------------------------------------------
// GET /api/v1/admin/usage
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const requestId = randomUUID();

  let adminCtx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    adminCtx = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return fail("validation_error", "Invalid query params", 400, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const { range, tenant_id } = parsed.data;
  const rangeMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
  const days = rangeMap[range] ?? 30;

  const admin = createAdminClient();

  // -------------------------------------------------------------------------
  // Per-tenant aggregates
  // -------------------------------------------------------------------------

  // Fetch organizations first (need name/slug)
  let orgsQuery = admin
    .from("organizations")
    .select("id, display_name, slug");
  if (tenant_id) {
    orgsQuery = orgsQuery.eq("id", tenant_id);
  }
  const { data: orgs, error: orgsError } = await orgsQuery;
  if (orgsError) {
    return fail("db_error", "Failed to fetch organizations", 500, { requestId });
  }

  const orgMap = new Map(
    (orgs ?? []).map((o: { id: string; display_name: string; slug: string }) => [
      o.id,
      { display_name: o.display_name, slug: o.slug },
    ]),
  );

  const orgIds = (orgs ?? []).map((o: { id: string }) => o.id);

  // Compute start date
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startIso = startDate.toISOString();

  // ---- contagens por org: `count` no banco, zero linha trafegada ----
  //
  // Antes: `select("organization_id")` da janela inteira e contagem em memória.
  // Com 90 dias de mensagens isso é baixar a tabela para somar um número. Agora
  // é `count: "exact", head: true` por organização — poucas orgs numa tela de
  // plataforma, e o banco devolve só o inteiro.
  const messagesCountMap = new Map<string, number>();
  const convsCountMap = new Map<string, number>();
  const aiInvCountMap = new Map<string, number>();
  if (orgIds.length > 0) {
    await Promise.all(
      orgIds.map(async (orgId: string) => {
        const [msg, conv, ia] = await Promise.all([
          admin
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .gte("created_at", startIso),
          admin
            .from("conversations")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .gte("created_at", startIso),
          admin
            .from("llm_calls")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .gte("created_at", startIso),
        ]);
        if (!msg.error && msg.count !== null) messagesCountMap.set(orgId, msg.count);
        if (!conv.error && conv.count !== null) convsCountMap.set(orgId, conv.count);
        if (!ia.error && ia.count !== null) aiInvCountMap.set(orgId, ia.count);
      }),
    );
  }

  // ---- consumo de IA por org: `llm_calls`, a tabela única (migration 0130) ----
  //
  // Lia `ai_invocations`, e a 0130 deixou essa tabela SEM NENHUM ESCRITOR:
  // `lib/ai/log-invocation.ts` passou a gravar em `llm_calls`. O painel de
  // plataforma continuaria somando o histórico congelado e, passados os 30 dias
  // da janela, mostraria ZERO consumo para todo tenant com o dinheiro saindo —
  // exatamente o sintoma que a 0130 existe para matar, reintroduzido na tela do
  // outro lado. `tests/unit/telemetria-tem-um-leitor-so.test.ts` guarda isto.
  //
  // TETO DECLARADO: tokens e custo são SOMA, e o PostgREST não faz `group by`.
  // Sem RPC de agregação, estas linhas são lidas uma vez para servir as duas
  // saídas (total por org e série diária) — antes eram duas leituras da mesma
  // janela. O custo cresce com o número de chamadas de IA no período; a saída é
  // uma RPC `sum(...) group by organization_id, dia`, que exige migration.
  const aiTokensMap = new Map<string, number>();
  const aiCostMap = new Map<string, number>();
  const aiCostDayMap = new Map<string, number>();
  const aiTokensDayMap = new Map<string, number>();
  if (orgIds.length > 0) {
    const filterOrgIds = tenant_id ? [tenant_id] : orgIds;
    const { data: aiRows, error: aiErr } = await admin
      .from("llm_calls")
      .select("organization_id, input_tokens, output_tokens, cost_cents, created_at")
      .in("organization_id", filterOrgIds)
      .gte("created_at", startIso);
    if (!aiErr && aiRows) {
      for (const row of aiRows) {
        const oid = row.organization_id as string;
        const tokens = ((row.input_tokens as number) ?? 0) + ((row.output_tokens as number) ?? 0);
        aiTokensMap.set(oid, (aiTokensMap.get(oid) ?? 0) + tokens);
        aiCostMap.set(oid, (aiCostMap.get(oid) ?? 0) + ((row.cost_cents as number) ?? 0));
        const day = (row.created_at as string).slice(0, 10);
        aiCostDayMap.set(day, (aiCostDayMap.get(day) ?? 0) + ((row.cost_cents as number) ?? 0));
        aiTokensDayMap.set(day, (aiTokensDayMap.get(day) ?? 0) + tokens);
      }
    }
  }

  // Build tenant rows
  const tenants: UsageTenantRow[] = (orgs ?? [])
    .map((org: { id: string }) => {
      const meta = orgMap.get(org.id) ?? { display_name: org.id, slug: "" };
      return {
        organization_id: org.id,
        tenant_name: meta.display_name,
        tenant_slug: meta.slug,
        messages_count: messagesCountMap.get(org.id) ?? 0,
        ai_invocations_count: aiInvCountMap.get(org.id) ?? 0,
        ai_tokens_total: aiTokensMap.get(org.id) ?? 0,
        ai_cost_cents: aiCostMap.get(org.id) ?? 0,
        conversations_count: convsCountMap.get(org.id) ?? 0,
      };
    })
    .sort(
      (a: UsageTenantRow, b: UsageTenantRow) =>
        b.ai_cost_cents - a.ai_cost_cents ||
        b.messages_count - a.messages_count,
    );

  // -------------------------------------------------------------------------
  // Daily series
  // -------------------------------------------------------------------------

  // Build date labels for last N days
  const dateLabels: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dateLabels.push(d.toISOString().slice(0, 10));
  }

  // messages per day
  const msgDayMap = new Map<string, number>();
  if (orgIds.length > 0) {
    const filterOrgIds = tenant_id ? [tenant_id] : orgIds;
    const { data: msgDays, error: msgDayErr } = await admin
      .from("messages")
      .select("created_at")
      .in("organization_id", filterOrgIds)
      .gte("created_at", startIso);
    if (!msgDayErr && msgDays) {
      for (const row of msgDays) {
        const day = (row.created_at as string).slice(0, 10);
        msgDayMap.set(day, (msgDayMap.get(day) ?? 0) + 1);
      }
    }
  }

  // ai cost + tokens per day: já calculados na leitura única de `llm_calls`
  // acima — não há segunda passada pela mesma janela.

  const series: UsageSeries = {
    messages: dateLabels.map((date) => ({
      date,
      count: msgDayMap.get(date) ?? 0,
    })),
    ai_cost: dateLabels.map((date) => ({
      date,
      cents: aiCostDayMap.get(date) ?? 0,
    })),
    ai_tokens: dateLabels.map((date) => ({
      date,
      tokens: aiTokensDayMap.get(date) ?? 0,
    })),
  };

  // -------------------------------------------------------------------------
  // Audit
  // -------------------------------------------------------------------------

  void audit({
    action: "platform_admin.usage_viewed",
    actorUserId: adminCtx.user.id,
    actingAsPlatformAdmin: true,
    metadata: { range, tenant_id: tenant_id ?? null },
    requestId,
  });

  return ok<UsageData>({ range, tenants, series }, { requestId });
}
