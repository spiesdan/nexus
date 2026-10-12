/**
 * POST /api/v1/products/ncm-completar — o lote com piso alto e margem.
 *
 * ─── O que estes testes travam ──────────────────────────────────────────────
 *
 * 1. Confiança alta E sem ambiguidade grava; o resto volta para revisar.
 * 2. Empate no topo não grava — dúvida vai para humano, não para a nota.
 * 3. Sem IBPT, 422 com instrução (não zero silencioso).
 * 4. Uma auditoria para o lote, não 600.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

import { audit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

const ORG = "11111111-1111-4111-8111-111111111111";

function sessao(papel: Role = "manager") {
  const user = { id: "admin-1" } as AuthUser;
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      : { ok: false, response: fail("forbidden_role", "x", 403, {}) },
  );
}

function req() {
  return new NextRequest("http://x/api/v1/products/ncm-completar", { method: "POST" });
}

// Seis linhas de propósito (ver sugerir-ncm.test.ts): o filtro de palavras
// comuns precisa de volume — com 2 linhas, a estatística não morde.
const IBPT = [
  {
    codigo: "28289011",
    ex: "",
    descricao: "Águas sanitárias (água sanitária, cloro)",
    vigencia_inicio: "2020-01-01",
    vigencia_fim: null,
  },
  {
    codigo: "22071010",
    ex: "",
    descricao:
      "Álcool etílico não desnaturado, com teor alcoólico em volume igual ou superior a 80%",
    vigencia_inicio: "2020-01-01",
    vigencia_fim: null,
  },
  {
    codigo: "34011190",
    ex: "",
    descricao: "Sabões para lavagem não industriais",
    vigencia_inicio: "2020-01-01",
    vigencia_fim: null,
  },
  {
    codigo: "38089419",
    ex: "",
    descricao: "Desinfetantes de uso geral não diluídos",
    vigencia_inicio: "2020-01-01",
    vigencia_fim: null,
  },
  {
    codigo: "34022000",
    ex: "",
    descricao: "Detergentes não tóxicos para louça",
    vigencia_inicio: "2020-01-01",
    vigencia_fim: null,
  },
  {
    codigo: "96039000",
    ex: "",
    descricao: "Vassouras e escovas",
    vigencia_inicio: "2020-01-01",
    vigencia_fim: null,
  },
];

function banco(ibpt: Record<string, unknown>[], produtos: Record<string, unknown>[]) {
  const gravados: { id: string; patch: Record<string, unknown> }[] = [];
  const cadeiaIbpt = {
    select: () => cadeiaIbpt,
    eq: () => cadeiaIbpt,
    lte: () => Promise.resolve({ data: ibpt, error: null }),
  };
  const cadeiaProd = (op: string) => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.or = () => c;
    c.order = () => c;
    c.limit = () =>
      op === "list"
        ? Promise.resolve({ data: produtos, error: null })
        : Promise.resolve({ data: null, error: null });
    c.update = (patch: Record<string, unknown>) => ({
      eq: () => ({
        eq: async () => {
          gravados.push({ id: "?", patch });
          return { error: null };
        },
      }),
    });
    return c;
  };
  let listados = 0;
  const cliente = {
    from: (t: string) =>
      t === "fiscal_ibpt" ? cadeiaIbpt : cadeiaProd(listados++ === 0 ? "list" : "x"),
  };
  return { cliente: cliente as never, gravados };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao("manager");
});

/**
 * Resposta da IA derivada do PRÓPRIO prompt recebido.
 *
 * Não crava um NCM no stub: o empate de 0.9 entre "Aguas sanitarias" e "Aguas
 * sanitarias concentradas" tem ordem própria (medido em 11/10/2026: o da
 * concentração vai na frente), e um NCM fixo no teste passaria a descrever a
 * ordem do desempate em vez do que quer provar. Aqui o stub responde sobre os
 * candidatos que a regra ofereceu — `nEscolhido(0)` = concordar com o primeiro
 * (o que a regra sugeriu), `nEscolhido(1)` = discordar dele.
 */
