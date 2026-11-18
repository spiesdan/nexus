import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkRateLimit,
  peekRateLimit,
  rateLimitBackend,
  statusDeSaudeDoRateLimit,
} from "@/lib/ai/dispatcher/rate-limit";

/**
 * P3-02 — o fallback do rate limit em memória é DECLARADO, e a saúde sabe.
 *
 * ## A decisão (e por que não é "derrubar no boot")
 *
 * `lib/env.ts` já exige `UPSTASH_REDIS_REST_URL/TOKEN` em produção: sem elas o
 * app NÃO sobe. O buraco que sobrava é outro — Redis **configurado e
 * inalcançável** (contêiner parado, MISCONF, rede): o contador caía para a
 * memória do processo com um `warn` que ninguém lia, e o operador seguia
 * acreditando num limite compartilhado. Com duas réplicas, o teto efetivo dobra.
 *
 * Derrubar o processo quando o Redis pisca transformaria uma degradação de
 * rate limit em indisponibilidade TOTAL do CRM. A escolha é: **o app segue** e a
 * superfície de saúde fica `down` em produção (`/api/v1/health` → 503) enquanto
 * o limitador estiver em memória. Em dev/teste fica `degraded` (200) — `pnpm dev`
 * sem Redis precisa subir, é o ambiente de quem está só na UI.
 *
 * Este arquivo mede as três garantias: a classificação por ambiente, o contador
 * funcionando no modo memória (o modo em que ele é o ÚNICO limite) e a fiação do
 * check na rota de saúde.
 */

describe("classificação de saúde do rate limit", () => {
  it("Redis respondendo é `ok` em qualquer ambiente", () => {
    expect(statusDeSaudeDoRateLimit(true, "production")).toBe("ok");
    expect(statusDeSaudeDoRateLimit(true, "development")).toBe("ok");
    expect(statusDeSaudeDoRateLimit(true, "test")).toBe("ok");
  });

  it("em PRODUÇÃO, limitador em memória é `down` (health 503)", () => {
    expect(
      statusDeSaudeDoRateLimit(false, "production"),
      "produção com o teto por processo não pode se declarar saudável",
    ).toBe("down");
  });

  it("em dev/teste, o mesmo estado é `degraded` (200) — `pnpm dev` sem Redis sobe", () => {
    expect(statusDeSaudeDoRateLimit(false, "development")).toBe("degraded");
    expect(statusDeSaudeDoRateLimit(false, "test")).toBe("degraded");
  });
});

describe("contador em memória — o modo em que ele é o único limite", () => {
  it("conta, barra no teto e não vaza entre buckets", async () => {
    // Sem Upstash no ambiente de teste (`tests/setup` não semeia as chaves), o
    // caminho exercitado aqui é exatamente o fallback.
    const bucket = `teste:memoria:${Date.now()}`;
    const resultados = [];
    for (let i = 0; i < 3; i++) {
      resultados.push(await checkRateLimit(bucket, 2, 60));
    }
    expect(resultados.map((r) => r.allowed)).toEqual([true, true, false]);
    expect(resultados.map((r) => r.count)).toEqual([1, 2, 3]);

    const outro = await checkRateLimit(`${bucket}:outro`, 2, 60);
    expect(outro.count, "buckets diferentes não compartilham contador").toBe(1);
  });

  it("`peekRateLimit` lê o mesmo contador sem incrementar", async () => {
    const bucket = `teste:peek:${Date.now()}`;
    await checkRateLimit(bucket, 5, 60);
    await checkRateLimit(bucket, 5, 60);
    expect(await peekRateLimit(bucket, 60)).toBe(2);
    expect(await peekRateLimit(bucket, 60), "peek não pode incrementar").toBe(2);
  });

  it("o estado do backend é consultável e nomeia o motivo", () => {
    // Uma chamada anterior (qualquer teste acima) já declarou o fallback.
    const saude = rateLimitBackend();
    expect(saude.backend).toBe("memoria");
    expect(saude.motivo, "o motivo precisa ser nomeado, não `undefined`").toBeTruthy();
    expect(saude.desde, "a transição tem data — não é estado sem quando").toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
  });
});

describe("a rota de saúde expõe o check", () => {
  it("`/api/v1/health` sonda o MESMO caminho do limitador e publica `rate_limit`", () => {
    const fonte = readFileSync(
      path.resolve(__dirname, "../../app/api/v1/health/route.ts"),
      "utf8",
    );
    // A sonda é `checkRateLimit`, não um PING: PING passa em estado parcial
    // (MISCONF recusa escrita e atende leitura) e o contador já está na memória.
    expect(fonte).toMatch(/checkRateLimit\("health:rate-limit-probe"/);
    expect(fonte).toMatch(/rate_limit:\s*filtrar\(rateLimit\)/);
    expect(fonte).toMatch(/statusDeSaudeDoRateLimit\(/);
    // O estado entra no veredito global: um `down` aqui precisa derrubar a rota.
    expect(fonte).toMatch(/Object\.values\(checks\)\.some\(\(c\) => c\.status === "down"\)/);
  });
});
