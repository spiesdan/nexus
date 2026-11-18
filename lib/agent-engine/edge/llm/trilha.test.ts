import { describe, expect, it } from "vitest";

import {
  ferramentasDoTurno,
  fontesDoTurno,
  metaDasMensagens,
  metaDasMensagensJson,
  trilhaDoTurno,
} from "./trilha";

/**
 * A trilha do turno (0312) — estrutura e hash, NUNCA conteúdo.
 *
 * O invariante do repo é explícito: conteúdo de mensagem é PII e não entra em
 * `llm_calls` (`tests/unit/llm-calls-registra-falha.test.ts`). A trilha existe
 * para responder "por que o agente respondeu isso?" sem copiar a conversa — o
 * texto segue em `messages`, e o hash é o que correlaciona.
 */
describe("trilha do turno", () => {
  it("meta das mensagens NÃO carrega conteúdo — só total, papéis e tamanho", () => {
    const meta = metaDasMensagens([
      { role: "assistant", content: "Olá!" },
      { role: "user", content: "meu CPF é 123.456.789-00" },
    ]);
    expect(meta).not.toBeNull();
    const json = JSON.stringify(meta);
    expect(json).not.toContain("123.456.789-00");
    expect(json).not.toContain("CPF");
    expect(json).not.toContain("Olá");
    expect(meta).toMatchObject({
      total: 2,
      papeis: [
        { role: "assistant", chars: 4 },
        { role: "user", chars: "meu CPF é 123.456.789-00".length },
      ],
    });
    expect(meta!.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("o hash do contexto muda quando o conteúdo muda (é verificável)", () => {
    const a = metaDasMensagens([{ role: "user", content: "oi" }])!;
    const b = metaDasMensagens([{ role: "user", content: "oi " }])!;
    expect(a.sha256).not.toBe(b.sha256);
  });

  it("mensagens vazias viram null (não afirma contexto que não houve)", () => {
    expect(metaDasMensagens([])).toBeNull();
    expect(metaDasMensagens(undefined)).toBeNull();
    expect(metaDasMensagensJson([])).toBeNull();
  });

  it("ferramentas: nome + hash do input/output + tamanho, sem o trecho", () => {
    const ferramentas = ferramentasDoTurno([
      {
        toolCalls: [{ toolName: "buscar_conhecimento", input: { q: "prazo de entrega" } }],
        toolResults: [{ toolName: "buscar_conhecimento", output: { trechos: ["3 dias úteis"] } }],
      },
    ]);
    expect(ferramentas).toHaveLength(1);
    expect(ferramentas[0]!.tool).toBe("buscar_conhecimento");
    expect(ferramentas[0]!.input_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(ferramentas[0]!.output_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(ferramentas[0]!.output_chars).toBeGreaterThan(0);
    const json = JSON.stringify(ferramentas);
    expect(json).not.toContain("prazo de entrega");
    expect(json).not.toContain("3 dias úteis");
  });

  it("resultado sem chamada correspondente não some", () => {
    const ferramentas = ferramentasDoTurno([{ toolResults: [{ toolName: "crm", output: "lead 42" }] }]);
    expect(ferramentas).toHaveLength(1);
    expect(ferramentas[0]!.tool).toBe("crm");
    expect(ferramentas[0]!.output_chars).toBe(7);
  });

  it("fontes: só total e host, sem título nem caminho", () => {
    const fontes = fontesDoTurno([
      { sources: [{ title: "Manual", url: "https://exemplo.test/segredo/123" }] },
      { sources: [{ title: "Outro", url: "https://exemplo.test/x" }] },
    ]);
    expect(fontes).toEqual({ total: 2, hosts: ["exemplo.test"] });
    const json = JSON.stringify(fontes);
    expect(json).not.toContain("segredo");
    expect(json).not.toContain("Manual");
  });

  it("ausência de ferramenta/fonte vira null", () => {
    expect(ferramentasDoTurno([])).toEqual([]);
    expect(fontesDoTurno([])).toBeNull();
  });

  it("trilha completa: saída vazia vira null, e nada de texto na saída", () => {
    const t = trilhaDoTurno({
      system: "Você é o atendente.",
      messages: [{ role: "user", content: "meu CPF é 123.456.789-00" }],
      saida: "   ",
      steps: [],
    });
    expect(t.output_text_hash).toBeNull();
    expect(t.output_chars).toBeNull();
    expect(t.prompt_system_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(t.prompt_messages_meta).not.toBeNull();
    const json = JSON.stringify(t);
    expect(json).not.toContain("123.456.789-00");
    expect(json).not.toContain("atendente");
  });

  it("saída com texto vira hash + tamanho, nunca o texto", () => {
    const t = trilhaDoTurno({
      system: "s",
      messages: [{ role: "user", content: "oi" }],
      saida: "  Olá, tudo bem?  ",
      steps: [],
    });
    expect(t.output_text_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(t.output_chars).toBe("Olá, tudo bem?".length);
    expect(JSON.stringify(t)).not.toContain("Olá");
  });
});
