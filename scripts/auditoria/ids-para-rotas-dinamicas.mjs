/**
 * ID REAL PARA ROTA DINÂMICA — o que separa "não auditei" de "não dá para auditar".
 *
 * ─── O PROBLEMA ────────────────────────────────────────────────────────────
 *
 * 16 das 54 telas com subtela são rotas dinâmicas (`/app/pedidos/[id]`,
 * `/app/ai/agents/[id]`, `/app/expedicao/[id]/motorista`…). Abrir
 * `/app/pedidos/[id]` literal devolve a tela de "não encontrado" — medir isso e
 * chamar de "tela vazia" é o erro do F-21, o mesmo que o instrumento de captura
 * já corrigiu para a varredura de rotas.
 *
 * A saída honesta não é inventar um id: é **pedir um id real ao banco** da
 * instalação auditada. Este script faz uma consulta por tabela, pega o primeiro
 * id existente e monta a URL. Se a tabela estiver vazia, a rota entra em
 * `sem-dado` com o motivo — e é isso que o relatório publica.
 *
 * ─── POR QUE REST E NÃO psql ────────────────────────────────────────────────
 *
 * As credenciais de `.env.e2e` já são as da instalação local; o PostgREST aceita
 * `select=id&limit=1` sem schema na mão. Um `psql` aqui exigiria a senha do
 * Postgres, que não está no arquivo, e mais uma dependência de máquina.
 *
 * Uso:
 *   node scripts/auditoria/ids-para-rotas-dinamicas.mjs            # imprime
 *   node scripts/auditoria/ids-para-rotas-dinamicas.mjs --json     # para script
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

/** tabela → rota com `{id}`. Ordem importa só para o relatório. */
export const MAPA = [
  { tabela: "contacts", rota: "/app/contacts/{id}" },
  { tabela: "commercial_orders", rota: "/app/pedidos/{id}" },
  { tabela: "shipments", rota: "/app/expedicao/{id}" },
  { tabela: "shipments", rota: "/app/expedicao/{id}/fechamento" },
  { tabela: "shipments", rota: "/app/expedicao/{id}/motorista" },
  { tabela: "shipments", rota: "/app/expedicao/{id}/rota" },
  { tabela: "ai_agents", rota: "/app/ai/agents/{id}" },
  // O fluxo mora em `followup_flow_pointers` (ponteiro para a versão vigente);
  // `followup_flows` não existe — o 404 do PostgREST foi a pista.
  { tabela: "followup_flow_pointers", rota: "/app/ai/followups/{id}" },
  { tabela: "followup_enrollments", rota: "/app/ai/followups/enrollments/{id}" },
  { tabela: "ai_routers", rota: "/app/ai/routers/{id}" },
  { tabela: "purchase_orders", rota: "/app/compras/{id}" },
  { tabela: "invoices", rota: "/app/fiscal/notas/{id}" },
  { tabela: "lgpd_requests", rota: "/app/lgpd/requests/{id}" },
  { tabela: "crm_pipelines", rota: "/app/pipelines/{id}" },
  { tabela: "prospecting_campaigns", rota: "/app/prospeccao/campanhas/{id}" },
  { tabela: "organizations", rota: "/admin/tenants/{id}" },
  { tabela: "organizations", rota: "/admin/tenants/{id}/health" },
  // As seis rotas de `/admin/**` que ficavam fora da lista. Tabelas conferidas
  // na rota de API de cada tela, não deduzidas do nome:
  { tabela: "api_audit_log", rota: "/admin/audit/{id}" },
  { tabela: "conversations", rota: "/admin/inbox/{id}" },
  { tabela: "incidents", rota: "/admin/incidents/{id}" },
  { tabela: "lgpd_requests", rota: "/admin/lgpd/requests/{id}" },
  { tabela: "user_organizations", rota: "/admin/users/{id}", coluna: "user_id" },
  // As duas do tenant que também ficavam de fora.
  { tabela: "conversations", rota: "/app/inbox/{id}" },
  { tabela: "crm_leads", rota: "/app/leads/{id}" },
];

function env() {
  const bruto = readFileSync(path.join(RAIZ, ".env.e2e"), "utf8");
  const v = {};
  for (const linha of bruto.split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;
    const i = limpa.indexOf("=");
    if (i > 0) v[limpa.slice(0, i)] = limpa.slice(i + 1).replace(/^["']|["']$/g, "");
  }
  return v;
}

const { NEXT_PUBLIC_SUPABASE_URL: BASE, SUPABASE_SERVICE_ROLE_KEY: CHAVE } = env();
if (!BASE || !CHAVE) {
  console.error("faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.e2e");
  process.exit(2);
}

/** Primeiro id de uma tabela, ou null se ela não existir/estiver vazia. */
export async function primeiroId(tabela, coluna = "id") {
  const url = `${BASE}/rest/v1/${tabela}?select=${coluna}&limit=1`;
  const r = await fetch(url, {
    headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` },
  });
  if (!r.ok) return { id: null, motivo: `HTTP ${r.status} ao ler ${tabela}` };
  const linhas = await r.json();
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return { id: null, motivo: `${tabela} sem nenhuma linha nesta instalação` };
  }
  return { id: linhas[0][coluna] ?? null, motivo: null };
}

const rotas = [];
const semDado = [];
const cache = new Map();
for (const { tabela, rota, coluna = "id" } of MAPA) {
  // A chave do cache inclui a coluna: `user_organizations` não tem `id` de
  // usuário na primeira coluna, e o id de membro não serve para `/admin/users`.
  const chave = `${tabela}:${coluna}`;
  if (!cache.has(chave)) cache.set(chave, await primeiroId(tabela, coluna));
  const { id, motivo } = cache.get(chave);
  if (id) rotas.push(rota.replace("{id}", id));
  else semDado.push({ rota, motivo });
}

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify({ rotas, semDado }, null, 2) + "\n");
} else {
  process.stdout.write(`rotas dinâmicas com id real: ${rotas.length}\n`);
  for (const r of rotas) process.stdout.write(`  ${r}\n`);
  process.stdout.write(`sem dado (${semDado.length}):\n`);
  for (const s of semDado) process.stdout.write(`  ${s.rota} — ${s.motivo}\n`);
}
