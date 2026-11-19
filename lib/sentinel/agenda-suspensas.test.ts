import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";

import { organizacoesDevidas } from "./agenda";

const AGORA = Date.parse("2026-11-19T12:00:00.000Z");

function builder(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const metodo of ["select", "order", "eq", "limit", "update", "insert"]) {
    q[metodo] = () => q;
  }
  q.maybeSingle = async () => result;
  q.single = async () => result;
  q.upsert = async () => result;
  q.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(ok, falha);
  return q;
}

function montar(
  orgs: Array<{ id: string; suspended_at: string | null }>,
  settings: Array<Record<string, unknown>>,
) {
  const from = vi.fn((tabela: string) =>
    builder(tabela === "organizations" ? { data: orgs, error: null } : { data: settings, error: null }),
  );
  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
  return from;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Sentinel — agenda com organização suspensa", () => {
  it("suspensa sai da fila de detecção e entra na lista de puladas", async () => {
    montar(
      [
        { id: "org-ativa", suspended_at: null },
        { id: "org-suspensa", suspended_at: "2026-11-19T09:00:00.000Z" },
        { id: "org-ativa-fora-de-hora", suspended_at: null },
        { id: "org-suspensa-fora-de-hora", suspended_at: "2026-11-19T09:00:00.000Z" },
      ],
      [
        { organization_id: "org-ativa", ativo: true, intervalo_minutos: 360, ultima_execucao_em: null },
        { organization_id: "org-suspensa", ativo: true, intervalo_minutos: 360, ultima_execucao_em: null },
        {
          organization_id: "org-ativa-fora-de-hora",
          ativo: true,
          intervalo_minutos: 360,
          ultima_execucao_em: "2026-11-19T11:30:00.000Z",
        },
        {
          organization_id: "org-suspensa-fora-de-hora",
          ativo: true,
          intervalo_minutos: 360,
          ultima_execucao_em: "2026-11-19T11:30:00.000Z",
        },
      ],
    );

    const agenda = await organizacoesDevidas(AGORA, 3);
    expect(agenda.devidas.map((o) => o.organizationId)).toEqual(["org-ativa"]);
    expect(agenda.suspensas.map((o) => o.organizationId)).toEqual(["org-suspensa"]);
  });

  it("suspensa não consome a vaga das ativas e o kill switch vale para as duas", async () => {
    montar(
      [
        { id: "org-1", suspended_at: "2026-11-19T09:00:00.000Z" },
        { id: "org-2", suspended_at: "2026-11-19T09:00:00.000Z" },
        { id: "org-3", suspended_at: "2026-11-19T09:00:00.000Z" },
        { id: "org-4", suspended_at: null },
        { id: "org-5", suspended_at: null },
        { id: "org-6", suspended_at: null },
        { id: "org-7", suspended_at: null },
        { id: "org-desligada", suspended_at: null },
      ],
      [
        { organization_id: "org-1", ativo: true, ultima_execucao_em: null },
        { organization_id: "org-2", ativo: true, ultima_execucao_em: null },
        { organization_id: "org-3", ativo: true, ultima_execucao_em: null },
        { organization_id: "org-4", ativo: true, ultima_execucao_em: null },
        { organization_id: "org-5", ativo: true, ultima_execucao_em: null },
        { organization_id: "org-6", ativo: true, ultima_execucao_em: null },
        { organization_id: "org-7", ativo: true, ultima_execucao_em: null },
        { organization_id: "org-desligada", ativo: false, ultima_execucao_em: null },
      ],
    );

    const agenda = await organizacoesDevidas(AGORA, 2);
    expect(agenda.devidas.map((o) => o.organizationId)).toEqual(["org-4", "org-5"]);
    expect(agenda.suspensas.map((o) => o.organizationId)).toEqual(["org-1", "org-2"]);
    expect(agenda.devidas.some((o) => o.organizationId === "org-desligada")).toBe(false);
  });

  /**
   * A suspensão é lida do banco A CADA tick (`organizations.suspended_at`), não
   * congelada na configuração do Sentinel. Então reativar é só limpar a coluna:
   * a organização volta para a fila de detecção sozinha, sem tocar em
   * `sentinel_settings`. Este teste fixa essa promessa — sem ele, "reativada
   * volta a ser incluída" seria só prosa.
   */
  it("organização reativada volta para a fila de detecção no tick seguinte", async () => {
    const settings = [
      { organization_id: "org-reativada", ativo: true, ultima_execucao_em: null },
    ];

    montar([{ id: "org-reativada", suspended_at: "2026-11-19T09:00:00.000Z" }], settings);
    const suspensa = await organizacoesDevidas(AGORA, 3);
    expect(suspensa.devidas).toEqual([]);
    expect(suspensa.suspensas.map((o) => o.organizationId)).toEqual(["org-reativada"]);

    // Mesmo id, mesma configuração; só `suspended_at` voltou a null.
    montar([{ id: "org-reativada", suspended_at: null }], settings);
    const reativada = await organizacoesDevidas(AGORA, 3);
    expect(reativada.devidas.map((o) => o.organizationId)).toEqual(["org-reativada"]);
    expect(reativada.suspensas).toEqual([]);
  });
});
