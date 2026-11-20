import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));

import { AvisoMotorIndisponivel } from "@/components/observabilidade/AvisoMotorIndisponivel";
import type { SaudeDoMotor } from "@/lib/laya/saude";

afterEach(cleanup);

function saude(over: Partial<SaudeDoMotor> = {}): SaudeDoMotor {
  return {
    estado: "indisponivel",
    ultima_falha: "2026-11-20T10:00:00.000Z",
    detalhe: "fetch failed",
    falhas: 17,
    ...over,
  };
}

/**
 * A REGRA DE HONESTIDADE DA TELA: motor fora não pode parecer "nada a sugerir".
 * O aviso aparece SÓ com incidente aberto; disponível e sem registro são mudos.
 */
describe("AvisoMotorIndisponivel", () => {
  it("indisponível → diz que o motor não respondeu e o que revisar", () => {
    render(<AvisoMotorIndisponivel saude={saude()} contexto="radar" />);

    const aviso = screen.getByTestId("aviso-motor-indisponivel");
    expect(aviso.textContent).toContain("motor de decisão não respondeu");
    expect(aviso.textContent).toContain("LAYA_URL");
    expect(aviso.textContent).toContain("fetch failed");
    expect(aviso.textContent).toContain("Última falha");
  });

  it("prospecção fala da triagem, não da ação do radar", () => {
    render(<AvisoMotorIndisponivel saude={saude()} contexto="prospeccao" />);
    expect(screen.getByTestId("aviso-motor-indisponivel").textContent).toContain(
      "triagem automática",
    );
  });

  it("disponível → nenhum aviso", () => {
    const { container } = render(
      <AvisoMotorIndisponivel saude={saude({ estado: "ok" })} contexto="radar" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("sem histórico → nenhum alarme inventado", () => {
    const { container } = render(
      <AvisoMotorIndisponivel
        saude={saude({ estado: "sem_registro", ultima_falha: null, detalhe: null, falhas: null })}
        contexto="radar"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
