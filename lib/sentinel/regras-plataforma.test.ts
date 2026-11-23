import { describe, expect, it } from "vitest";

import { snapshot } from "./teste-fixtures";
import { fingerprint, type ResumoSloApi, type SloPorRota } from "./tipos";
import { slosEstourados } from "./regras-plataforma";

function rota(route: string, total: number, erros: number, p95: number): SloPorRota {
  return { route, total, erros, p95 };
}

function resumo(over: Partial<ResumoSloApi> = {}): ResumoSloApi {
  return {
    janela_dias: 7,
    total: 1_000,
    erros: 4,
    p95: 500,
    rotas: [
      rota("/api/v1/commercial-orders", 500, 4, 500),
      rota("/api/v1/conversations", 500, 0, 300),
    ],
    ...over,
  };
}

describe("plataforma.slo_estourado", () => {
  it("disponibilidade 99,0% abre com evidência da janela e das rotas", () => {
    const achados = slosEstourados(
      snapshot({
        sloApi: resumo({
          erros: 10,
          rotas: [
            rota("/api/v1/commercial-orders", 700, 9, 400),
            rota("/api/v1/contacts", 300, 1, 200),
          ],
        }),
      }),
    );

    expect(achados).toHaveLength(1);
    expect(achados![0]).toMatchObject({
      regra: "plataforma.slo_estourado",
      entidadeTipo: "slo",
      entidadeId: "disponibilidade",
      categoria: "plataforma",
    });
    expect(achados![0]?.evidencia).toMatchObject({
      janela_dias: 7,
      total: 1_000,
      erros_5xx: 10,
      disponibilidade_pct: 99,
      rotas_com_5xx: ["/api/v1/commercial-orders: 9/700", "/api/v1/contacts: 1/300"],
    });
  });

  it("99,6% não abre (acima do alvo)", () => {
    expect(slosEstourados(snapshot({ sloApi: resumo({ erros: 4 }) }))).toHaveLength(0);
  });

  it("p95 de 850 ms abre; 700 ms não", () => {
    const estourado = slosEstourados(snapshot({ sloApi: resumo({ p95: 850 }) }));
    expect(estourado).toHaveLength(1);
    expect(estourado![0]).toMatchObject({ entidadeId: "latencia", severidade: "media" });
    expect(estourado![0]?.evidencia).toMatchObject({ p95_ms: 850, alvo_ms: 800 });

    expect(slosEstourados(snapshot({ sloApi: resumo({ p95: 700 }) }))).toHaveLength(0);
  });

  it("janela vazia ou abaixo do piso não abre nada", () => {
    expect(slosEstourados(snapshot({ sloApi: null }))).toBeNull();
    expect(
      slosEstourados(snapshot({ sloApi: resumo({ total: 99, erros: 99, p95: 5_000 }) })),
    ).toBeNull();
  });

  it("fingerprint é estável por SLO e os dois SLOs não colidem", () => {
    const ambos = slosEstourados(snapshot({ sloApi: resumo({ erros: 20, p95: 900 }) }));
    expect(ambos).toHaveLength(2);
    const f1 = fingerprint(ambos![0]!);
    const f2 = fingerprint(ambos![1]!);
    expect(f1).not.toBe(f2);
    expect(fingerprint(slosEstourados(snapshot({ sloApi: resumo({ erros: 20, p95: 900 }) }))![0]!)).toBe(f1);
  });

  it("dados reais de produção (267 amostras, p95 2660 ms) abrem latência CRÍTICA", () => {
    const achados = slosEstourados(
      snapshot({
        sloApi: resumo({
          total: 267,
          erros: 0,
          p95: 2660,
          rotas: [
            rota("/api/v1/conversations", 259, 0, 2673),
            rota("/api/v1/commercial-orders", 3, 0, 1378),
            rota("/api/v1/contacts", 4, 0, 1052),
            rota("/api/v1/invoices", 1, 0, 971),
          ],
        }),
      }),
    );

    // 0 erros ⇒ disponibilidade 100% (não abre); latência 2660 > 1600 ⇒ crítica.
    expect(achados).toHaveLength(1);
    expect(achados![0]).toMatchObject({
      regra: "plataforma.slo_estourado",
      entidadeTipo: "slo",
      entidadeId: "latencia",
      severidade: "critica",
    });
    expect(achados![0]?.evidencia).toMatchObject({
      total: 267,
      p95_ms: 2660,
      alvo_ms: 800,
    });
    expect(achados![0]?.evidencia.rotas_lentas).toContain(
      "/api/v1/conversations: p95 2673 ms (259 amostras)",
    );
  });

});
