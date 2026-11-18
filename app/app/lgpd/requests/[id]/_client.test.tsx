/**
 * O detalhe do pedido LGPD tinha um erro SEM saída: a única forma de tentar de
 * novo era recarregar a página. Este teste prende o retry.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refetch = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useLgpdRequest", () => ({
  useLgpdRequest: () => ({ data: undefined, isLoading: false, error: new Error("boom"), refetch }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => undefined }));

import { LgpdRequestDetail } from "./_client";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("detalhe LGPD — erro", () => {
  it("mostra a falha e oferece Tentar novamente", () => {
    render(<LgpdRequestDetail id="a0000000-0000-4000-8000-000000000001" />);
    expect(screen.getByText("Falha ao carregar solicitação.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
