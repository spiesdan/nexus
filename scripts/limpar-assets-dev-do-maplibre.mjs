/**
 * Remove os builds `-dev` do MapLibre do artefato publicado.
 *
 * ## Por que eles aparecem (medido em 17/11/2026)
 *
 * `maplibre-gl/dist/maplibre-gl.mjs` calcula a URL do worker em runtime:
 *
 * ```js
 * const nome = url.endsWith("-dev.mjs") ? "maplibre-gl-worker-dev.mjs" : "maplibre-gl-worker.mjs";
 * const worker = new URL(nome, import.meta.url);
 * ```
 *
 * O bundler não consegue provar qual dos dois ramos vence no build, então
 * **copia os dois** para `.next/static/media` — junto do mapa principal em
 * versão dev. Medido: `maplibre-gl-dev.mjs` 2,4 MB + `maplibre-gl-worker-dev.mjs`
 * 1,1 MB = **3,5 MB** de artefato que nenhuma requisição de produção pede
 * (o app chama `lib.setWorkerUrl("/maplibre-gl-worker.mjs")`, servido de
 * `public/`).
 *
 * ## Por que apagar depois do build é seguro
 *
 * Em produção o módulo real é `maplibre-gl.<hash>.mjs` (sem `-dev`), então o
 * ramo do worker é o de produção; e o worker é **sobrescrito** pelo
 * `setWorkerUrl` do componente. Ninguém pede os arquivos `-dev`.
 *
 * O container de produção roda `pnpm build`, então este passo entra no mesmo
 * caminho do Docker e do CI (`build-and-size`) — não é um ritual local.
 *
 * Se algum dia o app passar a depender do build dev (ex.: modo
 * desenvolvimento servido do artefato), a remoção tem de sair junto — o
 * `console.warn` deixa o rastro do que foi apagado.
 */
import { readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const MEDIA = path.resolve(process.cwd(), ".next", "static", "media");

function tamanho(arquivo) {
  try {
    return statSync(arquivo).size;
  } catch {
    return 0;
  }
}

function principal() {
  if (!statSync(MEDIA, { throwIfNoEntry: false })) {
    console.info("[maplibre] sem .next/static/media — nada a limpar");
    return;
  }

  const alvos = readdirSync(MEDIA).filter(
    (nome) =>
      /^maplibre-gl-dev\..*\.mjs$/.test(nome) ||
      /^maplibre-gl-worker-dev\..*\.mjs$/.test(nome),
  );

  if (alvos.length === 0) {
    console.info("[maplibre] nenhum build -dev no artefato");
    return;
  }

  let liberado = 0;
  for (const nome of alvos) {
    const arquivo = path.join(MEDIA, nome);
    liberado += tamanho(arquivo);
    rmSync(arquivo, { force: true });
  }
  console.info(
    `[maplibre] removidos ${alvos.length} build(s) -dev (${(liberado / 1024 / 1024).toFixed(1)} MB): ${alvos.join(", ")}`,
  );
}

principal();
