import { describe, expect, it } from "vitest";

import { executarDetectores } from "./motor";
import { REGRAS } from "./regras";
import { fingerprint, snapshotVazio, type Achado, type Regra } from "./tipos";
import { nota, primeiro, snapshot } from "./teste-fixtures";
const ACHADO_BASE: Achado = {
  regra: "regra.a",
  categoria: "operacao",
  entidadeTipo: "x",
  entidadeId: "1",
  titulo: "t",
  resumo: "r",
  causaProvavel: "c",
  severidade: "media",
  href: null,
  evidencia: {},
};

describe("motor de detecção", () => {
  it("registry: ids únicos, todos com detector, e nenhuma regra lança em foto vazia", () => {
    const ids = REGRAS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);

    const vazia = snapshotVazio("org-1", Date.now());
    for (const regra of REGRAS) {
      expect(regra.descricao.trim().length, regra.id).toBeGreaterThan(10);
      expect(() => regra.detectar(vazia), regra.id).not.toThrow();
      expect(regra.detectar(vazia), regra.id).toEqual([]);
    }
  });

  it("uma regra que lança não derruba as outras e não conta como avaliada", () => {
    const quebrada: Regra = {
      id: "regra.quebrada",
      categoria: "operacao",
      descricao: "lança de propósito para provar o isolamento",
      detectar: () => {
        throw new Error("boom");
      },
    };
    const boa: Regra = {
      id: "regra.boa",
      categoria: "operacao",
      descricao: "devolve um achado válido",
      detectar: () => [{ ...ACHADO_BASE, regra: "regra.boa", severidade: "alta" }],
    };

    const r = executarDetectores(snapshot(), { regras: [quebrada, boa] });
    expect(r.achados).toHaveLength(1);
    expect(r.regrasAvaliadas).toEqual(["regra.boa"]);
    expect(r.falhas).toEqual([{ regra: "regra.quebrada", motivo: "boom" }]);
  });

  it("achado inválido reprova a regra inteira em vez de gravar lixo", () => {
    const invalida: Regra = {
      id: "regra.invalida",
      categoria: "operacao",
      descricao: "devolve achado sem entidade",
      detectar: () => [{ ...ACHADO_BASE, regra: "regra.invalida", entidadeId: "" }],
    };
    const r = executarDetectores(snapshot(), { regras: [invalida] });
    expect(r.achados).toHaveLength(0);
    expect(r.regrasAvaliadas).toHaveLength(0);
    expect(primeiro(r.falhas).motivo).toContain("entidadeId");
  });

  it("deduplica pela impressão digital e mantém a maior severidade", () => {
    const duplicada: Regra = {
      id: "regra.dup",
      categoria: "operacao",
      descricao: "devolve o mesmo evento duas vezes",
      detectar: () => [
        { ...ACHADO_BASE, regra: "regra.dup", severidade: "baixa" },
        { ...ACHADO_BASE, regra: "regra.dup", severidade: "critica" },
      ],
    };
    const r = executarDetectores(snapshot(), { regras: [duplicada] });
    expect(r.achados).toHaveLength(1);
    expect(primeiro(r.achados).severidade).toBe("critica");
  });

  it("respeita o kill switch de regra por organização", () => {
    const r = executarDetectores(
      snapshot({ notas: [nota({ status: "erro" })] }),
      { desativados: ["fiscal.nota_rejeitada"] },
    );
    expect(r.achados.some((a) => a.regra === "fiscal.nota_rejeitada")).toBe(false);
    expect(r.regrasAvaliadas).not.toContain("fiscal.nota_rejeitada");
  });

  it("ordena por severidade desc e depois por regra (determinístico)", () => {
    const regras: Regra[] = [
      {
        id: "regra.z_baixa",
        categoria: "operacao",
        descricao: "achado de severidade baixa",
        detectar: () => [{ ...ACHADO_BASE, regra: "regra.z_baixa", severidade: "baixa" }],
      },
      {
        id: "regra.a_critica",
        categoria: "operacao",
        descricao: "achado de severidade crítica",
        detectar: () => [{ ...ACHADO_BASE, regra: "regra.a_critica", severidade: "critica" }],
      },
      {
        id: "regra.m_alta",
        categoria: "operacao",
        descricao: "achado de severidade alta",
        detectar: () => [{ ...ACHADO_BASE, regra: "regra.m_alta", severidade: "alta" }],
      },
    ];
    const r = executarDetectores(snapshot(), { regras });
    expect(r.achados.map((a) => a.regra)).toEqual([
      "regra.a_critica",
      "regra.m_alta",
      "regra.z_baixa",
    ]);
  });

  it("fingerprint é estável e separa regra de entidade", () => {
    expect(fingerprint(ACHADO_BASE)).toBe(fingerprint({ ...ACHADO_BASE }));
    expect(fingerprint(ACHADO_BASE)).not.toBe(
      fingerprint({ ...ACHADO_BASE, regra: "regra.b" }),
    );
    expect(fingerprint(ACHADO_BASE)).not.toBe(
      fingerprint({ ...ACHADO_BASE, entidadeId: "2" }),
    );
  });
});
