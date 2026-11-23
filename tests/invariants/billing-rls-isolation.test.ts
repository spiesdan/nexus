import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql, writeCountAs } from "./gov-helpers";

/**
 * 0343 — as oito tabelas de cobrança são tenant-aware de verdade.
 * Dois tenants, leitura isolada e ZERO escrita para `authenticated`.
 */
const ORG_A = "0343aaaa-0000-4000-8000-000000000001";
const ORG_B = "0343bbbb-0000-4000-8000-000000000002";
const USER_A = "0343cccc-0000-4000-8000-000000000003";

const TABELAS = [
  "billing_customers",
  "billing_subscriptions",
  "billing_invoices",
  "billing_checkout_sessions",
  "billing_notices",
  "billing_events",
  "billing_verifications",
  "billing_suspensions",
] as const;

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values ('${USER_A}', 'billing-a@nexus.test')
    on conflict (id) do nothing;
    insert into public.organizations (id, slug, display_name, legal_name)
    values ('${ORG_A}', 'billing-a', 'Billing A', 'Billing A'),
           ('${ORG_B}', 'billing-b', 'Billing B', 'Billing B')
    on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
    values ('${USER_A}', '${ORG_A}', 'admin', now())
    on conflict do nothing;

    insert into public.billing_customers (organization_id, stripe_customer_id)
    values ('${ORG_A}', 'cus_a'), ('${ORG_B}', 'cus_b');
    insert into public.billing_subscriptions (organization_id, customer_id, stripe_subscription_id, status)
    select c.organization_id, c.id, 'sub_' || c.stripe_customer_id, 'active'
      from public.billing_customers c;
    insert into public.billing_invoices (organization_id, subscription_id, stripe_invoice_id, amount_cents, currency, status)
    select s.organization_id, s.id, 'in_' || s.stripe_subscription_id, 1000, 'BRL', 'open'
      from public.billing_subscriptions s;
    insert into public.billing_checkout_sessions (organization_id, stripe_session_id, status)
    values ('${ORG_A}', 'cs_a', 'open'), ('${ORG_B}', 'cs_b', 'open');
    insert into public.billing_notices (organization_id, invoice_id, etapa, canal, resultado)
    select i.organization_id, i.id, 3, 'email', 'pendente' from public.billing_invoices i;
    insert into public.billing_events (stripe_event_id, organization_id, tipo, payload_hash)
    values ('evt_a', '${ORG_A}', 'invoice.paid', 'a'), ('evt_b', '${ORG_B}', 'invoice.paid', 'b');
    insert into public.billing_verifications (organization_id, kind)
    values ('${ORG_A}', 'stripe_indisponivel'), ('${ORG_B}', 'stripe_indisponivel');
    insert into public.billing_suspensions (organization_id, invoice_id, estado, motivo, autor)
    select i.organization_id, i.id, 'suspensa', 'billing', 'sistema' from public.billing_invoices i;
  `);
});

describe("0343 — RLS das tabelas de cobrança", () => {
  for (const tabela of TABELAS) {
    it(`${tabela}: membro da org A vê só as linhas da própria org`, () => {
      expect(countAs(USER_A, `select count(*) from public.${tabela}`)).toBe(1);
    });

    it(`${tabela}: authenticated NÃO escreve`, () => {
      expect(
        writeCountAs(USER_A, `insert into public.${tabela} (organization_id) values ('${ORG_A}')`),
      ).toBe(0);
    });
  }

  it("sem membership (usuário de outra org) não lê nenhuma tabela", () => {
    for (const tabela of TABELAS) {
      expect(
        countAs("0343dddd-0000-4000-8000-000000000004", `select count(*) from public.${tabela}`),
      ).toBe(0);
    }
  });

  it("as oito tabelas existem", () => {
    for (const tabela of TABELAS) {
      expect(sql(`select to_regclass('public.${tabela}') is not null`)).toBe("t");
    }
  });
});
