/**
 * TELEFONE: a pessoa digita como fala; o banco guarda E.164.
 *
 * O schema exigia `+5511999998888` cru e recusava `47996751010` — que é como
 * todo mundo digita (reclamado em 25/11/2026). O E.164 é exigência do canal
 * (o WhatsApp casa por ele), não do operador.
 */
import { describe, expect, it } from "vitest";

import { contactCreateSchema } from "./contacts";

const comTelefone = (valor: unknown) =>
  contactCreateSchema.safeParse({ name: "Cliente Teste", phone_number: valor });

describe("telefone do contato", () => {
  it("aceita DDD + número sem máscara (o caso reclamado)", () => {
    const r = comTelefone("47996751010");
    expect(r.success).toBe(true);
    expect(r.success && r.data.phone_number).toBe("+5547996751010");
  });

  it("aceita máscara", () => {
    const r = comTelefone("(47) 99675-1010");
    expect(r.success && r.data.phone_number).toBe("+5547996751010");
  });

  it("aceita E.164 como antes (ninguém perde o hábito antigo)", () => {
    const r = comTelefone("+5547996751010");
    expect(r.success && r.data.phone_number).toBe("+5547996751010");
  });

  it("aceita 10 dígitos (fixo, sem o nono)", () => {
    const r = comTelefone("4736220197");
    expect(r.success).toBe(true);
    expect(r.success && r.data.phone_number).toMatch(/^\+5547/);
  });

  it("recusa lixo com mensagem que mostra o formato aceito", () => {
    const r = comTelefone("telefone do vizinho");
    expect(r.success).toBe(false);
    const msg = r.success ? "" : (r.error.issues[0]?.message ?? "");
    expect(msg).toContain("99675-1010");
  });

  it("vazio continua sendo sem telefone, não erro", () => {
    const r = comTelefone("");
    expect(r.success).toBe(true);
    expect(r.success && r.data.phone_number).toBeUndefined();
  });
});
