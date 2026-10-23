import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { ensureConversation } from "@/lib/automation/start-conversation";

import { enviarParaProspect, type ParametrosDoEnvio } from "./envio";

vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: vi.fn() }));
vi.mock("@/lib/automation/start-conversation", () => ({
  ensureConversation: vi.fn(async () => "conv-1"),
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function resposta(over: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    status: "sent",
    error_message: null,
    metadata: {},
    ...over,
  } as never;
}

function adminFalso() {
  const ledger: unknown[] = [];
  const admin = {
    rpc: vi.fn(async () => ({ data: "contact-1", error: null })),
    from: (tabela: string) => ({
      insert: async (linha: unknown) => {
        if (tabela === "pacing_ledger") ledger.push(linha);
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  return { admin, ledger };
}

function parametros(over: Partial<ParametrosDoEnvio> = {}): ParametrosDoEnvio {
  return {
    orgId: "org-1",
    usuarioId: null,
    requestId: "req-1",
    sessaoId: "sess-1",
    prospect: {
      id: "p-1",
      nome: "Maria Silva",
      telefone_normalizado: "+5531999999999",
      cidade: "Belo Horizonte",
      categoria: "Oficina mecânica",
    },
    mensagem: "texto de teste",
    ...over,
  };
}

describe("enviarParaProspect", () => {
  beforeEach(() => {
    vi.mocked(sendMessageHandler).mockReset();
    vi.mocked(ensureConversation).mockClear();
  });

  it("template: interpola por prospect, manda type=template e grava o ledger", async () => {
    vi.mocked(sendMessageHandler).mockResolvedValue(resposta());
    const { admin, ledger } = adminFalso();

    const r = await enviarParaProspect(
      admin,
      parametros({
        template: {
          name: "boas_vindas",
          language: "pt_BR",
          contractHash: "hash-1",
          values: { "1": "Olá {{primeiro_nome}}, de {{cidade}}" },
          components: [{ type: "BODY", text: "{{1}}" }],
          parameterFormat: "POSITIONAL",
        },
      }),
    );

    expect(r).toEqual({ ok: true, messageId: "msg-1", status: "sent" });
    const [, , entrada] = vi.mocked(sendMessageHandler).mock.calls[0]!;
    expect(entrada).toMatchObject({
      type: "template",
      body: "Olá Maria, de Belo Horizonte",
      template_name: "boas_vindas",
      template_language: "pt_BR",
      template_values: { "1": "Olá Maria, de Belo Horizonte" },
    });
    expect(ledger).toHaveLength(1);
  });

  it("queued NÃO é enviado: devolve erro e não consome o espaçamento do número", async () => {
    vi.mocked(sendMessageHandler).mockResolvedValue(
      resposta({ status: "queued", metadata: { queued_reason: "meta_not_configured" } }),
    );
    const { admin, ledger } = adminFalso();

    const r = await enviarParaProspect(admin, parametros());

    expect(r).toMatchObject({
      ok: false,
      erro: "Mensagem em fila: meta_not_configured.",
    });
    expect(ledger).toHaveLength(0);
  });

  it("failed devolve o motivo da mensagem, não um 'enviado' sem id", async () => {
    vi.mocked(sendMessageHandler).mockResolvedValue(
      resposta({ status: "failed", error_message: "131047: janela fechada" }),
    );
    const { admin, ledger } = adminFalso();

    const r = await enviarParaProspect(admin, parametros());

    expect(r).toEqual({ ok: false, erro: "131047: janela fechada" });
    expect(ledger).toHaveLength(0);
  });

  it("template sem texto para os guardrails é recusado ANTES de chamar o handler", async () => {
    const { admin } = adminFalso();

    const r = await enviarParaProspect(
      admin,
      parametros({
        template: {
          name: "só_midia",
          language: "pt_BR",
          contractHash: "hash-1",
          values: {},
          components: [{ type: "HEADER", format: "IMAGE" }],
          parameterFormat: "POSITIONAL",
        },
      }),
    );

    expect(r).toMatchObject({ ok: false, erro: expect.stringContaining("template_sem_texto") });
    expect(sendMessageHandler).not.toHaveBeenCalled();
  });
});
