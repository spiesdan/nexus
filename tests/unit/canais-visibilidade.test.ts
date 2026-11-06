import { describe, expect, it } from "vitest";

import {
  canaisDoInbox,
  canalVisivelPara,
  interpretarLeituraDeCanais,
  isCanaisColumnMissing,
} from "@/lib/channels/visibilidade";

/**
 * 0296 — leitura da allowlist de números por membro.
 *
 * A parte pura é testada aqui porque o desfecho de cada estado tem significado
 * de produto: `null` = todos, `[]` = nenhum, e coluna ausente = o passado (sem
 * restrição). Colapsar dois deles é o defeito que este arquivo vigia.
 */
describe("isCanaisColumnMissing", () => {
  it("reconhece 42703 quando a mensagem nomeia a coluna", () => {
    expect(
      isCanaisColumnMissing({
        code: "42703",
        message: 'column user_organizations.canais_permitidos does not exist',
      }),
    ).toBe(true);
  });

  it("reconhece PGRST204 (escrita com coluna fora do schema cache)", () => {
    expect(
      isCanaisColumnMissing({
        code: "PGRST204",
        message: "Could not find the 'canais_permitidos' column",
      }),
    ).toBe(true);
  });

  it("NÃO confunde erro qualquer com migration faltando", () => {
    expect(isCanaisColumnMissing({ code: "42703", message: "column foo does not exist" })).toBe(
      false,
    );
    expect(isCanaisColumnMissing({ code: "08006", message: "connection failure" })).toBe(false);
    expect(isCanaisColumnMissing(null)).toBe(false);
  });
});

describe("interpretarLeituraDeCanais", () => {
  it("coluna ausente degrada para 'todos' e sinaliza o schema velho", () => {
    expect(
      interpretarLeituraDeCanais({
        data: null,
        error: {
          code: "42703",
          message: "column user_organizations.canais_permitidos does not exist",
        },
      }),
    ).toEqual({ ok: true, canais: null, schemaOutdated: true });
  });

  it("sem linha de membership, também é 'todos' (a RLS já barra quem não é membro)", () => {
    expect(interpretarLeituraDeCanais({ data: null, error: null })).toEqual({
      ok: true,
      canais: null,
      schemaOutdated: false,
    });
  });

  it("coluna NULL é 'todos'; lista vazia é 'nenhum' — e não se confundem", () => {
    expect(
      interpretarLeituraDeCanais({ data: { canais_permitidos: null }, error: null }),
    ).toEqual({ ok: true, canais: null, schemaOutdated: false });
    expect(
      interpretarLeituraDeCanais({ data: { canais_permitidos: [] }, error: null }),
    ).toEqual({ ok: true, canais: [], schemaOutdated: false });
  });

  it("erro real NÃO falha aberto: sobe como ok:false para a rota responder 500", () => {
    const r = interpretarLeituraDeCanais({
      data: null,
      error: { code: "08006", message: "connection failure" },
    });
    expect(r.ok).toBe(false);
  });
});

describe("canalVisivelPara", () => {
  it("null libera todos", () => {
    expect(canalVisivelPara(null, "canal-a")).toBe(true);
  });

  it("lista libera só o que está nela", () => {
    expect(canalVisivelPara(["canal-a"], "canal-a")).toBe(true);
    expect(canalVisivelPara(["canal-a"], "canal-b")).toBe(false);
  });

  it("lista vazia não libera nada", () => {
    expect(canalVisivelPara([], "canal-a")).toBe(false);
  });
});

describe("canaisDoInbox", () => {
  it("esconde só o que a API marcou como false", () => {
    const canais = [
      { id: "a", visivel_no_inbox: true },
      { id: "b", visivel_no_inbox: false },
      // Cache anterior ao deploy: ausente significa visível (estado antigo).
      { id: "c" },
    ];
    expect(canaisDoInbox(canais).map((c) => c.id)).toEqual(["a", "c"]);
  });
});
