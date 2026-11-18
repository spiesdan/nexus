import { describe, expect, it } from "vitest";

import {
  hashDaCorrecao,
  planejarAntecipacao,
  planejarLiberacaoConversa,
  type ConversaCorrigivel,
  type JobCorrigivel,
} from "./correcao";
import { correcaoDeConversaSuportada, correcaoDeJobSuportada } from "./correcao-constantes";

const AGORA = "2026-11-18T18:00:00.000Z";

function job(over: Partial<JobCorrigivel> = {}): JobCorrigivel {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: "org-1",
    kind: "watchdog",
    status: "pending",
    run_after: "2026-11-18T14:00:00.000+00:00",
    attempts: 1,
    max_attempts: 5,
    ...over,
  };
}

describe("correção aprovada — antecipar job de manutenção", () => {
  it("só a regra/entidade do job de manutenção tem correção", () => {
    expect(correcaoDeJobSuportada("operacao.job_fila_travado", "job_queue")).toBe(true);
    expect(correcaoDeJobSuportada("fiscal.nota_rejeitada", "invoices")).toBe(false);
    expect(correcaoDeJobSuportada("operacao.recebivel_duplicado", "financial_receivables")).toBe(
      false,
    );
    expect(correcaoDeJobSuportada("operacao.job_fila_travado", "invoices")).toBe(false);
  });

  it("job watchdog pending e atrasado é elegível; antes/depois/hash são exatos", () => {
    const r = planejarAntecipacao(job(), AGORA);
    expect(r.elegivel).toBe(true);
    if (!r.elegivel) return;

    expect(r.plano.antes.run_after).toBe("2026-11-18T14:00:00.000+00:00");
    expect(r.plano.depois.run_after).toBe(AGORA);
    expect(r.plano.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.plano.hash).toBe(
      hashDaCorrecao(job().id, "2026-11-18T14:00:00.000+00:00", AGORA),
    );
  });

  it("recusa job de atendimento, running/dead, não atrasado e sem tentativa", () => {
    expect(planejarAntecipacao(job({ kind: "inbound_turn" }), AGORA)).toMatchObject({
      elegivel: false,
    });
    expect(planejarAntecipacao(job({ kind: "followup_turn" }), AGORA)).toMatchObject({
      elegivel: false,
    });
    expect(planejarAntecipacao(job({ status: "running" }), AGORA)).toMatchObject({
      elegivel: false,
    });
    expect(planejarAntecipacao(job({ status: "dead" }), AGORA)).toMatchObject({
      elegivel: false,
    });
    expect(
      planejarAntecipacao(job({ run_after: "2026-11-18T17:30:00.000+00:00" }), AGORA),
    ).toMatchObject({ elegivel: false });
    expect(planejarAntecipacao(job({ attempts: 5, max_attempts: 5 }), AGORA)).toMatchObject({
      elegivel: false,
    });
    expect(planejarAntecipacao(null, AGORA)).toMatchObject({ elegivel: false });
  });

  it("o hash muda se o antes ou o depois mudar — executar outro plano não casa", () => {
    const base = hashDaCorrecao("job-1", "2026-11-18T14:00:00.000+00:00", AGORA);
    expect(hashDaCorrecao("job-1", "2026-11-18T15:00:00.000+00:00", AGORA)).not.toBe(base);
    expect(
      hashDaCorrecao("job-1", "2026-11-18T14:00:00.000+00:00", "2026-11-18T18:00:01.000Z"),
    ).not.toBe(base);
  });
});

function conversa(over: Partial<ConversaCorrigivel> = {}): ConversaCorrigivel {
  return {
    id: "conversa-1",
    organization_id: "org-1",
    status: "claimed",
    assigned_to_user_id: "atendente-1",
    assigned_at: "2026-11-08T12:00:00.000+00:00",
    last_message_at: "2026-11-09T12:00:00.000+00:00",
    ...over,
  };
}

describe("correção aprovada — liberar claim de conversa", () => {
  it("só a regra/entidade da conversa tem este caso", () => {
    expect(correcaoDeConversaSuportada("operacao.conversa_claim_parado", "conversations")).toBe(
      true,
    );
    expect(correcaoDeConversaSuportada("fiscal.nota_rejeitada", "invoices")).toBe(false);
    expect(correcaoDeConversaSuportada("operacao.conversa_claim_parado", "contacts")).toBe(false);
  });

  it("claim de 10 dias sem mensagem é elegível; antes/depois/hash exatos", () => {
    const r = planejarLiberacaoConversa(conversa(), AGORA);
    expect(r.elegivel).toBe(true);
    if (!r.elegivel) return;
    expect(r.plano.antes).toEqual({
      atendente_id: "atendente-1",
      assigned_at: "2026-11-08T12:00:00.000+00:00",
    });
    expect(r.plano.depois).toEqual({ status: "open", atendente_id: null, assigned_at: null });
    expect(r.plano.hash).toBe(
      hashDaCorrecao(
        "conversa-1",
        "atendente-1|2026-11-08T12:00:00.000+00:00",
        "open",
      ),
    );
  });

  it("recusa claim recente, mensagem recente, sem responsável e status não-claimed", () => {
    expect(
      planejarLiberacaoConversa(
        conversa({ assigned_at: "2026-11-16T12:00:00.000Z", last_message_at: null }),
        AGORA,
      ),
    ).toMatchObject({ elegivel: false });
    expect(
      planejarLiberacaoConversa(
        conversa({ last_message_at: "2026-11-17T12:00:00.000Z" }),
        AGORA,
      ),
    ).toMatchObject({ elegivel: false });
    expect(
      planejarLiberacaoConversa(conversa({ assigned_to_user_id: null }), AGORA),
    ).toMatchObject({ elegivel: false });
    expect(planejarLiberacaoConversa(conversa({ status: "open" }), AGORA)).toMatchObject({
      elegivel: false,
    });
    expect(planejarLiberacaoConversa(null, AGORA)).toMatchObject({ elegivel: false });
  });
});
