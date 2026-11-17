/**
 * Issue #64 — o teto existe e conta as duas coisas.
 *
 * Sem Upstash configurado o `checkRateLimit` cai para o contador em memória do
 * processo, que é exatamente o que este teste quer exercitar: o caminho real,
 * sem mock do limitador. O que se mocka é só o `headers()` do Next, para
 * escolher o IP de cada tentativa.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { headers } from "next/headers";

vi.mock("next/headers", () => ({ headers: vi.fn() }));

function comIp(ip: string) {
  vi.mocked(headers).mockResolvedValue({
    get: (k: string) => (k === "x-forwarded-for" ? ip : null),
  } as never);
}

describe("authRateLimited", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("barra ao estourar o teto por IP", async () => {
    const { authRateLimited } = await import("./rate-limit");
    comIp("203.0.113.10");
    const limites = { ip: 3, windowSec: 300 };

    const veredito: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      veredito.push(await authRateLimited("teste_ip", null, limites));
    }

    expect(veredito).toEqual([false, false, false, true]);
  });

  it("barra por identificador mesmo com o IP mudando a cada tentativa", async () => {
    const { authRateLimited } = await import("./rate-limit");
    const limites = { ip: 100, id: 2, windowSec: 300 };
    const alvo = "vitima@example.com";

    const veredito: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      comIp(`198.51.100.${i}`); // IP diferente a cada tentativa: o ataque distribuído
      veredito.push(await authRateLimited("teste_id", alvo, limites));
    }

    // Se só houvesse contagem por IP, os três passariam.
    expect(veredito).toEqual([false, false, true]);
  });

  it("conta identificadores diferentes em baldes separados", async () => {
    const { authRateLimited } = await import("./rate-limit");
    comIp("203.0.113.20");
    const limites = { ip: 100, id: 1, windowSec: 300 };

    expect(await authRateLimited("teste_sep", "a@example.com", limites)).toBe(false);
    expect(await authRateLimited("teste_sep", "b@example.com", limites)).toBe(false);
    expect(await authRateLimited("teste_sep", "a@example.com", limites)).toBe(true);
  });

  it("não põe o e-mail em claro na chave do contador", async () => {
    const rl = await import("@/lib/ai/dispatcher/rate-limit");
    const spy = vi.spyOn(rl, "checkRateLimit");
    vi.resetModules();
    const { authRateLimited } = await import("./rate-limit");
    comIp("203.0.113.30");

    await authRateLimited("teste_pii", "cliente@example.com", { ip: 10, id: 10, windowSec: 300 });

    const chaves = spy.mock.calls.map((c) => c[0]).join(" ");
    expect(chaves).not.toContain("cliente@example.com");
    expect(chaves).not.toContain("203.0.113.30");
  });
});

describe("sem IP identificável — o balde global que era um DoS", () => {
  function semNenhumHeaderDeIp() {
    vi.mocked(headers).mockResolvedValue({ get: () => null } as never);
  }

  it("não barra por IP quando não há de onde tirar o IP", async () => {
    // A versão anterior jogava TODA tentativa sem header num único balde
    // (`opaque("sem-ip")`). Como o kit self-host expõe o app sem proxy, esse era o
    // caminho NORMAL: 60 requisições anônimas trancavam o login da instalação
    // inteira, e o atacante dividia o balde com as vítimas em vez de ficar isolado.
    const { authRateLimited } = await import("./rate-limit");
    semNenhumHeaderDeIp();
    const limites = { ip: 3, windowSec: 300 };

    const veredito: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      veredito.push(await authRateLimited("teste_sem_ip", null, limites));
    }

    expect(veredito).toEqual([false, false, false, false, false, false]);
  });

  it("mas o teto por CONTA continua valendo sem IP — é ele que barra força bruta", async () => {
    // O contrapeso que impede a leitura preguiçosa "sem IP não tem limite": a
    // proteção que realmente importa contra adivinhação de senha não depende de IP,
    // e é exatamente a desenhada para o ataque distribuído.
    const { authRateLimited } = await import("./rate-limit");
    semNenhumHeaderDeIp();
    const limites = { ip: 100, id: 2, windowSec: 300 };

    const veredito: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      veredito.push(await authRateLimited("teste_conta", "alvo@example.com", limites));
    }

    expect(veredito).toEqual([false, false, true]);
  });

  it("x-real-ip serve quando x-forwarded-for não vem — Nginx simples só seta esse", async () => {
    const { authRateLimited } = await import("./rate-limit");
    vi.mocked(headers).mockResolvedValue({
      get: (k: string) => (k === "x-real-ip" ? "203.0.113.77" : null),
    } as never);
    const limites = { ip: 2, windowSec: 300 };

    const veredito: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      veredito.push(await authRateLimited("teste_real_ip", null, limites));
    }

    // Barra na terceira: o IP FOI reconhecido, senão nenhuma seria barrada.
    expect(veredito).toEqual([false, false, true]);
  });
});

/**
 * P1 — MFA e código de recuperação também têm teto.
 *
 * O `verifyMfa` já tinha um contador em COOKIE. Ele protege contra erro de
 * digitação, não contra ataque: quem apaga o cookie recomeça do zero, e 6
 * dígitos são 10^6 tentativas. O código de recuperação (8 caracteres) não
 * tinha teto nenhum. Aqui se prova que o balde POR IDENTIFICADOR barra mesmo
 * quando o IP muda a cada tentativa — o caso distribuído.
 */
describe("authRateLimited — identificador (MFA e recuperação)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("AUTH_LIMITS tem teto por identificador para mfa e recovery_code", async () => {
    const { AUTH_LIMITS } = await import("./rate-limit");
    expect(AUTH_LIMITS.mfa.id).toBeGreaterThan(0);
    expect(AUTH_LIMITS.mfa.windowSec).toBeGreaterThan(0);
    expect(AUTH_LIMITS.recovery_code.id).toBeGreaterThan(0);
    expect(AUTH_LIMITS.recovery_code.windowSec).toBeGreaterThan(0);
  });

  it("barra o código de recuperação por e-mail mesmo trocando de IP", async () => {
    const { authRateLimited, AUTH_LIMITS } = await import("./rate-limit");
    const veredito: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      comIp(`203.0.113.${100 + i}`); // IP diferente a cada tentativa
      veredito.push(
        await authRateLimited("recovery_code", "vitima@exemplo.test", AUTH_LIMITS.recovery_code),
      );
    }
    expect(veredito).toEqual([false, false, false, false, false, true]);
  });

  it("o balde de MFA é por usuário: dois usuários não se atrapalham", async () => {
    const { authRateLimited, AUTH_LIMITS } = await import("./rate-limit");
    comIp("203.0.113.200");
    for (let i = 0; i < 10; i++) {
      await authRateLimited("mfa", "usuario-a", AUTH_LIMITS.mfa);
    }
    comIp("203.0.113.201");
    expect(await authRateLimited("mfa", "usuario-b", AUTH_LIMITS.mfa)).toBe(false);
  });
});
