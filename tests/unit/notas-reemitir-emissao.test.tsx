/**
 * NOTA PARADA EM "EMITINDO" PRECISA DE SAÍDA NA TELA.
 *
 * O Agente C fez a API recuperar a nota travada em `em_emissao` (o worker morreu
 * com o job `processando`): `POST /invoices/[id]/reemitir` devolve o MESMO job à
 * fila por CAS, recusa com 409 enquanto a tentativa está viva e não cria job
 * duplicado. Faltava a PORTA: a grade só mostrava "Reemitir" para `erro`, então
 * a recuperação existia sem botão.
 *
 * Este teste cobra o contrato da tela:
 *  1. `em_emissao` tem "Tentar de novo", com confirmação que explica o teto de
 *     15 min e a recusa honesta;
 *  2. recusar a confirmação NÃO chama a rota;
 *  3. confirmar chama `reemitir` — o mesmo caminho do `erro`, sem segunda ação.
 */
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const confirmarMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/nexus-ui/forms/ConfirmacaoProvider", () => ({
  useConfirmar: () => confirmarMock,
}));

const postMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  apiClient: { post: postMock, get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { GradeNotas } from "@/app/app/notas/_components/GradeNotas";
import type { NotaFiscal } from "@/lib/schemas/fiscal";

const TEXTOS = new Proxy({} as ComponentProps<typeof GradeNotas>["textos"], {
  get: (_alvo, prop) => String(prop),
});

function nota(status: NotaFiscal["status"]): NotaFiscal {
  return {
    id: `nota-${status}`,
    order_id: null,
    serie: "1",
    numero: 10,
    chave_acesso: null,
    protocolo: null,
    sefaz_cstat: null,
    sefaz_xmotivo: null,
    status,
    provedor: "sidecar",
    erro: status === "erro" ? "SEFAZ indisponível" : null,
    total_cents: 1000,
    created_at: "2026-11-18T12:00:00.000Z",
  };
}

function montar(status: NotaFiscal["status"], totalNotas: number | null = null) {
  return render(
    <GradeNotas
      inicial={[nota(status)]}
      totalNotas={totalNotas}
      pessoas={{}}
      operacaoPadrao=""
      ambientePadrao="homologacao"
      podeEmitir
      textos={TEXTOS}
    />,
  );
}

beforeEach(() => {
  refresh.mockReset();
  postMock.mockReset();
  postMock.mockResolvedValue({ data: {} });
  confirmarMock.mockReset();
  confirmarMock.mockResolvedValue(true);
});

afterEach(cleanup);

describe("grade de notas — nota travada em Emitindo", () => {
  it("mostra 'Tentar de novo' para em_emissao e chama a rota depois da confirmação", async () => {
    montar("em_emissao");

    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    expect(confirmarMock).toHaveBeenCalledTimes(1);
    // A explicação precisa nomear o teto e a recusa: sem isso o operador
    // reenvia uma nota que está processando e lê o 409 como defeito.
    const aviso = confirmarMock.mock.calls[0]?.[0] as { description: string };
    expect(aviso.description).toContain("15 minutos");

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/api/v1/invoices/nota-em_emissao/reemitir", {}),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("recusar a confirmação não chama a rota", () => {
    confirmarMock.mockResolvedValue(false);
    montar("em_emissao");

    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    expect(postMock).not.toHaveBeenCalled();
  });

  it("nota em erro continua com o botão de reemitir — mesmo caminho, sem duplicar a ação", async () => {
    montar("erro");

    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "reemitir" }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/api/v1/invoices/nota-erro/reemitir", {}),
    );
  });

  it("nota pendente não oferece reenvio — ela ainda não tentou emitir", () => {
    montar("pendente");
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "reemitir" })).toBeNull();
  });

  it("a grade declara o teto de 200 quando a organização tem mais notas", () => {
    montar("autorizada", 843);
    expect(screen.getByRole("status")).toHaveTextContent("Mostrando 1 de 843 notas");
  });

  it("sem truncagem não inventa aviso", () => {
    montar("autorizada", 1);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
