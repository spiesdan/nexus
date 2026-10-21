/**
 * COLETOR DE PEDIDOS DO MERCOS — fora do repositório, de propósito.
 *
 * Por que fora: este arquivo é operacional e one-off. Ele lê credencial do
 * ambiente e conversa com um ERP de terceiro. Nada disso pertence ao git do
 * produto — nem por acidente, nem num commit depressa.
 *
 * ─── O QUE ELE FAZ ───────────────────────────────────────────────────────
 *
 * 1. Entra no painel (credencial só de `MERCOS_EMAIL`/`MERCOS_SENHA`).
 * 2. Percorre a LISTA de pedidos por cursor (`ultimo_id`), do período pedido.
 * 3. Para cada pedido, lê a página de DETALHE e extrai cabeçalho + itens.
 * 4. Grava JSONL incremental — se parar no meio, não perde o que já leu.
 * 5. RECONCILA: soma dos itens tem que bater com o total do pedido.
 *    Quando não bate, marca `diverge: true` e NÃO esconde — é o alarme que
 *    impede 572 pedidos com item errado de entrarem como verdade.
 *
 * ─── POR QUE RECONCILIA E NÃO SÓ CONTA ───────────────────────────────────
 *
 * Parse de HTML de terceiro é frágil por natureza: uma classe nova no CSS
 * move uma coluna e o número sai errado sem erro nenhum. A soma dos itens é a
 * única verdade que o próprio sistema dá, e é independente do meu parser. Se
 * ela não fecha, o parser está errado — e um pedido sem item é melhor do que
 * um pedido com item errado, porque faturamento e comissão mentem em silêncio.
 *
 * Uso:
 *   MERCOS_EMAIL=... MERCOS_SENHA=... node coletar.mjs --de 01/09/2026 --ate 14/10/2026
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? process.argv[i + 1] : padrao;
};

const EMPRESA = process.env.MERCOS_EMPRESA || "338282";
const BASE = `https://app.mercos.com/${EMPRESA}`;
const SAIDA = arg("saida", new URL("./pedidos.jsonl", import.meta.url).pathname);
const ANDAMENTO = arg("andamento", new URL("./andamento.json", import.meta.url).pathname);

const DE = arg("de", "01/09/2026");
const ATE = arg("ate", "31/12/2026");
/** Só o que ainda não foi importado: o banco tem até este número. */
const A_PARTIR_DE = Number(arg("a-partir-de", "18459"));
const LIMITE = Number(arg("limite", "0")) || Infinity;
// 1,2s entre pedidos TOMOU 429 medido em 13/10/2026. O padrão aqui é
// 4s: mais lento, e a recoleta é retomável, então demorar não custa nada.
const ESPERA_MS = Number(arg("espera", "4000"));
/** Recuo a partir de 429. O limite do servidor é curto: 30s sobe a 10min. */
const RECUO_INICIAL = 30_000;
const RECUO_MAXIMO = 600_000;

const email = process.env.MERCOS_EMAIL;
const senha = process.env.MERCOS_SENHA;
if (!email || !senha) {
  console.error("Falta MERCOS_EMAIL ou MERCOS_SENHA no ambiente.");
  process.exit(1);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const moeda = (s) => {
  const m = String(s ?? "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const v = Math.round(parseFloat(m || "0") * 100);
  return Number.isFinite(v) ? v : 0;
};

/** O que já foi lido — é o que torna o rodízio retomável. */
function lidos() {
  if (!existsSync(SAIDA)) return new Set();
  return new Set(
    readFileSync(SAIDA, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l).numero;
        } catch {
          return null;
        }
      })
      .filter((n) => n != null),
  );
}

const STORAGE = process.env.MERCOS_STORAGE_STATE || "";
const CODIGO_FILE = process.env.MERCOS_CODIGO_FILE || "";

