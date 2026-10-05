/**
 * O NCM CHEGA SOZINHO — E A PESSOA É QUE SALVA.
 *
 * A busca (rota `products/ncm-sugestao`, alimentada pela tabela IBPT da org da
 * 0254) escreve no CAMPO do formulário; só o clique em "Salvar" grava. Este
 * arquivo cerca as quatro frases em que isso pode sair errado:
 *
 *  1. Digitar o nome preenche o NCM e o save manda `ncm_origem: "sugerido"`.
 *  2. Quem chega primeiro leva: a resposta atrasada não sobrescreve o que a
 *     pessoa já digitou — e aí a origem é `manual`, não `sugerido`.
 *  3. Editar produto legado (NCM existente, origem NULL) sem tocar no campo
 *     reenvia `ncm_origem: null` — nunca marca tudo como manual.
 *  4. Editar produto SEM NCM também sugere, e o patch leva `sugerido`.
 *  5. Rota indisponível (sem tabela IBPT, sem rede): o formulário segue intacto
 *     — sem badge, sem NCM, e o save continua mandando SEM ncm e SEM origem.
 *
 * A degradação do `buscarSugestaoDeNcm` é silenciosa de propósito: a 0216
 * manda a emissão listar quem falta NCM em vez de presumir, então "sem
 * sugestão" é um estado legítimo, não um erro a exibir.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/app/app/products/_fotos", () => ({ FotosDoProduto: () => null }));

import { apiClient } from "@/lib/api/client";
import type { CandidatoDeNcm } from "@/lib/catalogo/sugerir-ncm";
import type { Produto } from "@/lib/schemas/produtos";

import { ProdutosClient } from "@/app/app/products/_client";

const TEXTOS = {
  titulo: "Produtos",
  subtitulo: "O catálogo da loja.",
  vazio: "Nenhum produto cadastrado ainda",
  vazioDica: "Cadastre o primeiro.",
};

const SUGESTAO: CandidatoDeNcm = {
  ncm: "73181500",
  ex: "7318.15",
  descricao: "Parafusos e porcas de aço inoxidável",
  confianca: 0.92,
};

function produto(over: Partial<Produto> = {}): Produto {
  return {
    id: "44444444-4444-4444-4444-444444444444",
    codigo: "PAR-001",
    nome: "Parafuso sextavado",
    descricao: null,
    marca: null,
    categoria: null,
    preco_cents: 1000,
    moeda: "BRL",
    custo_cents: null,
    controla_estoque: true,
    quantidade: 10,
    ativo: true,
    origem: "manual",
    imagem_url: null,
    ncm: null,
    ncm_origem: null,
    unidade: null,
    cfop: null,
    destaque: false,
    preco_promocional_cents: null,
    promocao_ate: null,
    updated_at: "2026-10-04T12:00:00Z",
    ...over,
  };
}

function montar(inicial: Produto[] = [], podeEditar = true) {
  return render(
    <ProdutosClient inicial={inicial} podeEditar={podeEditar} textos={TEXTOS} />,
  );
}

/**
 * Espera DENTRO de `act`. O debounce é de 500 ms e a resposta da rota é uma
 * promessa: deixar as duas estourarem fora de `act` renderiza o componente de
 * novo sem sincronizar e enche o stderr do teste de aviso — o teste até passa,
 * mas passa barulhento, e aviso que ninguém lê vira aviso que ninguém conserta.
 */
async function espera(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function campo(testid: string) {
  return screen.getByTestId(testid) as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue({ data: { sugestao: SUGESTAO } } as never);
  vi.mocked(apiClient.post).mockResolvedValue({ data: { id: "novo" } } as never);
  vi.mocked(apiClient.patch).mockResolvedValue({ data: {} } as never);
});

afterEach(cleanup);

