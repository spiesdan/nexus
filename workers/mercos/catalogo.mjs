/**
 * IMPORTA O CATÁLOGO COLETADO DO MERCOS — upsert por `(organization_id, codigo)`.
 *
 * ─── O QUE ELE GARANTE ────────────────────────────────────────────────────
 *
 * - **Identidade é o código.** O upsert usa o índice único que já existe
 *   (`catalog_products_org_codigo_key`), então rodar duas vezes não duplica.
 * - **O nome do banco vence.** Produto que já existe com nome diferente do ERP
 *   é atualizado em preço/unidade/foto e o nome fica como está; a divergência
 *   vai para o relatório com os dois nomes lado a lado. Rebatizar produto em
 *   silêncio é o tipo de "sincronização" que ninguém consegue auditar depois.
 * - **Dry-run é o padrão.** Sem `--aplicar`, nada é escrito: o relatório sai
 *   igualzinho, e é ele que se revisa antes.
 *
 * Uso:
 *   node workers/mercos/catalogo.mjs --org <uuid> --arquivo /tmp/mercos/produtos.jsonl
 *   node workers/mercos/catalogo.mjs --org <uuid> --arquivo ... --aplicar
 *   node workers/mercos/catalogo.mjs --org <uuid> --coletar   # roda produtos.mjs antes
 */
import { spawn } from "node:child_process";
import { createReadStream, existsSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

import { createClient } from "@supabase/supabase-js";

import { classificarLinhas, montarLinhasDeUpsert, planejarUpsert } from "./catalogo-logica.mjs";

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? process.argv[i + 1] : padrao;
};

const ORG = arg("org", process.env.MERCOS_ORG_ID || "");
const ARQUIVO = arg("arquivo", "/tmp/mercos/produtos.jsonl");
const APLICAR = process.argv.includes("--aplicar");
const COLETAR = process.argv.includes("--coletar");
const SAIDA_RELATORIO = arg("relatorio", "/tmp/mercos/catalogo-relatorio.json");
const TAMANHO_LOTE = 200;

const log = (evento, dados = {}) =>
  process.stdout.write(
    JSON.stringify({
      ts: new Date().toISOString(),
      importador: "mercos-catalogo",
      evento,
      ...dados,
    }) + "\n",
  );

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  log("sem_supabase", { detalhe: "NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes" });
  process.exit(2);
}
if (!ORG) {
  log("sem_org", { detalhe: "use --org <uuid> (ou MERCOS_ORG_ID)" });
  process.exit(2);
}

/** Coleta antes, se pedido — o coletor é outro processo de propósito. */
async function coletar() {
  await new Promise((resolve, reject) => {
    const filho = spawn(
      process.execPath,
      [new URL("./produtos.mjs", import.meta.url).pathname, "--saida", ARQUIVO],
      { env: process.env, stdio: "inherit" },
    );
    filho.on("error", reject);
    filho.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`coletor saiu com ${code}`)),
    );
  });
}

async function lerLinhas(caminho) {
  if (!existsSync(caminho)) throw new Error(`arquivo não existe: ${caminho}`);
  const linhas = [];
  const leitor = createInterface({ input: createReadStream(caminho), crlfDelay: Infinity });
  for await (const linha of leitor) {
    if (!linha.trim()) continue;
    try {
      linhas.push(JSON.parse(linha));
    } catch {
      linhas.push({ codigo: null, nome: null, preco: null }); // vira `sem código` no relatório
    }
  }
  return linhas;
}

async function buscarExistentes(admin, codigos) {
  const porCodigo = new Map();
  for (let i = 0; i < codigos.length; i += TAMANHO_LOTE) {
    const lote = codigos.slice(i, i + TAMANHO_LOTE);
    const { data, error } = await admin
      .from("catalog_products")
      .select("id, codigo, nome, preco_cents, unidade, imagem_url, ativo")
      .eq("organization_id", ORG)
      .in("codigo", lote);
    if (error) throw new Error(`leitura do catálogo: ${error.message}`);
    for (const produto of data ?? []) porCodigo.set(produto.codigo, produto);
  }
  return porCodigo;
}

async function main() {
  if (COLETAR) await coletar();

  const linhas = await lerLinhas(ARQUIVO);
  const { validas, divergentes, semCodigo } = classificarLinhas(linhas);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const existentes = await buscarExistentes(
    admin,
    validas.map((p) => p.codigo),
  );
  const {
    criados,
    atualizados,
    divergentes: nomesDivergentes,
  } = planejarUpsert(validas, existentes);

  const linhasParaGravar = montarLinhasDeUpsert(ORG, criados, atualizados, existentes);
  let gravados = 0;

  if (APLICAR && linhasParaGravar.length > 0) {
    for (let i = 0; i < linhasParaGravar.length; i += TAMANHO_LOTE) {
      const lote = linhasParaGravar.slice(i, i + TAMANHO_LOTE);
      const { error } = await admin
        .from("catalog_products")
        .upsert(lote, { onConflict: "organization_id,codigo", ignoreDuplicates: false });
      if (error) throw new Error(`upsert do catálogo: ${error.message}`);
      gravados += lote.length;
    }
  }

  const relatorio = {
    organization_id: ORG,
    arquivo: ARQUIVO,
    aplicado: APLICAR,
    lidos: linhas.length,
    validos: validas.length,
    criados: criados.length,
    atualizados: atualizados.length,
    divergentes: divergentes.length + nomesDivergentes.length,
    sem_codigo: semCodigo.length,
    gravados,
    detalhe: {
      // Nome divergente é o que o dono revisa: preço atualizado, nome mantido.
      nomes_divergentes: nomesDivergentes.slice(0, 200),
      linhas_divergentes: divergentes.slice(0, 200),
      sem_codigo: semCodigo.slice(0, 200),
      sem_codigo_unicos: [...new Set(semCodigo.map((s) => s.nome ?? "—"))].slice(0, 100),
    },
  };

  writeFileSync(SAIDA_RELATORIO, JSON.stringify(relatorio, null, 2) + "\n");
  log("fim", {
    aplicado: relatorio.aplicado,
    lidos: relatorio.lidos,
    criados: relatorio.criados,
    atualizados: relatorio.atualizados,
    divergentes: relatorio.divergentes,
    sem_codigo: relatorio.sem_codigo,
    relatorio: SAIDA_RELATORIO,
  });
}

main().catch((erro) => {
  log("erro", { detalhe: String(erro).slice(0, 400) });
  process.exitCode = 1;
});
