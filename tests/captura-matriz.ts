/**
 * MATRIZ DE TELAS — mede uma tela por vez, no MESMO build, e grava o veredito.
 *
 * O instrumento dos recortes (lista/thread do inbox) media uma tela com detalhe.
 * Este mede MUITAS: cada rota de `docs/auditoria/41-matriz-rotas.json` passa
 * pelas quatro combinações (claro/escuro × 1440/390) e devolve, por combinação:
 *
 *   - overflow horizontal da página (`scrollWidth - clientWidth`);
 *   - erros de console e de página;
 *   - axe: quantas violações críticas e sérias, com o ALVO de cada uma;
 *   - o `<h1>` que a tela pinta (ou a ausência dele).
 *
 * Captura de tela só quando a linha pede (`capturar: true`) — 110 telas × 4
 * combinações × 2 lados são 880 PNGs, e evidência que ninguém abre é peso no
 * repositório. O número vale para todas; a FOTO vale para quem mudou.
 *
 * Uso:
 *   BASE=http://localhost:3311 npx tsx tests/captura-matriz.ts <rotulo> --grupo pedidos-e-vendas
 *   BASE=http://localhost:3311 npx tsx tests/captura-matriz.ts <rotulo> --rotas /pedidos,/pedidos/novo
 *   …/tests/captura-matriz.ts <rotulo> --so-capturar     (só as linhas com capturar=true)
 */
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3311";
const ROTULO = process.argv[2] ?? "depois";
const ARGS = process.argv.slice(3);
const CREDS = JSON.parse(readFileSync(path.join(process.cwd(), ".e2e-creds.json"), "utf8"));
const MATRIZ = path.join(process.cwd(), "docs/auditoria/41-matriz-rotas.json");
const RAIZ = path.join(process.cwd(), "docs/auditoria/capturas", `${ROTULO}-matriz`);
const SAIDA = path.join(RAIZ, "medidas.json");

const TAMANHOS = [
  { nome: "1440", width: 1440, height: 900 },
  { nome: "390", width: 390, height: 844 },
] as const;

/** Ids reais do banco de teste, para as rotas dinâmicas. */
const IDS: Record<string, Record<string, string>> = {
  "/pedidos/[id]": { id: process.env.ID_PEDIDO ?? "f0597235-ba27-4d32-98c5-e0f881dc667d" },
  "/compras/[id]": { id: process.env.ID_COMPRA ?? "1595e588-f87d-4323-b434-13039b4938a7" },
  "/inbox/[id]": { id: process.env.ID_CONVERSA ?? "75119f51-edee-47ff-a968-71094203b5a3" },
  "/contacts/[id]": { id: process.env.ID_CONTATO ?? "70fd026e-6759-4aa1-a55d-4ff2d8b65f4b" },
  "/leads/[id]": { id: process.env.ID_LEAD ?? "56563958-a491-416f-8ec8-db3fe251f636" },
  "/pipelines/[id]": { id: process.env.ID_PIPELINE ?? "714dbeb6-8873-4771-9b72-6c5240109f34" },
  "/fiscal/notas/[id]": { id: process.env.ID_NOTA ?? "a6d2935c-8ada-49da-a33b-957642f4c3a2" },
};

interface Linha {
  rota: string;
  grupo: string;
  dinamica: boolean;
  capturar: boolean;
  veredito: string;
  exemplo?: string;
}

interface MedidaRota {
  rota: string;
  url: string;
  tema: string;
  largura: number;
  /**
   * `null` = NÃO MEDIDO. Zero medido e zero não-medido são coisas diferentes:
   * a primeira rodada gravou `overflow: 0` em rota que nunca abriu, e o
   * artefato passou a contar 24 medições de 6 telas dinâmicas que ninguém
   * visitou. Quem lê o JSON tem de conseguir separar "passou" de "não fui lá".
   */
  overflow: number | null;
  h1: string[];
  consoleErros: string[];
  axe: { critica: number; seria: number; ids: string[]; nos: string[] } | null;
  esqueleto?: boolean;
  captura?: string;
  /** `false` (ou ausente em artefato antigo) = linha sem medição válida. */
  valida?: boolean;
  motivo?: string;
  pulada?: string;
}

/**
 * UMA LINHA SEM MEDIÇÃO — e sem zeros que fingem medição.
 *
 * O `medir()` só devolve linha válida quando a tela abriu e pintou `<h1>`. O
 * que falha antes disso (rota dinâmica sem id, redirect que destruiu o
 * contexto, erro de navegação) passa por aqui: `overflow`/`axe` nulos e o
 * motivo escrito. O total continua contando a linha, mas ela não entra como
 * "medida" em nenhum placar.
 */
