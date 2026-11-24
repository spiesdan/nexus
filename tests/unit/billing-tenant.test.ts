/**
 * A tela de billing é a única superfície de pagamento do tenant. Os estados
 * vêm da API — nunca de constante, nunca de "pagamento confirmado" local.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { estadoDaAssinatura } from "../../app/app/settings/billing/_client";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

const base = {
  fonte: "stripe",
  status: "active",
  valor_cents: 4900,
  moeda: "brl",
  vencimento: "2026-12-01T00:00:00Z",
  cancela_no_fim: false,
  id: "sub_1",
  avisos: [],
  proximos: [],
};

describe("estados da assinatura", () => {
  it("sem assinatura, ativa e pendente", () => {
    expect(estadoDaAssinatura({ ...base, status: "sem_assinatura" }, false)).toBe("sem_assinatura");
    expect(estadoDaAssinatura(base, false)).toBe("ativa");
    expect(estadoDaAssinatura({ ...base, status: "past_due" }, false)).toBe("pendente");
    expect(estadoDaAssinatura({ ...base, status: "unpaid" }, false)).toBe("pendente");
  });

  it("sem Stripe e suspensa", () => {
    expect(estadoDaAssinatura({ ...base, fonte: "local_cache" }, false)).toBe("sem_stripe");
    expect(estadoDaAssinatura(base, true)).toBe("suspensa");
    expect(estadoDaAssinatura({ ...base, status: "suspenso" }, false)).toBe("suspensa");
  });

  it("falha para status desconhecido", () => {
    expect(estadoDaAssinatura({ ...base, status: "incomplete_expired" }, false)).toBe("pendente");
    expect(estadoDaAssinatura({ ...base, status: "outro" }, false)).toBe("falha");
  });
});

describe("contrato da tela", () => {
  const client = ler("app/app/settings/billing/_client.tsx");
  const rota = ler("app/api/v1/billing/subscription/route.ts");

  it("tudo vem da API, nada de plano/preço constante", () => {
    expect(client).toContain('"/api/v1/billing/subscription"');
    expect(rota).toContain("valor_cents: preco?.unit_amount ?? null");
    expect(client).toContain("plano não configurado");
    expect(client).not.toMatch(/R\$\s?\d/);
  });

  it("ação por estado, sem cartão exposto", () => {
    expect(client).toContain('"/api/v1/billing/checkout"');
    expect(client).toContain('"/api/v1/billing/portal"');
    expect(client).not.toMatch(/card_number|last4|cvv/);
  });

  it("suspensa linka a tela que já existe", () => {
    expect(client).toContain('href="/account-suspended"');
  });

  it("avisos e próximas etapas vêm do banco/serviço, não de texto fixo", () => {
    expect(rota).toContain('.from("billing_notices")');
    expect(rota).toContain("ETAPAS.filter");
    expect(client).toContain("Avisos de vencimento");
  });

  it("nenhum 'pagamento confirmado' local", () => {
    expect(client).not.toContain("Pagamento confirmado");
  });
});
