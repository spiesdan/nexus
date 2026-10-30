import { beforeEach, describe, expect, it, vi } from "vitest";

const { getWahaClient } = vi.hoisted(() => ({ getWahaClient: vi.fn() }));

vi.mock("@/lib/waha/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/waha/client")>();
  return { ...real, getWahaClient };
});

import { lerRestricaoDeAlcance } from "@/lib/waha/client";

import {
  restricaoAtingeO,
  restricaoAtivaDaSessao,
  textoDaRestricao,
} from "./restricao-do-whatsapp";

/**
 * O payload é o que o WAHA devolveu em produção em 30/10/2026, recortado.
 * `timeEnforcementEnds` em SEGUNDOS — ler como ms daria 1970, ou seja
 * "já expirou", e a proteção desligaria em silêncio.
 */
const SESSAO_WAHA = {
  name: "org_4bc721ce_e8cbfb",
  status: "WORKING",
  me: {
    id: "554791615508@c.us",
    reachoutTimelock: {
      enforcementType: "RESTRICT_ALL_COMPANIONS",
      isActive: true,
      timeEnforcementEnds: 1793389802,
    },
  },
};

const FIM_EM_MS = 1793389802 * 1000;

beforeEach(() => {
  getWahaClient.mockReset();
});

describe("lerRestricaoDeAlcance", () => {
  it("lê o prazo em segundos do payload real", () => {
    expect(lerRestricaoDeAlcance(SESSAO_WAHA)).toEqual({
      tipo: "RESTRICT_ALL_COMPANIONS",
      terminaEm: "2026-10-30T19:50:02.000Z",
    });
  });

  it("aceita o prazo em milissegundos, porque a unidade já mudou entre versões", () => {
    const info = {
      me: { reachoutTimelock: { isActive: true, timeEnforcementEnds: FIM_EM_MS } },
    };
    expect(lerRestricaoDeAlcance(info)?.terminaEm).toBe("2026-10-30T19:50:02.000Z");
  });

  it("restrição inativa não é restrição", () => {
    const info = { me: { reachoutTimelock: { isActive: false, timeEnforcementEnds: FIM_EM_MS } } };
    expect(lerRestricaoDeAlcance(info)).toBeNull();
  });

  it("sessão sem o campo devolve null (o caso de todo número por QR que está bem)", () => {
    expect(lerRestricaoDeAlcance({ me: { id: "5547@c.us" } })).toBeNull();
    expect(lerRestricaoDeAlcance({})).toBeNull();
    expect(lerRestricaoDeAlcance(null)).toBeNull();
  });

  it("payload torto não lança — um tick de 60s não pode morrer por campo acessório", () => {
    expect(lerRestricaoDeAlcance("texto")).toBeNull();
    expect(lerRestricaoDeAlcance({ me: { reachoutTimelock: "sim" } })).toBeNull();
    expect(
      lerRestricaoDeAlcance({ me: { reachoutTimelock: { isActive: true, timeEnforcementEnds: "x" } } }),
    ).toEqual({ tipo: "DESCONHECIDO", terminaEm: null });
  });
});

describe("restricaoAtingeO", () => {
  it("atinge prospecção (conversa nova)", () => {
    expect(restricaoAtingeO("prospects")).toBe(true);
  });

  it("NÃO atinge recuperação — quem já conversa com a empresa continua recebendo", () => {
    expect(restricaoAtingeO("contatos")).toBe(false);
  });

  it("coluna nula é prospecção: o default do produto", () => {
    expect(restricaoAtingeO("")).toBe(true);
  });
});

describe("restricaoAtivaDaSessao", () => {
  const sessao = { provider: "waha", waha_session_name: "org_4bc721ce_e8cbfb" };

  it("devolve a restrição quando o prazo ainda não passou", async () => {
    getWahaClient.mockReturnValue({
      getSessionQr: async () => ({
        status: "WORKING",
        restricaoDeAlcance: { tipo: "RESTRICT_ALL_COMPANIONS", terminaEm: "2026-10-30T19:50:02.000Z" },
      }),
    });

    const r = await restricaoAtivaDaSessao(sessao, Date.parse("2026-10-30T14:00:00.000Z"));
    expect(r).toEqual({
      tipo: "RESTRICT_ALL_COMPANIONS",
      terminaEm: "2026-10-30T19:50:02.000Z",
    });
  });

  it("devolve null quando o prazo já passou — a campanha volta sozinha", async () => {
    getWahaClient.mockReturnValue({
      getSessionQr: async () => ({
        status: "WORKING",
        restricaoDeAlcance: { tipo: "RESTRICT_ALL_COMPANIONS", terminaEm: "2026-10-30T19:50:02.000Z" },
      }),
    });

    const r = await restricaoAtivaDaSessao(sessao, Date.parse("2026-10-30T20:00:00.000Z"));
    expect(r).toBeNull();
  });

  it("restrição SEM prazo continua valendo: mandar durante ela é o que derruba o número", async () => {
    getWahaClient.mockReturnValue({
      getSessionQr: async () => ({
        status: "WORKING",
        restricaoDeAlcance: { tipo: "RESTRICT_ALL_COMPANIONS", terminaEm: null },
      }),
    });

    expect(await restricaoAtivaDaSessao(sessao, Date.now())).not.toBeNull();
  });

  it("não pergunta ao transporte para canal sem aparelho vinculado (oficial da Meta)", async () => {
    getWahaClient.mockReturnValue({ getSessionQr: vi.fn() });
    const r = await restricaoAtivaDaSessao(
      { provider: "meta_cloud", waha_session_name: null },
      Date.now(),
    );
    expect(r).toBeNull();
    expect(getWahaClient).not.toHaveBeenCalled();
  });

  it("falha ABERTO: transporte que não responde não congela a campanha", async () => {
    getWahaClient.mockReturnValue({
      getSessionQr: async () => {
        throw new Error("waha_timeout");
      },
    });
    expect(await restricaoAtivaDaSessao(sessao, Date.now())).toBeNull();
  });
});

describe("textoDaRestricao", () => {
  it("diz o prazo no fuso da organização e que a campanha volta sozinha", () => {
    const texto = textoDaRestricao(
      { tipo: "RESTRICT_ALL_COMPANIONS", terminaEm: "2026-10-30T19:50:02.000Z" },
      "16:50",
    );
    expect(texto).toContain("até 16:50");
    expect(texto).toContain("volta sozinha");
    expect(texto).toContain("RESTRICT_ALL_COMPANIONS");
  });

  it("sem prazo, diz que não há prazo — em vez de inventar um", () => {
    const texto = textoDaRestricao({ tipo: "RESTRICT_ALL_COMPANIONS", terminaEm: null }, null);
    expect(texto).toContain("sem prazo informado");
    expect(texto).not.toContain("até null");
  });
});
