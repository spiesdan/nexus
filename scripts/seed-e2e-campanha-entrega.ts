/**
 * Seed E2E do CONTROLE da campanha no canal oficial.
 *
 * Cria uma campanha com três empresas, cada uma num degrau diferente do que o
 * canal confirmou depois do POST:
 *
 *   - "Padaria E2E Entrega"   → `delivered`  (chegou, não foi lida)
 *   - "Mercado E2E Entrega"   → `read`       (chegou e foi lida)
 *   - "Oficina E2E Entrega"   → `failed`     (a Meta recusou: 131047)
 *
 * O seed NÃO passa pelo envio real: ele grava a linha de `messages` no estado
 * que o webhook gravaria. É o único jeito de exercitar a tela sem uma WABA
 * conectada — e é honesto, porque o que a tela lê é exatamente `messages`.
 *
 * Idempotente: apaga a campanha anterior (e os envios dela) pelo nome. Os
 * prospects são reaproveitados — `prospecting_sends` tem UNIQUE por
 * (organization_id, prospect_id), então o envio antigo precisa sair antes.
 *
 * Depende de `.e2e-creds.json` (rode `pnpm e2e:seed:creds`). Escreve
 * `.e2e-campanha-entrega.json` com o id da campanha para a spec.
 *
 * Run: npx tsx scripts/seed-e2e-campanha-entrega.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

import { anunciarDestino, credenciaisSupabaseDeTeste } from "./lib/env-de-teste";

const credenciais = credenciaisSupabaseDeTeste();
anunciarDestino("seed-e2e-campanha-entrega", credenciais);
const admin = createClient(credenciais.url, credenciais.serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RAIZ = process.cwd();
const CREDS_PATH = path.join(RAIZ, ".e2e-creds.json");
const SAIDA_PATH = path.join(RAIZ, ".e2e-campanha-entrega.json");

const CAMPANHA = "Campanha E2E Entrega";

interface Caso {
  nome: string;
  telefone: string;
  status: "delivered" | "read" | "failed";
  /** Minutos atrás do envio, para a tela mostrar instantes diferentes. */
  minutos: number;
  erro?: { code: string; message: string };
}

const CASOS: Caso[] = [
  { nome: "Padaria E2E Entrega", telefone: "+5547999990001", status: "delivered", minutos: 30 },
  { nome: "Mercado E2E Entrega", telefone: "+5547999990002", status: "read", minutos: 20 },
  {
    nome: "Oficina E2E Entrega",
    telefone: "+5547999990003",
    status: "failed",
    minutos: 10,
    erro: { code: "131047", message: "Re-engagement message" },
  },
];

function minutosAtras(minutos: number): string {
  return new Date(Date.now() - minutos * 60_000).toISOString();
}

