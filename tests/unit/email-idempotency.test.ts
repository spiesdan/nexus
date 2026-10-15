/**
 * Idempotência do envio (Resend `idempotencyKey`).
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══════════════════════════════════════════
 *
 * O export LGPD envia o e-mail (passo 9) e SÓ DEPOIS marca `completed`
 * (passo 10). Crash no meio faz o retry reenviar — e o titular recebia o
 * relatório duas vezes. A chave `lgpd-export:<requestId>` faz a Resend
 * devolver o mesmo envio. Este teste trava o encadeamento
 * `sendEmail → client.emails.send`: com chave ela chega ao SDK, sem chave
 * nada é enviado a mais.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const envio = vi.fn(async () => ({ data: { id: "msg-1" }, error: null }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: envio };
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    RESEND_API_KEY: "chave-de-teste-comprida",
    RESEND_FROM_EMAIL: "sistema@exemplo.com",
  },
}));

beforeEach(() => {
  vi.resetModules();
  envio.mockClear();
});

describe("sendEmail com idempotencyKey", () => {
  it("repassa a chave ao SDK", async () => {
    const { sendEmail } = await import("@/lib/email/resend");
    const r = await sendEmail({
      to: "titular@exemplo.com",
      subject: "assunto",
      html: "<p>oi</p>",
      idempotencyKey: "lgpd-export:req-1",
    });
    expect(r.ok).toBe(true);
    expect(envio).toHaveBeenCalledTimes(1);
    const chamada = envio.mock.calls[0] as Array<Record<string, unknown>>;
    expect(chamada[0]).toMatchObject({ idempotencyKey: "lgpd-export:req-1" });
  });

  it("sem chave, não inventa nenhuma", async () => {
    const { sendEmail } = await import("@/lib/email/resend");
    await sendEmail({ to: "titular@exemplo.com", subject: "assunto", html: "<p>oi</p>" });
    expect(envio).toHaveBeenCalledTimes(1);
    const chamada = envio.mock.calls[0] as Array<Record<string, unknown>>;
    expect(chamada[0]).not.toHaveProperty("idempotencyKey");
  });
});
