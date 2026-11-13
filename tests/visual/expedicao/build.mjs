/**
 * BUILD DA BANCADA VISUAL — esbuild para o JS, Tailwind para o CSS.
 *
 * Por que não `next build`: a bancada precisa rodar fora do app (sem Supabase,
 * sem auth, sem banco) e precisar do Next para fotografar uma tela é o mesmo
 * que não poder fotografá-la na máquina de quem só tem o repositório.
 *
 * O esbuild não é dependência direta deste repositório (ele vem junto do
 * Vite/Vitest), então o caminho é resolvido dentro de `node_modules/.pnpm` em
 * vez de ser importado por nome — é ferramenta local, não parte do produto.
 *
 *     node tests/visual/expedicao/build.mjs /caminho/de/saida
 */
import { createRequire } from "node:module";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "../../..");
const SAIDA = resolve(process.argv[2] ?? join(RAIZ, ".visual-expedicao"));
const require = createRequire(import.meta.url);

function caminhoDoEsbuild() {
  const pnpm = join(RAIZ, "node_modules/.pnpm");
  const dir = readdirSync(pnpm).find((d) => d.startsWith("esbuild@"));
  if (!dir) throw new Error("esbuild não está em node_modules/.pnpm — rode `pnpm install`");
  return require.resolve(join(pnpm, dir, "node_modules/esbuild"));
}

const esbuild = require(caminhoDoEsbuild());

mkdirSync(SAIDA, { recursive: true });

await esbuild.build({
  entryPoints: [join(AQUI, "bancada.tsx")],
  bundle: true,
  outdir: SAIDA,
  entryNames: "bancada",
  jsx: "automatic",
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  tsconfig: join(RAIZ, "tsconfig.json"),
  define: {
    "process.env.NODE_ENV": '"production"',
    // O client do Supabase não é chamado na bancada (status "montando" não
    // assina Realtime), mas o módulo é importado — e o bundler precisa dos
    // nomes para substituir.
    "process.env.NEXT_PUBLIC_SUPABASE_URL": "undefined",
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": "undefined",
  },
  alias: {
    "next/link": join(AQUI, "link-stub.tsx"),
  },
  loader: { ".css": "css" },
  logLevel: "info",
});

// ─── O CSS do produto (Tailwind 4) ────────────────────────────────────────
const postcss = require("postcss");
const tailwind = (await import("@tailwindcss/postcss")).default;
const globals = join(RAIZ, "app/globals.css");
const compilado = await postcss([tailwind()]).process(
  (await import("node:fs")).readFileSync(globals, "utf8"),
  { from: globals },
);
writeFileSync(join(SAIDA, "estilo.css"), compilado.css);

writeFileSync(
  join(SAIDA, "bancada.html"),
  `<!doctype html>
<html lang="pt-BR" data-theme="dark" style="color-scheme: dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bancada — expedição</title>
    <link rel="stylesheet" href="estilo.css" />
    <link rel="stylesheet" href="bancada.css" />
  </head>
  <body class="min-h-screen bg-background text-text">
    <div id="raiz"></div>
    <script src="bancada.js"></script>
  </body>
</html>
`,
);

/**
 * O `index.html` é só uma MOLDURA: um iframe de 1680px de largura.
 *
 * Sem isso a foto sai no tamanho da janela do app, que é estreita — e a
 * expedição é uma tela de TRÊS COLUNAS no `xl`. O iframe dá ao componente a
 * largura real em que o operador o usa (e, portanto, as media queries certas),
 * e o print é do elemento, não da viewport.
 */
writeFileSync(
  join(SAIDA, "index.html"),
  `<!doctype html>
<html lang="pt-BR" data-theme="dark" style="color-scheme: dark">
  <head>
    <meta charset="utf-8" />
    <title>Bancada — moldura</title>
    <style>
      html, body { margin: 0; background: #0b0c12; }
      #quadro { display: block; width: 1680px; height: 1600px; border: 0; }
    </style>
  </head>
  <body>
    <div id="quadro-wrap" role="group" aria-label="Quadro da bancada">
      <iframe id="quadro" src="bancada.html" title="Bancada da expedição"></iframe>
    </div>
  </body>
</html>
`,
);

if (!existsSync(join(SAIDA, "bancada.js"))) {
  throw new Error("o bundle não foi gerado — veja o log do esbuild acima");
}

// ─── Worker do MapLibre ───────────────────────────────────────────────────
// O MapLibre carrega o worker como módulo. Copiamos o arquivo oficial para o
// diretório de saída e o componente aponta `setWorkerUrl("/maplibre-gl-worker.mjs")`.
//
// O caminho é resolvido pelo PACOTE instalado, não por `maplibre-gl@<versão>`:
// hardcodar a versão aqui fazia a bancada quebrar (ou, pior, servir o worker de
// outra versão) no primeiro bump do Dependabot.
const WORKER_SRC = join(RAIZ, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs");
if (!existsSync(WORKER_SRC)) {
  throw new Error(`maplibre-gl worker não encontrado: ${WORKER_SRC}`);
}
copyFileSync(WORKER_SRC, join(SAIDA, "maplibre-gl-worker.mjs"));

console.log(`bancada pronta em ${SAIDA}`);