function medidaInvalida(
  linha: Linha,
  tema: string,
  largura: number,
  motivo: string,
  consoleErros: string[] = [],
): MedidaRota {
  return {
    rota: linha.rota,
    url: "",
    tema,
    largura,
    overflow: null,
    h1: [],
    consoleErros: consoleErros.slice(0, 5),
    axe: null,
    valida: false,
    motivo,
  };
}

/**
 * A régua única do que conta como medido — inclusive para artefato antigo, que
 * não tinha `valida` e gravava zero. URL vazia ou `<h1>` vazio é não-medido,
 * não importa o que o campo numérico diga.
 */
function ehMedidaValida(m: MedidaRota): boolean {
  return (
    m.valida !== false &&
    Boolean(m.url) &&
    Array.isArray(m.h1) &&
    m.h1.some((titulo) => Boolean(titulo && titulo.trim()))
  );
}

function slug(rota: string): string {
  return rota.replace(/^\//, "").replace(/\//g, "_").replace(/\[|\]/g, "") || "raiz";
}

/** Troca `[id]` pelo id real; sem id, a rota é PULADA com motivo declarado. */
function urlDe(rota: string): string | null {
  if (!rota.includes("[")) return `${BASE}/app${rota}`;
  const patch = IDS[rota];
  if (!patch) return null;
  let url = rota;
  for (const [chave, valor] of Object.entries(patch)) url = url.replace(`[${chave}]`, valor);
  return url.includes("[") ? null : `${BASE}/app${url}`;
}

async function entrar(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  // Corrida com a hidratação (ver instrumento do inbox): repetir o clique.
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    await page.locator("#email").fill(CREDS.users.manager.email, { timeout: 120_000 });
    await page.locator("#password").fill(CREDS.password, { timeout: 120_000 });
    await page
      .getByRole("button", { name: /entrar/i })
      .first()
      .click();
    try {
      await page.waitForURL(/\/app\//, { timeout: 40_000 });
      return;
    } catch {
      await page.waitForTimeout(2_000);
    }
  }
  throw new Error("login não concluiu após 4 tentativas");
}

async function medir(
  page: Page,
  linha: Linha,
  tema: string,
  largura: number,
  erros: string[],
): Promise<MedidaRota> {
  const url = urlDe(linha.rota)!;
  erros.length = 0;

  /*
   * NAVEGA ATÉ PARAR — porque metade das telas de configuração REDIRECIONA.
   *
   * Medido no lote de configurações: `goto` seguido de `evaluate` estoura com
   * "Execution context was destroyed" e "Navigation is interrupted by another
   * navigation" quando a própria tela leva para outra rota (`/settings/atendimento`
   * → `/settings/tenant/whatsapp`, `/team` → 403, e assim por diante). O sinal de
   * "parou" é a URL não mudar por 700ms.
   */
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  let anterior = "";
  for (let i = 0; i < 25 && page.url() !== anterior; i++) {
    anterior = page.url();
    await page.waitForTimeout(700);
  }

  /*
   * ESPERAR O ESQUELETO SUMIR — não um relógio fixo.
   *
   * Medido na primeira rodada: com 1,8 s de espera, `/compras` foi fotografada
   * em SKELETON (a rota ainda compilava em dev) — o instrumento teria registrado
   * "tela sem conteúdo" e um `overflow: 0` que não é da tela. O `Skeleton` do
   * produto é `animate-pulse`; o sinal de "tela pronta" é esse seletor zerar.
   * Se em 45 s ainda houver esqueleto, a linha é registrada com `skeleton: true`
   * em vez de mentir que mediu.
   */
  let esqueleto = false;
  try {
    /*
     * DOIS sinais de "tela pronta", porque o produto tem dois esqueletos: o
     * componente `Skeleton` (`animate-pulse`) e o esqueleto caseiro
     * `bg-primary/10 text-transparent` (as telas financeiras usam o segundo).
     * Medido: sem o segundo sinal, o axe acusava `color-contrast` em textos
     * que são PLACEHOLDER ("Rótulo", "R$ 0,00") — defeito que não existe na
     * tela carregada.
     */
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".animate-pulse").length === 0 &&
        document.querySelectorAll('[class*="text-transparent"]').length === 0,
      null,
      { timeout: 45_000 },
    );
  } catch {
    esqueleto = true;
  }
  await page.waitForTimeout(900);

  /*
   * ESPERAR O `<h1>` — E NÃO MEDIR ZERO QUANDO ELE NÃO VEM.
   *
   * A primeira rodada mediu `/ai/providers` e `/ai/runs` no primeiro paint da
   * combinação light/1440 e gravou `h1: []`, `overflow: 0`, `axe: 0`: a tela
   * ainda estava montando e o artefato contou como medida. Esperar o título é a
   * mesma régua que o instrumento de captura já usa. Se em 12 s ele não vier,
   * a linha vira NÃO MEDIDA — nunca uma tela "limpa" que ninguém viu.
   */
  try {
    await page.waitForFunction(() => document.querySelector("h1") !== null, null, {
      timeout: 12_000,
    });
  } catch {
    return medidaInvalida(
      linha,
      tema,
      largura,
      "sem <h1> após 12 s — a tela não terminou de renderizar",
      erros,
    );
  }

  const basico = (await page.evaluate(`(() => {
    var de = document.documentElement;
    return {
      overflow: Math.max(0, de.scrollWidth - de.clientWidth),
      h1: Array.from(document.querySelectorAll('h1')).map(function (h) { return (h.textContent || '').trim(); })
    };
  })()`)) as { overflow: number; h1: string[] };

  const axe = await new AxeBuilder({ page }).analyze();
  const graves = axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious");

  let captura: string | undefined;
  if (linha.capturar) {
    const arquivo = `${slug(linha.rota)}_${tema}_${largura}.png`;
    await page.screenshot({ path: path.join(RAIZ, arquivo) });
    captura = arquivo;
  }

  return {
    rota: linha.rota,
    url: url.replace(BASE, ""),
    tema,
    largura,
    overflow: basico.overflow,
    h1: basico.h1,
    consoleErros: erros.slice(0, 5),
    valida: true,
    // O aviso que faltava: `esqueleto` era calculado e descartado, então uma
    // tela presa no esqueleto saía igual a uma carregada. Agora sai marcada.
    ...(esqueleto ? { esqueleto: true } : {}),
    axe: {
      critica: axe.violations.filter((v) => v.impact === "critical").length,
      seria: graves.filter((v) => v.impact === "serious").length,
      ids: graves.map((v) => `${v.id} (${v.impact})`),
      // O HTML curto junto do alvo: `button-name` em `.h-9` não diz QUAL botão.
      nos: graves.flatMap((v) =>
        v.nodes
          .slice(0, 2)
          .map((n) => `${v.id}: ${n.target.join(" ")} :: ${(n.html ?? "").slice(0, 180)}`),
      ),
    },
    captura,
  };
}