/** O código de e-mail só existe quando o Mercos desconfia do dispositivo. */
function codigoDoEmail() {
  if (process.env.MERCOS_CODIGO) return process.env.MERCOS_CODIGO.trim();
  if (CODIGO_FILE && existsSync(CODIGO_FILE)) {
    const lido = readFileSync(CODIGO_FILE, "utf8").replace(/\D/g, "").slice(0, 6);
    if (lido.length === 6) return lido;
  }
  return "";
}

const navegador = await chromium.launch({
  headless: true,
  // O contêiner roda sem CAP_SYS_ADMIN; o sandbox do Chromium não sobe.
  args: ["--no-sandbox"],
});
const contexto = await navegador.newContext({
  locale: "pt-BR",
  viewport: { width: 1440, height: 900 },
  // A sessão persistida é o que evita um código de e-mail por dia. O Mercos
  // passou a pedir código depois da senha (medido em 21/10/2026), e sem
  // storage state o cron das 17h pararia num prompt que ninguém vê.
  ...(STORAGE && existsSync(STORAGE) ? { storageState: STORAGE } : {}),
});
const pagina = await contexto.newPage();

async function entrar() {
  await pagina.goto(`${BASE}/pedidos/`, { waitUntil: "domcontentloaded" });
  if (!pagina.url().includes("/login")) return;

  await pagina.goto("https://app.mercos.com/login/", { waitUntil: "domcontentloaded" });
  await pagina.fill('input[type="email"], input[name="email"]', email);
  await pagina.fill('input[type="password"], input[name="password"]', senha);
  await pagina.click('button:has-text("ENTRAR"), input[type="submit"]');

  // Espera ou o painel, ou o prompt de código. O URL fica em /login nos dois
  // casos por alguns instantes; o texto é o discriminante.
  await pagina.waitForTimeout(5000);
  const texto = await pagina.locator("body").innerText();
  if (/Insira seu c[oó]digo/i.test(texto)) {
    let codigo = codigoDoEmail();
    if (!codigo) {
      // O primeiro login de um dispositivo novo é o ÚNICO que pede código.
      // Ficar esperando o arquivo (em vez de falhar na hora) permite que o
      // operador mande o código sem reiniciar o worker; a sessão é salva logo
      // depois, e o cron das 17h não vê este prompt de novo.
      console.log("  aguardando código do e-mail (MERCOS_CODIGO_FILE)…");
      const limite = Date.now() + Number(process.env.MERCOS_CODIGO_ESPERA_MS || "900000");
      while (!codigo && Date.now() < limite) {
        await dormir(3000);
        codigo = codigoDoEmail();
      }
    }
    if (!codigo) {
      throw new Error(
        "mercos_codigo_necessario: o Mercos pediu o código enviado por e-mail. " +
          "Grave os 6 dígitos em MERCOS_CODIGO_FILE (ou passe MERCOS_CODIGO) e rode de novo; " +
          "depois da primeira entrada a sessão fica salva e o código não é pedido de novo.",
      );
    }
    const campos = pagina.locator('input[type="text"]');
    const n = await campos.count();
    if (n < 6) throw new Error(`mercos_codigo_necessario: esperava 6 campos, achei ${n}`);
    for (let i = 0; i < 6; i++) await campos.nth(i).fill(codigo[i]);
    await pagina.click('button:has-text("continuar")');
  }

  await pagina.waitForFunction((empresa) => location.pathname.includes(empresa), EMPRESA, {
    timeout: 45_000,
  });
  if (STORAGE) {
    mkdirSync(new URL(".", `file://${STORAGE}`).pathname, { recursive: true });
    await contexto.storageState({ path: STORAGE });
  }
  console.log("  login ok:", await pagina.title());
}

