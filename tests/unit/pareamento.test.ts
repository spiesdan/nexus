/**
 * O CÓDIGO DE PAREAMENTO — o único dado que atravessa do navegador do admin
 * para o celular do vendedor.
 *
 * Erros aqui são caros e silenciosos: um código que não volta é "não pareou" no
 * celular, sem pista; aceitar URL arbitrária é mandar o pedido (e o token) para
 * outro host. Os casos abaixo cobrem o que o vendedor realmente faz: colar o
 * código inteiro, colar só o token quando a URL já está no aparelho, e colar
 * lixo (mensagem de erro do sistema, espaço, código truncado).
 */
import { describe, expect, it } from "vitest";

import {
  lerCodigoDePareamento,
  montarCodigoDePareamento,
} from "@/lib/offline/credencial";

const URL = "https://crm.exemplo.com.br";
const TOKEN = "nod_ab12cd34_segredo-com-under_e-hifen";

describe("código de pareamento", () => {
  it("ida e volta preserva URL e token", () => {
    const codigo = montarCodigoDePareamento(URL, TOKEN);
    expect(codigo.startsWith("NEXUS1.")).toBe(true);
    expect(lerCodigoDePareamento(codigo)).toEqual({ url: URL, token: TOKEN });
  });

  it("normaliza a barra final da URL", () => {
    const codigo = montarCodigoDePareamento(`${URL}/`, TOKEN);
    expect(lerCodigoDePareamento(codigo)?.url).toBe(URL);
  });

  it("token solto só vale se o aparelho já conhece a URL", () => {
    expect(lerCodigoDePareamento(TOKEN, URL)).toEqual({ url: URL, token: TOKEN });
    expect(lerCodigoDePareamento(TOKEN, null)).toBeNull();
    expect(lerCodigoDePareamento(TOKEN)).toBeNull();
  });

  it("recusa lixo em vez de parear com qualquer coisa", () => {
    expect(lerCodigoDePareamento("")).toBeNull();
    expect(lerCodigoDePareamento("   ")).toBeNull();
    expect(lerCodigoDePareamento("erro: copie o código")).toBeNull();
    // Prefixo certo, payload truncado.
    expect(lerCodigoDePareamento("NEXUS1.abc")).toBeNull();
    // Payload válido, mas URL não navegável.
    const semHttp = `NEXUS1.${btoa(JSON.stringify({ u: "javascript:alert(1)", t: TOKEN }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")}`;
    expect(lerCodigoDePareamento(semHttp)).toBeNull();
  });

  it("aceita só http(s) — o shell navega para essa URL", () => {
    const codigo = montarCodigoDePareamento("http://192.168.0.10:3000", TOKEN);
    expect(lerCodigoDePareamento(codigo)?.url).toBe("http://192.168.0.10:3000");
  });
});
