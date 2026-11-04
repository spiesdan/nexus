import { chromium, devices } from "@playwright/test";

const base = "https://crm.billhigiene.tech";
const carga = "68b72756-8246-4d90-a5d0-1c6b8736730b";

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ ...devices["Pixel 7"] });
const pagina = await ctx.newPage();

const tiles = [];
const erros = [];
pagina.on("console", (m) => { if (m.type() === "error") erros.push(m.text().slice(0, 180)); });
pagina.on("response", (r) => { if (/tile\.openstreetmap/.test(r.url())) tiles.push(r.status()); });

await pagina.goto(`${base}/login`, { waitUntil: "networkidle" });
await pagina.fill("#email", "motorista@billhigiene.tech");
await pagina.fill("#password", "12345678");
await pagina.click('form button[type=submit]');
await pagina.waitForTimeout(6000);
await pagina.goto(`${base}/app/expedicao/${carga}/motorista`, { waitUntil: "networkidle" });
await pagina.waitForTimeout(5000);

const medir = () =>
  pagina.evaluate(() => {
    const c = document.querySelector(".leaflet-container");
    const caixa = c?.getBoundingClientRect();
    const folha = [...document.querySelectorAll("div")].find((d) =>
      (d.className || "").toString().includes("rounded-t-2xl"),
    );
    const f = folha?.getBoundingClientRect();
    return {
      viewport: { w: innerWidth, h: innerHeight },
      mapa: caixa ? { w: Math.round(caixa.width), h: Math.round(caixa.height) } : null,
      folha: f ? { h: Math.round(f.height), top: Math.round(f.top) } : null,
      mapaVisivelPct: caixa && f ? Math.round(((f.top - caixa.top) / innerHeight) * 100) : null,
      tilesCarregados: [...document.querySelectorAll("img.leaflet-tile")].filter((i) => i.complete && i.naturalWidth > 0).length,
      marcadores: document.querySelectorAll(".leaflet-marker-icon").length,
      bandeiraWhats: document.body.innerText.includes("está desconectado"),
      botaoCentralizar: !!document.querySelector('button[aria-label="Centralizar em mim"]'),
      controlesZoom: document.querySelectorAll(".leaflet-control-zoom").length,
      texto: document.body.innerText.replace(/\s+/g, " ").slice(0, 200),
    };
  });

const fechada = await medir();
await pagina.screenshot({ path: "/tmp/entregador-mapa-fechado.png" });

await pagina.getByRole("button", { name: /roteiro/i }).click();
await pagina.waitForTimeout(1500);
const aberta = await medir();
const organizar = await pagina.evaluate(() => {
  const txt = document.body.innerText;
  return {
    temTitulo: txt.includes("Organizar paradas"),
    porDistancia: txt.includes("Por distância"),
    porRuas: txt.includes("Por ruas"),
  };
});
await pagina.screenshot({ path: "/tmp/entregador-mapa-aberto.png" });

console.log(JSON.stringify({ fechada, aberta, organizar, tilesOk: tiles.filter((s) => s === 200).length, erros: erros.slice(0, 3) }, null, 1));
await navegador.close();
