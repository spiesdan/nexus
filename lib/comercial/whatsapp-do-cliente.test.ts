import { describe, expect, it } from "vitest";

import { linkWhatsAppDoCliente } from "./whatsapp-do-cliente";

describe("link de WhatsApp para o cliente", () => {
  it("usa o telefone do cadastro em dígitos com DDI", () => {
    const r = linkWhatsAppDoCliente("+5547996751010", "PED-19733 — Cliente — R$ 10,00");
    expect(r.direto).toBe(true);
    expect(r.href).toContain("https://wa.me/5547996751010?text=");
    expect(r.digitos).toBe("5547996751010");
  });

  it("aceita telefone com máscara", () => {
    const r = linkWhatsAppDoCliente("(47) 99675-1010", "oi");
    expect(r.href).toContain("wa.me/47996751010");
    expect(r.direto).toBe(true);
  });

  it("sem telefone, abre o WhatsApp sem destino e diz que não foi direto", () => {
    for (const vazio of [null, undefined, "", "  "]) {
      const r = linkWhatsAppDoCliente(vazio, "oi");
      expect(r.direto).toBe(false);
      expect(r.href).toBe("https://wa.me/?text=oi");
    }
  });

  it("telefone curto demais não vira destino (evita abrir número errado)", () => {
    const r = linkWhatsAppDoCliente("1234", "oi");
    expect(r.direto).toBe(false);
  });
});
