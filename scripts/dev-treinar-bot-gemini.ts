/**
 * TREINA E PUBLICA O BOT DE WHATSAPP NO GEMINI (dev local).
 *
 * Três passos idempotentes, no caminho que a TELA faz:
 *
 *   1. valida a `GEMINI_API_KEY` contra a própria API (header, nunca query);
 *   2. grava a credencial `google` em `ai_provider_credentials` CIFRADA com
 *      AES-256-GCM (`AI_CRED_AES_KEY`) e `validated_at` preenchido — sem isso
 *      `loadCredential` recusa com "not_validated" e o turno nem começa;
 *   3. cria/atualiza o agente "Vendedor WhatsApp (Gemini)" e publica a versão
 *      na channel_session do nascimento (a mesma que o webhook do e2e entrega),
 *      com `provider=google` + `gemini-3.5-flash-lite`, `tool_ids` do vendedor
 *      (catálogo, pedido, contatos) validados contra `VALID_TOOL_IDS` — id igual
 *      ao do publish da tela, que recusa id fora do catálogo MCP.
 *
 * O catálogo NÃO vai mais embutido no prompt: são 631 produtos da org. O bot
 * consulta `crm_search_products` no turno e enxerga a loja inteira (varredura
 * paginada de até 10k) com preço e estoque frescos — prompt gigante ficava
 * congelado até o próximo publish.
 *
 * O CIFRAR é uma reimplementação local de propósito: `lib/crypto/aes_gcm`
 * importa `@/lib/env`, que puxa o env validado COMPLETO do produto — este roda
 * como seed, fora do Next, com só o que precisa.
 *
 * A chave NUNCA aparece no log nem no repositório: vem de `GEMINI_API_KEY` no
 * ambiente (`.env.local`, não versionado) e só o `last4` sai impresso.
 *
 * Run: npx tsx --env-file=.env.local scripts/dev-treinar-bot-gemini.ts
 */
