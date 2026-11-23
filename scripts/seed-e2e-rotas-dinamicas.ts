/**
 * IDs de exemplo para as SEIS rotas dinâmicas bloqueadas na matriz 41.
 *
 * SOMENTE SUPABASE LOCAL — roda contra NEXT_PUBLIC_SUPABASE_URL do `.env.e2e`,
 * nunca contra produção. Cinco ids já existem nos seeds do e2e; o script só
 * os lê. `ai_routers` não tinha linha no banco local (medido 22/11/2026),
 * então cria UMA fixture com id fixo e uma sessão de canal da org de teste.
 *
 * Saída: `docs/auditoria/capturas/ids-dinamicos.json`, lido pelo instrumento.
 *
 *   set -a && . ./.env.e2e && set +a && npx tsx scripts/seed-e2e-rotas-dinamicas.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { anunciarDestino, credenciaisSupabaseDeTeste } from "./lib/env-de-teste";

const ORG = process.env.E2E_ORG_ID ?? "68fe016a-7312-4ee0-8417-2dd07a0ad659";
const ROUTER_ID = "11111111-1111-4111-8111-111111111111";

async function main(): Promise<void> {
  const { createClient } = await import("@supabase/supabase-js");
  // `process.env` VENCE o `.env.local`: sem isto um checkout de trabalho
  // semearia a VPS de produção. O anúncio torna o destino observável no log.
  const credenciais = credenciaisSupabaseDeTeste();
  anunciarDestino("seed-e2e-rotas-dinamicas", credenciais);
  const banco = createClient(credenciais.url, credenciais.serviceRole, {
    auth: { persistSession: false },
  });

  async function primeiroId(tabela: string, ordem: string): Promise<string | null> {
    const { data, error } = await banco
      .from(tabela)
      .select("id")
      .eq("organization_id", ORG)
      .order(ordem, { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`${tabela}: ${error.message}`);
    return (data?.id as string | undefined) ?? null;
  }

  let roteadorId = await primeiroId("ai_routers", "created_at");
  if (!roteadorId) {
    const { data: sessao, error: erroSessao } = await banco
      .from("channel_sessions")
      .select("id")
      .eq("organization_id", ORG)
      .limit(1)
      .maybeSingle();
    if (erroSessao || !sessao) throw new Error(`sem sessão de canal: ${erroSessao?.message}`);
    const { error } = await banco.from("ai_routers").upsert({
      id: ROUTER_ID,
      organization_id: ORG,
      name: "Roteador E2E (auditoria)",
      channel_session_id: sessao.id,
      is_active: true,
    });
    if (error) throw new Error(`ai_routers: ${error.message}`);
    roteadorId = ROUTER_ID;
  }

  const ids = {
    "/ai/agents/[id]": { id: await primeiroId("ai_agents", "created_at") },
    "/ai/routers/[id]": { id: roteadorId },
    "/ai/followups/[id]": { id: await primeiroId("followup_flow_pointers", "updated_at") },
    "/ai/followups/enrollments/[id]": {
      id: await primeiroId("followup_enrollments", "updated_at"),
    },
    "/lgpd/requests/[id]": { id: await primeiroId("lgpd_requests", "created_at") },
    "/prospeccao/campanhas/[id]": {
      id: await primeiroId("prospecting_campaigns", "created_at"),
    },
  };

  const faltando = Object.entries(ids)
    .filter(([, parametros]) => !parametros.id)
    .map(([rota]) => rota);
  if (faltando.length > 0) throw new Error(`sem id de exemplo: ${faltando.join(", ")}`);

  const caminho = path.join(process.cwd(), "docs/auditoria/capturas/ids-dinamicos.json");
  writeFileSync(caminho, JSON.stringify(ids, null, 2) + "\n");
  console.log(`→ ${caminho}`);
  for (const [rota, parametros] of Object.entries(ids)) console.log(`  ${rota} → ${parametros.id}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
