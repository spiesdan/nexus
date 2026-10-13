import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Remove um par de aspas (simples ou duplas) que envolva o valor inteiro —
 * mesma convenção que `hostgator-setup-kit/install.sh` grava no `.env` de
 * TODA instalação self-host (`NEXT_PUBLIC_APP_URL="https://${DOMAIN}"`).
 * Sem isto, um self-hoster que rode `pnpm test:unit` na própria VPS antes de
 * atualizar vê a suíte inteira falhar com "Variáveis de ambiente inválidas"
 * (a URL vira `"https://…"` — aspas incluídas — e falha a validação Zod de
 * `lib/env.ts`), mesmo com o `.env` real e correto. `.env.example` (o
 * convívio local, sem instalador) não usa aspas — por isso o bug nunca
 * apareceu em desenvolvimento, só em VPS instalada pelo kit.
 */
function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

// Load .env and .env.local before importing any app code that validates env vars
for (const envFile of [".env", ".env.local"]) {
  try {
    const path = resolve(process.cwd(), envFile);
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (key && !process.env[key]) {
        process.env[key] = stripQuotes(rest.join("=").trim());
      }
    }
  } catch {
    // File doesn't exist, skip
  }
}

/**
 * Placeholders para as vars que `lib/env.ts` exige na IMPORTAÇÃO.
 *
 * Sem isto, qualquer arquivo de teste que importe (mesmo transitivamente) um
 * módulo que toque `@/lib/env` **não carrega** onde não há `.env` — e o CI é
 * exatamente esse lugar. O sintoma é cruel: some o arquivo inteiro em vez de
 * falhar um teste, então a contagem cai e ninguém vê que a cobertura evaporou.
 * Foi o que aconteceu no PR #58: 4 arquivos com 0 testes rodados, e o número
 * verde de 1322 escondendo que 3 deles eram novos.
 *
 * É o mesmo remédio que `lib/env.ts:155` já aplica na fase de build da imagem
 * ("semeia placeholders pras vars que faltam e revalida"), aqui restrito ao
 * setup de teste — a lógica de produção não é tocada.
 *
 * `??=` de propósito: valor real de `.env`/`.env.local` SEMPRE vence, então
 * localmente nada muda. E o host `.invalid` é reservado por RFC 2606: se algum
 * teste tentar usar isto como URL de verdade, a chamada falha alto em vez de
 * bater em algum lugar existente.
 */
const PLACEHOLDERS: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://test-placeholder.invalid",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-placeholder-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-placeholder-service-role-key",
};
for (const [chave, valor] of Object.entries(PLACEHOLDERS)) {
  process.env[chave] ??= valor;
}

import "@testing-library/jest-dom/vitest";

// jsdom não implementa ResizeObserver; Radix (ex.: Switch) usa em layout effects.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/**
 * `URL.createObjectURL` É DUBLADO, e este é o motivo de ele não vir do jsdom.
 *
 * ═══ O QUE ACONTECEU ═════════════════════════════════════════════════════
 *
 * O bump do Dependabot #134 trouxe `jsdom` 30.0.1 → 30.1.2, e três testes caíram
 * com `TypeError: Cannot read properties of undefined (reading '_buffer')`, em
 * `AttachmentPreviewDialog.tsx:24`:
 *
 *   URL.createObjectURL(file)  →  a implementação do jsdom lê `_buffer` do Blob
 *
 * `_buffer` é detalhe INTERNO do jsdom. A implementação mudou, o campo interno
 * mudou de nome ou de lugar, e três testes que não têm nada a ver com object URL
 * pararam de passar.
 *
 * ═══ POR QUE DUBLAR E NÃO PINAR O JSDOM ═══════════════════════════════════
 *
 * Pinar significaria segurar o jsdom numa versão antiga para sempre, por causa
 * de um detalhe de implementação que ninguém está testando. Cada bump seguinte
 * de jsdom voltaria a derrubar o `verify`, e a resposta seria a mesma: pedir
 * para o Dependabot não tocar.
 *
 * O que os testes do composer medem é o COMPORTAMENTO — abrir preview, enviar,
 * manter o diálogo aberto quando o upload falha. A object URL é meio, não fim.
 * Dublando, o teste passa a depender do contrato (`createObjectURL` recebe algo
 * e devolve string) e não da representação interna de Blob do jsdom.
 *
 * O dublê não mexe em produção: no browser, `createObjectURL` é nativo e
 * funciona. As 15 chamadas do app continuam usando a nativa.
 *
 * A URL devolvida é única e com cara de blob: um preview que a renderiza continua
 * sendo testado de verdade, e `revokeObjectURL` continua sendo chamado e
 * verificável.
 */
let contadorObjectUrl = 0;
const objectUrlsCriadas = new Map<string, Blob>();

if (typeof URL.createObjectURL === "undefined") {
  // jsdom antigo ou removido: o teste tem que falhar alto, não passar em branco.
  throw new Error(
    "URL.createObjectURL não existe — o dublê abaixo depende dele para decidir se precisa instalar.",
  );
}
URL.createObjectURL = function createObjectURL(objeto: Blob | MediaSource): string {
  const id = ++contadorObjectUrl;
  const url = `blob:https://test.invalid/${id}`;
  objectUrlsCriadas.set(url, objeto as Blob);
  return url;
};
URL.revokeObjectURL = function revokeObjectURL(url: string): void {
  objectUrlsCriadas.delete(url);
};

/**
 * O que o dublê recebeu — para o teste que quiser afirmar que o preview usou a
 * URL certa, sem precisar expor o mapa inteiro.
 */
export function objectUrlDe(url: string): Blob | undefined {
  return objectUrlsCriadas.get(url);
}
