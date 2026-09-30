import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { CrmSalesChart, type CrmSalesPoint } from "@/components/nexus-ui/crm/crm-sales-chart";

/**
 * O "Evolução de Vendas" ganhou três alavancas, e este teste prende a
 * promessa de cada uma:
 *
 * 1. O SELETOR DE MÊS navega por `?mes=AAAA-MM` no servidor (nada de estado
 *    local fingindo que trocou), preserva os outros parâmetros (o `vendedor`
 *    dos Indicadores morreria num `router.push` ingênuo), trava o futuro no
 *    mês corrente e apaga o parâmetro quando volta para o corrente (URL limpa).
 * 2. O TOOLTIP só existe no hover e conta o DIA, não a série: o delta do
 *    acumulado é o que a pessoa quer ("quanto entrou dia 2?"), não o total.
 * 3. A LEGENDA é botão: cada item liga e desliga a própria série (inclusive
 *    a linha do tooltip), "Mês passado" acende o COMPARAR quando ele está
 *    desligado, e item sem dado nenhum fica desabilitado — com o motivo no
 *    `title`, porque desabilitado mudo é beco sem saída.
 * 4. O KPI "Projeção" nunca mostra R$ 0 por falta de dado: quando não há
 *    ritmo nenhum (mês que ainda não começou) ele cai para a previsão do mês,
 *    que é a própria projeção quando ela existe. E a linha de ritmo é do mês
 *    INTEIRO — existe nos dias passados, atravessa o último dia e sobrevive
 *    a mês fechado (a realizada não é truncada no dia de número igual a hoje).
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

describe("a linha de ritmo (projeção)", () => {
  afterEach(cleanup);

  const COM_RITMO: CrmSalesPoint[] = [
    { dia: 1, vendidoAc: 10000, metaAc: 5000, projecao: 8000 },
    { dia: 2, vendidoAc: 25000, metaAc: 10000, projecao: 16000 },
  ];

  it("atravessa o mês inteiro — existe do dia 1 ao último, inclusive no dia de hoje", () => {
    const { container } = renderizar({ pontos: COM_RITMO });
    const serie = container.querySelector('g[data-serie="projecao"]');
    expect(serie).not.toBeNull();
    const pontos = serie?.querySelector("polyline")?.getAttribute("points") ?? "";
    expect(pontos.split(" ").filter(Boolean)).toHaveLength(2);
  });

  it("mostra a projeção do dia também nos dias passados — o ritmo não é só futuro", () => {
    const { container } = renderizar({ pontos: COM_RITMO });
    // dia 1 é passado (diaHoje=2): o tooltip conta as DUAS verdades do dia.
    fireEvent.mouseOver(container.querySelector('rect[data-dia="1"]') as Element);
    const tooltip = screen.getByTestId("tooltip-dia");
    expect(tooltip).toHaveTextContent("No dia");
    expect(tooltip).toHaveTextContent("Projeção do dia");
    // Delta do dia 1 = 8000 (não há dia anterior) → R$ 80.
    expect(tooltip).toHaveTextContent("R$ 80");
  });

  it("mês fechado desenha a realizada INTEIRA — o dia 3 não some por ter número maior que hoje", () => {
    const { container } = renderizar({
      ehMesAtual: false,
      mes: "2026-08",
      pontos: [
        { dia: 1, vendidoAc: 10000, metaAc: 5000, projecao: null },
        { dia: 2, vendidoAc: 25000, metaAc: 10000, projecao: null },
        { dia: 3, vendidoAc: 40000, metaAc: 15000, projecao: null },
      ],
    });
    const linha = container.querySelector('g[data-serie="vendido"] polyline');
    expect((linha?.getAttribute("points") ?? "").split(" ").filter(Boolean)).toHaveLength(3);

    fireEvent.mouseOver(container.querySelector('rect[data-dia="3"]') as Element);
    expect(screen.getByTestId("tooltip-dia")).toHaveTextContent("No dia");
    expect(screen.queryByText(/Hoje R\$/)).toBeNull();
  });
});

describe("a legenda", () => {
  afterEach(() => cleanup());

  it("'Vendas no mês' esconde a série realizada e volta a mostrar", () => {
    const { container } = renderizar();
    expect(container.querySelector('g[data-serie="vendido"]')).not.toBeNull();

    const botao = screen.getByRole("button", { name: "Vendas no mês" });
    expect(botao).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(botao);
    expect(container.querySelector('g[data-serie="vendido"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Vendas no mês" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Vendas no mês" }));
    expect(container.querySelector('g[data-serie="vendido"]')).not.toBeNull();
  });

  it("'Objetivo' fica desabilitado quando não há meta nos dados", () => {
    renderizar({
      pontos: [
        { dia: 1, vendidoAc: 10000, metaAc: null, projecao: null },
        { dia: 2, vendidoAc: 25000, metaAc: null, projecao: null },
      ],
    });
    expect(screen.getByRole("button", { name: "Objetivo" })).toBeDisabled();
  });

  it("'Mês passado' com a comparação desligada acende o COMPARAR", () => {
    const onToggle = vi.fn();
    renderizar({
      pontos: PONTOS.map((p) => ({ ...p, mesAnt: p.vendidoAc + 5000 })),
      comparar: { ativo: false, onToggle },
    });
    const botao = screen.getByRole("button", { name: "Mês passado" });
    expect(botao).not.toBeDisabled();
    fireEvent.click(botao);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("com a comparação ligada, cada item some só a própria linha", () => {
    const { container } = renderizar({
      pontos: PONTOS.map((p) => ({ ...p, mesAnt: p.vendidoAc + 5000, mesAno: p.vendidoAc + 9000 })),
      comparar: { ativo: true, onToggle: vi.fn() },
    });
    expect(container.querySelector('g[data-serie="mesAnt"]')).not.toBeNull();
    expect(container.querySelector('g[data-serie="mesAno"]')).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mês passado" }));
    expect(container.querySelector('g[data-serie="mesAnt"]')).toBeNull();
    expect(container.querySelector('g[data-serie="mesAno"]')).not.toBeNull();
  });

  it("esconder a série tira a linha dela do tooltip", () => {
    const { container } = renderizar();
    fireEvent.mouseOver(container.querySelector('rect[data-dia="2"]') as Element);
    expect(screen.getByTestId("tooltip-dia")).toHaveTextContent("Acumulado");

    fireEvent.click(screen.getByRole("button", { name: "Vendas no mês" }));
    const tooltip = screen.getByTestId("tooltip-dia");
    expect(tooltip).not.toHaveTextContent("Acumulado");
    // A meta continua visível — o clique mexeu só na série clicada.
    expect(tooltip).toHaveTextContent("Meta do dia");
  });

  it("'Previsão de vendas' sem dado de projeção fica desabilitada e explica o porquê", () => {
    renderizar();
    const botao = screen.getByRole("button", { name: "Previsão de vendas" });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute("title", "Sem previsão para este mês");
  });

  it("'Previsão de vendas' com dado na série é acionável e não ganha aviso", () => {
    renderizar({ pontos: PONTOS.map((p) => ({ ...p, projecao: 30000 })) });
    const botao = screen.getByRole("button", { name: "Previsão de vendas" });
    expect(botao).not.toBeDisabled();
    expect(botao).not.toHaveAttribute("title");
  });
});

describe("o card Projeção", () => {
  afterEach(cleanup);

  it("sem ritmo na série, mostra a previsão do mês — nunca R$ 0", () => {
    renderizar({ projecao: null, previsaoMes: 123456 });
    const card = screen.getByText("Projeção").closest(".rounded-xl") as Element;
    expect(card).toHaveTextContent("R$ 1.235");
  });

  it("com projeção na série, mostra o valor dela — não o da previsão", () => {
    renderizar({ projecao: 999999, previsaoMes: 111111 });
    const projecao = screen.getByText("Projeção").closest(".rounded-xl") as Element;
    expect(projecao).toHaveTextContent("R$ 10.000");
    const previsao = screen.getByText("Previsão").closest(".rounded-xl") as Element;
    expect(previsao).toHaveTextContent("R$ 1.111");
  });
});
