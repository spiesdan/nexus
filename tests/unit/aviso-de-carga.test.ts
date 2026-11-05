/**
 * O aviso de "saiu para entrega" — texto e saudação.
 *
 * O que se mede aqui é o CONTRATO do texto que o cliente lê: saudação pelo
 * relógio da organização, número do pedido e o fato que interessa. O jargão de
 * expedição (carga, separação, romaneio) não volta — foi o pedido do dono:
 * "está muito técnico esse aviso".
 */
import { describe, expect, it } from "vitest";

import { saudacao, textoDoAviso } from "@/lib/expedicao/aviso-de-carga";

const SP = "America/Sao_Paulo";

describe("saudacao", () => {
  it("dá bom dia das 5h às 11h59", () => {
    expect(saudacao(new Date("2026-11-05T08:00:00Z"), SP)).toBe("Bom dia"); // 05:00
    expect(saudacao(new Date("2026-11-05T11:00:00Z"), SP)).toBe("Bom dia"); // 08:00
    expect(saudacao(new Date("2026-11-05T14:59:00Z"), SP)).toBe("Bom dia"); // 11:59
  });

  it("dá boa tarde das 12h às 17h59", () => {
    expect(saudacao(new Date("2026-11-05T15:00:00Z"), SP)).toBe("Boa tarde"); // 12:00
    expect(saudacao(new Date("2026-11-05T20:59:00Z"), SP)).toBe("Boa tarde"); // 17:59
  });

  it("dá boa noite à noite e de madrugada", () => {
    expect(saudacao(new Date("2026-11-05T21:00:00Z"), SP)).toBe("Boa noite"); // 18:00
    expect(saudacao(new Date("2026-11-05T06:00:00Z"), SP)).toBe("Boa noite"); // 03:00
  });

  it("usa o fuso da organização, não o do servidor", () => {
    // 15:30 UTC = 12:30 em São Paulo (boa tarde) e 11:30 em Manaus (bom dia).
    const agora = new Date("2026-11-05T15:30:00Z");
    expect(saudacao(agora, SP)).toBe("Boa tarde");
    expect(saudacao(agora, "America/Manaus")).toBe("Bom dia");
  });
});

describe("textoDoAviso", () => {
  it("é comercial e curto: saudação, pedido e o fato", () => {
    expect(textoDoAviso(19391, "Boa tarde")).toBe(
      "Boa tarde! Seu pedido PED-19391 saiu para entrega. 🚚 " +
        "Em breve ele chega até você. Qualquer dúvida, é só responder por aqui.",
    );
  });

  it("não fala em carga, separação nem programação", () => {
    expect(textoDoAviso(7, "Bom dia")).not.toMatch(/carga|separad|programad|romaneio/i);
  });

  it("mantém o número do pedido com o zero à esquerda do formato PED-", () => {
    expect(textoDoAviso(7, "Bom dia")).toContain("PED-0007");
  });
});
