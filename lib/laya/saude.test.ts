import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  lerSaudeDaInstalacao,
  lerSaudeDoMotor,
  registrarFalhaDoMotor,
  registrarSucessoDoMotor,
  TIPO_INCIDENTE_MOTOR,
} from "@/lib/laya/saude";

/**
 * A SAÚDE DO MOTOR — o que transforma "sem sugestão" em "o motor não respondeu".
 *
 * O contrato que estes testes fixam:
 * - falha abre UM incidente e incrementa o contador em vez de criar 96 por dia;
 * - sucesso fecha o incidente (o aviso some sozinho);
 * - leitura nunca lança: erro vira `sem_registro`, não alarme inventado.
 */
interface Incidente {
  id: string;
  organization_id: string | null;
  type: string;
  severity: string;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  resolution_note?: string | null;
}

function adminFake(opcoes: { quebrar?: boolean } = {}) {
  const linhas: Incidente[] = [];
  let seq = 0;
  const chamadas: Array<{ tipo: string; payload?: Record<string, unknown> }> = [];

  function consulta() {
    const filtros: Record<string, unknown> = {};
    let operacao: "select" | "update" | "insert" = "select";
    let payload: Record<string, unknown> | undefined;

    const q = {
      select: () => q,
      eq: (coluna: string, valor: unknown) => {
        filtros[coluna] = valor;
        return q;
      },
      order: () => q,
      limit: () => q,
      maybeSingle: () => Promise.resolve({ ...ler(), data: ler().data?.[0] ?? null }),
      insert: (linha: Incidente) => {
        operacao = "insert";
        chamadas.push({ tipo: "insert" });
        payload = linha as unknown as Record<string, unknown>;
        return q;
      },
      update: (campos: Record<string, unknown>) => {
        operacao = "update";
        payload = campos;
        chamadas.push({ tipo: "update", payload: campos });
        return q;
      },
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
        try {
          if (operacao === "select") {
            const r = ler();
            resolve({ data: r.data, error: r.error });
            return;
          }
          aplicar();
          resolve({ data: null, error: null });
        } catch (e) {
          reject?.(e);
        }
      },
    };

    function filtra() {
      return linhas.filter((l) =>
        Object.entries(filtros).every(([c, v]) => (l as unknown as Record<string, unknown>)[c] === v),
      );
    }

    function ler() {
      if (opcoes.quebrar) return { data: null, error: { message: "indisponível" } };
      const ordenadas = [...filtra()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return { data: ordenadas.slice(0, 5), error: null };
    }

    function aplicar() {
      if (operacao === "insert") {
        const linha = payload as unknown as Incidente;
        linhas.push({
          ...linha,
          id: `inc-${++seq}`,
          created_at: "2026-11-20T10:00:00.000Z",
          updated_at: "2026-11-20T10:00:00.000Z",
        });
        return;
      }
      if (operacao === "update") {
        for (const l of filtra()) Object.assign(l, payload);
      }
    }

    return q;
  }

  const admin = { from: () => consulta() };
  return { admin: admin as never, linhas, chamadas };
}

describe("registrarFalhaDoMotor", () => {
  it("abre UM incidente com origem, erro e contador", async () => {
    const { admin, linhas, chamadas } = adminFake();

    await registrarFalhaDoMotor(admin, "org-1", "radar", "fetch failed");
    await registrarFalhaDoMotor(admin, "org-1", "radar", "fetch failed");

    expect(chamadas.filter((c) => c.tipo === "insert")).toHaveLength(1);
    expect(chamadas.filter((c) => c.tipo === "update")).toHaveLength(1);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      organization_id: "org-1",
      type: TIPO_INCIDENTE_MOTOR,
      severity: "warning",
      status: "open",
    });
    expect(linhas[0]!.payload).toMatchObject({
      origem: "radar",
      erro: "fetch failed",
      falhas: 2,
    });
  });

  it("nunca lança quando o banco falha", async () => {
    const admin = {
      from: () => {
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          limit: () => q,
          maybeSingle: () => Promise.reject(new Error("sem conexão")),
        };
        return q;
      },
    } as never;

    await expect(
      registrarFalhaDoMotor(admin, "org-1", "prospeccao", "timeout"),
    ).resolves.toBeUndefined();
  });
});

describe("registrarSucessoDoMotor", () => {
  it("fecha o incidente aberto — o aviso some sozinho", async () => {
    const { admin, linhas } = adminFake();
    await registrarFalhaDoMotor(admin, "org-1", "radar", "fetch failed");

    await registrarSucessoDoMotor(admin, "org-1");

    expect(linhas[0]!.status).toBe("resolved");
    expect(linhas[0]!.resolution_note).toContain("voltou a responder");
  });
});

describe("lerSaudeDoMotor", () => {
  it("incidente aberto → indisponível, com última falha e detalhe", async () => {
    const { admin, linhas } = adminFake();
    await registrarFalhaDoMotor(admin, "org-1", "radar", "fetch failed");

    const saude = await lerSaudeDoMotor(admin, "org-1");

    expect(saude.estado).toBe("indisponivel");
    expect(saude.detalhe).toBe("fetch failed");
    expect(saude.falhas).toBe(1);
    expect(saude.ultima_falha).toBe(linhas[0]!.updated_at);
  });

  it("resolvido → ok (não é alarme permanente)", async () => {
    const { admin } = adminFake();
    await registrarFalhaDoMotor(admin, "org-1", "radar", "fetch failed");
    await registrarSucessoDoMotor(admin, "org-1");

    expect((await lerSaudeDoMotor(admin, "org-1")).estado).toBe("ok");
  });

  it("sem histórico → sem_registro", async () => {
    const { admin } = adminFake();
    expect((await lerSaudeDoMotor(admin, "org-1")).estado).toBe("sem_registro");
  });

  it("erro de leitura vira sem_registro, nunca exceção", async () => {
    const { admin } = adminFake({ quebrar: true });
    await expect(lerSaudeDoMotor(admin, "org-1")).resolves.toMatchObject({
      estado: "sem_registro",
    });
  });
});

describe("lerSaudeDaInstalacao", () => {
  it("conta organizações com incidente aberto e guarda a última falha", async () => {
    const { admin, linhas } = adminFake();
    await registrarFalhaDoMotor(admin, "org-1", "radar", "fetch failed");
    await registrarFalhaDoMotor(admin, "org-2", "prospeccao", "timeout");
    await registrarFalhaDoMotor(admin, "org-3", "radar", "fetch failed");
    await registrarSucessoDoMotor(admin, "org-3");
    linhas[0]!.updated_at = "2026-11-20T11:00:00.000Z";
    linhas[1]!.updated_at = "2026-11-20T10:30:00.000Z";

    const saude = await lerSaudeDaInstalacao(admin);

    expect(saude.estado).toBe("indisponivel");
    expect(saude.organizacoes_com_falha).toBe(2);
    expect(saude.detalhe).toBe("fetch failed");
  });
});
