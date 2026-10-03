/**
 * Seed E2E da seção "Novos prospects" do Radar (spec 19, FASE 11, §30).
 *
 * Cria 1 prospect NUNCA abordado (`status_comercial=novo`) com telefone — o
 * recorte exato que a seção lê (`status=novo,nao_analisado`) e que habilita
 * as 3 ações do §30: Abrir, Iniciar conversa (precisa de telefone) e
 * Adicionar à fila (precisa de DONO vazio).
 *
 * Idempotente por nome. Depende de .e2e-creds.json.
 *
 * Run: npx tsx scripts/seed-e2e-radar-prospects.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";
import { anunciarDestino, credenciaisSupabaseDeTeste } from "./lib/env-de-teste";

const credenciais = credenciaisSupabaseDeTeste();
anunciarDestino("seed-e2e-radar-prospects", credenciais);
const admin = createClient(credenciais.url, credenciais.serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const NOME = "Padaria E2E Radar Novo";

async function main(): Promise<void> {
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as { org_id: string };

  // Resíduo da ação "Iniciar conversa" de rodadas anteriores: o Inbox cria o
  // contato a partir do telefone, e o cruzamento telefone→contacts da rota do
  // Radar marcaria o prospect recém-nascido como "Cliente" — o card mudava de
  // aparência entre um run e outro. Não dá para apagar o contato (FK com a
  // conversa que a mesma ação criou); zera-se só o telefone, que é o que
  // alimenta o cruzamento. A evidência precisa ser estável.
  const { error: erroLimpeza } = await admin
    .from("contacts")
    .update({ phone_number: null })
    .eq("organization_id", creds.org_id)
    .eq("phone_number", "+4736220009");
  if (erroLimpeza) throw new Error(`limpa contato residual: ${erroLimpeza.message}`);

  const { data: existing } = await admin
    .from("business_prospects")
    .select("id")
    .eq("organization_id", creds.org_id)
    .eq("nome", NOME)
    .maybeSingle();
  if (existing) {
    // Um dono residual de rodada anterior esconderia o botão "Adicionar à
    // fila" — a spec cobra as 3 ações, então o prospect nasce sem dono.
    await admin.from("business_prospects").update({ owner_user_id: null }).eq("id", (existing as { id: string }).id);
    // eslint-disable-next-line no-console
    console.log("seed-e2e-radar-prospects: já existe, dono zerado");
    return;
  }

  const { error } = await admin.from("business_prospects").insert({
    organization_id: creds.org_id,
    nome: NOME,
    nome_normalizado: NOME.toLowerCase(),
    categoria: "Padaria",
    cidade: "Canoinhas",
    estado: "SC",
    telefone: "(47) 3622-0009",
    provider: "e2e",
    status_comercial: "novo",
    score: 90,
  });
  if (error) throw new Error(`insert prospect: ${error.message}`);

  // eslint-disable-next-line no-console
  console.log("seed-e2e-radar-prospects OK");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
