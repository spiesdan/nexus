/**
 * O LABORATÓRIO EM TESTE — personas, simulação e juiz sem rede e sem banco.
 *
 * ─── O que estes testes travam ──────────────────────────────────────────────
 *
 * 1. Cada persona existe por um defeito (o campo `pega` não é enfeite: sem
 *    ele, daqui a 6 meses ninguém sabe por que estes 6 e não outros).
 * 2. A simulação NUNCA envia mensagem de verdade — o teste importa o módulo e
 *    procura qualquer import de envio. É estrutural, não promessa.
 * 3. O juiz extrai JSON mesmo com markdown em volta, descarta achado sem
 *    evidência e sem chave válida, e distingue nulo (não respondeu) de zero.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PERSONA_IDS, persona } from "@/lib/laboratorio/personas";
import { simularConversa } from "@/lib/laboratorio/simulacao";
import {
  extrairJson,
  formatarTranscricao,
  julgarTranscricao,
  promptDoJuiz,
} from "@/lib/laboratorio/juiz";

describe("as personas", () => {
  it("são 6, cada uma com o defeito que pega", () => {
    expect(PERSONA_IDS).toHaveLength(6);
    for (const id of PERSONA_IDS) {
      const p = persona(id);
      expect(p.nome.length, `sem nome: ${id}`).toBeGreaterThan(0);
      expect(p.pega.length, `sem defeito-alvo: ${id}`).toBeGreaterThan(10);
      expect(p.responder("olá", 0).length, `muda sem resposta: ${id}`).toBeGreaterThan(0);
    }
  });

  it("o perguntão insiste no preço (é o defeito caro)", () => {
    const p = persona("pregao_preco");
    const textos = [p.responder("oi", 0), p.responder("oi", 1), p.responder("oi", 2)];
    expect(textos.filter((t) => /preço|valor|custa/i.test(t)).length).toBeGreaterThanOrEqual(3);
  });

  it("o irritado sinaliza saída (o harness precisa ver)", () => {
    const p = persona("irritado");
    expect(p.responder("oi", 1)).toMatch(/bloquear/i);
  });

  it("o que exige humano não se contenta com a primeira resposta", () => {
    const p = persona("exige_humano");
    expect(p.responder("sou um atendente virtual", 0)).toMatch(/humano|pessoa/i);
  });
});

describe("a simulação nunca envia mensagem", () => {
  it("simulacao.ts não importa nada que envie", () => {
    // Estrutural: se alguém importar o sender aqui no futuro, este teste
    // quebra — e é para quebrar. Sandbox que manda mensagem não é sandbox.
    // Sem os comentários: import não mora em comentário, e o texto que
    // explica a proibição menciona os nomes proibidos — sem tirar, o teste
    // reprovaria por causa da própria documentação.
    const fonte = readFileSync(join(process.cwd(), "lib/laboratorio/simulacao.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "$1");
    expect(fonte).not.toMatch(/sendMessageHandler/);
    expect(fonte).not.toMatch(/ensureConversation/);
    expect(fonte).not.toMatch(/\.insert\(/);
    expect(fonte).not.toMatch(/\.update\(/);
  });

  it("roda os turnos e para quando a persona sai", async () => {
    const r = await simularConversa({
      personaId: "irritado",
      campanhaNome: "Campanha",
      campanhaPerfil: null,
      gerar: async () => ({ ok: true as const, texto: "posso ajudar?" }),
    });
    expect(r.parada).toBe("persona_saiu");
    expect(r.turnos.length).toBeGreaterThanOrEqual(3);
    expect(r.turnos[0]).toMatchObject({ de: "prospect" });
    expect(r.turnos[1]).toMatchObject({ de: "agente", texto: "posso ajudar?" });
  });

  it("para quando o agente cala, e diz isso", async () => {
    const r = await simularConversa({
      personaId: "decidido",
      campanhaNome: "Campanha",
      campanhaPerfil: null,
      gerar: async () => ({ ok: false as const, motivo: "ia_indisponivel" }),
    });
    expect(r.parada).toBe("agente_calou");
  });

  it("respeita o teto de turnos", async () => {
    const r = await simularConversa({
      personaId: "pregao_preco",
      campanhaNome: "Campanha",
      campanhaPerfil: null,
      gerar: async () => ({ ok: true as const, texto: "temos ótimas opções" }),
      maxTurnos: 2,
    });
    // abertura + 2 turnos completos (agente+prospect cada)
    expect(r.turnos).toHaveLength(5);
    expect(r.parada).toBe("turnos_esgotados");
  });
});

describe("o juiz", () => {
  function respostaApi(veredito: unknown) {
    return {
      status: 200,
      corpo: async () =>
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(veredito) } }] }),
    };
  }

  it("nota + achados com evidência", async () => {
    const v = await julgarTranscricao(
      [
        { de: "agente", texto: "custa R$ 99,90" },
        { de: "prospect", texto: "ok" },
      ],
      { url: "http://x", chave: "k", modelo: "m" },
      {
        buscar: async () =>
          respostaApi({
            nota: 40,
            resumo: "Preço inventado.",
            achados: [
              {
                chave: "preco_inventado",
                evidencia: "custa R$ 99,90",
                sugestao: "Nunca citar preço.",
              },
            ],
          }),
      },
    );
    expect(v.nota).toBe(40);
    expect(v.achados).toHaveLength(1);
    expect(v.achados[0]?.chave).toBe("preco_inventado");
  });

  it("descarta achado sem evidência e com chave inválida", async () => {
    const v = await julgarTranscricao(
      [{ de: "agente", texto: "oi" }],
      { url: "http://x", chave: "k", modelo: "m" },
      {
        buscar: async () =>
          respostaApi({
            nota: 90,
            resumo: "Ok.",
            achados: [
              { chave: "tom", evidencia: "", sugestao: "x" },
              { chave: "qualquer_coisa", evidencia: "oi", sugestao: "x" },
              { chave: "tom", evidencia: "texto grosseiro aqui", sugestao: "x" },
            ],
          }),
      },
    );
    expect(v.achados).toHaveLength(1);
  });

  it("tira o JSON de dentro do markdown", async () => {
    const v = await julgarTranscricao(
      [{ de: "agente", texto: "oi" }],
      { url: "http://x", chave: "k", modelo: "m" },
      {
        buscar: async () => ({
          status: 200,
          corpo: async () =>
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: 'Claro! ```json\n{"nota": 80, "resumo": "Boa.", "achados": []}\n```',
                  },
                },
              ],
            }),
        }),
      },
    );
    expect(v.nota).toBe(80);
  });

  it("HTTP do juiz vira nulo, não zero", async () => {
    const v = await julgarTranscricao(
      [{ de: "agente", texto: "oi" }],
      { url: "http://x", chave: "k", modelo: "m" },
      { buscar: async () => ({ status: 429, corpo: async () => "limite" }) },
    );
    expect(v.nota).toBeNull();
    expect(v.resumo).toMatch(/429/);
  });

  it("timeout vira nulo com motivo", async () => {
    const v = await julgarTranscricao(
      [{ de: "agente", texto: "oi" }],
      { url: "http://x", chave: "k", modelo: "m" },
      {
        buscar: async () => {
          throw new Error("fetch failed");
        },
      },
      10,
    );
    expect(v.nota).toBeNull();
  });

  it("nota é presa em 0-100", async () => {
    const v = await julgarTranscricao(
      [{ de: "agente", texto: "oi" }],
      { url: "http://x", chave: "k", modelo: "m" },
      { buscar: async () => respostaApi({ nota: 250, resumo: "x", achados: [] }) },
    );
    expect(v.nota).toBe(100);
  });

  it("o prompt nomeia as regras que importam", () => {
    const p = promptDoJuiz("AGENTE: oi");
    expect(p).toMatch(/preco_inventado/);
    expect(p).toMatch(/JSON/);
  });

  it("o formato da transcrição marca quem fala", () => {
    expect(
      formatarTranscricao([
        { de: "agente", texto: "oi" },
        { de: "prospect", texto: "opa" },
      ]),
    ).toBe("AGENTE: oi\nPROSPECT: opa");
  });

  it("extrairJson: direto, bloco e nada", () => {
    expect(extrairJson('{"a":1}')).toEqual({ a: 1 });
    expect(extrairJson('texto ```json\n{"a":2}\n``` fim')).toEqual({ a: 2 });
    expect(extrairJson("sem json aqui")).toBeNull();
  });
});
