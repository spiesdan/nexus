/**
 * WORKER DO MERCOS — o navegador dedicado.
 *
 * Por que existe separado do app: o Next atende browser de gente; abrir um
 * Chromium no mesmo processo é caro, aumenta a imagem e coloca a credencial do
 * ERP no processo que renderiza a tela. Aqui o worker só consome a fila
 * `mercos_import_runs`, loga alto e devolve o resumo para a tela.
 *
 * Não é um agente LLM. O caminho é determinístico de propósito: o HTML do
 * Mercos já é frágil; um modelo no meio acrescentaria custo e imprevisibilidade
 * sem resolver o único problema real — parsear a página e reconciliar total.
 */
import { createServer } from "node:http";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EMAIL = process.env.MERCOS_EMAIL || "";
const SENHA = process.env.MERCOS_SENHA || "";
const EMPRESA = process.env.MERCOS_EMPRESA || "338282";
const POLL_MS = Number(process.env.MERCOS_POLL_MS || "5000");
const SCRAPE_TIMEOUT_MS = Number(process.env.MERCOS_SCRAPE_TIMEOUT_MS || "1800000");
const TMP_ROOT = process.env.MERCOS_TMP_DIR || "/tmp/mercos";

const STATUS = {
  Concluído: "entregue",
  "Em orçamento": "rascunho",
  Cancelado: "cancelado",
  Expedido: "expedido",
  Aprovado: "aprovado",
  Faturado: "faturado",
  "Parcialmente Faturado": "faturado",
  // O detalhe do Mercos mostra "Aguardando Faturamento" quando o pedido já
  // saiu do rascunho mas ainda não foi faturado. Na lista esse rótulo às
  // vezes não vem; por isso o fallback abaixo.
  "Aguardando Faturamento": "aprovado",
};

function log(evento, dados = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), worker: "mercos", evento, ...dados }) + "\n",
  );
}

