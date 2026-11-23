/**
 * RECONCILIAÇÃO MERCOS × NEXUS — prova de que nenhum pedido ficou de fora.
 *
 * Medição do dono (23/11/2026): 5.929 números na lista (minutos); abrir os
 * 5.929 detalhes levaria ~12 h. Então o CENSO vem da LISTA (número + data +
 * cliente) e o detalhe só é consultado para o que não está presente ou que
 * colidiu. O detalhe é um JSONL separado, produzido por uma coleta dirigida.
 *
 * Uso (dry-run por padrão):
 *   node scripts/mercos-reconciliar.mjs --lista /tmp/lista.jsonl \
 *     --detalhes /tmp/pedidos.jsonl --org <uuid> --run-id 30d-2026-11-23
 *   ... --aplicar   # importa ausentes e colisões, preservando numero_mercos
 *
 * A prova: rodada 1 lista ausentes/colisões/ignorados; rodada 2, com o MESMO
 * run-id, devolve 0 ausentes e as mesmas colisões com `resolvido_em` preenchido.
 */
import { existsSync, readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { avaliarCobertura, avaliarResultado } from "./mercos-cobertura.mjs";
import {
  classificarComDetalhe,
  classificarNumero,
  dentroDaJanela,
  payloadDeImportacao,
} from "./mercos-reconciliar-logica.mjs";

const PADRAO_JANELA_DIAS = 30;
const FATIA = 500;

const args = process.argv.slice(2);
function arg(nome, padrao) {
  const i = args.indexOf(`--${nome}`);
  return i > -1 ? args[i + 1] : padrao;
}

const LISTA = arg("lista", "");
const DETALHES = arg("detalhes", "");
const ORG = arg("org", process.env.MERCOS_ORG_ID || "");
const RUN_ID = arg("run-id", process.env.MERCOS_RUN_ID || "reconciliacao");
const LIMITE = Number(arg("limite", process.env.MERCOS_RECONCILIAR_LIMITE || "100"));
const APLICAR = args.includes("--aplicar");
const JANELA_DIAS = Number(arg("dias", process.env.MERCOS_RECONCILIAR_DIAS || String(PADRAO_JANELA_DIAS)));
const AGORA = Date.parse(arg("agora", process.env.MERCOS_RECONCILIAR_AGORA || "") || "") || Date.now();
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!LISTA || !ORG || !URL_BASE || !CHAVE) {
  console.error("faltam --lista, --org ou credenciais SUPABASE_URL/SERVICE_ROLE_KEY");
  process.exit(2);
}

function lerJsonl(caminho) {
  if (!caminho) return { registros: [], ilegiveis: 0 };
  const registros = [];
  let ilegiveis = 0;
  for (const linha of readFileSync(caminho, "utf8").split("\n").filter(Boolean)) {
    try {
      registros.push(JSON.parse(linha));
    } catch {
      ilegiveis++; // truncada: contada, nunca descartada em silêncio
    }
  }
  return { registros, ilegiveis };
}

/** Meta do coletor: quantos pedidos a lista tinha de verdade. */
function censoEsperado() {
  const override = arg("censo-esperado", process.env.MERCOS_CENSO_ESPERADO || "");
  if (override) {
    const n = Number(override);
    if (Number.isInteger(n) && n > 0) return n;
  }
  const caminho = `${LISTA}.meta.json`;
  if (!existsSync(caminho)) return null;
  try {
    const meta = JSON.parse(readFileSync(caminho, "utf8"));
    return Number.isInteger(meta?.censo_esperado) && meta.censo_esperado > 0 ? meta.censo_esperado : null;
  } catch {
    return null;
  }
}

const inicio = Date.now();
const { registros: linhasLista, ilegiveis: ilegiveisLista } = lerJsonl(LISTA);
const porNumero = new Map();
let numerosIlegiveis = 0;
for (const linha of linhasLista) {
  if (!Number.isInteger(linha?.numero) || linha.numero <= 0) {
    numerosIlegiveis++;
    continue;
  }
  if (!porNumero.has(linha.numero)) porNumero.set(linha.numero, linha);
}
const ESPERADO = censoEsperado();

