/**
 * SEMENTE DE EVIDÊNCIA — as quatro situações de `/admin/billing`.
 *
 * Cria (idempotente, por slug) quatro organizações `demo-cobranca-*`:
 * ativa, em atraso (com duas faturas falhas), sem assinatura e não verificada
 * (cliente Stripe sem nenhuma leitura). É o cenário das capturas de
 * `tests/captura-billing-plataforma.ts`; não faz parte do produto e só roda
 * contra o Supabase LOCAL, como os demais `seed-e2e-*`.
 *
 * Uso:
 *   pnpm e2e:env
 *   set -a; . ./.env.e2e; set +a
 *   pnpm exec tsx scripts/seed-e2e-billing-demo.ts
 */
import { createClient } from "@supabase/supabase-js";

import { anunciarDestino, credenciaisSupabaseDeTeste } from "./lib/env-de-teste";

const credenciais = credenciaisSupabaseDeTeste();
anunciarDestino("seed-e2e-billing-demo", credenciais);

const db = createClient(credenciais.url, credenciais.serviceRole, {
  auth: { persistSession: false },
});

const ORGS = [
  { slug: "demo-cobranca-ativa", nome: "Padaria Aurora" },
  { slug: "demo-cobranca-atraso", nome: "Clínica Bem Viver" },
  { slug: "demo-cobranca-sem-assinatura", nome: "Açaí do Bairro" },
  { slug: "demo-cobranca-nao-verificada", nome: "Loja Horizonte" },
];

async function main() {
  const { data: existentes } = await db
    .from("organizations")
    .select("id, slug")
    .like("slug", "demo-cobranca-%");
  for (const org of existentes ?? []) {
    await db.from("organizations").delete().eq("id", org.id);
  }

  const ids: Record<string, string> = {};
  for (const org of ORGS) {
    const { data, error } = await db
      .from("organizations")
      .insert({
        slug: org.slug,
        display_name: org.nome,
        legal_name: `${org.nome} Ltda`,
        status: "active",
      })
      .select("id")
      .single();
    if (error) throw new Error(`${org.slug}: ${error.message}`);
    ids[org.slug] = data.id;
  }

  async function cliente(slug: string, cus: string) {
    const { data, error } = await db
      .from("billing_customers")
      .insert({ organization_id: ids[slug], stripe_customer_id: cus })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  async function assinatura(
    orgId: string,
    customerId: string,
    sub: string,
    status: string,
    fim: string,
  ) {
    const { data, error } = await db
      .from("billing_subscriptions")
      .insert({
        organization_id: orgId,
        customer_id: customerId,
        stripe_subscription_id: sub,
        status,
        current_period_end: fim,
        cancel_at_period_end: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  async function fatura(
    orgId: string,
    subId: string,
    inv: string,
    status: string,
    due: string,
    paid: string | null,
    created: string,
  ) {
    const { error } = await db.from("billing_invoices").insert({
      organization_id: orgId,
      subscription_id: subId,
      stripe_invoice_id: inv,
      numero: inv.replace("in_", ""),
      amount_cents: 169_900,
      currency: "BRL",
      due_at: due,
      status,
      paid_at: paid,
      created_at: created,
    });
    if (error) throw new Error(error.message);
  }

  // ATIVA — uma cobrança paga, vencimento no próximo mês.
  const cAtiva = await cliente("demo-cobranca-ativa", "cus_demo_ativa");
  const sAtiva = await assinatura(
    ids["demo-cobranca-ativa"]!,
    cAtiva,
    "sub_demo_ativa",
    "active",
    "2026-12-16T00:00:00Z",
  );
  await fatura(
    ids["demo-cobranca-ativa"]!,
    sAtiva,
    "in_demo_ativa",
    "paid",
    "2026-11-16T00:00:00Z",
    "2026-11-16T00:00:00Z",
    "2026-11-01T00:00:00Z",
  );

  // EM ATRASO — duas faturas falhas; a mais recente venceu em 16/11.
  const cAtraso = await cliente("demo-cobranca-atraso", "cus_demo_atraso");
  const sAtraso = await assinatura(
    ids["demo-cobranca-atraso"]!,
    cAtraso,
    "sub_demo_atraso",
    "past_due",
    "2026-11-16T00:00:00Z",
  );
  await fatura(
    ids["demo-cobranca-atraso"]!,
    sAtraso,
    "in_demo_atraso_2",
    "unpaid",
    "2026-11-16T00:00:00Z",
    null,
    "2026-11-01T00:00:00Z",
  );
  await fatura(
    ids["demo-cobranca-atraso"]!,
    sAtraso,
    "in_demo_atraso_1",
    "action_required",
    "2026-10-16T00:00:00Z",
    null,
    "2026-10-01T00:00:00Z",
  );

  // SEM ASSINATURA — nunca teve customer nem fatura.
  // NÃO VERIFICADA — customer existe, nenhuma assinatura foi lida.
  await cliente("demo-cobranca-nao-verificada", "cus_demo_nao_verificada");

  console.info(JSON.stringify(ids, null, 2));
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
