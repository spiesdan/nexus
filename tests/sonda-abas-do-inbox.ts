/**
 * AS ABAS DO INBOX NÃO SE SOBREPÕEM — regressão de layout, medida por ferramenta.
 *
 * ## O defeito que esta sonda existe para não deixar voltar
 *
 * A faixa de filtros do inbox tem CINCO abas ("Fila", "Minhas", "Todas",
 * "Fechadas", "Automático") num painel de 272px no `xl` (300px em `md`/`2xl`).
 * Com `grid` + `minmax(0,1fr)`, cada coluna ficava ~44px enquanto "Automático"
 * mede ~64px — o `justify-center` transbordava o texto para os dois lados e as
 * abas vizinhas se sobrepunham na tela ("FechadasAutomático" colado).
 *
 * A referência (`Inbox – dark premium.html`) não sofre disso porque usa
 * `display:flex` com `button{flex:1}`: no flex, o filho tem piso em
 * `min-width:auto` e nunca encolhe abaixo do próprio conteúdo. A faixa, na
 * pior das hipóteses, rola (`overflow-x-auto`, precedente em
 * `components/ui/tabs.tsx`) — mas o texto nunca colide.
 *
 * ## Por que sonda de browser e não teste unitário
 *
 * Largura de texto, `min-content` de flex e resolução de `grid-template-columns`
 * são cálculo de layout. O jsdom não tem engine de layout: um teste lá mediria
 * zero em tudo e passaria feliz — verde por ausência de motor, o pior falso
 * verde que existe. Só um browser real responde a esta pergunta.
 *
 * Uso: `npx tsx tests/sonda-abas-do-inbox.ts`
 * Requer o app no ar apontando para o Supabase LOCAL
 * (`npx supabase start` → `pnpm e2e:build` → `next start` na porta do
 * `E2E_PORT`, com `.e2e-creds.json` na raiz).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.E2E_PORT
  ? `http://127.0.0.1:${process.env.E2E_PORT}`
  : "http://127.0.0.1:3001";
const CREDS = process.env.E2E_CREDS ?? join(process.cwd(), ".e2e-creds.json");
const c = JSON.parse(readFileSync(CREDS, "utf8")) as {
  password: string;
  users: { manager: { email: string } };
};

/**
 * 900 = `md` (coluna da lista 300px) · 1280/1440 = `xl` (272px, o aperto
 * máximo) · 1536/1920 = `2xl` (300px). É a coluna da lista que decide: ela é
 * quem dá largura à faixa de abas.
 */
const LARGURAS = [900, 1280, 1440, 1536, 1920];

/** Tolerância de subpixel: caixas arredondadas não devem contar como colisão. */
const EPS = 0.5;

interface Medida {
  viewport: number;
  sem_abas?: boolean;
  abas?: number;
  rotulos?: string[];
  coluna_w?: number;
  faixa_rola?: boolean;
  estouradas?: number;
  colisoes?: string[];
}

