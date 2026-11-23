/**
 * Seed E2E — multi-campanha, retomada e matching sem case/acento.
 *
 * O seed NÃO dispara mensagem e NÃO fala com a Meta: ele grava só o estado que
 * as rotas/rotinas leriam. É honesto — as specs que dependem de envio real
 * ficam `fixme` com o motivo, em vez de fingir sucesso.
 *
 * Prepara:
 *  - prospect "Posto E2E Matching" com `categoria_canonica = 'Posto de combustível'`
 *    em Itajaí/SC, FORA de qualquer campanha — é o caso do matching (o prévio
 *    ainda exclui reservados, então ele não pode estar nas campanhas do seed);
 *  - prospect "Posto E2E Retomada" em Mafra/SC e duas campanhas com o MESMO
 *    prospect em `prospect_ids` e a membresia da 0338 preenchida;
 *  - preset de retomada configurável (categoria `retomada`), nunca texto fixo;
 *  - uma linha em `prospecting_followups` para a campanha 1 (já agendada).
 *
 * Idempotente: apaga o que criou pelo nome antes de inserir.
 * Depende de `.e2e-creds.json`. Escreve `.e2e-multi-campanha.json`.
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

import { anunciarDestino, credenciaisSupabaseDeTeste } from "./lib/env-de-teste";

const credenciais = credenciaisSupabaseDeTeste();
anunciarDestino("seed-e2e-multi-campanha", credenciais);
const admin = createClient(credenciais.url, credenciais.serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RAIZ = process.cwd();
const CREDS_PATH = path.join(RAIZ, ".e2e-creds.json");
const SAIDA_PATH = path.join(RAIZ, ".e2e-multi-campanha.json");

const NOME_PROSPECT = "Posto E2E Retomada";
const TELEFONE = "+5547999994400";
const CIDADE = "Mafra";
const UF = "SC";
const NOME_MATCHING = "Posto E2E Matching";
const TELEFONE_MATCHING = "+5547999994401";
const CIDADE_MATCHING = "Itajaí";

async function main(): Promise<void> {
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as {
    org_id: string;
    users: Record<string, { email: string } | undefined>;
  };
  const orgId = creds.org_id;

  // Limpeza idempotente (a membresia nova tem FK para campanha/prospect).
  const { data: antigas } = await admin
    .from("prospecting_campaigns")
    .select("id")
    .eq("organization_id", orgId)
    .in("nome", ["Campanha E2E Retomada A", "Campanha E2E Retomada B"]);
  for (const c of antigas ?? []) {
    await admin.from("prospecting_followups").delete().eq("campaign_id", c.id);
    await admin.from("prospecting_campaign_prospects").delete().eq("campaign_id", c.id);
    await admin.from("prospecting_sends").delete().eq("campaign_id", c.id);
    await admin.from("prospecting_campaigns").delete().eq("id", c.id);
  }
  for (const nome of [NOME_PROSPECT, NOME_MATCHING]) {
    await admin
      .from("business_prospects")
      .delete()
      .eq("organization_id", orgId)
      .eq("nome", nome);
  }
  await admin
    .from("prospecting_message_presets")
    .delete()
    .eq("organization_id", orgId)
    .eq("categoria", "retomada");

  const { data: prospect, error: erroProspect } = await admin
    .from("business_prospects")
    .insert({
      organization_id: orgId,
      nome: NOME_PROSPECT,
      nome_normalizado: "posto e2e retomada",
      telefone: TELEFONE,
      telefone_normalizado: "5547999994400",
      whatsapp_potencial: true,
      cidade: CIDADE,
      estado: UF,
      categoria: "Gas station",
      categoria_canonica: "Posto de combustível",
      categoria_revisar: false,
      provider: "baseline",
      source: "e2e",
    })
    .select("id")
    .single();
  if (erroProspect) throw new Error(`prospect: ${erroProspect.message}`);

  const { data: matching, error: erroMatching } = await admin
    .from("business_prospects")
    .insert({
      organization_id: orgId,
      nome: NOME_MATCHING,
      nome_normalizado: "posto e2e matching",
      telefone: TELEFONE_MATCHING,
      telefone_normalizado: "5547999994401",
      whatsapp_potencial: true,
      cidade: CIDADE_MATCHING,
      estado: UF,
      categoria: "Gas station",
      categoria_canonica: "Posto de combustível",
      categoria_revisar: false,
      provider: "baseline",
      source: "e2e",
    })
    .select("id")
    .single();
  if (erroMatching) throw new Error(`prospect matching: ${erroMatching.message}`);

  const campanhas: string[] = [];
  let membroBloqueado = false;
  for (const nome of ["Campanha E2E Retomada A", "Campanha E2E Retomada B"]) {
    const { data, error } = await admin
      .from("prospecting_campaigns")
      .insert({
        organization_id: orgId,
        nome,
        categorias: ["posto de combustível"],
        cidades: [{ cidade: CIDADE, estado: UF }],
        prospect_ids: [prospect.id],
        status: "rascunho",
        fonte_publico: "busca",
        mensagem_tipo: "texto",
        mensagens: ["Primeiro contato E2E"],
      })
      .select("id")
      .single();
    if (error?.message === "prospect_em_outra_campanha") {
      // Instalação sem a 0338: o trigger antigo ainda barra. Não é defect da
      // spec — as que dependem disso estão fixme com este mesmo motivo.
      membroBloqueado = true;
      continue;
    }
    if (error) throw new Error(`campanha ${ nome }: ${ error.message }`);
    campanhas.push(data.id);
    const { error: erroMembro } = await admin.from("prospecting_campaign_prospects").insert({
      organization_id: orgId,
      campaign_id: data.id,
      prospect_id: prospect.id,
    });
    // Banco de teste mais antigo pode não ter a 0338 aplicada; a prova da
    // membresia em si é test:db. Aqui o que interessa é o estado para a prévia.
    if (erroMembro && !erroMembro.message.includes("Could not find the table")) {
      throw new Error(`membrosia: ${erroMembro.message}`);
    }
  }

  const { error: erroPreset } = await admin.from("prospecting_message_presets").insert({
    organization_id: orgId,
    categoria: "retomada",
    mensagens: ["Texto de retomada vindo do preset do tenant"],
  });
  if (erroPreset) throw new Error(`preset: ${erroPreset.message}`);

  // Uma linha já agendada prova a idempotência: reexecutar o tick não duplica.
  const { error: erroFollowup } = await admin.from("prospecting_followups").insert({
    organization_id: orgId,
    campaign_id: campanhas[0]!,
    prospect_id: prospect.id,
    agendado_em: new Date(Date.now() + 48 * 3_600_000).toISOString(),
  });
  // Banco sem a 0339: o unique de follow-up é provado em test:db, não aqui.
  if (erroFollowup && !erroFollowup.message.includes("Could not find the table")) {
    throw new Error(`followup: ${erroFollowup.message}`);
  }

  fs.writeFileSync(
    SAIDA_PATH,
    JSON.stringify(
      {
        org_id: orgId,
        prospect_id: prospect.id,
        matching_id: matching.id,
        campanha_a: campanhas[0],
        campanha_b: campanhas[1] ?? campanhas[0],
        /** true = o banco local ainda tem o trigger 0277 (sem a 0338). */
        membro_bloqueado: membroBloqueado,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("ok: seed multi-campanha/retomada pronto");
}

void main();