function moedaParaCents(valor) {
  const limpo = String(valor ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Math.round(Number.parseFloat(limpo || "0") * 100);
  return Number.isFinite(n) ? n : 0;
}

function dataIso(valor) {
  const m = String(valor ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return new Date().toISOString();
  // Meio-dia em Brasília: o pedido é uma DATA, e gravar 00:00 UTC faria a
  // lista dele cair no dia anterior em qualquer tela que leia BRT.
  return `${m[3]}-${m[2]}-${m[1]}T15:00:00.000Z`;
}

function dataBr(d) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function normalizar(linha) {
  const bruto = JSON.parse(linha);
  const statusOrigem = bruto.status_lista ?? bruto.status_detalhe ?? null;
  const status = statusOrigem ? STATUS[statusOrigem] : null;
  if (!status) {
    return { erro: `status não lido na lista (${statusOrigem ?? "ausente"})`, numero: bruto.numero ?? null };
  }
  if (!bruto.numero) {
    return { erro: "número do pedido não encontrado", numero: null };
  }
  if (!bruto.bate) {
    return {
      erro: `soma dos itens ${bruto.soma_itens_cents} != total ${bruto.total_cents}`,
      numero: bruto.numero,
    };
  }

  const cli = bruto.cliente ?? {};
  // Razão social é o nome do cadastro. A fantasia pode ser o nome do
  // vendedor/evento ("event PRAZO - ..."), e era ela que virava o nome do
  // contato: pedido da TRANSGIRES nascia como "event PRAZO - TRANSGIRES".
  // O detalhe é a fonte limpa; a lista fica só como reserva.
  const nomeLista = [bruto.fantasia_lista, bruto.razao_lista]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(" - ");
  const clienteNome = (cli.razao || cli.fantasia || nomeLista || "").replace(/^[-\u2013]\s*/, "").trim();
  if (!clienteNome) {
    return { erro: "cliente sem nome", numero: bruto.numero };
  }

  const itens = (bruto.itens ?? []).map((i) => ({
    codigo: i.codigo ?? null,
    descricao: i.descricao ?? "",
    quantidade: Number(i.quantidade ?? 1),
    preco_unit_cents: moedaParaCents(i.preco_liq),
    subtotal_cents: moedaParaCents(i.subtotal),
  }));

  return {
    pedido: {
      numero: bruto.numero,
      status,
      status_origem: statusOrigem,
      cliente_nome: clienteNome.slice(0, 300),
      cliente_documento: cli.documento ?? null,
      // Quem emitiu o pedido no Mercos. O detalhe traz "Vendedor"; a lista
      // traz "emitido por". Guardamos os dois porque o detalhe pode falhar e a
      // lista já veio na varredura.
      vendedor: (bruto.vendedor || bruto.vendedor_lista || "").trim() || null,
      cliente: {
        razao: cli.razao ?? null,
        fantasia: cli.fantasia ?? null,
        documento: cli.documento ?? null,
        telefone: cli.telefone ?? null,
        cidade: cli.cidade ?? null,
      },
      subtotal_cents: itens.reduce((soma, i) => soma + i.subtotal_cents, 0),
      desconto_cents: 0,
      frete_cents: moedaParaCents(bruto.valor_frete),
      total_cents: bruto.total_cents,
      condicao_pagamento: bruto.condicao_pagamento ?? null,
      created_at: dataIso(bruto.data_emissao),
      itens,
    },
  };
}

function executarColetor({ saida, andamento, aPartirDe, de, ate }) {
  return new Promise((resolve, reject) => {
    const script = new URL("./coletar.mjs", import.meta.url).pathname;
    const filho = spawn(
      process.execPath,
      [
        script,
        "--saida",
        saida,
        "--andamento",
        andamento,
        "--a-partir-de",
        String(aPartirDe),
        "--de",
        de,
        "--ate",
        ate,
        "--espera",
        process.env.MERCOS_ESPERA_MS || "3000",
      ],
      {
        env: { ...process.env, MERCOS_EMAIL: EMAIL, MERCOS_SENHA: SENHA, MERCOS_EMPRESA: EMPRESA },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    const limite = setTimeout(() => {
      filho.kill("SIGKILL");
      reject(new Error(`coletor excedeu ${Math.round(SCRAPE_TIMEOUT_MS / 1000)}s`));
    }, SCRAPE_TIMEOUT_MS);
    filho.stdout.on("data", (b) => {
      stdout += b.toString();
      if (stdout.length > 200_000) stdout = stdout.slice(-100_000);
    });
    filho.stderr.on("data", (b) => {
      stderr += b.toString();
      if (stderr.length > 20_000) stderr = stderr.slice(-10_000);
    });
    filho.on("error", (err) => {
      clearTimeout(limite);
      reject(err);
    });
    filho.on("close", (code) => {
      clearTimeout(limite);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`coletor saiu com ${code}: ${stderr.slice(-1500) || stdout.slice(-1500)}`));
    });
  });
}

async function processar(admin, run) {
  const org = run.organization_id;
  const { data: ultimo, error: erroUltimo } = await admin
    .from("commercial_orders")
    .select("numero, created_at")
    .eq("organization_id", org)
    .eq("origem", "mercos")
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroUltimo) throw new Error(erroUltimo.message);

  // Backfill explícito: quando um lote anterior falhou em pedidos abaixo do
  // maior número já importado, a coleta normal nunca os revisita. O override
  // existe só para recuperação operacional e não fica ligado por padrão.
  const aPartirDeOverride = Number(process.env.MERCOS_A_PARTIR_DE || 0);
  const maiorNumero = aPartirDeOverride > 0 ? aPartirDeOverride : Number(ultimo?.numero ?? 0);
  const inicio =
    aPartirDeOverride > 0
      ? new Date(Date.now() - 30 * 86400000)
      : ultimo?.created_at
        ? new Date(ultimo.created_at)
        : new Date(Date.now() - 30 * 86400000);
  const de = dataBr(new Date(inicio.getTime() - 86400000));
  const ate = dataBr(new Date(Date.now() + 86400000));
  const pasta = join(TMP_ROOT, run.id);
  mkdirSync(pasta, { recursive: true });
  const saida = join(pasta, "pedidos.jsonl");
  const andamento = join(pasta, "andamento.json");

  log("inicio", { run: run.id, org, maior_numero: maiorNumero, de, ate });
  const { stdout } = await executarColetor({ saida, andamento, aPartirDe: maiorNumero, de, ate });

  let conteudo = "";
  try {
    conteudo = readFileSync(saida, "utf8");
  } catch {
    conteudo = "";
  }
  const linhas = conteudo.split("\n").filter(Boolean);
  const erros = [];
  let novos = 0;
  let pulados = 0;
  let itensNovos = 0;
  let clientesNovos = 0;
  let divergentes = 0;

  for (const linha of linhas) {
    let normalizado;
    try {
      normalizado = normalizar(linha);
    } catch (err) {
      erros.push({ motivo: "json_invalido", detalhe: err instanceof Error ? err.message : String(err) });
      continue;
    }
    if (normalizado.erro) {
      if (normalizado.erro.startsWith("soma dos itens")) divergentes++;
      erros.push({ numero: normalizado.numero, motivo: normalizado.erro });
      continue;
    }
    const { data, error } = await admin.rpc("fn_importar_pedido_mercos", {
      p_org: org,
      p_pedido: normalizado.pedido,
    });
    if (error) {
      erros.push({ numero: normalizado.pedido.numero, motivo: error.message });
      continue;
    }
    const resultado = data ?? {};
    if (resultado.status === "inserted") {
      novos++;
      itensNovos += Number(resultado.items ?? 0);
      if (resultado.customer_created) clientesNovos++;
    } else if (resultado.status === "skipped") {
      pulados++;
    } else if (resultado.status === "divergent") {
      divergentes++;
      erros.push({ numero: normalizado.pedido.numero, motivo: resultado.motivo ?? "divergente" });
    } else {
      erros.push({ numero: normalizado.pedido.numero, motivo: "resultado inesperado" });
    }
  }

  const status = erros.length > 0 ? (novos > 0 ? "partial" : "error") : "success";
  const resumo = {
    lidos: linhas.length,
    novos,
    pulados,
    divergentes,
    falhas: erros.length,
    stdout: stdout.slice(-2000),
    de,
    ate,
    maior_numero_anterior: maiorNumero,
  };
  await admin
    .from("mercos_import_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      orders_new: novos,
      orders_skipped: pulados,
      items_new: itensNovos,
      customers_new: clientesNovos,
      errors: erros.slice(0, 200),
      summary: resumo,
    })
    .eq("id", run.id)
    .eq("organization_id", org);
  rmSync(pasta, { recursive: true, force: true });
  log("fim", { run: run.id, status, ...resumo });
  return { status, novos, pulados, itensNovos, clientesNovos, erros: erros.length };
}

