/**
 * A FALHA REAL DO GEOCODIFICADOR — sem interceptação de rede.
 *
 * O banner de erro da rota só é útil se aparecer quando o serviço de mapas cai.
 * A primeira tentativa de prova usado `page.route` (interceptar o POST com 500)
 * não disparou nada — e a leitura do código explicou: **a rota não estoura**.
 * `lib/rotas/geocodificacao.ts` devolve `{ estado: "erro" }` por parada e a rota
 * responde **200**. O `catch` do cliente nunca via a queda.
 *
 * Aqui a falha é produzida de verdade: o servidor sobe com
 * `GEOCODER_URL=http://127.0.0.1:9/search` (porta fechada). O `fetch` estoura
 * dentro do provedor, a parada volta como `estado: "erro"` e o banner tem de
 * aparecer com o texto do serviço fora — não com "endereço não encontrado".
 *
 * Uso (app já rodando com a env acima):
 *   AUDIT_BASE_URL=http://localhost:3021 node scripts/auditoria/rotas-falha-real.mjs
 *
 * Mede também o que o PR prometeu: a lista NÃO se move quando o banner aparece.
 * Fecha o navegador no mesmo processo.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const BASE = process.env.AUDIT_BASE_URL ?? "http://localhost:3021";
const ESTADO = process.env.AUDIT_ESTADO ?? "/tmp/state-rotas.json";
const CARGA = process.env.AUDIT_CARGA ?? "dd3e6cbf-8e05-4d23-a551-9bf5e35db52d";
const SAIDA = path.join(process.cwd(), "docs", "auditoria", "capturas");

mkdirSync(SAIDA, { recursive: true });

const larguras = [
  { nome: "1440", width: 1440, height: 1000 },
  { nome: "390", width: 390, height: 900 },
];

const navegador = await chromium.launch();

for (const tema of ["light", "dark"]) {
  for (const largura of larguras) {
    const contexto = await navegador.newContext({
      storageState: ESTADO,
      locale: "pt-BR",
      viewport: { width: largura.width, height: largura.height },
    });
    await contexto.addInitScript((t) => localStorage.setItem("nexus-theme", t), tema);
    const pagina = await contexto.newPage();

    await pagina.goto(`${BASE}/app/expedicao/${CARGA}/rota`, {
      waitUntil: "networkidle",
      timeout: 180_000,
    });
    await pagina.waitForTimeout(3000);

    // Onde a lista começa ANTES de qualquer banner: é a régua do "não pula".
    const antes = await pagina.evaluate(() => {
      const alvo = [...document.querySelectorAll("*")]
        .filter((e) => /^Ordem de entrega/.test((e.textContent ?? "").trim()))
        .sort((a, b) => (a.textContent ?? "").length - (b.textContent ?? "").length)[0];
      return alvo ? Math.round(alvo.getBoundingClientRect().top) : null;
    });

    await pagina.getByRole("button", { name: /Geocodificar/i }).first().click();
    await pagina.waitForTimeout(6000);

    const depois = await pagina.evaluate(() => {
      const banner = document.querySelector('[data-testid="erro-geocodificacao"]');
      const alvo = [...document.querySelectorAll("*")]
        .filter((e) => /^Ordem de entrega/.test((e.textContent ?? "").trim()))
        .sort((a, b) => (a.textContent ?? "").length - (b.textContent ?? "").length)[0];
      return {
        banner: banner ? (banner.textContent ?? "").replace(/\s+/g, " ").trim() : null,
        botao: banner
          ? ([...banner.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim())[0] ?? null)
          : null,
        topoLista: alvo ? Math.round(alvo.getBoundingClientRect().top) : null,
      };
    });

    console.log(
      `${tema} ${largura.nome}: banner=${depois.banner ? JSON.stringify(depois.banner.slice(0, 90)) : "AUSENTE"} · botao=${depois.botao} · lista ${antes}→${depois.topoLista}`,
    );

    await pagina.screenshot({
      path: path.join(SAIDA, `rotas-falha-${tema}-${largura.nome}.png`),
    });
    await contexto.close();
  }
}

await navegador.close();
