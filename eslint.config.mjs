// Flat config (ESLint 9 / eslint-config-next 16 — `next lint` foi removido no
// Next 16; o script `lint` chama o eslint CLI direto). Migração 1:1 do antigo
// .eslintrc.json.
import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig([
  // `.claude/worktrees/` são checkouts locais de outros agentes (com `.next/` e
  // `node_modules/` próprios) — nunca fonte deste repo; lintá-los explode o eslint
  // com dezenas de milhares de falsos positivos em JS gerado. (Na CI, checkout
  // limpo, o diretório nem existe.)
  //
  // `public/maplibre-gl-worker.mjs` é ASSET VENDORIZADO: o bundle do worker do
  // MapLibre, copiado de `node_modules` e servido como está (é ele que o
  // `setWorkerUrl` do mapa carrega). Lintá-lo produziu **1073 erros** no CI —
  // o arquivo é minificado, e as regras do produto não se aplicam a código que
  // não escrevemos. O teste `worker-do-mapa-e-asset-estatico` garante que ele é
  // byte a byte o do pacote instalado, então não há código nosso escondido ali.
  globalIgnores([
    ".next/",
    "node_modules/",
    "dist/",
    "supabase/",
    "mobile/www/",
    "android/app/src/main/assets/public/",
    "next-env.d.ts",
    ".claude/worktrees/",
    "public/maplibre-gl-worker.mjs",
  ]),
  nextPlugin.configs["core-web-vitals"],
  reactHooks.configs.flat.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      // react-hooks 7 introduziu esta regra como error; o padrão setState-em-
      // effect é pré-existente em 14 componentes — warn até o mutirão de refactor.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // Script CLI do gov-loop (roda via tsx, fora do bundle) — require() ok.
    files: ["loop/**/*.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);