function iaQueEscolhe(nEscolhido: number, confianca: number) {
  return vi.fn(async (_url: string, init: { body: string }) => {
    const prompt = JSON.parse(init.body) as {
      contents: { parts: { text: string }[] }[];
    };
    const codigos = [...prompt.contents[0]!.parts[0]!.text.matchAll(/NCM (\d{8})/g)].map(
      (m) => m[1]!,
    );
    const escolhido = codigos[nEscolhido];
    return {
      status: 200,
      text: async () =>
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      ncm: escolhido ?? null,
                      confianca,
                      motivo: "resposta do stub",
                    }),
                  },
                ],
              },
            },
          ],
        }),
    };
  });
}

/**
 * Tabela com EMPATE PROPOSITAL entre "Aguas sanitarias" e "Aguas sanitarias
 * concentradas" (ambas 0.9).
 *
 * Sem o empate o primeiro teste cai no limiar da regra e o item é aplicado
 * antes da IA — o passe de IA nunca roda e o teste não prova nada. O empate
 * (margem ≤ 0.1) é o que joga o item para a zona cinzenta, que é exatamente
 * onde a IA é consultada.
 */
const IBPT_EMPATADO = [
  {
    codigo: "28289011",
    ex: "",
    descricao: "Aguas sanitarias e alvejantes",
    vigencia_inicio: "2020-01-01",
    vigencia_fim: null,
  },
  {
    codigo: "28289019",
    ex: "",
    descricao: "Aguas sanitarias concentradas",
    vigencia_inicio: "2020-01-01",
    vigencia_fim: null,
  },
  {
    codigo: "34011190",
    ex: "",
    descricao: "Saboes para lavagem nao industriais",
    vigencia_inicio: "2020-01-01",
    vigencia_fim: null,
  },
  {
    codigo: "38089419",
    ex: "",
    descricao: "Desinfetantes de uso geral nao diluidos",
    vigencia_inicio: "2020-01-01",
    vigencia_fim: null,
  },
  {
    codigo: "34022000",
    ex: "",
    descricao: "Detergentes nao toxicos para louca",
    vigencia_inicio: "2020-01-01",
    vigencia_fim: null,
  },
  {
    codigo: "96039000",
    ex: "",
    descricao: "Vassouras e escovas",
    vigencia_inicio: "2020-01-01",
    vigencia_fim: null,
  },
];

