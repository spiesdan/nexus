/**
 * J14 — aprovar uma solicitação LGPD PELA TELA.
 *
 * O ciclo que o produto vende como "LGPD nativa" começa num clique. A rota está
 * provada em `j14-lgpd-ciclo.test.ts`; aqui se mede o que a rota não pode
 * provar:
 *
 *   - a justificativa é OBRIGATÓRIA e o botão de confirmar fica desabilitado
 *     até 10 caracteres — o servidor também barra (422), mas chegar no 422 por
 *     tentativa e erro é experiência ruim;
 *   - confirmar envia a justificativa SEM espaços nas pontas (é o que o banco
 *     guarda e a auditoria lê);
 *   - falha da API vira toast de erro — o DPO não pode achar que aprovou;
 *   - pedido já processado não oferece o botão.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApproveButton } from "@/app/app/lgpd/requests/[id]/ApproveButton";
import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("@/hooks/useApproveLgpdRequest", () => ({
  useApproveLgpdRequest: () => ({ mutate: mocks.mutate, isPending: false }),
}));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const PEDIDO = "req-lgpd-1";

beforeEach(() => {
  mocks.mutate.mockReset();
  vi.mocked(nexusToast.success).mockClear();
  vi.mocked(nexusToast.error).mockClear();
});

describe("ApproveButton", () => {
  it("pedido já em processing não oferece aprovação de novo", () => {
    const { container } = render(
      <ApproveButton requestId={PEDIDO} requestType="redact" status="processing" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("confirmar fica bloqueado até a justificativa ter 10 caracteres", () => {
    render(<ApproveButton requestId={PEDIDO} requestType="redact" status="received" />);

    fireEvent.click(screen.getByRole("button", { name: /Aprovar anonimização/i }));

    const confirmar = screen.getByRole("button", { name: "Confirmar aprovação" });
    expect(confirmar).toHaveProperty("disabled", true);

    const campo = screen.getByLabelText(/Justificativa/i) as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: "curto" } });
    expect(confirmar).toHaveProperty("disabled", true);

    fireEvent.change(campo, { target: { value: "Pedido do titular confirmado" } });
    expect(confirmar).toHaveProperty("disabled", false);
  });

  it("confirmar envia id e justificativa aparada — e o sucesso fecha a dialog", () => {
    render(<ApproveButton requestId={PEDIDO} requestType="data_request" status="received" />);

    fireEvent.click(screen.getByRole("button", { name: /Aprovar export/i }));
    fireEvent.change(screen.getByLabelText(/Justificativa/i), {
      target: { value: "  Titular confirmou por e-mail  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aprovação" }));

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    const [variaveis, opcoes] = mocks.mutate.mock.calls[0]!;
    expect(variaveis).toEqual({
      id: PEDIDO,
      approved_reason: "Titular confirmou por e-mail",
    });

    // O componente só fecha no onSuccess — e é o toast que diz que gravou.
    opcoes.onSuccess();
    expect(nexusToast.success).toHaveBeenCalledTimes(1);
  });

  it("falha da API avisa — o DPO não pode achar que aprovou", () => {
    render(<ApproveButton requestId={PEDIDO} requestType="redact" status="received" />);

    fireEvent.click(screen.getByRole("button", { name: /Aprovar anonimização/i }));
    fireEvent.change(screen.getByLabelText(/Justificativa/i), {
      target: { value: "Pedido do titular confirmado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aprovação" }));

    const [, opcoes] = mocks.mutate.mock.calls[0]!;
    opcoes.onError(new Error("409: já processado"));

    expect(nexusToast.error).toHaveBeenCalledWith(
      "Falha ao aprovar a solicitação. Tente novamente.",
    );
    expect(nexusToast.success).not.toHaveBeenCalled();
  });
});
