import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { CrmSalesChart, type CrmSalesPoint } from "@/components/nexus-ui/crm/crm-sales-chart";

/**
 * O "Evolução de Vendas" ganhou duas alavancas novas, e este teste prende a
 * promessa de cada uma:
 *
 * 1. O SELETOR DE MÊS navega por `?mes=AAAA-MM` no servidor (nada de estado
 *    local fingindo que trocou), preserva os outros parâmetros (o `vendedor`
 *    dos Indicadores morreria num `router.push` ingênuo), trava o futuro no
 *    mês corrente e apaga o parâmetro quando volta para o corrente (URL limpa).
 * 2. O TOOLTIP só existe no hover e conta o DIA, não a série: o delta do
 *    acumulado é o que a pessoa quer ("quanto entrou dia 2?"), não o total.
 */

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/app",
  useSearchParams: () => new URLSearchParams("vendedor=abc"),
}));

const PONTOS: CrmSalesPoint[] = [
  { dia: 1, vendidoAc: 10000, metaAc: 5000, projecao: null },
  { dia: 2, vendidoAc: 25000, metaAc: 10000, projecao: null },
];

function renderizar(sobrescrever: Partial<Parameters<typeof CrmSalesChart>[0]> = {}) {
  return render(
    <CrmSalesChart
      pontos={PONTOS}
      metaAc={0}
      projecao={0}
      previsaoMes={0}
      mes="2026-09"
      diaHoje={2}
      vendidoMes={25000}
      vendidoHoje={15000}
      objetivo={50000}
      pctObjetivo={50}
      necessarioDia={10000}
      diasUteisRestantes={5}
      mesAtual="2026-09"
      {...sobrescrever}
    />,
  );
}

describe("o seletor de mês", () => {
  afterEach(() => {
    cleanup();
    push.mockClear();
  });

  it("mês anterior empurra ?mes= sem derrubar os outros parâmetros", () => {
    renderizar();
    fireEvent.click(screen.getByLabelText("Mês anterior"));
    expect(push).toHaveBeenCalledWith("/app?vendedor=abc&mes=2026-08");
  });

  it("próximo fica travado enquanto o mês exibido é o corrente", () => {
    renderizar({ mes: "2026-09", mesAtual: "2026-09" });
    expect(screen.getByLabelText("Próximo mês")).toBeDisabled();
  });

  it("voltar para o mês corrente apaga o parâmetro — a URL fica limpa", () => {
    renderizar({ mes: "2026-08", mesAtual: "2026-09" });
    expect(screen.getByLabelText("Próximo mês")).toBeEnabled();
    fireEvent.click(screen.getByLabelText("Próximo mês"));
    expect(push).toHaveBeenCalledWith("/app?vendedor=abc");
  });

  it("mostra o mês exibido no próprio seletor", () => {
    renderizar();
    expect(screen.getByTestId("mes-exibido").textContent).toContain("2026");
  });
});

describe("o tooltip do dia", () => {
  afterEach(() => cleanup());

  it("no hover, mostra o realizado DO dia e o acumulado — não a série inteira", () => {
    const { container } = renderizar();
    const alvo = container.querySelector('rect[data-dia="2"]');
    expect(alvo).not.toBeNull();
    fireEvent.mouseOver(alvo as Element);

    const tooltip = screen.getByTestId("tooltip-dia");
    // 25000 - 10000 = 15000 cents → R$ 150 no dia; acumulado R$ 250.
    expect(tooltip).toHaveTextContent("R$ 150");
    expect(tooltip).toHaveTextContent("R$ 250");
    // Meta do dia: 10000 - 5000 → R$ 50.
    expect(tooltip).toHaveTextContent("R$ 50");
  });

  it("some quando o cursor sai do gráfico", () => {
    const { container } = renderizar();
    fireEvent.mouseOver(container.querySelector('rect[data-dia="1"]') as Element);
    expect(screen.getByTestId("tooltip-dia")).toBeTruthy();
    fireEvent.mouseLeave(screen.getByTestId("svg-vendas"));
    expect(screen.queryByTestId("tooltip-dia")).toBeNull();
  });

  it("num mês fechado não promete projeção nem a linha de hoje", () => {
    // ehMesAtual=false: todos os dias são passados, então "No dia" aparece em
    // todos e a linha "Hoje R$" do painel some (mês passado não tem hoje).
    const { container } = renderizar({ ehMesAtual: false, mes: "2026-08" });
    fireEvent.mouseOver(container.querySelector('rect[data-dia="1"]') as Element);
    expect(screen.getByTestId("tooltip-dia")).toHaveTextContent("No dia");
    expect(screen.queryByText(/Hoje R\$/)).toBeNull();
  });
});
