/**
 * O GATE DE IDENTIDADE barra o que preço certo não barra (cenários G, H + o caso real).
 *
 * Puro e determinístico: corpo candidato × itens devolvidos no turno. Sem
 * Gemini, sem WAHA, sem banco.
 */
import { describe, expect, it } from "vitest";

import {
  validarCitacaoCatalogo,
  type ItemCitavel,
} from "@/lib/agent-engine/guardrails/catalog-identity";
import {
  extrairItensDoTurnoLegado,
  FALLBACK_IDENTIDADE_LEGADO,
} from "@/lib/ai/runtime/extrair-itens-do-turno";

const TURNO_VASSOURA: ItemCitavel[] = [
  { codigo: "CABO-VAS", nome: "Cabo de vassoura avulso", preco_cents: 500, relacao: "relacionada" },
  { codigo: "VAS-PELO", nome: "Vassoura de pelo", preco_cents: 1500 },
  { codigo: "VAS-NYLON", nome: "Vassoura de nylon", preco_cents: 1200 },
];

describe("o caso real — relacionada como resposta, direta ignorada", () => {
  it("⭐ 'Cabo de vassoura avulso — R$ 5,00' sozinho é VETO", () => {
    const v = validarCitacaoCatalogo("Cabo de vassoura avulso — R$ 5,00", TURNO_VASSOURA);
    expect(v.ok).toBe(false);
    expect(v.code).toBe("catalogo_troca_por_acessorio");
  });

  it("alternativa EXPLÍCITA passa — 'não temos a vassoura, mas temos o cabo'", () => {
    const v = validarCitacaoCatalogo(
      "Não temos a vassoura completa, mas temos o cabo de vassoura avulso por R$ 5,00, quer?",
      TURNO_VASSOURA,
    );
    expect(v.ok).toBe(true);
  });

  it("resposta com as diretas passa", () => {
    const v = validarCitacaoCatalogo(
      "Temos vassoura de pelo por R$ 15,00 e vassoura de nylon por R$ 12,00",
      TURNO_VASSOURA,
    );
    expect(v.ok).toBe(true);
  });
});

describe("cenário G — preço que a busca não devolveu", () => {
  it("⭐ 'Vassoura de pelo — R$ 10,00' (real: R$ 15,00) é VETO", () => {
    const v = validarCitacaoCatalogo("Vassoura de pelo por R$ 10,00", TURNO_VASSOURA);
    expect(v.ok).toBe(false);
    expect(v.code).toBe("catalogo_preco_inconsistente");
  });

  it("preço com milhar e sem decimal também confere", () => {
    const itens: ItemCitavel[] = [{ codigo: "X", nome: "Produto X", preco_cents: 123456 }];
    expect(validarCitacaoCatalogo("sai por R$ 1.234,56", itens).ok).toBe(true);
    expect(validarCitacaoCatalogo("sai por R$ 1.234,00", itens).ok).toBe(false);
  });
});

describe("cenário H — código que a busca não devolveu", () => {
  it("⭐ 'código VAS-XYZ' sem esse código nos resultados é VETO", () => {
    const v = validarCitacaoCatalogo(
      "A vassoura de pelo (código VAS-XYZ) sai por R$ 15,00",
      TURNO_VASSOURA,
    );
    expect(v.ok).toBe(false);
    expect(v.code).toBe("catalogo_codigo_desconhecido");
  });

  it("código devolvido passa", () => {
    const v = validarCitacaoCatalogo(
      "A vassoura de pelo (código VAS-PELO) sai por R$ 15,00",
      TURNO_VASSOURA,
    );
    expect(v.ok).toBe(true);
  });
});

describe("o gate não veta conversa normal", () => {
  it("sem itens no turno (preço veio de RAG/prompt): no-op", () => {
    expect(validarCitacaoCatalogo("A vassoura sai por R$ 15,00", []).ok).toBe(true);
  });

  it("mensagem sem preço nem produto: passa", () => {
    expect(validarCitacaoCatalogo("Oi! Como posso ajudar?", TURNO_VASSOURA).ok).toBe(true);
  });

  it("só o acessório no turno (cenário B): citar ele passa", () => {
    const soCabo: ItemCitavel[] = [TURNO_VASSOURA[0]!];
    expect(validarCitacaoCatalogo("Temos o cabo de vassoura avulso por R$ 5,00", soCabo).ok).toBe(
      true,
    );
  });
});

describe("runtime legado: extração dos itens do turno + fallback", () => {
  const passos = [
    {
      toolResults: [
        { toolName: "get_lead_context", output: { contato: "x" } },
        {
          toolName: "crm_search_products",
          output: {
            produtos: [
              { codigo: "CABO-VAS", nome: "Cabo de vassoura avulso", preco_cents: 500, relacao: "relacionada" },
              { codigo: "VAS-PELO", nome: "Vassoura de pelo", preco_cents: 1500 },
            ],
          },
        },
      ],
    },
  ];

  it("⭐ extrai só crm_search_products, ignorando as demais tools", () => {
    const itens = extrairItensDoTurnoLegado(passos);
    expect(itens.map((i) => i.codigo)).toEqual(["CABO-VAS", "VAS-PELO"]);
    expect(itens[0]).toMatchObject({ preco_cents: 500, relacao: "relacionada" });
  });

  it("passo sem toolResults não quebra a extração", () => {
    expect(extrairItensDoTurnoLegado([{}, { toolResults: null }])).toEqual([]);
  });

  it("o fluxo completo barra o cabo no legado: extrai → valida → veta", () => {
    const itens = extrairItensDoTurnoLegado(passos);
    const v = validarCitacaoCatalogo("Cabo de vassoura avulso — R$ 5,00", itens);
    expect(v.ok).toBe(false);
    expect(v.code).toBe("catalogo_troca_por_acessorio");
  });

  it("o fallback honesto não contém preço nem produto — passa em qualquer turno", () => {
    expect(validarCitacaoCatalogo(FALLBACK_IDENTIDADE_LEGADO, TURNO_VASSOURA).ok).toBe(true);
  });
});