const { registros: detalhesBrutos, ilegiveis: ilegiveisDetalhes } = lerJsonl(DETALHES);
const detalhes = new Map();
for (const registro of detalhesBrutos) {
  if (Number.isInteger(registro?.numero) && !detalhes.has(registro.numero)) {
    detalhes.set(registro.numero, registro);
  }
}
const LINHAS_ILEGIVEIS = ilegiveisLista + ilegiveisDetalhes + numerosIlegiveis;

const todos = [...porNumero.values()];
const semData = todos.filter((r) => !Number.isFinite(Date.parse(r.data_emissao || "")));
const naJanela = todos.filter((r) => dentroDaJanela(r, AGORA, JANELA_DIAS));
const candidatos = naJanela.sort((a, b) => a.numero - b.numero).slice(0, LIMITE);

const admin = createClient(URL_BASE, CHAVE, { auth: { persistSession: false } });

/** Todas as linhas com numero = N ou numero_mercos = N, em fatias de 500. */
async function linhasPorNumero(numeros) {
  const mapa = new Map();
  for (let i = 0; i < numeros.length; i += FATIA) {
    const fatia = numeros.slice(i, i + FATIA);
    for (const coluna of ["numero_mercos", "numero"]) {
      const { data, error } = await admin
        .from("commercial_orders")
        .select("id, numero, numero_mercos, cliente_nome, cliente_documento")
        .eq("organization_id", ORG)
        .in(coluna, fatia);
      if (error) throw error;
      for (const linha of data ?? []) {
        for (const n of [linha.numero_mercos, linha.numero]) {
          if (n == null) continue;
          if (!mapa.has(n)) mapa.set(n, []);
          if (!mapa.get(n).some((x) => x.id === linha.id)) mapa.get(n).push(linha);
        }
      }
    }
  }
  return mapa;
}

/** Colisões já resolvidas em rodada anterior continuam visíveis no artefato. */
async function artefatosAnteriores(numeros) {
  const mapa = new Map();
  for (let i = 0; i < numeros.length; i += FATIA) {
    const fatia = numeros.slice(i, i + FATIA);
    const { data, error } = await admin
      .from("mercos_reconciliacoes")
      .select("numero_mercos, situacao, resolvido_em, pedido_id")
      .eq("organization_id", ORG)
      .eq("run_id", RUN_ID)
      .in("numero_mercos", fatia);
    if (error) throw error;
    for (const linha of data ?? []) mapa.set(linha.numero_mercos, linha);
  }
  return mapa;
}

const numeros = candidatos.map((r) => r.numero);
const banco = numeros.length ? await linhasPorNumero(numeros) : new Map();
const anteriores = numeros.length ? await artefatosAnteriores(numeros) : new Map();

const resultado = {
  run_id: RUN_ID,
  organization_id: ORG,
  fonte: "lista",
  janela_dias: JANELA_DIAS,
  limite: LIMITE,
  aplicar: APLICAR,
  numeros_na_lista: todos.length,
  censo_esperado: ESPERADO,
  censo_lido: todos.length,
  linhas_ilegiveis: LINHAS_ILEGIVEIS,
  registros_sem_data: semData.length,
  registros_fora_da_janela: todos.length - semData.length - naJanela.length,
  candidatos: candidatos.length,
  consultados_no_detalhe: 0,
  ausentes_por_numero: [],
  colisoes_por_identidade: [],
  ignorados_sem_itens: [],
  sem_detalhe: [],
  importados: [],
  ja_importados: [],
  erros_importacao: 0,
  ausentes_depois: 0,
  duracao_ms: 0,
};