describe("POST ncm-completar", () => {
  it("casamento exato grava; resto vai para revisar com motivo", async () => {
    const mem = banco(IBPT, [
      { id: "p1", nome: "ÁGUA SANITÁRIA 5L" },
      { id: "p2", nome: "XYZQ NÃO EXISTE NADA" },
    ]);
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    const { POST } = await import("@/app/api/v1/products/ncm-completar/route");
    const res = await POST(req());
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      data: { aplicados: { id: string }[]; para_revisar: { id: string; motivo: string }[] };
    };
    expect(corpo.data.aplicados.map((a) => a.id)).toEqual(["p1"]);
    expect(corpo.data.para_revisar.map((a) => [a.id, a.motivo])).toEqual([["p2", "sem_candidato"]]);
    expect(mem.gravados).toHaveLength(1);
    expect(mem.gravados[0]?.patch).toMatchObject({ ncm_origem: "sugerido" });
  });

  it("uma auditoria para o lote", async () => {
    const mem = banco(IBPT, [{ id: "p1", nome: "ÁGUA SANITÁRIA 5L" }]);
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    const { POST } = await import("@/app/api/v1/products/ncm-completar/route");
    await POST(req());
    expect(vi.mocked(audit)).toHaveBeenCalledTimes(1);
    const chamada = vi.mocked(audit).mock.calls[0]?.[0] as { action: string };
    expect(chamada.action).toBe("catalog_product.ncm_lote");
  });

  it("sem IBPT, 422 com instrução — não zero silencioso", async () => {
    const mem = banco([], [{ id: "p1", nome: "ÁGUA SANITÁRIA 5L" }]);
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    const { POST } = await import("@/app/api/v1/products/ncm-completar/route");
    const res = await POST(req());
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { message: string } };
    expect(corpo.error.message).toMatch(/IBPT/);
    expect(mem.gravados).toHaveLength(0);
  });

  it("IA concorda com a regra: aplica como regra+ia", async () => {
    // Zona cinzenta que a regra sozinha mandaria para revisão: primeiro a
    // 0.9 em ponto (sem margem sobre o segundo). A IA escolhe o mesmo com
    // confiança alta → dois sistemas concordando, aplica.
    const mem = banco(IBPT_EMPATADO, [{ id: "p1", nome: "AGUA SANITARIA" }]);
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    // `env` (lib/env) faz parse no import: sem reset, o módulo em cache enxerga
    // o env de quando foi importado pela primeira vez neste arquivo.
    vi.resetModules();
    vi.stubEnv("GEMINI_API_KEY", "teste");
    vi.stubGlobal("fetch", iaQueEscolhe(0, 0.92));
    try {
      const { POST } = await import("@/app/api/v1/products/ncm-completar/route");
      const res = await POST(req());
      expect(res.status).toBe(200);
      const corpo = (await res.json()) as {
        data: {
          aplicados: { id: string; via: string }[];
          para_revisar: unknown[];
          ia_chamadas: number;
        };
      };
      expect(corpo.data.ia_chamadas).toBe(1);
      expect(corpo.data.aplicados).toHaveLength(1);
      expect(corpo.data.aplicados[0]?.via).toBe("regra+ia");
      expect(corpo.data.para_revisar).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("IA discorda: fica para revisão COM a opinião anexada", async () => {
    const mem = banco(IBPT_EMPATADO, [{ id: "p1", nome: "AGUA SANITARIA" }]);
    vi.mocked(createClient).mockResolvedValue(mem.cliente);
    // `env` (lib/env) faz parse no import: sem reset, o módulo em cache enxerga
    // o env de quando foi importado pela primeira vez neste arquivo.
    vi.resetModules();
    vi.stubEnv("GEMINI_API_KEY", "teste");
    // Escolhe o SEGUNDO candidato — que não é o primeiro da regra. É a
    // discordância: a IA confiante e em desacordo com a regra é o caso mais
    // informativo da revisão (vale olhar), nunca motivo para aplicar.
    vi.stubGlobal("fetch", iaQueEscolhe(1, 0.95));
    try {
      const { POST } = await import("@/app/api/v1/products/ncm-completar/route");
      const res = await POST(req());
      const corpo = (await res.json()) as {
        data: {
          aplicados: unknown[];
          para_revisar: { ia_opiniao?: { ncm: string | null }; candidatos: { ncm: string }[] }[];
        };
      };
      // Discordou: não aplica, mas a opinião fica para acelerar o humano.
      expect(corpo.data.aplicados).toHaveLength(0);
      expect(corpo.data.para_revisar).toHaveLength(1);
      // A opinião fica anexada para acelerar o humano — e tem que ser a da IA
      // (o segundo candidato), diferente do primeiro que a regra sugeriu.
      const opiniao = corpo.data.para_revisar[0]?.ia_opiniao;
      expect(opiniao?.ncm).not.toBe(corpo.data.para_revisar[0]?.candidatos[0]?.ncm);
      expect(opiniao?.ncm).toBe(corpo.data.para_revisar[0]?.candidatos[1]?.ncm);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("não-manager é 403", async () => {
    sessao("agent");
    const { POST } = await import("@/app/api/v1/products/ncm-completar/route");
    const res = await POST(req());
    expect(res.status).toBe(403);
  });
});