describe("NCM pelo nome no formulário de produto", () => {
  it("preenche sozinho ao digitar o nome e salva com origem sugerido", async () => {
    montar();
    fireEvent.click(screen.getByTestId("novo-produto"));
    fireEvent.change(campo("produto-codigo"), { target: { value: "PAR-001" } });
    fireEvent.change(campo("produto-nome"), { target: { value: "Parafuso sextavado inox" } });
    fireEvent.change(campo("produto-preco"), { target: { value: "10,00" } });

    await espera(1500);

    expect(vi.mocked(apiClient.get)).toHaveBeenCalledWith(
      "/api/v1/products/ncm-sugestao?nome=Parafuso%20sextavado%20inox",
    );
    expect(campo("produto-ncm").value).toBe("73181500");
    expect(screen.getByTestId("ncm-sugerido-criar")).toBeTruthy();

    fireEvent.click(screen.getByTestId("salvar-produto"));
    await waitFor(() => expect(vi.mocked(apiClient.post)).toHaveBeenCalled());

    const corpo = vi.mocked(apiClient.post).mock.calls[0]![1] as Record<string, unknown>;
    expect(corpo).toMatchObject({ ncm: "73181500", ncm_origem: "sugerido" });
  });

  it("não sobrescreve o NCM digitado à mão — a origem vira manual", async () => {
    let chega: (v: unknown) => void = () => {};
    vi.mocked(apiClient.get).mockImplementationOnce(
      () => new Promise((resolve) => { chega = resolve; }) as never,
    );

    montar();
    fireEvent.click(screen.getByTestId("novo-produto"));
    fireEvent.change(campo("produto-codigo"), { target: { value: "PAR-002" } });
    fireEvent.change(campo("produto-nome"), { target: { value: "Porca sextavada" } });
    fireEvent.change(campo("produto-preco"), { target: { value: "2,50" } });

    await waitFor(() => expect(vi.mocked(apiClient.get)).toHaveBeenCalled(), {
      timeout: 3000,
    });

    const ncm = campo("produto-ncm");
    fireEvent.change(ncm, { target: { value: "84146000" } });

    await act(async () => {
      chega({ data: { sugestao: SUGESTAO } });
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(ncm.value).toBe("84146000");
    expect(screen.queryByTestId("ncm-sugerido-criar")).toBeNull();

    fireEvent.click(screen.getByTestId("salvar-produto"));
    await waitFor(() => expect(vi.mocked(apiClient.post)).toHaveBeenCalled());

    const corpo = vi.mocked(apiClient.post).mock.calls[0]![1] as Record<string, unknown>;
    expect(corpo).toMatchObject({ ncm: "84146000", ncm_origem: "manual" });
  });

  it("editar produto legado sem origem reenvia null, sem virar manual", async () => {
    montar([produto({ ncm: "73181500", ncm_origem: null })]);

    fireEvent.click(screen.getByTestId("editar-PAR-001"));
    fireEvent.click(screen.getByTestId("salvar-edicao"));
    await waitFor(() => expect(vi.mocked(apiClient.patch)).toHaveBeenCalled());

    // Nada a sugerir: o campo já tinha NCM, então a rota nem é consultada.
    expect(vi.mocked(apiClient.get)).not.toHaveBeenCalled();

    const patch = vi.mocked(apiClient.patch).mock.calls[0]![1] as Record<string, unknown>;
    expect(patch).toMatchObject({ ncm: "73181500", ncm_origem: null });
  });

  it("editar produto sem NCM também sugere, e o patch leva sugerido", async () => {
    montar([produto({ ncm: null, ncm_origem: null })]);

    fireEvent.click(screen.getByTestId("editar-PAR-001"));
    fireEvent.change(campo("editar-nome"), { target: { value: "Parafuso sextavado inox" } });
    await espera(1500);

    expect(campo("editar-ncm").value).toBe("73181500");
    expect(screen.getByTestId("ncm-sugerido-editar")).toBeTruthy();

    fireEvent.click(screen.getByTestId("salvar-edicao"));
    await waitFor(() => expect(vi.mocked(apiClient.patch)).toHaveBeenCalled());

    const patch = vi.mocked(apiClient.patch).mock.calls[0]![1] as Record<string, unknown>;
    expect(patch).toMatchObject({ ncm: "73181500", ncm_origem: "sugerido" });
  });

  it("rota indisponível degrada em silêncio: sem badge, sem NCM e save sem origem", async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error("42P01") as never);

    montar();
    fireEvent.click(screen.getByTestId("novo-produto"));
    fireEvent.change(campo("produto-codigo"), { target: { value: "PAR-003" } });
    fireEvent.change(campo("produto-nome"), { target: { value: "Cabo flexível" } });
    fireEvent.change(campo("produto-preco"), { target: { value: "9,90" } });

    await waitFor(() => expect(vi.mocked(apiClient.get)).toHaveBeenCalled(), {
      timeout: 3000,
    });
    await espera(100);

    expect(campo("produto-ncm").value).toBe("");
    expect(screen.queryByTestId("ncm-sugerido-criar")).toBeNull();

    fireEvent.click(screen.getByTestId("salvar-produto"));
    await waitFor(() => expect(vi.mocked(apiClient.post)).toHaveBeenCalled());

    const corpo = vi.mocked(apiClient.post).mock.calls[0]![1] as Record<string, unknown>;
    expect(corpo).not.toHaveProperty("ncm");
    expect(corpo).not.toHaveProperty("ncm_origem");
  });
});
