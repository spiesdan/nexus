import { describe, expect, it } from "vitest";

import {
  ferramentasDoTurno,
  fontesDoTurno,
  mensagensDoTurno,
  recortar,
  systemDoTurno,
  trilhaDoTurno,
} from "./trilha";

/**
 * A trilha do turno (P0, 0312). Antes dela, `llm_calls` guardava custo e erro
 * e nada do conteúdo — "por que o agente respondeu isso?" não tinha resposta.
 *
 * O que se mede aqui é o contrato do registro: contexto que o modelo VIU (não
 * só a entrada), saída, ferramentas e fontes — com recorte VISÍVEL e sem
 * inventar vazio onde não houve resposta.
 */
describe("trilha do turno", () => {
  it("recorta com marca visível em vez de cortar em silêncio", () => {
    const curto = recortar("abc", 10);
    expect(curto).toBe("abc");

    const longo = recortar("x".repeat(50), 10);
    expect(longo).toBe(`${"x".repeat(10)}…`);
  });

  it("serializa objeto e não lança com ciclo", () => {
    expect(recortar({ a: 1 })).toBe('{"a":1}');

    const ciclo: Record<string, unknown> = {};
    ciclo.self = ciclo;
    expect(() => recortar(ciclo)).not.toThrow();
    expect(recortar(ciclo).length).toBeGreaterThan(0);
  });

  it("system: null quando ausente; string preservada", () => {
    expect(systemDoTurno(undefined)).toBeNull();
    expect(systemDoTurno("Você é o atendente.")).toBe("Você é o atendente.");
  });

  it("mensagens: é o CONTEXTO (histórico + entrada), não só a entrada", () => {
    const json = mensagensDoTurno([
      { role: "assistant", content: "Olá!" },
      { role: "user", content: "Quero 2 caixas" },
    ]);
    expect(json).not.toBeNull();
    const lido = JSON.parse(json!) as Array<{ role: string; content: string }>;
    expect(lido).toHaveLength(2);
    expect(lido[0]).toEqual({ role: "assistant", content: "Olá!" });
    expect(lido[1]).toEqual({ role: "user", content: "Quero 2 caixas" });
  });

  it("mensagens: vazio vira null (não afirma contexto que não houve)", () => {
    expect(mensagensDoTurno([])).toBeNull();
    expect(mensagensDoTurno(undefined)).toBeNull();
  });

  it("ferramentas: nome, entrada e resultado — a trilha da fonte consultada", () => {
    const json = ferramentasDoTurno([
      {
        toolCalls: [{ toolName: "buscar_conhecimento", input: { q: "prazo de entrega" } }],
        toolResults: [{ toolName: "buscar_conhecimento", output: { trechos: ["3 dias úteis"] } }],
      },
    ]);
    const lido = JSON.parse(json!) as Array<{ tool: string; input: string; output?: string }>;
    expect(lido).toHaveLength(1);
    expect(lido[0]!.tool).toBe("buscar_conhecimento");
    expect(lido[0]!.input).toContain("prazo de entrega");
    expect(lido[0]!.output).toContain("3 dias úteis");
  });

  it("ferramentas: resultado sem chamada correspondente não some", () => {
    const lido = JSON.parse(
      ferramentasDoTurno([{ toolResults: [{ toolName: "crm", output: "lead 42" }] }])!,
    ) as Array<{ tool: string; output?: string }>;
    expect(lido).toHaveLength(1);
    expect(lido[0]!.tool).toBe("crm");
    expect(lido[0]!.output).toContain("lead 42");
  });

  it("ferramentas e fontes: ausência vira null", () => {
    expect(ferramentasDoTurno([])).toBeNull();
    expect(ferramentasDoTurno([{}])).toBeNull();
    expect(fontesDoTurno([])).toBeNull();
  });

  it("fontes citadas pelo provedor entram", () => {
    const lido = JSON.parse(
      fontesDoTurno([{ sources: [{ title: "Manual", url: "https://exemplo.test" }] }])!,
    ) as Array<{ title: string }>;
    expect(lido[0]!.title).toBe("Manual");
  });

  it("trilha completa: saída vazia vira null, não string vazia", () => {
    const t = trilhaDoTurno({
      system: "sistema",
      messages: [{ role: "user", content: "oi" }],
      saida: "   ",
      steps: [],
    });
    expect(t.output_text).toBeNull();
    expect(t.prompt_system).toBe("sistema");
    expect(t.prompt_messages).toContain("oi");
    expect(t.tool_calls).toBeNull();
    expect(t.sources).toBeNull();
  });
});