try {
  await entrar();
  await pagina.goto(`${BASE}/pedidos/`, { waitUntil: "domcontentloaded" });

  // ─── LISTA: percorre por cursor ─────────────────────────────────────────
  // ═══ POR QUE A VARREDURA PARA PELO NÚMERO E NÃO POR DATA ═══════════════
  //
  // Medido em 13/10/2026 com quatro janelas (1 dia, 1 mês, 6 semanas, 6 anos):
  // as quatro devolveram a MESMA página 1, de #19012 a #19031. O servidor
  // ignora `data_emissao_inicio`/`data_emissao_fim` — e o próprio link
  // "Próxima »" que o Mercos gera descarta o `data_emissao_fim`.
  //
  // Consequência prática: filtrar por data aqui não filtra nada, e a varredura
  // caminha a história inteira. O corte certo é o NÚMERO do pedido, que é
  // monotônico e é o mesmo campo que deduplica a importação. Parar na página
  // em que o maior número já é <= o que o banco tem é o que transforma
  // "~300 páginas" em "~29".
  const lista = [];
  let cursor = null;
  let paginas = 0;
  const vistos = new Set();

  while (paginas < 400) {
    const qs = new URLSearchParams({
      tipo_pesquisa: "0",
      status: "9",
      data_emissao_inicio: DE,
      data_emissao_fim: ATE,
    });
    if (cursor) qs.set("ultimo_id", cursor);
    const url = `${BASE}/pedidos/?${qs}`;
    await pagina.goto(url, { waitUntil: "domcontentloaded" });
    await pagina.waitForSelector("#aba-pedidos-react-root", { timeout: 30_000 }).catch(() => {});

    const paginaDados = await pagina.evaluate(() => {
      const STATUS = ["Concluído", "Em orçamento", "Cancelado", "Expedido", "Aprovado", "Faturado"];
      const pedidos = [];
      for (const a of document.querySelectorAll('a[href*="/detalhar/"]')) {
        const id = a.getAttribute("href").match(/pedidos\/(\d+)\/detalhar/)?.[1] ?? null;
        // Sobe até o CARTÃO: o textContent do link é só o número, e o cartão
        // é o ancestral mais próximo que tem número + status + valor juntos.
        let el = a;
        for (let i = 0; i < 8 && el?.parentElement; i++) {
          el = el.parentElement;
          const t = el.innerText || "";
          if (/R\$/.test(t) && STATUS.some((s) => t.includes(s))) break;
        }
        const linhas = (el?.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean);
        const iNum = linhas.findIndex((l) => /^#\d{3,8}/.test(l));
        if (!id || iNum < 0) continue;
        pedidos.push({
          id,
          numero: Number(linhas[iNum].match(/#(\d{3,8})/)[1]),
          status: STATUS.find((s) => linhas.some((l) => l === s)) ?? null,
          razao_lista: linhas[iNum + 2] ?? null,
          fantasia_lista: linhas[iNum + 3] ?? null,
        });
      }
      const prox = [...document.querySelectorAll("a")]
        .find((a) => /^Próxima/.test(a.textContent.trim()))
        ?.getAttribute("href");
      const cursor = prox ? new URL(prox, location.origin).searchParams.get("ultimo_id") : null;
      return { pedidos, cursor };
    });

    const novos = paginaDados.pedidos.filter((p) => p.id && p.numero && !vistos.has(p.id));
    if (novos.length === 0) break;
    novos.forEach((p) => vistos.add(p.id));
    lista.push(...novos);
    paginas++;
    process.stdout.write(`\r  lista: ${lista.length} pedidos em ${paginas} pagina(s)`);

    // Para assim que a página inteira já for antiga. `Math.max` da página, e
    // não do acumulado: o que decide é se ESTA página trouxe algo novo.
    const maiorDaPagina = Math.max(...novos.map((p) => p.numero));
    if (maiorDaPagina <= A_PARTIR_DE) {
      console.log(`\n  corte atingido na pagina ${paginas} (maior numero ${maiorDaPagina} <= ${A_PARTIR_DE})`);
      break;
    }

    if (!paginaDados.cursor) break;
    cursor = paginaDados.cursor;
    await dormir(700);
  }
  console.log(`\n  lista fechada: ${lista.length} pedidos entre ${DE} e ${ATE}`);

  // ─── DETALHE: cabeçalho + itens, com reconciliação ───────────────────────
  const jaLidos = lidos();
  const alvo = lista
    .filter((p) => p.numero > A_PARTIR_DE)
    .filter((p) => !jaLidos.has(p.numero))
    .sort((a, b) => b.numero - a.numero)
    .slice(0, LIMITE);

  console.log(
    `  a importar: ${alvo.length} (ja lidos antes: ${jaLidos.size}; corte: numero > ${A_PARTIR_DE})`,
  );
  if (alvo.length === 0) {
    console.log("  nada a fazer.");
  }

  const divergences = [];
  const falhas = [];
  let feitas = 0;
  let tentativas429 = 0;

  for (const pedido of alvo) {
    const dados = await pagina.evaluate(async (id) => {
      const resp = await fetch(`/338282/pedidos/${id}/detalhar/`, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      const html = await resp.text();
      // ═══ O STATUS HTTP É O QUE SEPARA DADO DE ERRO ══════════════════════
      // Medido em 13/10/2026: ao passar de ~4 requisições seguidas, o servidor
      // respondeu 429 com 39 bytes. Parseado, esse corpo dá "0 itens" e
      // "R$ 0,00" — e a reconciliação aprova, porque 0 == 0. Foi assim que 371
      // pedidos entraram como "cancelado sem itens" quando eram recusa.
      //
      // A reconciliação sozinha NÃO protege: ela não distingue "não tem item"
      // de "não me mandou nada". Só o status HTTP distingue.
      if (!resp.ok) return { http_status: resp.status, erro: true };
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("script,style,noscript").forEach((e) => e.remove());
      const linhas = doc.body.innerText.split("\n").map((s) => s.trim()).filter(Boolean);

      // O card da LISTA nem sempre carrega o status (medido em 21/10/2026:
      // 24 pedidos chegaram com `status_lista` nulo). O detalhe sempre tem o
      // badge de faturamento; ele é a fonte de verdade quando a lista falha.
      const badgeFaturamento = doc.querySelector("#badge-status-faturamento");
      const statusFaturamento =
        badgeFaturamento && !/display\s*:\s*none/i.test(badgeFaturamento.getAttribute("style") || "")
          ? badgeFaturamento.textContent.trim()
          : null;

      // Rótulo -> valor é SEMPRE a linha seguinte. O bloco "Detalhes do pedido"
      // é uma lista de pares; não depende de classe nem de posição de pixel.
      const campo = (rotulo) => {
        // O rotigo vem como "* No do pedido" — o asterisco de "obrigatorio" na
        // frente. Sem tirar o "* " (e os espacos), `startsWith` nao casa e o
        // numero do pedido sai 0 — que e o pior defeito possivel aqui: 0 nao
        // deduplica, e o mesmo pedido entra duas vezes.
        const alvo = rotulo.toLowerCase();
        const i = linhas.findIndex((l) => l.replace(/^[*\s]+/, "").toLowerCase().startsWith(alvo));
        return i > -1 ? (linhas[i + 1] ?? "") : null;
      };

      const itens = [...doc.querySelectorAll("table tr")]
        .map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.trim().replace(/\s+/g, " ")).filter(Boolean))
        .filter((c) => c.length >= 6 && /R\$/.test(c[c.length - 1] ?? ""))
        .map((c) => {
          const codigo = /^\d+$/.test(c[0]) ? c[0] : null;
          const desc = codigo ? c[1] : c[0];
          const comCodigo = codigo ? c : null;
          const ult = comCodigo ? comCodigo[comCodigo.length - 1] : c[c.length - 1];
          const pen = comCodigo ? comCodigo[comCodigo.length - 2] : c[c.length - 2];
          // "1 UN", "3 GL", "12,5 L": o numero vai para `quantidade` e a
          // unidade para `unidade`. Sem esta divisao o item entra com 1 UN de
          // quantidade e o relatorio de quantidade mente.
          const qTexto = c[comCodigo ? 2 : 1] ?? "";
          const qm = qTexto.match(/^([\d.,]+)\s*(.*)$/);
          return {
            codigo,
            descricao: desc,
            quantidade: qm ? parseFloat(qm[1].replace(",", ".")) : null,
            unidade: qm && qm[2] ? qm[2].trim() : null,
            preco_liq: pen,
            subtotal: ult,
          };
        });

      // ═══ BLOCO DO CLIENTE — a parte mais fácil de errar ══════════════════
      //
      // A tela empilha, nesta ordem:
      //     <fantasia>
      //     "- <razão social>"
      //     "- <CNPJ/CPF>"
      //     <telefone>
      //     <cidade>, <uf>
      //
      // A tentação é ancorar no CNPJ e chamar a linha de "razão social". Não é:
      // a linha do CNPJ É o documento, e a razão é a ANTERIOR. Feito assim, o
      // `cliente_nome` de 572 pedidos vira um número de CNPJ — e o nome do
      // cliente é o que o vendedor lê na tela e o que casa o contato.
      const jDoc = linhas.findIndex((l) => /^-?\s*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(l));
      const tiraPrefixo = (l) => (l || "").replace(/^[-–]\s*/, "").trim();
      const documento = jDoc > -1 ? (linhas[jDoc].match(/[\d.]+\/[\d-]+/) || [])[0] ?? null : null;
      const razao = jDoc > 0 ? tiraPrefixo(linhas[jDoc - 1]) : null;
      const anterior = jDoc > 1 ? linhas[jDoc - 2] : null;
      // A fantasia é a linha que NÃO começa com "-"; se a anterior começar com
      // "-", não existe fantasia separada (pedido de consumidor final).
      const fantasia = anterior && !/^[-–]/.test(anterior) ? anterior.trim() : null;

      //
      // Telefone e cidade vêm nas linhas seguintes, MAS cada um deles é
      // precedido por um ícone (Material Symbol) que o `innerText` cola no
      // começo da linha. Por isso a busca é por CONTEÚDO e varre as 3 linhas
      // seguintes, em vez de ancorar na posição exata: a posição muda entre o
      // bloco do cliente e o da representada, e o ícone some em metade das telas.
      const janela = jDoc > -1 ? linhas.slice(jDoc + 1, jDoc + 4) : [];
      const soNumero = (l) => (l || "").replace(/[^\d()\s-]/g, "").trim();
      const linhaFone = janela.find((l) => /\(\d{2}\)\s?\d{4,5}-?\d{4}|\d{4,5}-\d{4}/.test(soNumero(l)) && soNumero(l).length >= 8);
      const telefone = linhaFone ? soNumero(linhaFone) || null : null;
      const linhaCidade = janela.find((l) => l.includes(",") && !/^[^\w(]*\s*[\d.,/-]+$/.test(l.trim()));
      const cidade = linhaCidade ? linhaCidade.replace(/^[^\w(]*\s*/, "").trim() : null;

      return {
        http_status: resp.status,
        // `numero` NULO é falha de leitura, nunca "pedido sem número". Sem
        // este `if`, o registro entra com 0 e o dedup por número não funciona.
        numero: (() => {
          const bruto = campo("Nº do pedido") || campo("N. do pedido") || "";
          return Number(bruto.replace(/\D/g, "")) || null;
        })(),
        data_emissao: campo("Data da emissão"),
        status_detalhe: statusFaturamento || null,
        vendedor: campo("Vendedor"),
        condicao_pagamento: campo("Cond. de pagamento"),
        valor_frete: campo("Valor do frete"),
        transportadora: campo("Transportadora"),
        contato_cliente: campo("Contato no cliente"),
        cliente: { razao, documento, fantasia, telefone, cidade },
        itens,
        total_bruto: (() => {
          // `/^Valor total/` pega "Valor total DO PEDIDO" — que e o campo do
          // formulario de adicionar produto, e vem sozinho, sem valor. O
          // total real e a linha que e EXATAMENTE "Valor total", com o preco
          // na linha seguinte. Sem este `\s*$`, o total sai 0 e a
          // reconciliacao acusa 100% de divergencia.
          const i = linhas.findIndex((l) => /^Valor total\s*$/i.test(l));
          const a1 = i > -1 ? (linhas[i + 1] || "") : "";
          const achado = a1.match(/R\$\s*([\d.,]+)/)?.[1];
          if (achado) return achado;
          // Reserva: o bloco de resumo traz "Total   R$ 200,00" numa linha so.
          return linhas.find((l) => /^Total\s+R\$/i.test(l))?.match(/R\$\s*([\d.,]+)/)?.[1] ?? null;
        })(),
      };
    }, pedido.id);

    // 429: PARA, espera o limite passar e tenta o MESMO pedido depois. Sem
    // espera, o próximo pedido toma 429 também e a recoleta inteira vira lixo
    // silencioso — que é exatamente o que aconteceu na primeira passada.
    if (dados.erro) {
      if (dados.http_status === 429) {
        const espera = Math.min(RECUO_MAXIMO, RECUO_INICIAL * 2 ** (tentativas429++));
        console.log(`\n  429 no pedido ${pedido.numero}: recuando ${Math.round(espera / 1000)}s`);
        writeFileSync(ANDAMENTO, JSON.stringify({ feitas, de: alvo.length, ultima: pedido.numero, aguardando429: true }));
        await dormir(espera);
        continue;
      }
      falhas.push({ numero: pedido.numero, erro: `HTTP ${dados.http_status}` });
      console.log(`\n  pedido ${pedido.numero}: HTTP ${dados.http_status}`);
      continue;
    }
    if (!dados.numero) {
      falhas.push({ numero: pedido.numero, erro: "numero nao encontrado no HTML" });
      continue;
    }

    const somaItens = dados.itens.reduce((a, i) => a + moeda(i.subtotal), 0);
    // O total vem de "Valor total R$ X" — que na página aparece colado.
    const total = moeda(dados.total_bruto);

    const registro = {
      ...dados,
      id_mercos: pedido.id,
      status_lista: pedido.status ?? null,
      razao_lista: pedido.razao_lista ?? null,
      fantasia_lista: pedido.fantasia_lista ?? null,
      total_cents: total,
      soma_itens_cents: somaItens,
      bate: somaItens === total,
      coletado_em: new Date().toISOString(),
    };

    if (!registro.bate) divergences.push({ numero: registro.numero, soma: somaItens, total });
    appendFileSync(SAIDA, JSON.stringify(registro) + "\n");
    feitas++;
    if (feitas % 20 === 0) {
      writeFileSync(ANDAMENTO, JSON.stringify({ feitas, de: alvo.length, ultima: registro.numero }));
      process.stdout.write(`\r  detalhe: ${feitas}/${alvo.length} (${divergences.length} divergentes)`);
    }
    await dormir(ESPERA_MS);
  }

  console.log(`\n  detalhe: ${feitas}/${alvo.length} lidos`);
  console.log(`  divergentes (soma dos itens != total): ${divergences.length}`);
  console.log(`  falhas de leitura: ${falhas.length}`);
  if (falhas.length > 0) console.log("  amostra:", JSON.stringify(falhas.slice(0, 10)));
  if (divergences.length > 0) {
    console.log("  amostra:", JSON.stringify(divergences.slice(0, 10)));
    console.log("  >>> NÃO importar sem olhar isto: parse errado entra como verdade.");
  }
  writeFileSync(ANDAMENTO, JSON.stringify({ feitas, de: alvo.length, divergences: divergences.length, falhas: falhas.length, fim: true }));
  writeFileSync(
    SAIDA.replace(/\.jsonl$/, "-resultado.json"),
    JSON.stringify({ lidos: feitas, alvo: alvo.length, divergencias: divergences, falhas, fim: true }),
  );
} finally {
  await navegador.close();
}
