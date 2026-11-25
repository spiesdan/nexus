/**
 * MESMO CNPJ, DUAS FICHAS — a duplicata que para nota.
 *
 * Caso real, 25/11/2026: pedido 19733 apontava para a ficha de
 * `ACOMINA SOLUCOES EM MINERACAO LTDA` **sem IE**; a outra ficha do mesmo CNPJ
 * tinha a IE desde 23/11 e o CNPJ tem IE ativa em SC. A SEFAZ recusou com
 * `232 — IE do destinatário não informada`.
 *
 * A view irmã (`sentinel_contatos_duplicados`) agrupa por e-mail e não via
 * isso. A regra não funde ficha nenhuma: duas fichas do mesmo CNPJ só viram
 * achado, com a informação que decide a urgência — se as IEs divergem.
 */
import { describe, expect, it } from "vitest";

import { clientesDuplicadosPorCnpj } from "./regras-operacao";
import { snapshot } from "./teste-fixtures";

describe("operacao.cliente_duplicado_cnpj", () => {
  it("IE divergente é severidade alta e o resumo explica a rejeição 232", () => {
    const [a] = clientesDuplicadosPorCnpj(
      snapshot({
        clientesDuplicadosCnpj: [
          {
            organization_id: "org",
            cnpj: "56424176000125",
            total: 2,
            ids: ["a", "b"],
            ies_distintas: 2,
            ufs_distintas: 1,
          },
        ],
      }),
    );
    expect(a).toMatchObject({
      regra: "operacao.cliente_duplicado_cnpj",
      severidade: "alta",
      entidadeTipo: "contacts",
    });
    expect(a!.resumo).toContain("232");
  });

  it("sem divergência de IE a severidade cai — o achado continua", () => {
    const [a] = clientesDuplicadosPorCnpj(
      snapshot({
        clientesDuplicadosCnpj: [
          {
            organization_id: "org",
            cnpj: "11222333000181",
            total: 3,
            ids: ["a", "b", "c"],
            ies_distintas: 1,
            ufs_distintas: 1,
          },
        ],
      }),
    );
    expect(a!.severidade).toBe("media");
    expect(a!.titulo).toContain("3 fichas");
  });

  it("sem duplicata, sem achado — e nada é inventado", () => {
    expect(clientesDuplicadosPorCnpj(snapshot({ clientesDuplicadosCnpj: [] }))).toEqual([]);
  });
});