for (const registro of candidatos) {
  const numero = registro.numero;
  const nomeLista = registro.cliente_nome || registro.razao_lista || registro.fantasia_lista || null;
  const classificacao = classificarNumero({
    nomeLista,
    documentoLista: registro.cliente_documento || null,
    linhasBanco: banco.get(numero) ?? [],
  });

  const detalhe = classificacao.situacao === "ausente" || classificacao.situacao === "colisao"
    ? detalhes.get(numero)
    : undefined;
  if (detalhe) resultado.consultados_no_detalhe++;
  const situacao = classificarComDetalhe({ situacao: classificacao.situacao, detalhe });

  const linha = {
    organization_id: ORG,
    run_id: RUN_ID,
    numero_mercos: numero,
    cliente_nome: nomeLista,
    cliente_documento: registro.cliente_documento || null,
    cliente_local_nome: classificacao.cliente_local_nome,
    valor_cents: registro.total_cents ?? detalhe?.total_cents ?? 0,
    data_pedido: registro.data_emissao || null,
    situacao,
    pedido_id: classificacao.pedido_id,
    atualizado_em: new Date().toISOString(),
  };

  // Rodada 2: o pedido importado pela colisão agora é encontrado por
  // `numero_mercos` com identidade igual. Ainda assim a colisão continua no
  // artefato, marcada como resolvida — é a prova de que houve perda e que ela
  // foi recuperada, não um "zero ausentes" que apaga o histórico.
  const anterior = anteriores.get(numero);
  if (anterior?.situacao === "colisao" && anterior.resolvido_em) {
    linha.situacao = "colisao";
    linha.resolvido_em = anterior.resolvido_em;
    linha.pedido_id = anterior.pedido_id ?? linha.pedido_id;
  }

  if (classificacao.situacao === "ausente") resultado.ausentes_por_numero.push(numero);
  if (situacao === "ignorado_sem_itens") resultado.ignorados_sem_itens.push(numero);
  if (situacao === "sem_detalhe") resultado.sem_detalhe.push(numero);

  if ((situacao === "ausente" || situacao === "colisao") && APLICAR && detalhe) {
    const { data: importado, error: erroImport } = await admin.rpc("fn_importar_pedido_mercos", {
      p_org: ORG,
      p_pedido: payloadDeImportacao(detalhe),
    });
    if (!erroImport && importado?.status === "inserted") {
      linha.pedido_id = importado.order_id ?? linha.pedido_id;
      if (situacao === "ausente") {
        linha.situacao = "importado";
      } else {
        linha.resolvido_em = new Date().toISOString();
      }
      resultado.importados.push(numero);
    } else if (!erroImport && importado?.status === "skipped") {
      // Identidade divergente na lista pode gerar falso positivo de colisão.
      // O importador é a autoridade: `ja_importado` prova que o pedido JÁ
      // estava cá (por numero_mercos). Não é perda e não é importação nova.
      linha.situacao = "importado";
      linha.pedido_id = importado.order_id ?? linha.pedido_id;
      resultado.ja_importados.push(numero);
    } else {
      resultado.erros_importacao++;
    }
  }

  // Contado no FINAL: colisão confirmada (`inserted` ou já resolvida) entra;
  // falso positivo que o importador disse `ja_importado` sai da lista.
  if (linha.situacao === "colisao") resultado.colisoes_por_identidade.push(numero);

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

const cobertura = avaliarCobertura({
  censoEsperado: ESPERADO,
  censoLido: resultado.censo_lido,
  linhasIlegiveis: resultado.linhas_ilegiveis,
  registrosSemData: resultado.registros_sem_data,
  erros: resultado.erros_importacao,
});
const veredito = avaliarResultado({ cobertura, ausentesDepois: resultado.ausentes_depois });
resultado.status = veredito.status;
resultado.motivos = veredito.motivos;
resultado.verificado = veredito.verificado;
resultado.declaracao = veredito.declaracao;

const { error: erroRun } = await admin
  .from("mercos_reconciliacoes_runs")
  .upsert({
    organization_id: ORG,
    run_id: RUN_ID,
    censo_esperado: ESPERADO,
    censo_lido: resultado.censo_lido,
    linhas_ilegiveis: resultado.linhas_ilegiveis,
    registros_sem_data: resultado.registros_sem_data,
    ausentes: resultado.ausentes_depois,
    colisoes: resultado.colisoes_por_identidade.length,
    ignorados_sem_item: resultado.ignorados_sem_itens.length,
    importados: resultado.importados.length,
    status: veredito.status,
    motivos: veredito.motivos,
    verificado: veredito.verificado,
    declaracao: veredito.declaracao,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: "organization_id,run_id" });
if (erroRun) {
  resultado.erros_importacao++;
  resultado.verificado = false;
  resultado.declaracao = "não verificado: falha ao gravar o resumo da rodada";
}

resultado.duracao_ms = Date.now() - inicio;
process.stdout.write(JSON.stringify(resultado, null, 2) + "\n");
if (resultado.erros_importacao > 0 || resultado.status === "incompleta") process.exitCode = 1;