import { createCipheriv, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { VALID_TOOL_IDS } from "../lib/mcp/tools/catalogo";

import { anunciarDestino, credenciaisSupabaseDeTeste } from "./lib/env-de-teste";

const credenciais = credenciaisSupabaseDeTeste();
anunciarDestino("dev-treinar-bot-gemini", credenciais);

const admin = createClient(credenciais.url, credenciais.serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const NOME_AGENTE = "Vendedor WhatsApp (Gemini)";
const PROVIDER = "google";
/**
 * Cota free tier = 20 requests/dia POR MODELO (`GenerateRequestsPerDay…`), e um
 * turno só faz um BURST de chamadas (stage, jailbreak, agent_turn, gates,
 * checkpoint). gemini-3.6-flash estourou primeiro (429), depois o 3.5-flash
 * (a janela diária só reseta à meia-noite Pacific). O lite é o que respondeu
 * 200 em todos os testes — e já é o default barato do provider no catálogo.
 */
const MODELO = "gemini-3.5-flash-lite";
const LABEL_CREDENCIAL = "Gemini (dev)";

/**
 * Papel pedido pelo dono do bot: "tem que fazer tudo que um vendedor externo
 * faz e um atendente de telemarketing". As regras de atendimento são as do
 * material existente na instalação (os prompts de atendimento já semeados) —
 * nada aqui inventa preço, prazo ou condição de produto. Preço e estoque saem
 * de `crm_search_products` (ferramenta que varre o catálogo inteiro da org),
 * e o pedido montado sai de `commercial_create_order` como RASCUNHO.
 */
const CABECALHO_PROMPT = `Você é o atendente de WhatsApp da empresa: ao mesmo tempo vendedor externo e operador de telemarketing.

O QUE VOCÊ FAZ:
- Atende quem escreve com educação e objetividade, no ritmo do WhatsApp (mensagem curta, uma ideia por vez).
- Consulta preço e disponibilidade SEMPRE com a ferramenta crm_search_products — o catálogo inteiro da loja está nela. Nunca invente preço, prazo ou endereço: só afirme o que a ferramenta devolveu.
- Entende pedido com erro de digitação e gíria de WhatsApp (ex.: "2 solupa" = 2 unid. de SOLUBILL 20L): procure no catálogo com o que a pessoa escreveu; se não casar com nenhum produto, pergunte qual quis dizer.
- Vende: apresenta a solução certa para o que a pessoa descreve, tira dúvidas, supera objeções com respeito e conduz para o próximo passo (montar o pedido, agendar, encaminhar proposta).
- Quando a pessoa CONFIRMAR os itens e as quantidades, monte o pedido com a ferramenta commercial_create_order (ela devolve o número PED-XXXX e o total) e avise que o pedido fica como rascunho aguardando a confirmação do vendedor. Não monte pedido enquanto ela ainda estiver comparando opções.
- Antes de montar pedido de um contato que você acabou de conhecer, confira o cadastro com crm_search_contacts (nome, telefone ou email) para vincular o pedido certo.
- Identificação fiscal: quando for necessário para faturar ou entregar, peça o CPF (pessoa física) ou o CNPJ (empresa). ANTES de registrar, consulte crm_find_contact_by_document com o documento: se ele já devolver cadastro, use aquele contato e não proponha nada; se não houver cadastro, registre com crm_propose_contact_field (campo "cpf" ou "cnpj") — a proposta vai para uma pessoa confirmar, então NUNCA diga ao cliente que o cadastro foi atualizado ou já está feito; diga apenas que anotou para conferência.
- Calcula o total (quantidade x preço unitário) com o preço da ferramenta e confirma se há estoque antes de fechar.
- Consulta o histórico com crm_list_contact_orders antes de prometer prazo ou repetir oferta.
- Entrega ("e meu pedido?", "saiu para entrega?", "chegou?"): consulte commercial_delivery_status com o contact_id e responda com o status que a ferramenta devolver — separado na carga, a caminho, entregue ou devolvido. Nunca prometa data ou prazo de entrega: diga só o que a ferramenta mostra.
- Qualifica e organiza: confirma nome, necessidade e melhor horário de contato, e propõe retorno quando o assunto pedir.
- Passa a bola sem resistência quando a pessoa pedir "falar com humano", "atendente" ou "pessoa real", ou quando o assunto sair do seu alcance.

LIMITES:
- Responda APENAS com preços e estoque que vieram de crm_search_products; se a ferramenta não achar o produto, diga que confirma com a equipe em vez de chutar.
- Pedido com sem estoque ou sem crédito volta recusado da ferramenta: explique com suas palavras e ofereça alternativa.
- Cliente irritado: acalme com objetividade e ofereça atendimento humano.
- Você não pede nem registra senha ou número de cartão. CPF e CNPJ pode pedir — só pelo fluxo de identificação acima (consulta, depois proposta, nunca gravação própria).

Responda sempre em português do Brasil, com tom cordial e profissional.`;

/**
 * Tools ligadas NA PUBLICAÇÃO do agente — o mesmo caminho da tela (a rota de
 * publish valida contra `VALID_TOOL_IDS`). Sem isto o turno roda com
 * `mcp_tools_no_turno: 0` e o bot só enxerga o que estiver escrito no prompt.
 */
const TOOLS_DO_VENDEDOR = [
  "crm_search_products",
  "commercial_create_order",
  "crm_list_contact_orders",
  "commercial_delivery_status",
  "crm_search_contacts",
  "crm_get_contact",
  "crm_find_contact_by_document",
  "crm_propose_contact_field",
] as const;

function validarToolIds(): void {
  const validas = new Set<string>(VALID_TOOL_IDS);
  const invalidas = TOOLS_DO_VENDEDOR.filter((t) => !validas.has(t));
  if (invalidas.length > 0) {
    throw new Error(
      `tool_ids fora do catálogo MCP: ${invalidas.join(", ")} — o publish da tela recusaria o mesmo`,
    );
  }
}

interface Creds {
  org_id: string;
  nascimento?: { webhook_token: string; session_name: string };
}

function lerCreds(): Creds {
  if (!fs.existsSync(CREDS_PATH)) {
    throw new Error(".e2e-creds.json ausente — rode scripts/seed-e2e-credentials.ts primeiro");
  }
  return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
}

/** AES-256-GCM igual a lib/crypto/aes_gcm.ts (ver cabeçalho: por que local). */
function cifrarSegredo(plaintext: string): { ciphertext: string; iv: string; tag: string; last4: string } {
  const raw = process.env.AI_CRED_AES_KEY;
  if (!raw) throw new Error("AI_CRED_AES_KEY ausente no ambiente (.env.local)");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`AI_CRED_AES_KEY precisa de 32 bytes (lido: ${key.length})`);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: `\\x${ciphertext.toString("hex")}`,
    iv: `\\x${iv.toString("hex")}`,
    tag: `\\x${cipher.getAuthTag().toString("hex")}`,
    last4: plaintext.slice(-4),
  };
}

