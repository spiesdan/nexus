/**
 * A INGESTÃO GRAVA A CATEGORIA EFETIVA — não só o rótulo cru.
 *
 * O defeito que este teste prende: uma cafeteria classificada pelo Google como
 * "Gas station" entrava na base com `categoria_canonica` nula. A tela mostrava
 * "Posto de combustível" na faceta e o filtro a devolvia como posto até alguém
 * rodar um backfill. A linha NOVA tem que nascer com a mesma decisão da linha
 * antiga.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { importarNegociosDeArquivo } from "./motor";
import type { NegocioDescoberto } from "./tipos";

function adminFalso() {
  const inseridos: Array<Record<string, unknown>> = [];

  function builder() {
    const q: Record<string, unknown> = {};
    const volta = () => q;
    q.select = volta;
    q.eq = volta;
    q.in = volta;
    q.or = volta;
    q.limit = volta;
    q.order = volta;
    q.insert = (payload: Record<string, unknown>) => {
      inseridos.push(payload);
      return q;
    };
    q.single = () => Promise.resolve({ data: { id: `p-${inseridos.length}` }, error: null });
    q.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(onF, onR);
    return q;
  }

  return {
    from: () => builder(),
    inseridos,
  } as unknown as SupabaseClient & { inseridos: Array<Record<string, unknown>> };
}

function negocio(over: Partial<NegocioDescoberto> = {}): NegocioDescoberto {
  return {
    idExterno: null,
    nome: "Estação Café",
    categoriaPrincipal: "Gas station",
    categoriasSecundarias: ["Gas station"],
    telefone: null,
    website: null,
    email: null,
    endereco: "Rua A, 1 - Centro, Videira - SC",
    bairro: "Centro",
    cidade: "Videira",
    estado: "SC",
    cep: null,
    pais: "BR",
    latitude: null,
    longitude: null,
    urlExterna: null,
    nota: null,
    totalAvaliacoes: 0,
    horarioFuncionamento: null,
    ...over,
  };
}

describe("importação de arquivo — categoria efetiva desde a inserção", () => {
  it("café dentro de posto nasce como Café, não como Posto", async () => {
    const admin = adminFalso();
    await importarNegociosDeArquivo(admin, "org-1", "posto de combustível", [negocio()]);
    expect(admin.inseridos).toHaveLength(1);
    expect(admin.inseridos[0]).toMatchObject({
      categoria: "Gas station",
      categoria_canonica: "Café",
      categoria_revisar: false,
    });
  });

  it("nome sem sinal positivo nasce em revisão e sem canônica chutada", async () => {
    const admin = adminFalso();
    await importarNegociosDeArquivo(admin, "org-1", "posto de combustível", [
      negocio({ nome: "Branca" }),
    ]);
    expect(admin.inseridos[0]).toMatchObject({
      categoria: "Gas station",
      categoria_canonica: null,
      categoria_revisar: true,
    });
  });

  it("a categoria principal do provider manda sobre o termo da busca", async () => {
    const admin = adminFalso();
    await importarNegociosDeArquivo(admin, "org-1", "posto de combustível", [
      negocio({ nome: "Auto Posto Ipiranga", categoriaPrincipal: "Gas station" }),
    ]);
    expect(admin.inseridos[0]!.categoria).toBe("Gas station");
  });
});
