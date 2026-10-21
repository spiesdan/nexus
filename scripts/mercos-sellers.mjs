/**
 * Backfill de vendedor dos pedidos Mercos.
 *
 * O cartão da lista traz "emitido por <vendedor>" em cada pedido. A varredura
 * usa o mesmo cursor `ultimo_id` do coletor e para quando o Mercos não oferece
 * mais "Próxima". O resultado é um JSONL `{numero, vendedor}` para atualizar
 * `commercial_orders` sem reabrir os 11 mil detalhes.
 */
import { chromium } from "@playwright/test";
import { appendFileSync, writeFileSync, existsSync, readFileSync } from "node:fs";

const BASE = "https://app.mercos.com";
const EMPRESA = process.env.MERCOS_EMPRESA || "338282";
const SAIDA = process.env.MERCOS_SAIDA || "/out/sellers.jsonl";
const ESTADO = process.env.MERCOS_ESTADO || "/out/estado.json";
const MAX_PAGINAS = Number(process.env.MAX_PAGINAS || "700");
// A lista abre só os últimos 12 meses. O filtro avançado aceita uma janela de
// até ~12 meses; para a história inteira, roda-se uma janela por período.
const DE = process.env.MERCOS_DE || null;
const ATE = process.env.MERCOS_ATE || null;

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function lidos() {
  if (!existsSync(SAIDA)) return 0;
  return readFileSync(SAIDA, "utf8").split("\n").filter(Boolean).length;
}

(async () => {
  const feitos = lidos();
  const vistos = new Set();
  if (existsSync(SAIDA)) {
    for (const linha of readFileSync(SAIDA, "utf8").split("\n")) {
      if (!linha.trim()) continue;
      try {
        vistos.add(JSON.parse(linha).numero);
      } catch {}
    }
  }

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const contexto = await browser.newContext({
    storageState: "/data/mercos/state.json",
    locale: "pt-BR",
  });
  const pagina = await contexto.newPage();
  let paginas = 0;
  let total = feitos;
  let url = DE && ATE ? null : `${BASE}/${EMPRESA}/pedidos/`;

  if (DE && ATE) {
    // A lista padrão mostra só 12 meses e a URL com `tipo_pesquisa=0` ignora
    // os campos de data. O filtro avançado (`tipo_pesquisa=1`) é o caminho
    // que o servidor honra — medido em 21/10/2026 com #7396..#7416 em
    // out/2024.
    await pagina.goto(`${BASE}/${EMPRESA}/pedidos/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await pagina.waitForSelector("#aba-pedidos-react-root", { timeout: 30_000 }).catch(() => {});
    await pagina.evaluate(() => document.querySelector(".js-abrir-pesquisa-avancada")?.click());
    await dormir(500);
    await pagina.evaluate(({ de, ate }) => {
      const f = document.querySelector("#form_pesquisa_avancada");
      f.querySelector('[name="data_emissao_inicio"]').value = de;
      f.querySelector('[name="data_emissao_fim"]').value = ate;
      f.submit();
    }, { de: DE, ate: ATE });
    await pagina.waitForLoadState("domcontentloaded", { timeout: 60_000 }).catch(() => {});
    await dormir(1200);
    console.log("filtro aplicado", { de: DE, ate: ATE, url: pagina.url() });
  }

  while (paginas < MAX_PAGINAS) {
    if (url) {
      await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await pagina.waitForSelector("#aba-pedidos-react-root", { timeout: 30_000 }).catch(() => {});
      await dormir(500);
    }

    const dados = await pagina.evaluate(() => {
      const pedidos = [];
      for (const a of document.querySelectorAll('a[href*="/detalhar/"]')) {
        let el = a;
        for (let i = 0; i < 8 && el?.parentElement; i++) {
          el = el.parentElement;
          const t = el.innerText || "";
          if (/R\$/.test(t) && /#\d{3,8}/.test(t)) break;
        }
        const linhas = (el?.innerText || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        // O vendedor está na MESMA linha do número: "#19228 emitido por
        // VENDEDOR JB". Procurar no texto inteiro do cartão capturaria também
        // o status e o valor.
        const linhaNumero = linhas.find((l) => /^#\d{3,8}/.test(l));
        const numero = Number(linhaNumero?.match(/#(\d{3,8})/)?.[1] || 0);
        const vendedor = linhaNumero?.match(/emitido por\s+(.+)$/i)?.[1]?.trim() || null;
        if (numero) pedidos.push({ numero, vendedor });
      }
      const prox = [...document.querySelectorAll("a")]
        .find((a) => /^Próxima/.test(a.textContent.trim()))
        ?.getAttribute("href");
      // O href do Mercos é relativo à PÁGINA (".?ultimo_id=..."), não à
      // origem: resolver contra `location.origin` jogava a página 2 para `/`
      // e a varredura morria dizendo "sem novos".
      return { pedidos, proxima: prox ? new URL(prox, location.href).href : null };
    });

    const novos = dados.pedidos.filter((p) => p.numero && !vistos.has(p.numero));
    if (novos.length === 0) {
      console.log(`sem novos na pagina ${paginas + 1}; fim`);
      break;
    }
    for (const p of novos) {
      vistos.add(p.numero);
      appendFileSync(SAIDA, JSON.stringify(p) + "\n");
    }
    total += novos.length;
    paginas++;
    const menor = Math.min(...novos.map((p) => p.numero));
    const maior = Math.max(...novos.map((p) => p.numero));
    writeFileSync(
      ESTADO,
      JSON.stringify({ paginas, total, menor, maior, proxima: dados.proxima, atualizado_em: new Date().toISOString() }),
    );
    console.log(`pagina ${paginas}: +${novos.length} (total ${total}) #${menor}..#${maior}`);
    if (!dados.proxima) break;
    url = dados.proxima;
    await dormir(700);
  }

  await browser.close();
  console.log(`FIM: ${total} pedidos em ${paginas} paginas`);
})().catch((e) => {
  console.error("ERRO", e.stack || e.message);
  process.exit(1);
});
