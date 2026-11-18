/**
 * OFFLINE, O ENVIO NÃO SAI — E O TEXTO NÃO PODE SUMIR.
 *
 * ─── O DEFEITO (medido lendo o componente, 18/11/2026) ────────────────────
 *
 * O composer limpa o campo ANTES de saber o resultado do envio — de propósito,
 * para dar para digitar a próxima mensagem. O `onError` restaura o texto quando
 * o envio falha. Mas o TanStack Query **pausa mutations** sem rede (modo
 * `online`, o padrão): não há erro nem sucesso, a mutation fica pendente. E aí
 * o parágrafo escrito simplesmente desaparecia, sem toast, sem aviso — e sairia
 * sozinho quando a rede voltasse.
 *
 * A guarda checa `navigator.onLine === false` antes de limpar o campo. Wi-Fi sem
 * internet (`onLine: true`) segue o caminho normal: a API falha e o `onError`
 * restaura.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { enviar, criarNota, aviso } = vi.hoisted(() => ({
  enviar: vi.fn(),
  criarNota: vi.fn(),
  aviso: vi.fn(),
}));

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate: enviar, isPending: false }),
}));
vi.mock("@/hooks/inbox/useCreateNote", () => ({
  useCreateNote: () => ({ mutate: criarNota, isPending: false }),
}));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { warning: aviso, success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Peças do composer que abrem diálogos/popovers próprios: não são o assunto.
vi.mock("@/components/inbox/composer/AttachMenu", () => ({ AttachMenu: () => null }));
vi.mock("@/components/inbox/composer/AttachmentPreviewDialog", () => ({
  AttachmentPreviewDialog: () => null,
}));
vi.mock("@/components/inbox/composer/ContactPickerDialog", () => ({
  ContactPickerDialog: () => null,
}));
vi.mock("@/components/inbox/composer/AudioRecorder", () => ({ AudioRecorder: () => null }));
vi.mock("@/components/inbox/composer/DraftReplyButton", () => ({ DraftReplyButton: () => null }));
vi.mock("@/components/inbox/composer/EmojiButton", () => ({ EmojiButton: () => null }));
vi.mock("@/components/inbox/composer/TemplateMenu", () => ({
  TemplateMenu: () => null,
  resolveSlash: () => ({ open: false, query: "" }),
}));
vi.mock("@/components/nexus-ui/ai/NexusAi", () => ({ NexusAiSuggestion: () => null }));

import { Composer } from "@/components/inbox/Composer";

const onLineOriginal = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");

function fingirRede(online: boolean) {
  Object.defineProperty(Navigator.prototype, "onLine", {
    configurable: true,
    get: () => online,
  });
}

afterEach(() => {
  cleanup();
  enviar.mockClear();
  criarNota.mockClear();
  aviso.mockClear();
  if (onLineOriginal) Object.defineProperty(Navigator.prototype, "onLine", onLineOriginal);
});

function compor(texto: string) {
  const campo = screen.getByRole("textbox", { name: "Mensagem" });
  fireEvent.change(campo, { target: { value: texto } });
  return campo as HTMLTextAreaElement;
}

describe("composer sem conexão", () => {
  it("NÃO envia, NÃO apaga o texto e avisa", () => {
    fingirRede(false);
    render(<Composer conversationId="c1" />);

    const campo = compor("Resposta importante escrita com calma");
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(enviar).not.toHaveBeenCalled();
    // O ponto do teste: o texto continua exatamente onde estava.
    expect(campo.value).toBe("Resposta importante escrita com calma");
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it("com rede, envia e limpa o campo (o caminho de sempre)", () => {
    fingirRede(true);
    render(<Composer conversationId="c1" />);

    const campo = compor("Bom dia");
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0][0]).toMatchObject({ conversation_id: "c1", body: "Bom dia" });
    expect(campo.value).toBe("");
  });
});
