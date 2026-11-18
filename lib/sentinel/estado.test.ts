import { describe, expect, it } from "vitest";

import { camposDaTransicao, validarTransicao } from "./estado";

describe("máquina de estados da ocorrência", () => {
  it("aceita o caminho de investigação sem exigir gestor", () => {
    expect(
      validarTransicao({ de: "nova", para: "investigando", motivo: null, podeGerir: false }).ok,
    ).toBe(true);
    expect(
      validarTransicao({
        de: "investigando",
        para: "acao_necessaria",
        motivo: null,
        podeGerir: false,
      }).ok,
    ).toBe(true);
    expect(
      validarTransicao({ de: "investigando", para: "corrigida", motivo: null, podeGerir: false })
        .ok,
    ).toBe(true);
  });

  it("ignorar, encerrar, aprovar e reabrir exigem gestor", () => {
    const casos = [
      { de: "nova", para: "ignorada" },
      { de: "nova", para: "encerrada" },
      { de: "acao_necessaria", para: "aprovada" },
    ] as const;
    for (const { de, para } of casos) {
      const r = validarTransicao({ de, para, motivo: "motivo", podeGerir: false });
      expect(r.ok).toBe(false);
      expect(r.codigo).toBe("papel_insuficiente");
    }
    expect(
      validarTransicao({ de: "encerrada", para: "nova", motivo: null, podeGerir: false }).codigo,
    ).toBe("papel_insuficiente");
  });

  it("ignorar exige motivo com pelo menos 3 caracteres", () => {
    expect(
      validarTransicao({ de: "nova", para: "ignorada", motivo: "", podeGerir: true }).codigo,
    ).toBe("motivo_obrigatorio");
    expect(
      validarTransicao({ de: "nova", para: "ignorada", motivo: "ok", podeGerir: true }).codigo,
    ).toBe("motivo_obrigatorio");
    expect(
      validarTransicao({ de: "nova", para: "ignorada", motivo: "falso positivo", podeGerir: true })
        .ok,
    ).toBe(true);
  });

  it("recusa transição inexistente e no-op", () => {
    expect(
      validarTransicao({ de: "encerrada", para: "aprovada", motivo: null, podeGerir: true }).codigo,
    ).toBe("transicao_invalida");
    expect(
      validarTransicao({ de: "nova", para: "nova", motivo: null, podeGerir: true }).codigo,
    ).toBe("transicao_invalida");
    expect(
      validarTransicao({ de: "nova", para: "corrigida", motivo: null, podeGerir: true }).codigo,
    ).toBe("transicao_invalida");
  });

  it("campos: assumir atribui responsável; encerrar grava data; reabrir limpa", () => {
    const assumir = camposDaTransicao({
      de: "nova",
      para: "investigando",
      motivo: null,
      usuarioId: "u1",
      responsavelAtual: null,
      agoraIso: "2026-11-18T12:00:00.000Z",
    });
    expect(assumir.estado).toBe("investigando");
    expect(assumir.responsavel_user_id).toBe("u1");
    expect(assumir.encerrada_em).toBeNull();

    const encerrar = camposDaTransicao({
      de: "acao_necessaria",
      para: "encerrada",
      motivo: "resolvido",
      usuarioId: "u1",
      responsavelAtual: "u2",
      agoraIso: "2026-11-18T12:00:00.000Z",
    });
    expect(encerrar.encerrada_em).toBe("2026-11-18T12:00:00.000Z");
    expect(encerrar.motivo_encerramento).toBe("resolvido");

    const reabrir = camposDaTransicao({
      de: "encerrada",
      para: "nova",
      motivo: "voltou",
      usuarioId: "u1",
      responsavelAtual: "u2",
      agoraIso: "2026-11-18T12:00:00.000Z",
    });
    expect(reabrir.encerrada_em).toBeNull();
    expect(reabrir.motivo_encerramento).toBeNull();
  });

  it("ignorar guarda o motivo no campo próprio e não em motivo_encerramento", () => {
    const campos = camposDaTransicao({
      de: "nova",
      para: "ignorada",
      motivo: "falso positivo conhecido",
      usuarioId: "u1",
      responsavelAtual: null,
      agoraIso: "2026-11-18T12:00:00.000Z",
    });
    expect(campos.ignorada_motivo).toBe("falso positivo conhecido");
    expect(campos.motivo_encerramento).toBeNull();
  });
});
