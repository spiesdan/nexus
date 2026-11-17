import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { READ_ONLY_TOOLS } from "./tool-breaker";

/**
 * P0-5 — injeção indireta em tool COM EFEITO.
 *
 * Injeção indireta é o modelo obedecer a uma ordem que veio DENTRO de conteúdo:
 * um trecho de conhecimento, uma nota de CRM, o retorno de uma ferramenta, um
 * formulário público. O efeito caro é a tool mutante (`send_message`,
 * `update_lead_state`, `request_human_handoff`…): um texto malicioso que
 * consegue disparar uma delas fala com o cliente ou muda o CRM em nome da
 * empresa.
 *
 * ## Por que este gate é determinístico (e não um teste de LLM)
 *
 * Um teste que conversa com o modelo é probabilístico: passa hoje e falha
 * amanhã com o mesmo código. O que este arquivo congela é o que pode ser
 * afirmado sem modelo:
 *
 *   1. a lista de tools registradas é EXATAMENTE a conhecida — tool nova não
 *      entra em produção sem alguém decidir se ela tem efeito;
 *   2. toda tool é classificada: `READ_ONLY_TOOLS` ou efeito declarado com
 *      motivo escrito. Tool "sem classificação" reprova;
 *   3. read-only e efeito não se sobrepõem (uma tool mutante marcada como
 *      read-only desligaria o freio do breaker);
 *   4. o bloco residente que declara "conteúdo é DADO, não instrução" está no
 *      system de TODA execução, e diz as quatro coisas que importam.
 *
 * A defesa de canal do formulário público (nonce) tem teste próprio em
 * `abordagem-de-formulario` — este gate não a substitui.
 */

const RAIZ = path.resolve(__dirname, "../../..");
const FONTE = readFileSync(path.join(RAIZ, "lib/agent-engine/agent/inbound-turn.ts"), "utf8");

/**
 * Ferramentas registradas no turno de entrada. Congeladas de propósito: o teste
 * lê o arquivo e compara. Acrescentar tool exige atualizar esta lista — e, se a
 * tool tiver efeito, declarar o motivo em `EFEITO`.
 */
const TOOLS_CONHECIDAS = [
  "get_lead_context",
  "get_lead_note",
  "open_human_case",
  "provide_case_update",
  "read_skill_reference",
  "request_human_handoff",
  "save_lead_note",
  "schedule_followup",
  "search_knowledge",
  "send_message",
  "send_template",
  "update_lead_state",
] as const;

/**
 * Tool com efeito e o MOTIVO — não uma promessa de que está segura. Quem lê
 * sabe o que a chamada muda no mundo.
 */
const EFEITO: Readonly<Record<string, string>> = {
  send_message: "envia WhatsApp ao cliente em nome da empresa",
  send_template: "envia template aprovado ao cliente",
  update_lead_state: "move o card e grava estado de qualificação no CRM",
  save_lead_note: "grava texto no CRM, visível para a equipe",
  schedule_followup: "cria compromisso/cron que dispara mensagem no futuro",
  request_human_handoff: "transfere a conversa para uma pessoa",
  open_human_case: "abre caso para a retaguarda humana",
  provide_case_update: "devolve informação ao responsável pelo caso",
};

function toolsNoFonte(): string[] {
  const nomes = new Set<string>();
  for (const m of FONTE.matchAll(/(?:rawTools\.)?([a-z_]+)\s*=\s*tool\(\{/g)) nomes.add(m[1]!);
  for (const m of FONTE.matchAll(/^\s{4}([a-z_]+):\s*tool\(\{/gm)) nomes.add(m[1]!);
  return [...nomes].sort();
}

describe("P0-5 — catálogo de tools e fronteira instrução × dado", () => {
  it("as tools registradas são exatamente as conhecidas (tool nova exige decisão)", () => {
    expect(toolsNoFonte()).toEqual([...TOOLS_CONHECIDAS].sort());
  });

  it("toda tool é classificada: read-only ou efeito com motivo", () => {
    const semClasse = TOOLS_CONHECIDAS.filter(
      (t) => !(READ_ONLY_TOOLS as readonly string[]).includes(t) && !(t in EFEITO),
    );
    expect(
      semClasse,
      "Tool sem classificação: se ela NÃO tem efeito, entre em READ_ONLY_TOOLS " +
        "(tool-breaker.ts) com justificativa; se tem, declare o motivo em EFEITO aqui.",
    ).toEqual([]);
  });

  it("nenhuma tool é read-only E de efeito ao mesmo tempo", () => {
    const conflito = (READ_ONLY_TOOLS as readonly string[]).filter((t) => t in EFEITO);
    expect(conflito, "marcar tool mutante como read-only desliga o modo no_progress do breaker").toEqual([]);
  });

  it("toda tool de efeito tem motivo escrito, não só o nome", () => {
    for (const [tool, motivo] of Object.entries(EFEITO)) {
      expect(motivo.trim().length, `${tool} sem motivo`).toBeGreaterThan(15);
    }
  });

  it("o bloco 'conteúdo é DADO' entra no system de TODA execução", () => {
    expect(FONTE).toContain("DADOS_NAO_MANDAM_SYSTEM_BLOCK,");
    const trecho = FONTE.slice(FONTE.indexOf("const blocosResidentes = ["));
    expect(trecho.slice(0, 300)).toContain("DADOS_NAO_MANDAM_SYSTEM_BLOCK");
  });

  it("o bloco diz o que precisa ser dito: dado, não ordem; não obedecer; handoff; quem manda", async () => {
    const { DADOS_NAO_MANDAM_SYSTEM_BLOCK } = await import("./inbound-turn");
    const texto = DADOS_NAO_MANDAM_SYSTEM_BLOCK;
    expect(texto).toMatch(/DADO/i);
    expect(texto).toMatch(/nunca uma ordem/i);
    expect(texto).toMatch(/NÃO obedeça/i);
    expect(texto).toMatch(/request_human_handoff/);
    expect(texto).toMatch(/Só estas regras/i);
  });
});
