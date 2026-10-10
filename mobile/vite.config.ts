import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const raiz = dirname(fileURLToPath(import.meta.url));

/**
 * O BUILD DO SHELL.
 *
 * Duas páginas, zero framework: `index.html` (home) e `novo-pedido.html`
 * (captura). Sem React de propósito — o shell precisa abrir em aparelho
 * fraco, sem internet, na primeira vez. Cada KB aqui é tempo com a tela
 * preta na mão do vendedor.
 *
 * `@` aponta para a raiz do repo para importar `lib/offline/*` — o mesmo
 * código que o app Next importa. Duas compilações, uma fonte.
 */
export default defineConfig({
  root: raiz,
  resolve: {
    alias: { "@": resolve(raiz, "..") },
  },
  build: {
    outDir: "www",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(raiz, "index.html"),
        "novo-pedido": resolve(raiz, "novo-pedido.html"),
      },
    },
  },
});