async function marcarErro(admin, run, err) {
  const detalhe = err instanceof Error ? err.message : String(err);
  await admin
    .from("mercos_import_runs")
    .update({
      status: "error",
      finished_at: new Date().toISOString(),
      errors: [{ motivo: "worker", detalhe }],
    })
    .eq("id", run.id)
    .eq("organization_id", run.organization_id);
  log("erro", { run: run.id, detalhe });
}

async function laco(admin) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    log("sem_supabase", { detalhe: "NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes" });
    return;
  }
  const { data, error } = await admin.rpc("fn_claim_mercos_import_run");
  if (error) {
    log("claim_erro", { detalhe: error.message });
    return;
  }
  const run = Array.isArray(data) ? data[0] : data;
  if (!run) return;
  try {
    if (!EMAIL || !SENHA) {
      throw new Error("MERCOS_EMAIL/MERCOS_SENHA ausentes no worker");
    }
    await processar(admin, run);
  } catch (err) {
    await marcarErro(admin, run, err);
  }
}

if (!SUPABASE_URL || !SERVICE_KEY) {
  log("boot_sem_supabase");
} else {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const servidor = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, worker: "mercos" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  servidor.listen(Number(process.env.MERCOS_HEALTH_PORT || "8791"), "0.0.0.0", () => {
    log("health", { porta: process.env.MERCOS_HEALTH_PORT || "8791" });
  });
  log("boot", { empresa: EMPRESA, poll_ms: POLL_MS });
  for (;;) {
    await laco(admin);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
