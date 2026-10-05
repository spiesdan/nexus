/**
 * Gera o manual de uso em PDF.
 *
 * Monta um HTML (capa + índice agrupado como o menu + uma página por tela) a
 * partir das capturas de `scripts/manual-telas.ts` e dos textos de
 * `scripts/manual-conteudo.ts`, e imprime em A4 com o Chromium do Playwright.
 *
 * A cor de destaque é a do PRODUTO (`--color-accent-600` em app/globals.css):
 * o manual usa a mesma cor que a pessoa vê na tela, e não uma cor de gosto do
 * script. O nome da marca vem por argumento — nada de marca escrita no código.
 *
 * Uso: pnpm exec tsx scripts/manual-pdf.ts <telasDir> <saida.pdf> <marca>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { TELAS_MANUAL, type TelaManual } from "./manual-conteudo";

const [, , telasDir = "manual/telas", saida = "manual/manual-de-uso.pdf", marcaArg = ""] = process.argv;

interface Manifesto {
  indice: number;
  rota: string;
  titulo: string;
  arquivo: string;
  url: string;
}

/** A mesma paleta do produto: destaque de app/globals.css, tinta de ink. */
const CORES = {
  destaque: "#7e77f0",
  destaqueFundo: "#f2f1fe",
  destaqueLinha: "#dcd9fd",
  tinta: "#0f172a",
  tintaSuave: "#334155",
  suave: "#64748b",
  linha: "#e2e8f0",
  fundo: "#f8fafc",
  capa: "#0f1225",
  capa2: "#1e1b4b",
};

/**
 * Grupos do menu, na ordem em que o sidebar os mostra
 * (`NAV_GROUPS` de lib/navigation/registry.ts). A tela entra no grupo pelo
 * SEU caminho — se a ordem de captura mudar, o índice continua certo.
 */