async function main(): Promise<void> {
  const matriz = JSON.parse(readFileSync(MATRIZ, "utf8")) as { rotas: Linha[] };
  const grupoIdx = ARGS.indexOf("--grupo");
  const grupo = grupoIdx >= 0 ? ARGS[grupoIdx + 1] : null;
  const rotasIdx = ARGS.indexOf("--rotas");
  const lista = rotasIdx >= 0 ? ARGS[rotasIdx + 1]!.split(",") : null;
  const soCapturar = ARGS.includes("--so-capturar");

  const alvo = matriz.rotas.filter(
    (r) =>
      (grupo ? r.grupo === grupo : true) &&
      (lista ? lista.includes(r.rota) : true) &&
      (soCapturar ? r.capturar : true),
  );
  if (alvo.length === 0) throw new Error("nenhuma rota selecionada");

  mkdirSync(RAIZ, { recursive: true });
  const browser = await chromium.launch();

  const aquecimento = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await entrar(await aquecimento.newPage());
  await aquecimento.close();
  console.info("aquecimento: login compilado");

  const medidas: MedidaRota[] = [];

  for (const tema of ["light", "dark"] as const) {
    for (const tamanho of TAMANHOS) {
      const contexto = await browser.newContext({
        viewport: { width: tamanho.width, height: tamanho.height },
        deviceScaleFactor: 1,
        locale: "pt-BR",
      });
      await contexto.addInitScript((t) => window.localStorage.setItem("nexus-theme", t), tema);
      const page = await contexto.newPage();
      // Os listeners são UM por página: presos à medição, cada rota somaria
      // listeners e os erros da rota anterior apareceriam na seguinte.
      const erros: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") erros.push(m.text().slice(0, 200));
      });
      page.on("pageerror", (e) => erros.push(String(e).slice(0, 200)));
      await entrar(page);

      for (const linha of alvo) {
        if (!urlDe(linha.rota)) {
          // NÃO MEDIDA, e o artefato diz isso. Antes esta linha entrava com
          // overflow/axe zerados e o placar contava a tela como aprovada.
          medidas.push(
            medidaInvalida(linha, tema, tamanho.width, "rota dinâmica sem id de exemplo em IDS"),
          );
          continue;
        }
        try {
          let m: MedidaRota;
          try {
            m = await medir(page, linha, tema, tamanho.width, erros);
          } catch (e) {
            // A tela redirecionou DURANTE a medição (contexto destruído). Uma
            // segunda passada, com a navegação já assentada, é a diferença
            // entre "a tela falhou" e "o instrumento correu atrás do redirect".
            if (
              !/Execution context was destroyed|interrupted by another navigation/i.test(String(e))
            ) {
              throw e;
            }
            m = await medir(page, linha, tema, tamanho.width, erros);
          }
          medidas.push(m);
          console.info(
            `${tema}/${tamanho.nome} ${linha.rota.padEnd(34)} overflow=${String(m.overflow ?? "—").padStart(3)} ` +
              `axe=${m.axe ? `${m.axe.critica}/${m.axe.seria}` : "—"} ` +
              `h1=${m.h1[0] ? `"${m.h1[0].slice(0, 22)}"` : "—"} ` +
              `console=${m.consoleErros.length}${m.esqueleto ? " ESQUELETO" : ""}`,
          );
          for (const no of m.axe?.nos ?? []) console.info(`    ${linha.rota} → ${no}`);
          for (const e of m.consoleErros.slice(0, 2))
            console.info(`    ${linha.rota} console → ${e}`);
        } catch (e) {
          medidas.push(
            medidaInvalida(
              linha,
              tema,
              tamanho.width,
              `erro ao medir: ${String(e).slice(0, 160)}`,
              [String(e).slice(0, 200)],
            ),
          );
          console.info(`${tema}/${tamanho.nome} ${linha.rota} NÃO MEDIDA: ${String(e).slice(0, 120)}`);
        }
      }
      await contexto.close();
    }
  }

  /*
   * MESCLA, NÃO SOBRESCREVE. Cada lote mede um grupo, e a matriz é o conjunto:
   * gravar só o lote apagou as 48 medições do grupo anterior na primeira
   * rodada. A chave é `rota+tema+largura` — a mesma linha medida de novo
   * substitui a antiga, que é o que se quer ao reconferir um conserto.
   */
  const antigas: MedidaRota[] = existsSync(SAIDA)
    ? (JSON.parse(readFileSync(SAIDA, "utf8")) as { medidas: MedidaRota[] }).medidas
    : [];
  const chave = (m: MedidaRota) => `${m.rota}|${m.tema}|${m.largura}`;
  const porChave = new Map(antigas.map((m) => [chave(m), m]));
  for (const m of medidas) porChave.set(chave(m), m);
  const todas = [...porChave.values()];

  /*
   * O PLACAR CONTA O QUE FOI MEDIDO — NÃO O QUE FOI VISITADO.
   *
   * `rotas` era `alvo.length`: medir um grupo de 2 rotas reescrevia o cabeçalho
   * de um artefato de 92 com "rotas: 2". Agora o número é o do CONJUNTO, e
   * `validas`/`invalidas` respondem a pergunta que o total sozinho não
   * responde. `ehMedidaValida` também reconhece artefato antigo (sem `valida`),
   * onde os zeros de rota não visitada ainda estão gravados.
   */
  const validas = todas.filter(ehMedidaValida);
  const invalidas = todas.filter((m) => !ehMedidaValida(m));
  const rotas = new Set(todas.map((m) => m.rota));
  const puladas = [...new Set(invalidas.map((m) => m.rota))].map((rota) => {
    const daRota = invalidas.filter((m) => m.rota === rota);
    return {
      rota,
      combinacoes: daRota.length,
      motivos: [...new Set(daRota.map((m) => m.motivo ?? m.pulada ?? "não medida"))],
    };
  });

  writeFileSync(
    SAIDA,
    JSON.stringify(
      {
        gerado: new Date().toISOString(),
        rotulo: ROTULO,
        rotas: rotas.size,
        total: todas.length,
        validas: validas.length,
        invalidas: invalidas.length,
        puladas,
        medidas: todas,
      },
      null,
      2,
    ),
  );
  await browser.close();
  console.info(
    `\n${medidas.length} medições neste lote; ${todas.length} no total ` +
      `(${validas.length} válidas, ${invalidas.length} não medidas) em ${SAIDA}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