async function ensureSessao(orgId: string): Promise<string> {
  const { data: existente, error: erroBusca } = await admin
    .from("channel_sessions")
    .select("id")
    .eq("organization_id", orgId)
    .eq("provider", "meta_cloud")
    .eq("meta_phone_number_id", "e2e-entrega-phone")
    .maybeSingle();
  if (erroBusca) throw new Error(`busca channel_session: ${erroBusca.message}`);
  if (existente) return (existente as { id: string }).id;

  const { data, error } = await admin
    .from("channel_sessions")
    .insert({
      organization_id: orgId,
      // A sessão é do canal OFICIAL: é nele que `delivered`/`read` chegam por
      // webhook. Uma sessão WAHA aqui provaria a tela com o canal errado.
      provider: "meta_cloud",
      meta_phone_number_id: "e2e-entrega-phone",
      meta_waba_id: "e2e-entrega-waba",
      // Sem valor real: o seed não fala com a Meta. A coluna é NOT NULL e o
      // conteúdo nunca é lido pela tela de controle.
      webhook_secret_encrypted: "e2e-nao-usado",
      status: "WORKING",
      phone_number: "+5547888880000",
      display_name: "E2E Entrega",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`insert channel_session: ${error?.message}`);
  return (data as { id: string }).id;
}

async function ensureContato(orgId: string, nome: string, telefone: string): Promise<string> {
  const { data: existente } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", orgId)
    .eq("display_name", nome)
    .maybeSingle();
  if (existente) return (existente as { id: string }).id;

  const { data, error } = await admin
    .from("contacts")
    .insert({
      organization_id: orgId,
      name: nome,
      display_name: nome,
      phone_number: telefone,
      source: "e2e",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`insert contact ${nome}: ${error?.message}`);
  return (data as { id: string }).id;
}

async function ensureConversa(orgId: string, contatoId: string, sessaoId: string): Promise<string> {
  const { data: existente } = await admin
    .from("conversations")
    .select("id")
    .eq("organization_id", orgId)
    .eq("contact_id", contatoId)
    .eq("channel_session_id", sessaoId)
    .maybeSingle();
  if (existente) return (existente as { id: string }).id;

  const { data, error } = await admin
    .from("conversations")
    .insert({
      organization_id: orgId,
      contact_id: contatoId,
      channel_session_id: sessaoId,
      channel: "whatsapp",
      status: "open",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`insert conversation: ${error?.message}`);
  return (data as { id: string }).id;
}

async function ensureProspect(orgId: string, nome: string, telefone: string): Promise<string> {
  const { data: existente } = await admin
    .from("business_prospects")
    .select("id")
    .eq("organization_id", orgId)
    .eq("nome", nome)
    .maybeSingle();
  if (existente) return (existente as { id: string }).id;

  const { data, error } = await admin
    .from("business_prospects")
    .insert({
      organization_id: orgId,
      nome,
      nome_normalizado: nome.toLowerCase(),
      categoria: "Padaria",
      cidade: "Canoinhas",
      estado: "SC",
      telefone,
      provider: "e2e",
      status_comercial: "novo",
      score: 70,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`insert prospect ${nome}: ${error?.message}`);
  return (data as { id: string }).id;
}

async function ensureMensagem(
  orgId: string,
  caso: Caso,
  contatoId: string,
  conversaId: string,
  sessaoId: string,
): Promise<string> {
  const externalId = `wamid.e2e-entrega-${caso.telefone.replace("+", "")}`;
  const { data: existente } = await admin
    .from("messages")
    .select("id")
    .eq("organization_id", orgId)
    .eq("external_id", externalId)
    .maybeSingle();

  const enviadaEm = minutosAtras(caso.minutos);
  const corpo = {
    organization_id: orgId,
    conversation_id: conversaId,
    channel_session_id: sessaoId,
    contact_id: contatoId,
    external_id: externalId,
    type: "template",
    direction: "outbound",
    status: caso.status,
    body: "Mensagem de teste do controle de campanha",
    sent_via: "crm",
    sent_at: enviadaEm,
    // O que o webhook grava: `delivered` marca `delivered_at`; `read` marca as
    // duas (ler implica ter chegado); `failed` guarda o motivo da recusa.
    delivered_at: caso.status === "failed" ? null : enviadaEm,
    read_at: caso.status === "read" ? minutosAtras(Math.max(0, caso.minutos - 5)) : null,
    error_code: caso.erro?.code ?? null,
    error_message: caso.erro?.message ?? null,
    template_name: "e2e_entrega",
    template_language: "pt_BR",
    metadata: {},
  };

  if (existente) {
    const { error } = await admin
      .from("messages")
      .update(corpo)
      .eq("id", (existente as { id: string }).id);
    if (error) throw new Error(`update message ${caso.nome}: ${error.message}`);
    return (existente as { id: string }).id;
  }

  const { data, error } = await admin.from("messages").insert(corpo).select("id").single();
  if (error || !data) throw new Error(`insert message ${caso.nome}: ${error?.message}`);
  return (data as { id: string }).id;
}

async function main(): Promise<void> {
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as { org_id: string };
  const orgId = creds.org_id;

  const sessaoId = await ensureSessao(orgId);

  const preparados: { prospectId: string; mensagemId: string }[] = [];
  for (const caso of CASOS) {
    const contatoId = await ensureContato(orgId, caso.nome, caso.telefone);
    const conversaId = await ensureConversa(orgId, contatoId, sessaoId);
    const prospectId = await ensureProspect(orgId, caso.nome, caso.telefone);
    const mensagemId = await ensureMensagem(orgId, caso, contatoId, conversaId, sessaoId);
    preparados.push({ prospectId, mensagemId });
  }

  // A campanha é recriada a cada execução: o ledger tem UNIQUE por prospect, e
  // reaproveitar a campanha antiga exigiria limpar envio por envio.
  const { data: antigas } = await admin
    .from("prospecting_campaigns")
    .select("id")
    .eq("organization_id", orgId)
    .eq("nome", CAMPANHA);
  for (const c of (antigas ?? []) as { id: string }[]) {
    await admin.from("prospecting_sends").delete().eq("organization_id", orgId).eq("campaign_id", c.id);
    await admin.from("prospecting_campaigns").delete().eq("id", c.id).eq("organization_id", orgId);
  }

  const { data: campanha, error: erroCampanha } = await admin
    .from("prospecting_campaigns")
    .insert({
      organization_id: orgId,
      nome: CAMPANHA,
      objetivo: "E2E do controle de entrega",
      categorias: ["Padaria", "Mercado", "Oficina"],
      cidades: [{ cidade: "Canoinhas", estado: "SC" }],
      status: "ativa",
      publico: "prospects",
      fonte_publico: "base",
      prospect_ids: preparados.map((p) => p.prospectId),
      mensagens: ["Mensagem de teste do controle de campanha"],
      mensagem_tipo: "template",
      template_name: "e2e_entrega",
      template_language: "pt_BR",
      // O CHECK do banco exige o bind completo (nome, idioma e hash) quando a
      // campanha declara `template`: campanha meio-configurada não nasce.
      template_contract_hash: "e2e-contrato-do-modelo",
      template_values: {},
      espaco_ms: 6000,
      limite_diario: 100,
      janelas: [],
    })
    .select("id")
    .single();
  if (erroCampanha || !campanha) throw new Error(`insert campanha: ${erroCampanha?.message}`);
  const campanhaId = (campanha as { id: string }).id;

  const { error: erroEnvios } = await admin.from("prospecting_sends").insert(
    preparados.map((p) => ({
      organization_id: orgId,
      campaign_id: campanhaId,
      prospect_id: p.prospectId,
      message_id: p.mensagemId,
      mensagem_indice: 0,
      enviado_em: minutosAtras(30),
    })),
  );
  if (erroEnvios) throw new Error(`insert envios: ${erroEnvios.message}`);

  fs.writeFileSync(
    SAIDA_PATH,
    `${JSON.stringify({ campaign_id: campanhaId, organization_id: orgId }, null, 2)}\n`,
    "utf8",
  );

  // eslint-disable-next-line no-console
  console.log(`seed-e2e-campanha-entrega OK — campanha ${campanhaId}`);
}

main().catch((e) => {
   
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
