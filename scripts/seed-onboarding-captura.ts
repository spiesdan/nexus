/**
 * FIXTURE DE CAPTURA DO ONBOARDING — organização que AINDA NÃO concluiu o wizard.
 *
 * Por que existe: o passe de design das 9 superfícies de onboarding precisa de
 * uma tela que só aparece antes da conclusão. A organização do E2E já está
 * onboardada (`onboarded_at` preenchido), então tudo cai em `/app/inbox`; e
 * resetar a organização compartilhada estragaria a suíte de quem estiver
 * rodando ao mesmo tempo. Aqui nasce uma organização própria, com um usuário
 * próprio, e ambos são idempotentes.
 *
 * Uso (com o ambiente do `.env.e2e` exportado):
 *   set -a; . ./.env.e2e; set +a
 *   pnpm exec tsx scripts/seed-onboarding-captura.ts
 */
import { writeFileSync } from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !CHAVE) {
  throw new Error("faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (use o .env.e2e)");
}

const admin = createClient(URL, CHAVE, { auth: { persistSession: false } });

const ORG_SLUG = "captura-onboarding";
const ORG_NOME = "Captura Onboarding";
const EMAIL = "captura-onboarding@nexus.test";
const SENHA = "captura-onboarding-123";

async function garantirOrg(): Promise<string> {
  const { data: existente } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", ORG_SLUG)
    .maybeSingle();

  if (existente) {
    const id = (existente as { id: string }).id;
    // RESET de propósito: cada captura começa do zero (nenhum passo cumprido).
    const { error } = await admin
      .from("organizations")
      .update({ onboarding_state: {}, onboarded_at: null } as never)
      .eq("id", id);
    if (error) throw new Error(`reset org: ${error.message}`);
    return id;
  }

  const { data, error } = await admin
    .from("organizations")
    .insert({
      slug: ORG_SLUG,
      display_name: ORG_NOME,
      legal_name: ORG_NOME,
      timezone: "America/Sao_Paulo",
      locale: "pt-BR",
      onboarding_state: {},
      onboarded_at: null,
    } as never)
    .select("id")
    .single();
  if (error || !data) throw new Error(`create org: ${error?.message}`);
  return (data as { id: string }).id;
}

async function garantirUsuario(): Promise<string> {
  const { data: lista } = await admin.auth.admin.listUsers({ perPage: 200 });
  const achado = lista.users.find((u) => u.email === EMAIL);
  if (achado) {
    await admin.auth.admin.updateUserById(achado.id, { password: SENHA, email_confirm: true });
    return achado.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: SENHA,
    email_confirm: true,
    user_metadata: { full_name: "Captura Onboarding" },
  });
  if (error || !data?.user) throw new Error(`create user: ${error?.message}`);
  return data.user.id;
}

async function garantirVinculo(userId: string, orgId: string): Promise<void> {
  const { data: existente } = await admin
    .from("user_organizations")
    .select("user_id")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();

  const dados = {
    role: "admin",
    accepted_at: new Date().toISOString(),
    revoked_at: null,
  } as never;

  if (existente) {
    const { error } = await admin
      .from("user_organizations")
      .update(dados)
      .eq("user_id", userId)
      .eq("organization_id", orgId);
    if (error) throw new Error(`update membership: ${error.message}`);
    return;
  }
  const { error } = await admin
    .from("user_organizations")
    .insert({ user_id: userId, organization_id: orgId, ...(dados as object) } as never);
  if (error) throw new Error(`insert membership: ${error.message}`);
}

async function main(): Promise<void> {
  const orgId = await garantirOrg();
  const userId = await garantirUsuario();
  await garantirVinculo(userId, orgId);

  const destino = path.join(process.cwd(), ".captura-onboarding.json");
  writeFileSync(destino, JSON.stringify({ email: EMAIL, password: SENHA, orgId }, null, 2));
  console.info(`[seed] org ${orgId} · user ${userId} · credenciais em ${destino}`);
}

void main();
