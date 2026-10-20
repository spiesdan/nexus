/**
 * A ABA NOTAS IMPORTA O HISTÓRICO POR XML — E DIZ POR QUE NÃO É POR NSU.
 *
 * O botão antigo ("Importar histórico do SEFAZ") ficava em `NSU 0/0` para
 * sempre: a distribuição de DF-e é do DESTINATÁRIO, e a SEFAZ não devolve ao
 * emitente as notas que ele mesmo emitiu (NT 2014.002). A busca não estava
 * "com defeito" — estava pedindo à SEFAZ uma coisa que ela não entrega.
 *
 * O caminho que funciona é o XML/ZIP exportado do sistema antigo. Este teste
 * cobra o contrato da tela:
 *   1. o diálogo explica a regra do NSU (senão o próximo agente "conserta"
 *      o botão de volta);
 *   2. os arquivos vão para `importar-xmls` como multipart, e o resumo fica
 *      na tela em vez de sumir num toast.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { GradeNotas } from "@/app/app/notas/_components/GradeNotas";

/**
 * O componente pede ~80 rótulos; o proxy devolve a própria chave, que é
 * exatamente o que o `useT` mockado faz. Assim o teste mede comportamento, e
 * não a lista de strings.
 */
const TEXTOS = new Proxy({} as ComponentProps<typeof GradeNotas>["textos"], {
  get: (_alvo, prop) => String(prop),
});

const fetchMock = vi.fn();

beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      data: {
        importados: 2,
        jaExistiam: 1,
        fora_do_emitente: 0,
        ilegiveis: 0,
        conflitos: 0,
        erros: [],
      },
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function abrirDialogo(): void {
  render(
    <GradeNotas
      inicial={[]}
      pessoas={{}}
      operacaoPadrao=""
      ambientePadrao="homologacao"
      podeEmitir
      textos={TEXTOS}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "importarXmls" }));
}

describe("aba Notas — importar o histórico por XML", () => {
  it("o diálogo explica por que o NSU não traz as notas emitidas", () => {
    abrirDialogo();
    expect(screen.getByRole("dialog")).toBeTruthy();
    // A frase inteira mora nos textos; aqui basta provar que ela está na tela.
    expect(screen.getByText("importarXmlsNsu")).toBeTruthy();
  });

  it("envia os arquivos como multipart e mostra o resumo sem fechar o diálogo", async () => {
    abrirDialogo();

    const entrada = screen.getByTestId("arquivos-xml") as HTMLInputElement;
    const arquivo = new File(["<xml/>"], "nota.xml", { type: "application/xml" });
    fireEvent.change(entrada, { target: { files: [arquivo] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/invoices/importar-xmls");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form.get("arquivos")).toBeInstanceOf(File);

    await waitFor(() => expect(screen.getByText(/2 importada\(s\)/)).toBeTruthy());
    expect(screen.getByText(/1 já existiam/)).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });

  it("erro da rota aparece no diálogo — não vira toast que some", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: "Nenhum arquivo no campo 'arquivos'." } }),
    });
    abrirDialogo();

    const entrada = screen.getByTestId("arquivos-xml") as HTMLInputElement;
    fireEvent.change(entrada, {
      target: { files: [new File(["x"], "nota.xml", { type: "application/xml" })] },
    });

    await waitFor(() =>
      expect(screen.getByText("Nenhum arquivo no campo 'arquivos'.")).toBeTruthy(),
    );
  });
});