async function main(): Promise<void> {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const erros: string[] = [];
  p.on("console", (m) => {
    if (m.type() === "error") erros.push(m.text());
  });

  await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await p.click('input[type="email"]');
  await p.locator('input[type="email"]').pressSequentially(c.users.manager.email, { delay: 6 });
  await p.click('input[type="password"]');
  await p.locator('input[type="password"]').pressSequentially(c.password, { delay: 6 });
  await p.click('button[type="submit"]');
  await p.waitForURL(/\/app/, { timeout: 30000 });
  await p.goto(`${BASE}/app/inbox`, { waitUntil: "networkidle" });
  await p.waitForSelector('[role="tablist"] [role="tab"]', { timeout: 20000 });
  await p.waitForTimeout(1500);

  const linhas: Medida[] = [];
  for (const w of LARGURAS) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.waitForTimeout(600);
    const m = (await p.evaluate(`(() => {
      var primeira = document.querySelector('[role="tablist"] [role="tab"]');
      if (!primeira) return { viewport: window.innerWidth, sem_abas: true };
      var faixa = primeira.closest('[role="tablist"]');
      var abas = Array.prototype.slice.call(faixa.querySelectorAll('[role="tab"]'));
      // Caixa de TEXTO (Range no conteúdo), não a caixa do botão: é o texto
      // que colidia, e a caixa do botão em flex nunca se sobrepõe.
      var caixas = abas.map(function (a) {
        var rng = document.createRange();
        rng.selectNodeContents(a);
        var r = rng.getBoundingClientRect();
        return { l: r.left, r: r.right };
      });
      var colisoes = [];
      for (var i = 0; i + 1 < caixas.length; i++) {
        if (caixas[i].r > caixas[i + 1].l + ${EPS}) colisoes.push(i + "+" + (i + 1));
      }
      var estouradas = abas.filter(function (a) {
        return a.scrollWidth > a.clientWidth + ${EPS};
      });
      // A coluna da lista é o ancestral com filete à direita (border-r): ela é
      // quem dá a largura (272px no xl, 300px em md/2xl). Medir a raiz do
      // InboxFilters em vez dela media a área de conteúdo e a asserção de
      // largura falhava por 32px de padding, não por defeito.
      var col = faixa;
      while (col && getComputedStyle(col).borderRightWidth === "0px") col = col.parentElement;
      return {
        viewport: window.innerWidth,
        abas: abas.length,
        rotulos: abas.map(function (a) { return (a.innerText || "").replace(/\\s+/g, " ").trim(); }),
        coluna_w: col ? Math.round(col.getBoundingClientRect().width) : null,
        faixa_rola: faixa.scrollWidth > faixa.clientWidth + ${EPS},
        estouradas: estouradas.length,
        colisoes: colisoes
      };
    })()`) as Medida);
    linhas.push(m);
    await p.screenshot({ path: `evidence/abas-inbox-${w}.png` });
  }
  await b.close();

  console.log(
    "  vp".padStart(6) +
      "col".padStart(6) +
      "abas".padStart(6) +
      "rola".padStart(6) +
      "estour".padStart(7) +
      "  colisoes".padStart(12),
  );
  for (const r of linhas) {
    console.log(
      String(r.viewport).padStart(6) +
        String(r.coluna_w ?? "?").padStart(6) +
        String(r.abas ?? "?").padStart(6) +
        String(r.faixa_rola ?? "?").padStart(6) +
        String(r.estouradas ?? "?").padStart(7) +
        `  ${(r.colisoes ?? []).join(",") || "-"}`.padStart(12),
    );
  }
  console.log("");
  for (const r of linhas) console.log(`  ${r.viewport}px: ${JSON.stringify(r.rotulos)}`);

  const casos: Array<[string, boolean]> = [
    ["mediu todas as larguras (guarda de vacuidade)", linhas.length === LARGURAS.length],
    ["a faixa de abas existe em toda largura", linhas.every((r) => !r.sem_abas)],
    ["a coluna da lista tem a largura esperada (272/300)", linhas.every((r) => [272, 300].includes(Number(r.coluna_w)))],
    ["nenhum texto de aba estoura a própria caixa", linhas.every((r) => Number(r.estouradas) === 0)],
    ["nenhum rótulo invade o rótulo vizinho", linhas.every((r) => (r.colisoes ?? []).length === 0)],
    ["a faixa inteira cabe sem rolagem", linhas.every((r) => r.faixa_rola === false)],
    ["a faixa tem as 5 abas (vacuidade)", linhas.every((r) => Number(r.abas) === 5)],
    ["sem erro de console", erros.length === 0],
  ];

  let falhas = 0;
  for (const [nome, ok] of casos) {
    console.log(`${ok ? "  ok  " : "FALHA "} ${nome}`);
    if (!ok) falhas += 1;
  }
  if (erros.length > 0) console.log(`  erros: ${erros.slice(0, 3).join(" | ")}`);
  console.log(falhas === 0 ? "\nTODOS OS CASOS PASSARAM" : `\n${falhas} CASO(S) FALHARAM`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