const GRUPOS: { rotas: string[]; nome: string }[] = [
  { nome: "Visão geral", rotas: ["/app", "/app/meu-dia"] },
  { nome: "Atendimento", rotas: ["/app/radar", "/app/inbox", "/app/ai/followups"] },
  { nome: "Vendas", rotas: ["/app/pedidos", "/app/contacts", "/app/products", "/app/kanban", "/app/prospeccao"] },
  { nome: "Operação", rotas: ["/app/estoque", "/app/expedicao"] },
  { nome: "Financeiro", rotas: ["/app/financeiro", "/app/titulos"] },
  { nome: "Fiscal", rotas: ["/app/notas"] },
  { nome: "Inteligência", rotas: ["/app/ai"] },
  { nome: "Equipe", rotas: ["/app/team"] },
  { nome: "Configurações", rotas: ["/app/settings", "/app/settings/tenant"] },
];

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dataDeHoje(): string {
  return new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function grupoDaRota(rota: string): string {
  for (const g of GRUPOS) if (g.rotas.includes(rota)) return g.nome;
  return "Outras telas";
}

const folha = (classe: string, corpo: string): string => `
  <section class="folha ${classe}">
${corpo}
  </section>`;

const ESTILO = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; }
  body {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    color: ${CORES.tinta};
    font-size: 10pt;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  .folha {
    width: 210mm;
    height: 297mm;
    position: relative;
    overflow: hidden;
    page-break-after: always;
    padding: 16mm 16mm 14mm;
  }
  .folha:last-child { page-break-after: auto; }

  /* ---------- capa ---------- */
  .capa {
    background:
      radial-gradient(120% 70% at 100% 0%, rgba(126,119,240,.55) 0%, rgba(126,119,240,0) 55%),
      radial-gradient(90% 60% at 0% 100%, rgba(99,102,241,.35) 0%, rgba(99,102,241,0) 60%),
      linear-gradient(155deg, ${CORES.capa} 0%, ${CORES.capa2} 100%);
    color: #fff;
    padding: 22mm 20mm 16mm;
    display: flex;
    flex-direction: column;
  }
  .capa .selo {
    align-self: flex-start;
    font-size: 8pt;
    letter-spacing: .28em;
    text-transform: uppercase;
    color: #c7c3ff;
    border: 1px solid rgba(199,195,255,.45);
    border-radius: 99px;
    padding: 2mm 5mm;
    margin-bottom: 16mm;
  }
  .capa h1 {
    font-size: 40pt;
    line-height: 1.04;
    letter-spacing: -1.1pt;
    font-weight: 700;
    max-width: 150mm;
  }
  .capa .regua { width: 26mm; height: 2.6pt; background: ${CORES.destaque}; margin: 9mm 0 8mm; border-radius: 2px; }
  .capa .sub { font-size: 14pt; line-height: 1.4; color: #cbd5e1; max-width: 145mm; font-weight: 400; }
  .capa .chips { display: flex; gap: 5mm; margin-top: auto; }
  .capa .chip {
    flex: 1;
    background: rgba(255,255,255,.07);
    border: 1px solid rgba(255,255,255,.14);
    border-radius: 4mm;
    padding: 5mm 5mm 4.5mm;
  }
  .capa .chip b { display: block; font-size: 19pt; font-weight: 700; line-height: 1.1; color: #fff; }
  .capa .chip b.longo { font-size: 12pt; }
  .capa .chip span { display: block; font-size: 8pt; color: #a5b4fc; margin-top: 2mm; letter-spacing: .06em; text-transform: uppercase; }
  .capa .nota { font-size: 8.5pt; color: #94a3b8; margin-top: 7mm; max-width: 150mm; line-height: 1.5; }
  .capa .rodape { border-top-color: rgba(255,255,255,.16); color: #94a3b8; }

  /* ---------- índice ---------- */
  .indice h2 { font-size: 24pt; letter-spacing: -.5pt; margin-bottom: 1.5mm; }
  .indice .subindice { color: ${CORES.suave}; font-size: 9.5pt; margin-bottom: 8mm; }
  .grupos { column-count: 2; column-gap: 10mm; }
  .bloco { margin-bottom: 5mm; break-inside: avoid; }
  .bloco .rotulo {
    font-size: 7.5pt;
    letter-spacing: .2em;
    text-transform: uppercase;
    color: ${CORES.destaque};
    font-weight: 700;
    margin-bottom: 2mm;
    padding-bottom: 1.5mm;
    border-bottom: 1px solid ${CORES.destaqueLinha};
  }
  .itens { display: flex; flex-direction: column; }
  .entrada {
    display: flex;
    align-items: baseline;
    gap: 3mm;
    padding: 2mm 0;
    border-bottom: 1px solid ${CORES.linha};
  }
  .entrada .n {
    font-size: 9pt;
    font-weight: 700;
    color: #fff;
    background: ${CORES.destaque};
    border-radius: 2.5mm;
    min-width: 9mm;
    height: 6mm;
    line-height: 6mm;
    text-align: center;
    flex: none;
  }
  .entrada .nome { font-size: 10.5pt; font-weight: 600; }
  .entrada .pag { font-size: 9pt; color: ${CORES.suave}; font-weight: 600; min-width: 9mm; text-align: right; }

  /* ---------- página da tela ---------- */
  .tela { padding-top: 14mm; }
  .tela::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 4mm;
    background: linear-gradient(90deg, ${CORES.destaque} 0%, #a5a1f7 45%, ${CORES.linha} 100%);
  }
  .topo { display: flex; align-items: center; gap: 5mm; margin-bottom: 4mm; }
  .topo .num {
    font-size: 30pt;
    font-weight: 700;
    line-height: 1;
    color: ${CORES.destaque};
    letter-spacing: -1pt;
    font-variant-numeric: tabular-nums;
  }
  .topo .num::after { content: "."; color: ${CORES.destaqueLinha}; }
  .topo h2 { font-size: 21pt; letter-spacing: -.5pt; font-weight: 700; line-height: 1.1; }
  .topo .sec {
    margin-left: auto;
    font-size: 7.5pt;
    letter-spacing: .16em;
    text-transform: uppercase;
    font-weight: 700;
    color: ${CORES.destaque};
    background: ${CORES.destaqueFundo};
    border: 1px solid ${CORES.destaqueLinha};
    border-radius: 99px;
    padding: 1.6mm 4.5mm;
  }
  .urlbar {
    display: flex;
    align-items: center;
    background: ${CORES.fundo};
    border: 1px solid ${CORES.linha};
    border-bottom: none;
    border-radius: 3mm 3mm 0 0;
    padding: 2mm 4mm;
    gap: 3mm;
  }
  .pontos { display: flex; gap: 1.6mm; }
  .pontos i { width: 2.6mm; height: 2.6mm; border-radius: 50%; display: block; }
  .pontos i:nth-child(1) { background: #f87171; }
  .pontos i:nth-child(2) { background: #fbbf24; }
  .pontos i:nth-child(3) { background: #34d399; }
  .endereco {
    flex: 1;
    background: #fff;
    border: 1px solid ${CORES.linha};
    border-radius: 99px;
    font-family: Consolas, "Courier New", monospace;
    font-size: 7.5pt;
    color: ${CORES.suave};
    padding: 1.4mm 4mm;
    white-space: nowrap;
    overflow: hidden;
  }
  .tela img {
    width: 100%;
    display: block;
    border: 1px solid ${CORES.linha};
    border-top: none;
    border-radius: 0 0 3mm 3mm;
    box-shadow: 0 4mm 10mm rgba(15,23,42,.10);
  }
  .resumo {
    background: ${CORES.destaqueFundo};
    border-left: 3px solid ${CORES.destaque};
    border-radius: 0 2.5mm 2.5mm 0;
    padding: 3.5mm 5mm;
    font-size: 10pt;
    line-height: 1.5;
    color: ${CORES.tintaSuave};
    margin-top: 6mm;
  }
  .secvtitulo {
    font-size: 8pt;
    letter-spacing: .2em;
    text-transform: uppercase;
    font-weight: 700;
    color: ${CORES.suave};
    margin: 6mm 0 3mm;
  }
  .lista { list-style: none; }
  .lista li { display: flex; gap: 3.5mm; padding: 1.6mm 0; font-size: 9.8pt; line-height: 1.45; }
  .lista li::before {
    content: "";
    flex: none;
    width: 2.4mm;
    height: 2.4mm;
    margin-top: 1.7mm;
    border-radius: .8mm;
    background: ${CORES.destaque};
    transform: rotate(45deg);
  }
  .lista li b { font-weight: 600; color: ${CORES.tinta}; }

  .rodape {
    position: absolute;
    left: 16mm; right: 16mm; bottom: 7mm;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 7.5pt;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: ${CORES.suave};
    border-top: 1px solid ${CORES.linha};
    padding-top: 2.5mm;
  }
  .rodape .marca { font-weight: 700; color: ${CORES.tintaSuave}; }
  .rodape .pg { font-variant-numeric: tabular-nums; }
`;

async function main(): Promise<void> {
  const manifesto = JSON.parse(readFileSync(join(telasDir, "manifest.json"), "utf-8")) as Manifesto[];
  if (manifesto.length !== TELAS_MANUAL.length) {
    throw new Error(
      `manifesto com ${manifesto.length} telas e conteudo com ${TELAS_MANUAL.length} - captura e texto precisam bater`,
    );
  }

  const marca = marcaArg.trim();
  if (!marca) {
    throw new Error("passe o nome da marca: pnpm exec tsx scripts/manual-pdf.ts <telasDir> <saida.pdf> <marca>");
  }

  const telas = manifesto.map((m, i) => {
    const conteudo = TELAS_MANUAL[i] as TelaManual;
    const arquivo = join(telasDir, m.arquivo);
    if (!existsSync(arquivo)) throw new Error(`captura ausente: ${arquivo}`);
    const imagem = `data:image/png;base64,${readFileSync(arquivo).toString("base64")}`;
    return { manifesto: m, conteudo, imagem };
  });

  const totalPaginas = telas.length + 2;
  const paginaDe = (indice: number): number => indice + 2;
  const rodape = (pagina: number): string =>
    `    <div class="rodape"><span class="marca">${escapar(marca)} · Manual de uso</span><span class="pg">${pagina} / ${totalPaginas}</span></div>`;

  // --- capa ---
  const capa = folha(
    "capa",
    `    <div class="selo">Manual de uso</div>
    <h1>${escapar(marca)}</h1>
    <div class="regua"></div>
    <p class="sub">O guia das telas do sistema — cada tela em uma página, com a captura real e o que dá para fazer nela.</p>
    <div class="chips">
      <div class="chip"><b>${telas.length}</b><span>telas</span></div>
      <div class="chip"><b>${totalPaginas}</b><span>páginas</span></div>
      <div class="chip"><b class="longo">${dataDeHoje()}</b><span>gerado em</span></div>
    </div>
    <p class="nota">Capturas feitas com o perfil de administrador: as telas que dependem de papel (atendente, gerente) aparecem com todas as opções visíveis.</p>
${rodape(1)}`,
  );

  // --- índice, agrupado como o menu ---
  const blocosIndex = GRUPOS.map((g) => {
    const entradas = telas
      .filter((t) => g.rotas.includes(t.manifesto.rota))
      .map(
        (t) => `        <li class="entrada">
          <span class="n">${String(t.manifesto.indice).padStart(2, "0")}</span>
          <span class="nome">${escapar(t.manifesto.titulo)}</span>
          <span class="pag">${paginaDe(t.manifesto.indice)}</span>
        </li>`,
      )
      .join("\n");
    if (!entradas) return "";
    return `      <div class="bloco">
        <div class="rotulo">${escapar(g.nome)}</div>
        <ul class="itens">
${entradas}
        </ul>
      </div>`;
  })
    .filter(Boolean)
    .join("\n");

  const indice = folha(
    "indice",
    `    <h2>Ãndice</h2>
    <p class="subindice">${telas.length} telas, na mesma ordem em que o menu as mostra.</p>
    <div class="grupos">
${blocosIndex}
    </div>
${rodape(2)}`,
  );

  // --- uma página por tela ---
  const paginas = telas
    .map(({ manifesto: m, conteudo, imagem }) => {
      const url = m.url.replace(/^https?:\/\/[^/]+/, "");
      const itens = conteudo.itens
        .map((item) => `          <li>${escapar(item)}</li>`)
        .join("\n");
      return folha(
        "tela",
        `    <div class="topo">
      <span class="num">${String(m.indice).padStart(2, "0")}</span>
      <h2>${escapar(m.titulo)}</h2>
      <span class="sec">${escapar(grupoDaRota(m.rota))}</span>
    </div>
    <div class="urlbar">
      <span class="pontos"><i></i><i></i><i></i></span>
      <span class="endereco">${escapar(url)}</span>
    </div>
    <img src="${imagem}" alt="Captura da tela ${escapar(m.titulo)}" />
    <p class="resumo">${escapar(conteudo.resumo)}</p>
    <div class="secvtitulo">O que dá para fazer aqui</div>
    <ul class="lista">
${itens}
    </ul>
${rodape(paginaDe(m.indice))}`,
      );
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Manual de uso — ${escapar(marca)}</title>
<style>${ESTILO}</style>
</head>
<body>
${capa}
${indice}
${paginas}
</body>
</html>`;

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });

  // Guarda de texto: se os acentos chegarem quebrados aqui, o PDF sai com
  // "OperaÃ§Ã£o" e ninguém percebe antes de abrir — falhar aqui é mais barato
  // que um manual com texto torto.
  const integridade = (await page.evaluate(() => {
    const corpo = document.body.innerText;
    const titulo = document.querySelector(".capa h1");
    return {
      marca: titulo ? (titulo.textContent || "").trim() : null,
      acento: corpo.includes("Configurações"),
      quebrado: corpo.includes("\uFFFD") || corpo.includes("Ã§Ã") || corpo.includes("Ã£"),
    };
  })) as { marca: string | null; acento: boolean; quebrado: boolean };

  if (integridade.marca !== marca || !integridade.acento || integridade.quebrado) {
    throw new Error(`texto do manual saiu quebrado: ${JSON.stringify(integridade)}`);
  }

  // A folha tem altura FIXA e `overflow: hidden`: um texto que não couber é
  // cortado em silêncio e o PDF sai "bonito" com o final da página faltando.
  // Medir aqui é a única prova de que nada estourou.
  // Sem função aninhada aqui dentro de propósito: o transpiler do tsx marca
  // nome de função e o helper (`__name`) não existe no contexto da página —
  // evaluate quebra com "ReferenceError: __name is not defined".
  const estouros = (await page.evaluate(() => {
    const MM = 96 / 25.4;
    const achados: { pagina: number; eixo: string; excedeuMm: number }[] = [];
    const folhas = document.querySelectorAll(".folha");

    for (let i = 0; i < folhas.length; i++) {
      const folha = folhas[i] as HTMLElement;
      const retangulo = folha.getBoundingClientRect();
      const rodape = folha.querySelector(".rodape");
      const limiteY = rodape ? rodape.getBoundingClientRect().top : retangulo.bottom;

      let maximoY = 0;
      const filhosDiretos: Element[] = [];
      for (let j = 0; j < folha.children.length; j++) filhosDiretos.push(folha.children[j] as Element);
      for (const filho of filhosDiretos) {
        if (filho === rodape) continue;
        const bottom = filho.getBoundingClientRect().bottom;
        if (bottom > maximoY) maximoY = bottom;
      }
      const excedeuY = maximoY - limiteY;
      if (excedeuY > 0) {
        achados.push({ pagina: i + 1, eixo: "vertical", excedeuMm: Math.round((excedeuY / MM) * 10) / 10 });
      }

      // Horizontal: o `overflow: hidden` corta em silêncio tudo que passa da
      // borda da folha — medir só a altura deixaria um título largo sumindo.
      let maximoX = 0;
      const pilha: Element[] = [];
      for (let j = 0; j < folha.children.length; j++) pilha.push(folha.children[j] as Element);
      while (pilha.length > 0) {
        const no = pilha.pop() as Element;
        const caixa = no.getBoundingClientRect();
        if (caixa.width > 0 && caixa.right > maximoX) maximoX = caixa.right;
        for (let j = 0; j < no.children.length; j++) pilha.push(no.children[j] as Element);
      }
      const excedeuX = maximoX - (retangulo.right - 1);
      if (excedeuX > 0) {
        achados.push({ pagina: i + 1, eixo: "horizontal", excedeuMm: Math.round((excedeuX / MM) * 10) / 10 });
      }

      // Texto cortado DENTRO de uma caixa: só importa onde o elemento RECORTA
      // (`overflow: hidden`) — fora disso o texto transborda visível, não
      // some, e a métrica da fonte (line-height baixo) falsearia o sinal.
      const caixas = folha.querySelectorAll("*");
      for (let j = 0; j < caixas.length; j++) {
        const caixa = caixas[j] as HTMLElement;
        if (caixa.classList.contains("folha")) continue;
        const estilo = getComputedStyle(caixa);
        const recorta =
          estilo.overflow === "hidden" || estilo.overflowX === "hidden" || estilo.overflowY === "hidden";
        if (!recorta) continue;
        const sobraVertical = caixa.scrollHeight - caixa.clientHeight;
        const sobraHorizontal = caixa.scrollWidth - caixa.clientWidth;
        if (sobraVertical > 2 || sobraHorizontal > 2) {
          achados.push({
            pagina: i + 1,
            eixo: `caixa:${caixa.className || caixa.tagName}`,
            excedeuMm: Math.round((Math.max(sobraVertical, sobraHorizontal) / MM) * 10) / 10,
          });
        }
      }
    }
    return achados;
  })) as { pagina: number; eixo: string; excedeuMm: number }[];

  if (estouros.length > 0) {
    throw new Error(`conteudo estourou a folha: ${JSON.stringify(estouros)}`);
  }

  mkdirSync(dirname(saida), { recursive: true });

  // O HTML vai junto com o PDF: mesma arte em formato que dá para abrir no
  // navegador, conferir o visual e reaproveitar como página do manual.
  const saidaHtml = saida.replace(/\.pdf$/i, ".html");
  if (saidaHtml !== saida) writeFileSync(saidaHtml, html, "utf-8");

  await page.pdf({
    path: saida,
    format: "A4",
    printBackground: true,
    margin: { top: "0", bottom: "0", left: "0", right: "0" },
  });
  await browser.close();
  process.stdout.write(`PDF_OK ${saida} (${telas.length} telas)\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});