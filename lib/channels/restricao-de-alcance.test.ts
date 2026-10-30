import { beforeEach, describe, expect, it, vi } from "vitest";

const getWahaClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/waha/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/waha/client")>();
  return { ...real, getWahaClient };
});

import { lerRestricaoDeAlcance } from "@/lib/waha/client";

import { restricaoDeAlcanceDaSessao } from "./restricao-de-alcance";

/**
 * O payload é o que o transporte devolveu em produção em 30/10/2026, recortado.
 * `timeEnforcementEnds` em SEGUNDOS — ler como ms daria 1970, ou seja
 * "já expirou", e a proteção desligaria em silêncio.
 */
const SESSAO_DO_TRANSPORTE = {
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
const FIM_ISO = "2026-10-30T19:50:02.000Z";

/** A linha de `channel_sessions` que o seam lê — só as colunas do ref. */
const LINHA = {
  organization_id: "org-1",
  provider: "waha",
  waha_session_name: "org_4bc721ce_e8cbfb",
  meta_phone_number_id: null,
  zernio_account_id: null,
};

/** Admin de mentira: uma tabela, um `maybeSingle`. */
function adminCom(linha: unknown) {
  const maybeSingle = vi.fn(async () => ({ data: linha }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { admin: { from: vi.fn(() => ({ select })) } as never, select, eq };
}

beforeEach(() => {
  getWahaClient.mockReset();
});

describe("lerRestricaoDeAlcance", () => {
  it("lê o prazo em segundos do payload real", () => {
    expect(lerRestricaoDeAlcance(SESSAO_DO_TRANSPORTE)).toEqual({
      tipo: "RESTRICT_ALL_COMPANIONS",
      terminaEm: FIM_ISO,
    });
  });

  it("aceita o prazo em milissegundos, porque a unidade já mudou entre versões", () => {
    const info = {
      me: { reachoutTimelock: { isActive: true, timeEnforcementEnds: FIM_EM_MS } },
    };
    expect(lerRestricaoDeAlcance(info)?.terminaEm).toBe(FIM_ISO);
  });

  it("restrição inativa não é restrição", () => {
    const info = { me: { reachoutTimelock: { isActive: false, timeEnforcementEnds: FIM_EM_MS } } };
    expect(lerRestricaoDeAlcance(info)).toBeNull();
  });

  it("sessão sem o campo devolve null (o caso de todo número que está bem)", () => {
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

describe("restricaoDeAlcanceDaSessao", () => {
  const ATIVO = {
    getSessionQr: async () => ({
      status: "WORKING",
      restricaoDeAlcance: { tipo: "RESTRICT_ALL_COMPANIONS", terminaEm: FIM_ISO },
    }),
  };

  it("devolve a restrição quando o prazo ainda não passou", async () => {
    getWahaClient.mockReturnValue(ATIVO);
    const { admin } = adminCom(LINHA);

    const r = await restricaoDeAlcanceDaSessao({
      admin,
      channelSessionId: "sessao-1",
      agoraMs: Date.parse("2026-10-30T14:00:00.000Z"),
    });
    expect(r).toEqual({ tipo: "RESTRICT_ALL_COMPANIONS", terminaEm: FIM_ISO });
  });

  it("devolve null quando o prazo já passou — a campanha volta sozinha", async () => {
    getWahaClient.mockReturnValue(ATIVO);
    const { admin } = adminCom(LINHA);

    const r = await restricaoDeAlcanceDaSessao({
      admin,
      channelSessionId: "sessao-1",
      agoraMs: Date.parse("2026-10-30T20:00:00.000Z"),
    });
    expect(r).toBeNull();
  });

  it("restrição SEM prazo continua valendo: mandar durante ela é o que derruba o número", async () => {
    getWahaClient.mockReturnValue({
      getSessionQr: async () => ({
        status: "WORKING",
        restricaoDeAlcance: { tipo: "RESTRICT_ALL_COMPANIONS", terminaEm: null },
      }),
    });
    const { admin } = adminCom(LINHA);

    const r = await restricaoDeAlcanceDaSessao({ admin, channelSessionId: "sessao-1" });
    expect(r).not.toBeNull();
  });

  it("pergunta pelo identificador que o SEAM resolve — a feature nunca vê a coluna", async () => {
    getWahaClient.mockReturnValue(ATIVO);
    const { admin, eq } = adminCom(LINHA);

    await restricaoDeAlcanceDaSessao({ admin, channelSessionId: "sessao-1" });
    expect(eq).toHaveBeenCalledWith("id", "sessao-1");
    expect(getWahaClient).toHaveBeenCalled();
  });

  it("canal oficial sem aparelho vinculado não é perguntado ao transporte", async () => {
    getWahaClient.mockReturnValue({ getSessionQr: vi.fn() });
    const { admin } = adminCom({ ...LINHA, provider: "meta_cloud", waha_session_name: null });

    // O adapter da Meta responde a saúde sem restrição: a chamada não quebra e o
    // resultado é "sem restrição conhecida".
    const r = await restricaoDeAlcanceDaSessao({ admin, channelSessionId: "sessao-1" });
    expect(r).toBeNull();
  });

  it("sessão que não existe mais devolve null, sem lançar", async () => {
    const { admin } = adminCom(null);
    expect(await restricaoDeAlcanceDaSessao({ admin, channelSessionId: "sumiu" })).toBeNull();
  });

  it("falha ABERTO: transporte que não responde não congela a campanha", async () => {
    getWahaClient.mockReturnValue({
      getSessionQr: async () => {
        throw new Error("waha_timeout");
      },
    });
    const { admin } = adminCom(LINHA);

    expect(await restricaoDeAlcanceDaSessao({ admin, channelSessionId: "sessao-1" })).toBeNull();
  });
});
