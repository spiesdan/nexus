/**
 * Gera o manual de uso em PDF.
 *
 * Monta um HTML com as capturas feitas por `scripts/manual-telas.ts` + os textos
 * de `scripts/manual-conteudo.ts`, e usa o Chromium do Playwright para
 * imprimir em A4. Uma tela por página, com índice e numeração.
 *
 * Uso: pnpm exec tsx scripts/manual-pdf.ts <telasDir> <saida.pdf> [nomeDaMarca]
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
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

async function main(): Promise<void> {
  const manifesto = JSON.parse(readFileSync(join(telasDir, "manifest.json"), "utf-8")) as Manifesto[];
  if (manifesto.length !== TELAS_MANUAL.length) {
    throw new Error(
      `manifesto com ${manifesto.length} telas e conteudo com ${TELAS_MANUAL.length} - captura e texto precisam bater`,
    );
  }

  const telas = manifesto.map((m, i) => {
    const conteudo = TELAS_MANUAL[i] as TelaManual;
    const arquivo = join(telasDir, m.arquivo);
    if (!existsSync(arquivo)) throw new Error(`captura ausente: ${arquivo}`);
    const imagem = `data:image/png;base64,${readFileSync(arquivo).toString("base64")}`;
    return { manifesto: m, conteudo, imagem };
  });

  // A marca NÃO é escrita no código: o manual imprime o nome que o produto
  // está mostrando, e esse nome mora no banco (branding). Quem chama o script
  // resolve e passa por argumento.
  const marca = marcaArg.trim();
  if (!marca) throw new Error("passe o nome da marca resolvido: pnpm exec tsx scripts/manual-pdf.ts <telasDir> <saida.pdf> <marca>");
  const totalPaginas = telas.length + 2; // capa + indice + telas

  const paginas = telas
    .map(
      ({ manifesto: m, conteudo, imagem }) => `
  <section class="tela">
    <div class="cabecalho">
      <span class="num">${String(m.indice).padStart(2, "0")}</span>
      <div>
        <h2>${escapar(m.titulo)}</h2>
        <div class="rota">${escapar(m.url.replace(/^https?:\/\/[^/]+/, ""))}</div>
      </div>
    </div>
    <img src="${imagem}" alt="Captura da tela ${escapar(m.titulo)}" />
    <p class="resumo">${escapar(conteudo.resumo)}</p>
    <h3>O que dá para fazer aqui</h3>
    <ul>
      ${conteudo.itens.map((item) => `<li>${escapar(item)}</li>`).join("\n      ")}
    </ul>
    <div class="rodape"><span>${escapar(marca)} — Manual de uso</span><span>${m.indice + 2}</span></div>
  </section>`,
    )
    .join("\n");

  const indice = telas
    .map(
      ({ manifesto: m }) =>
        `<li><span class="num">${String(m.indice).padStart(2, "0")}</span> ${escapar(m.titulo)}<span class="dots"></span><span class="pag">${m.indice + 2}</span></li>`,
    )
    .join("\n      ");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Manual de uso — ${escapar(marca)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", Helvetica, Arial, sans-serif;
    color: #111827;
    font-size: 10.5pt;
    line-height: 1.45;
  }
  .folha {
    width: 210mm;
    height: 297mm;
    padding: 18mm 16mm 14mm;
    position: relative;
    page-break-after: always;
    overflow: hidden;
  }
  .folha:last-child { page-break-after: auto; }

  .capa h1 { font-size: 30pt; margin: 0 0 4mm; letter-spacing: -0.5pt; }
  .capa .sub { font-size: 14pt; color: #6b7280; margin: 0 0 8mm; }
  .capa .regua { width: 22mm; height: 2.4pt; background: #2563eb; margin: 0 0 10mm; }
  .capa p { max-width: 150mm; }
  .capa .nota { color: #6b7280; margin-top: 6mm; }

  .indice h2 { font-size: 18pt; margin: 0 0 6mm; }
  .indice ul { list-style: none; margin: 0; padding: 0; }
  .indice li { display: flex; align-items: baseline; padding: 2.6mm 0; border-bottom: 1px solid #e5e7eb; }
  .indice .num { font-weight: 700; color: #2563eb; width: 10mm; }
  .indice .dots { flex: 1; }
  .indice .pag { color: #6b7280; }

  .cabecalho { display: flex; align-items: baseline; gap: 4mm; margin-bottom: 3mm; }
  .cabecalho .num { font-size: 20pt; font-weight: 700; color: #2563eb; }
  .cabecalho h2 { font-size: 19pt; margin: 0; }
  .cabecalho .rota { font-size: 8pt; color: #6b7280; }
  .tela img {
    width: 100%;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    display: block;
  }
  .tela .resumo { margin: 5mm 0 0; }
  .tela h3 { font-size: 10.5pt; margin: 5mm 0 2mm; }
  .tela ul { margin: 0; padding-left: 5mm; }
  .tela li { margin-bottom: 1.6mm; }
  .rodape {
    position: absolute;
    left: 16mm;
    right: 16mm;
    bottom: 8mm;
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    color: #6b7280;
    border-top: 1px solid #e5e7eb;
    padding-top: 2mm;
  }
  .capa .rodape, .indice .rodape { bottom: 8mm; }
</style>
</head>
<body>
  <section class="folha capa">
    <h1>Manual de uso — ${escapar(marca)}</h1>
    <p class="sub">Guia das telas do sistema, uma página por tela, no estado atual do produto</p>
    <div class="regua"></div>
    <p>
      Este manual foi gerado a partir do sistema rodando: cada página traz a captura real da tela
      e o que dá para fazer nela. Data da geração: ${dataDeHoje()}.
    </p>
    <p class="nota">
      As capturas foram feitas com o perfil de administrador, então as telas que dependem de papel
      (atendente, gerente) aparecem com todas as opções visíveis.
    </p>
    <div class="rodape"><span>${escapar(marca)} — Manual de uso</span><span>1 / ${totalPaginas}</span></div>
  </section>

  <section class="folha indice">
    <h2>Índice das telas</h2>
    <ul>
      ${indice}
    </ul>
    <div class="rodape"><span>${escapar(marca)} — Manual de uso</span><span>2 / ${totalPaginas}</span></div>
  </section>
${paginas}
</body>
</html>`;

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  mkdirSync(dirname(saida), { recursive: true });
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