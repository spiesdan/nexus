import localFont from "next/font/local";

/**
 * Tipografias do SHOWCASE `/design`.
 *
 * ─── Por que local, e não `next/font/google` (C10, 18/11/2026) ──────────────
 *
 * A página `/design` exibe pares tipográficos para avaliação, e usava nove
 * famílias via `next/font/google`. Esse import **baixa a fonte durante o
 * `build`**: numa VPS sem saída para o Google o build do produto inteiro morre
 * — inclusive o de quem só queria a instalação padrão. O showcase é uma tela
 * de avaliação; não pode ser o motivo de o produto não compilar offline.
 *
 * Os arquivos (subset `latin`, que cobre o português) estão em `public/fonts/`,
 * com o texto da licença OFL de cada família ao lado. `next/font/local` os
 * processa no build sem tocar a rede.
 *
 * `next/font` exige constantes de módulo: cada família exporta `.variable`, e
 * o CSS do showcase troca o par por `--font-display`/`--font-body`/`--font-mono`.
 */

export const bricolage = localFont({
  src: "../../../public/fonts/bricolage-grotesque-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-bricolage",
});

export const jakarta = localFont({
  src: "../../../public/fonts/plus-jakarta-sans-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-jakarta",
});

export const fraunces = localFont({
  src: "../../../public/fonts/fraunces-latin-full-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-fraunces",
});

export const manrope = localFont({
  src: "../../../public/fonts/manrope-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-manrope",
});

export const atkinson = localFont({
  src: [
    { path: "../../../public/fonts/atkinson-hyperlegible-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../../public/fonts/atkinson-hyperlegible-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-atkinson",
});

export const sourceSerif = localFont({
  src: "../../../public/fonts/source-serif-4-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-source-serif",
});

export const plexSans = localFont({
  src: [
    { path: "../../../public/fonts/ibm-plex-sans-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../../../public/fonts/ibm-plex-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../../public/fonts/ibm-plex-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../../public/fonts/ibm-plex-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../../public/fonts/ibm-plex-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-plex-sans",
});

export const plexMono = localFont({
  src: [
    { path: "../../../public/fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../../public/fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  variable: "--font-plex-mono",
});

export const jetbrains = localFont({
  src: "../../../public/fonts/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-jetbrains",
});

export const allFontVariables = [
  bricolage.variable,
  jakarta.variable,
  fraunces.variable,
  manrope.variable,
  atkinson.variable,
  sourceSerif.variable,
  plexSans.variable,
  plexMono.variable,
  jetbrains.variable,
].join(" ");
