import { describe, expect, it } from "vitest";

import { executarDetectores } from "./motor";
import { REGRAS } from "./regras";
import { fingerprint, snapshotVazio, type Achado, type Regra } from "./tipos";
import {
  leadAberto,
  nota,
  pedido,
  primeiro,
  produto,
  recebivel,
  snapshot,
} from "./teste-fixtures";
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

const PLANO_BASE = {
  resumo: "Plano de teste utilizável pela tela.",
  passos: ["Passo único"],
  campos_pendentes: [],
  risco: "baixo" as const,
  reversibilidade: "reversivel" as const,
  exige_aprovacao: false,
  fonte: ["tabela_teste"],
  limitacao: null,
  confianca: "alta" as const,
};

function mapa(...ids: string[]): Record<string, () => typeof PLANO_BASE> {
  return Object.fromEntries(ids.map((id) => [id, () => PLANO_BASE]));
}

describe("motor de detecção", () => {
  it("registry: ids únicos, todos com detector, e nenhuma regra lança em foto vazia", () => {
    const ids = REGRAS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);

    const vazia = snapshotVazio("org-1", Date.now());
    for (const regra of REGRAS) {
      expect(regra.descricao.trim().length, regra.id).toBeGreaterThan(10);
      expect(() => regra.detectar(vazia), regra.id).not.toThrow();
      const achados = regra.detectar(vazia);
      // `null` = regra sem dado para avaliar (ex.: série de SLO vazia); não é
      // achado nem falha, e por isso não entra em `regrasAvaliadas`.
      if (achados !== null) expect(achados, regra.id).toEqual([]);
    }
  });

  it("regra que devolve null não é avaliada, não falha e não fecha ausentes", () => {
    const semDados: Regra = {
      id: "regra.sem-dados",
      categoria: "plataforma",
      descricao: "sem série para avaliar nesta rodada",
      detectar: () => null,
    };
    const r = executarDetectores(snapshot(), { regras: [semDados] });
    expect(r.regrasAvaliadas).toEqual([]);
    expect(r.regrasNaoAvaliadas).toEqual(["regra.sem-dados"]);
    expect(r.falhas).toEqual([]);
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

    const r = executarDetectores(snapshot(), {
      regras: [quebrada, boa],
      recomendacoes: mapa("regra.boa"),
    });
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
    const r = executarDetectores(snapshot(), {
      regras: [invalida],
      recomendacoes: mapa("regra.invalida"),
    });
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
    const r = executarDetectores(snapshot(), {
      regras: [duplicada],
      recomendacoes: mapa("regra.dup"),
    });
    expect(r.achados).toHaveLength(1);
    expect(primeiro(r.achados).severidade).toBe("critica");
    expect(primeiro(r.achados).recomendacao?.risco).toBe("baixo");
  });

  it("regra sem plano de correção reprova em vez de abrir ocorrência muda", () => {
    const semPlano: Regra = {
      id: "regra.sem_plano",
      categoria: "operacao",
      descricao: "detector válido, mas sem entrada em RECOMENDACOES",
      detectar: () => [{ ...ACHADO_BASE, regra: "regra.sem_plano" }],
    };
    const r = executarDetectores(snapshot(), { regras: [semPlano], recomendacoes: {} });
    expect(r.achados).toHaveLength(0);
    expect(r.regrasAvaliadas).toHaveLength(0);
    expect(primeiro(r.falhas).motivo).toContain("sem plano");
  });

  it("orçamento de tempo trunca a rodada e não avalia as regras seguintes", () => {
    const lenta: Regra = {
      id: "regra.lenta",
      categoria: "operacao",
      descricao: "queima o orçamento de propósito",
      detectar: () => {
        const inicio = performance.now();
        while (performance.now() - inicio < 40) {
          // espera ocupada: simula detector patológico
        }
        return [];
      },
    };
    const depois: Regra = {
      id: "regra.depois",
      categoria: "operacao",
      descricao: "não pode rodar depois do estouro",
      detectar: () => [{ ...ACHADO_BASE, regra: "regra.depois" }],
    };

    const r = executarDetectores(snapshot(), {
      regras: [lenta, depois],
      recomendacoes: mapa("regra.depois"),
      orcamentoMs: 1,
    });

    expect(r.truncadoPorTempo).toBe(true);
    expect(r.regrasAvaliadas).toEqual(["regra.lenta"]);
    expect(r.regrasAvaliadas).not.toContain("regra.depois");
    expect(r.achados).toHaveLength(0);
  });

  it("carga: 2k produtos + 2k pedidos + 2k recebíveis + 2k leads roda no orçamento", () => {
    const grande = snapshot({
      produtos: Array.from({ length: 2_000 }, (_, i) =>
        produto({ id: `produto-${i}`, codigo: `SKU-${i}`, quantidade: i % 10 }),
      ),
      pedidos: Array.from({ length: 2_000 }, (_, i) =>
        pedido({
          id: `pedido-${i}`,
          numero: i,
          subtotal_cents: 10_000,
          desconto_cents: 0,
          frete_cents: 0,
          total_cents: 10_000,
          status: "rascunho",
          updated_at: new Date().toISOString(),
        }),
      ),
      recebiveis: Array.from({ length: 2_000 }, (_, i) =>
        recebivel({ id: `recebivel-${i}`, order_id: `pedido-${i}`, vencimento: "2026-12-01" }),
      ),
      sloApi: {
        janela_dias: 7,
        total: 100,
        erros: 0,
        p95: 100,
        rotas: [{ route: "/api/v1/contacts", total: 100, erros: 0, p95: 100 }],
      },
      leadsAbertos: Array.from({ length: 2_000 }, (_, i) =>
        leadAberto({
          id: `lead-${i}`,
          contact_id: `contato-${i}`,
          contatos: { name: null, display_name: null, phone_number: `+5511999${String(i).padStart(5, "0")}`, email_normalized: `p${i}@loja.test` },
        }),
      ),
    });

    const r = executarDetectores(grande);
    expect(r.truncadoPorTempo).toBe(false);
    expect(r.regrasAvaliadas).toHaveLength(REGRAS.length);
    // Teto folgado para máquina de CI carregada; o valor medido nesta máquina
    // está no comentário de ORCAMENTO_DETECCAO_PADRAO_MS.
    expect(r.tempoMs).toBeLessThan(2_000);
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
    const r = executarDetectores(snapshot(), {
      regras,
      recomendacoes: mapa("regra.z_baixa", "regra.a_critica", "regra.m_alta"),
    });
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
