/**
 * A CREDENCIAL DO APARELHO — as duas funções que não podem errar.
 *
 * O resto da autenticação precisa de banco e é medido em `tests/invariants`
 * (RLS/cross-tenant) e no `test:db`. Aqui ficam as peças puras que, erradas,
 * quebram tudo em silêncio:
 *
 *  - o hash: se mudar de algoritmo ou de encoding, todo token emitido deixa
 *    de casar e o aparelho vira 401 permanente;
 *  - a leitura do header: se aceitar qualquer esquema, `Basic` ou um token
 *    colado na query viram credencial válida por acidente.
 */
import { describe, expect, it } from "vitest";

import {
  ESCOPO_CATALOGO,
  ESCOPOS_DO_DISPOSITIVO,
  ESCOPO_PEDIDOS,
  extrairBearerDoHeader,
  hashDoToken,
  PAPEIS_QUE_CAPTURAM,
  PREFIXO_DO_DISPOSITIVO,
} from "@/lib/auth/device-token";

describe("hash do token", () => {
  it("é sha256 em hex minúsculo — o formato que a coluna CHECK aceita", () => {
    const h = hashDoToken("nod_ab12cd34_segredo");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("é determinístico e distingue tokens parecidos", () => {
    expect(hashDoToken("nod_aaaa_1")).toBe(hashDoToken("nod_aaaa_1"));
    expect(hashDoToken("nod_aaaa_1")).not.toBe(hashDoToken("nod_aaaa_2"));
  });
});

describe("header Authorization", () => {
  it("aceita Bearer em qualquer caixa", () => {
    expect(extrairBearerDoHeader("Bearer nod_x")).toBe("nod_x");
    expect(extrairBearerDoHeader("bearer nod_x")).toBe("nod_x");
    expect(extrairBearerDoHeader("  BEARER   nod_x  ")).toBe("nod_x");
  });

  it("recusa outro esquema, vazio e ausente", () => {
    expect(extrairBearerDoHeader(null)).toBeNull();
    expect(extrairBearerDoHeader("")).toBeNull();
    expect(extrairBearerDoHeader("Basic nod_x")).toBeNull();
    expect(extrairBearerDoHeader("Bearer")).toBeNull();
    expect(extrairBearerDoHeader("Bearer a b")).toBeNull();
  });
});

describe("escopo e papéis", () => {
  it("o escopo é fechado nos dois que o shell usa", () => {
    expect([...ESCOPOS_DO_DISPOSITIVO]).toEqual([ESCOPO_PEDIDOS, ESCOPO_CATALOGO]);
    expect(PREFIXO_DO_DISPOSITIVO).toBe("nod_");
  });

  it("viewer não captura; vendedor/agent/manager/admin capturam", () => {
    expect(PAPEIS_QUE_CAPTURAM.has("viewer")).toBe(false);
    for (const papel of ["vendedor", "agent", "manager", "admin"]) {
      expect(PAPEIS_QUE_CAPTURAM.has(papel), papel).toBe(true);
    }
  });
});