/** Valida a chave chamando a API com HEADER (nunca query string). */
async function validarChave(apiKey: string): Promise<string[]> {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
    headers: { "x-goog-api-key": apiKey },
  });
  if (!r.ok) {
    throw new Error(`chave recusada pela API do Gemini (HTTP ${r.status}) — veja o corpo: ${(await r.text()).slice(0, 300)}`);
  }
  const j = (await r.json()) as { models?: Array<{ name?: string }> };
  return (j.models ?? []).map((m) => (m.name ?? "").replace(/^models\//, "")).filter(Boolean);
}

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente — defina em .env.local");

  const models = await validarChave(apiKey);
  if (!models.includes(MODELO)) {
    throw new Error(`o modelo ${MODELO} não está acessível a esta chave (a API listou ${models.length} modelos)`);
  }
  console.info(`[dev-treinar-bot-gemini] chave validada — ${MODELO} acessível`);

  const creds = lerCreds();
  const orgId = creds.org_id;
  validarToolIds();
  const SYSTEM_PROMPT = CABECALHO_PROMPT;
  console.info(
    `[dev-treinar-bot-gemini] prompt do vendedor — ${SYSTEM_PROMPT.split("\n").length} linhas, ` +
      `${TOOLS_DO_VENDEDOR.length} tools`,
  );

  const { data: sessao } = await admin
    .from("channel_sessions")
    .select("id")
    .eq("organization_id", orgId)
    .eq("waha_session_name", creds.nascimento?.session_name ?? "")
    .single();
  if (!sessao) throw new Error("channel_session do nascimento não encontrada — rode seed-e2e-nascimento-do-lead.ts");

  // 1. Credencial (reusada por label; validated_at garantido).
  let credentialId: string;
  const { data: existente } = await admin
    .from("ai_provider_credentials")
    .select("id, is_active, validated_at")
    .eq("organization_id", orgId)
    .eq("provider", PROVIDER)
    .eq("label", LABEL_CREDENCIAL)
    .maybeSingle();

  if (existente) {
    credentialId = existente.id as string;
    if (!existente.validated_at || !existente.is_active) {
      await admin
        .from("ai_provider_credentials")
        .update({ validated_at: new Date().toISOString(), validation_error: null, is_active: true })
        .eq("id", credentialId);
    }
    console.info(`[dev-treinar-bot-gemini] credencial reusada ${credentialId} (…${apiKey.slice(-4)})`);
  } else {
    const c = cifrarSegredo(apiKey);
    const { data: criada, error } = await admin
      .from("ai_provider_credentials")
      .insert({
        organization_id: orgId,
        provider: PROVIDER,
        label: LABEL_CREDENCIAL,
        api_key_encrypted: c.ciphertext,
        api_key_iv: c.iv,
        api_key_tag: c.tag,
        api_key_last4: c.last4,
        validated_at: new Date().toISOString(),
        validation_error: null,
        models_available: [MODELO],
        is_active: true,
      })
      .select("id")
      .single();
    if (error || !criada) throw new Error(`falha ao gravar credencial: ${error?.message}`);
    credentialId = criada.id as string;
    console.info(`[dev-treinar-bot-gemini] credencial criada ${credentialId} (…${c.last4})`);
  }

  // 2. Agente (upsert pelo nome único da org) + versão publicada.
  let { data: agente } = await admin
    .from("ai_agents")
    .select("id, published_version_id")
    .eq("organization_id", orgId)
    .eq("name", NOME_AGENTE)
    .maybeSingle();

  if (!agente) {
    const { data: criado, error } = await admin
      .from("ai_agents")
      .insert({
        organization_id: orgId,
        name: NOME_AGENTE,
        description: "Bot de WhatsApp no Gemini — vendedor externo + telemarketing (dev).",
        kind: "mcp_agent",
        is_active: true,
        system_prompt: SYSTEM_PROMPT,
        model: `${PROVIDER}/${MODELO}`,
      })
      .select("id, published_version_id")
      .single();
    if (error || !criado) throw new Error(`falha ao criar agente: ${error?.message}`);
    agente = criado;
    console.info(`[dev-treinar-bot-gemini] agente criado ${criado.id}`);
  }

  const { data: versoes } = await admin
    .from("ai_agent_versions")
    .select("version_number")
    .eq("agent_id", agente.id)
    .order("version_number", { ascending: false })
    .limit(1);
  const proxima = ((versoes?.[0]?.version_number as number | undefined) ?? 0) + 1;

  const { data: versao, error: errV } = await admin
    .from("ai_agent_versions")
    .insert({
      organization_id: orgId,
      agent_id: agente.id,
      version_number: proxima,
      system_prompt: SYSTEM_PROMPT,
      provider: PROVIDER,
      model: MODELO,
      credential_id: credentialId,
      channel_session_id: sessao.id,
      tool_ids: [...TOOLS_DO_VENDEDOR],
      status: "published",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (errV || !versao) throw new Error(`falha ao gravar versão: ${errV?.message}`);

  const { error: errP } = await admin
    .from("ai_agents")
    .update({ published_version_id: versao.id, system_prompt: SYSTEM_PROMPT, model: `${PROVIDER}/${MODELO}` })
    .eq("id", agente.id);
  if (errP) throw new Error(`falha ao publicar: ${errP.message}`);

  console.info(
    `[dev-treinar-bot-gemini] ✅ publicado — agente ${agente.id}, versão v${proxima} (${versao.id}), ` +
      `${PROVIDER}/${MODELO}, sessão ${sessao.id}`,
  );
}

main().catch((err) => {
  console.error(`[dev-treinar-bot-gemini] ❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
