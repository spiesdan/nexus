/**
 * NOTA AVULSA NA GRADE: o nome do cliente tem que APARECER.
 *
 * A coluna Pessoa resolvia o nome pelo pedido de origem (`pessoas[order_id]`).
 * Venda avulsa não tem pedido — `order_id` é nulo por desenho —, então a célula
 * caía sempre em "—" mesmo com o cliente na nota. O filtro e o CSV foram
 * corrigidos primeiro; a CÉLULA, que é o que o dono olha, ficou para trás.
 *
 * Este teste olha o texto renderizado: é a diferença entre "a função recebeu o
 * mapa" e "o nome aparece na tela".
 */
import type { ComponentProps } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/components/nexus-ui/feedback/nexus-toast", () => ({
  nexusToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/nexus-ui/forms/ConfirmacaoProvider", () => ({
  useConfirmar: () => vi.fn(),
}));
vi.mock("@/lib/api/client", () => ({
  apiClient: { post: vi.fn(), get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { GradeNotas } from "@/app/app/notas/_components/GradeNotas";
import type { NotaFiscal } from "@/lib/schemas/fiscal";

const TEXTOS = new Proxy({} as ComponentProps<typeof GradeNotas>["textos"], {
  get: (_alvo, prop) => String(prop),
});

const AVULSA = {
  id: "nota-avulsa-4677",
  order_id: null,
  serie: "1",
  numero: 4677,
  chave_acesso: null,
  protocolo: null,
  sefaz_cstat: "100",
  sefaz_xmotivo: "Autorizado o uso da NF-e",
  status: "autorizada",
  provedor: "sidepfe",
  erro: null,
  total_cents: 21600,
  extras_fiscais: {
    avulsa: {
      cliente_nome: "SERVICO NACIONAL DE APRENDIZAGEM INDUSTRIAL",
      cliente_documento: "03774688001550",
      frete_cents: 0,
      itens: [],
    },
  },
  created_at: "2026-11-25T13:00:00.000Z",
} as unknown as NotaFiscal;

afterEach(cleanup);

describe("grade de notas — venda avulsa", () => {
  it("mostra o cliente na coluna Pessoa (não '—')", () => {
    render(
      <GradeNotas
        inicial={[AVULSA]}
        totalNotas={1}
        pessoas={{}}
        pessoasAvulsas={{ "nota-avulsa-4677": "SERVICO NACIONAL DE APRENDIZAGEM INDUSTRIAL" }}
        operacaoPadrao=""
        ambientePadrao="producao"
        podeEmitir
        textos={TEXTOS}
      />,
    );

    expect(screen.getByText("SERVICO NACIONAL DE APRENDIZAGEM INDUSTRIAL")).toBeTruthy();
  });

  it("sem o mapa, cai em '—' em vez de inventar nome", () => {
    render(
      <GradeNotas
        inicial={[AVULSA]}
        totalNotas={1}
        pessoas={{}}
        operacaoPadrao=""
        ambientePadrao="producao"
        podeEmitir
        textos={TEXTOS}
      />,
    );

    // "—" aparece em outras células vazias da grade; o que importa é NÃO
    // inventar nome de cliente.
    expect(screen.queryByText("SERVICO NACIONAL DE APRENDIZAGEM INDUSTRIAL")).toBeNull();
  });
});
