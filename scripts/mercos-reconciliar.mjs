/**
 * RECONCILIAÇÃO MERCOS × NEXUS — prova de que nenhum pedido ficou de fora.
 *
 * Lê o JSONL de uma coleta REAL (o coletor já grava um registro por pedido),
 * filtra a JANELA DE GARANTIA (padrão 30 dias — decisão do dono; configurável
 * por MERCOS_RECONCILIAR_DIAS) e compara CADA número da janela com commercial_orders por `numero_mercos` (e por
 * `numero` como reserva dos importados antigos sem a coluna) e grava o
 * resultado em `mercos_reconciliacoes` — artefato consultável, não log.
 *
 * Uso (dry-run por padrão):
 *   node scripts/mercos-reconciliar.mjs --jsonl /tmp/pedidos.jsonl --org <uuid> \
 *     --run-id 12m-2026-11-23
 *   ... --aplicar   # importa os ausentes, preservando numero_mercos
 *
 * Rodar de novo com o MESMO run-id tem de devolver `ausentes_depois = 0`.
 */
import { readFileSync } from "node:fs";

const PADRAO_JANELA_DIAS = 30;
import { createClient } from "@supabase/supabase-js";

import {
 dentroDaJanela,
 payloadDeImportacao,
 registroValido,
 situacaoPresenca,
} from "./mercos-reconciliar-logica.mjs";

const args = process.argv.slice(2);
function arg(nome, padrao) {
  const i = args.indexOf(`--${nome}`);
  return i > -1 ? args[i + 1] : padrao;
}

const JSONL = arg("jsonl", "");
const ORG = arg("org", process.env.MERCOS_ORG_ID || "");
const RUN_ID = arg("run-id", process.env.MERCOS_RUN_ID || "reconciliacao");
const LIMITE = Number(arg("limite", process.env.MERCOS_RECONCILIAR_LIMITE || "100"));
const APLICAR = args.includes("--aplicar");
const JANELA_DIAS = Number(arg("dias", process.env.MERCOS_RECONCILIAR_DIAS || String(PADRAO_JANELA_DIAS)));
const AGORA = Date.now();
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!JSONL || !ORG || !URL_BASE || !CHAVE) {
  console.error("faltam --jsonl, --org ou credenciais SUPABASE_URL/SERVICE_ROLE_KEY");
  process.exit(2);
}

const inicio = Date.now();
const linhas = readFileSync(JSONL, "utf8").split("\n").filter(Boolean);
const porNumero = new Map();
let falhasLeitura = 0;
for (const linha of linhas) {
  let registro;
  try {
    registro = JSON.parse(linha);
  } catch {
    falhasLeitura++;
    continue;
  }
  if (!registroValido(registro)) {
    falhasLeitura++;
    continue; // leitura ruim NÃO é ausência
  }
  if (!porNumero.has(registro.numero)) porNumero.set(registro.numero, registro);
}
const todos = [...porNumero.values()];
for (const r of todos) {
  if (!Number.isFinite(Date.parse(r.data_emissao || ""))) resultado.registros_sem_data++;
}
const naJanela = todos.filter((r) => dentroDaJanela(r, AGORA, JANELA_DIAS));
resultado.registros_fora_da_janela = todos.length - naJanela.length - resultado.registros_sem_data;
const candidatos = naJanela
  .sort((a, b) => a.numero - b.numero)
  .slice(0, LIMITE);

const admin = createClient(URL_BASE, CHAVE, { auth: { persistSession: false } });
const resultado = {
  run_id: RUN_ID,
  organization_id: ORG,
  limite: LIMITE,
  aplicar: APLICAR,
  registros_jsonl: linhas.length,
  falhas_leitura: falhasLeitura,
  janela_dias: JANELA_DIAS,
  registros_fora_da_janela: 0,
  registros_sem_data: 0,
  candidatos: candidatos.length,
  ausentes_antes: 0,
  importados: 0,
  ausentes_depois: 0,
  erros_importacao: 0,
  duracao_ms: 0,
};

for (const registro of candidatos) {
  const { data: existente, error: erroLeitura } = await admin
    .from("commercial_orders")
    .select("id, numero, numero_mercos")
    .eq("organization_id", ORG)
    .or(`numero_mercos.eq.${registro.numero},numero.eq.${registro.numero}`)
    .limit(1);
  if (erroLeitura) {
    resultado.erros_importacao++;
    continue; // falha de leitura nunca vira "ausente"
  }

  const linha = {
    organization_id: ORG,
    run_id: RUN_ID,
    numero_mercos: registro.numero,
    cliente_nome: registro.cliente.razao || registro.cliente.fantasia || null,
    valor_cents: registro.total_cents ?? 0,
    data_pedido: registro.data_emissao || null,
    situacao: situacaoPresenca((existente ?? []).length > 0),
    pedido_id: existente?.[0]?.id ?? null,
    atualizado_em: new Date().toISOString(),
  };

  if (linha.situacao === "ausente") {
    resultado.ausentes_antes++;
    if (APLICAR) {
      const { data: importado, error: erroImport } = await admin.rpc(
        "fn_importar_pedido_mercos",
        { p_org: ORG, p_pedido: payloadDeImportacao(registro) },
      );
      if (!erroImport && (importado?.status === "inserted" || importado?.status === "skipped")) {
        linha.situacao = "importado";
        linha.pedido_id = importado.order_id ?? null;
        resultado.importados++;
      } else {
        resultado.erros_importacao++;
      }
    }
  }

  const { error: erroEscrita } = await admin
    .from("mercos_reconciliacoes")
    .upsert(linha, { onConflict: "run_id,numero_mercos" });
  if (erroEscrita) resultado.erros_importacao++;
}

const { count: ausentesDepois, error: erroContagem } = await admin
  .from("mercos_reconciliacoes")
  .select("id", { count: "exact", head: true })
  .eq("organization_id", ORG)
  .eq("run_id", RUN_ID)
  .eq("situacao", "ausente");
if (erroContagem) {
  resultado.erros_importacao++;
} else {
  resultado.ausentes_depois = ausentesDepois ?? 0;
}
resultado.duracao_ms = Date.now() - inicio;
process.stdout.write(JSON.stringify(resultado, null, 2) + "\n");
if (resultado.erros_importacao > 0) process.exitCode = 1;
