/**
 * "Tempo no estágio" do card mede ENTRADA no estágio, não a última atividade.
 *
 * `crm_leads.stage_changed_at` existe desde a Wave 3 e é carimbada pelo trigger
 * `trg_stamp_stage_changed_at` (baseline.sql:8365-8381). O card ignorava a
 * coluna e usava `last_activity_at`: um lead parado em Proposta há três dias,
 * mas com uma nota escrita agora, aparecia como "em Proposta" há minutos — e o
 * número que existe para responder "este card está parado?" respondia outra
 * pergunta. O teste é discriminante de propósito: atividade de agora, estágio
 * de três dias atrás.
 */
import { describe, expect, it } from "vitest";

import { buildCardInput } from "@/lib/kanban/card-state";
import type { Lead } from "@/lib/types/leads";

const AGORA = new Date("2026-11-17T12:00:00Z");

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: "l1",
    organization_id: "org",
    pipeline_id: "p1",
    stage_id: "s1",
    contact_id: "c1",
    title: "Lead de prova",
    description: null,
    value_cents: null,
    currency: "BRL",
    status: "open",
    lost_reason: null,
    position_in_stage: 1,
    owner_kind: "user",
    owner_user_id: "u1",
    owner_agent_id: null,
    assigned_at: null,
    last_activity_at: "2026-11-17T11:59:00Z",
    stage_changed_at: "2026-11-14T12:00:00Z",
    created_at: "2026-11-01T12:00:00Z",
    updated_at: "2026-11-17T11:59:00Z",
    tags: [],
    custom_fields: {},
    ...over,
  } as Lead;
}

const opts = { stageName: "Proposta", ownerNames: new Map<string, string | null>() };

describe("tempo no estágio", () => {
  it("conta desde stage_changed_at, não desde a última atividade", () => {
    const card = buildCardInput(lead(), { ...opts, now: AGORA });
    expect(card.hoursInStage).toBe(72);
  });

  it("sem stage_changed_at (linha anterior ao backfill), cai para created_at", () => {
    const card = buildCardInput(lead({ stage_changed_at: null }), { ...opts, now: AGORA });
    // 01/11 12:00 → 17/11 12:00 = 16 dias.
    expect(card.hoursInStage).toBe(16 * 24);
  });

  it("nunca é negativo, mesmo com o relógio do servidor atrás do banco", () => {
    const card = buildCardInput(lead({ stage_changed_at: "2026-11-18T12:00:00Z" }), {
      ...opts,
      now: AGORA,
    });
    expect(card.hoursInStage).toBe(0);
  });
});
