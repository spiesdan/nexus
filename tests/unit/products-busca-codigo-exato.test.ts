/**
 * `GET /api/v1/products?busca=` — O CÓDIGO BIPADO NÃO PODE SER CORTADO PELO `limit`.
 *
 * A busca do editor de pedidos é substring (`ilike` em nome/código/marca) e vem
 * limitada a 12 linhas. Num catálogo grande, o produto do EAN bipado é só mais
 * um acerto de `ilike`, ordenado por `nome` — e pode ficar fora das 12. A tela
 * então diria "nenhum produto encontrado" para um produto que existe, e o
 * vendedor cadastraria de novo (duplicando o catálogo).
 *
 * A rota faz uma leitura por chave (`.eq("codigo")`, índice único
 * `(organization_id, codigo)`) e devolve a linha exata na frente. O teste
 * prende as três coisas que fazem isso funcionar: a linha vem primeiro, não
 * duplica, e a leitura é filtrada pela organização (nada de código de outro
 * tenant entrando na lista).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA_ORG = "22222222-2222-4222-8222-222222222222";
const CODIGO = "7891234567895";

interface Linha {
  id: string;
  organization_id: string;
  codigo: string;
  nome: string;
  ativo: boolean;
}

function produto(over: Partial<Linha> & { id: string; codigo: string }): Linha {
  return { organization_id: ORG, nome: `Produto ${over.codigo}`, ativo: true, ...over };
}

/**
 * Dublê que aplica os filtros como o PostgREST: `.eq()` acumula e o
 * `maybeSingle` filtra de verdade. Devolver a linha sem olhar os filtros faria
 * o teste de isolamento passar com a rota não filtrando nada.
 */
function banco(linhas: Linha[]) {
  const leiturasExatas: Record<string, unknown>[] = [];
  let chamadas = 0;

  function cadeia() {
    const filtros: Record<string, unknown> = {};
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = (col: string, valor: unknown) => {
      filtros[col] = valor;
      return c;
    };
    c.or = () => c;
    c.order = () => c;
    // A listagem também filtra pelo que a rota pediu (org), como o PostgREST.
    c.limit = () =>
      Promise.resolve({
        data: linhas.filter((l) =>
          Object.entries(filtros).every(
            ([col, v]) => (l as unknown as Record<string, unknown>)[col] === v,
          ),
        ),
        error: null,
      });

    c.maybeSingle = () => {
      leiturasExatas.push({ ...filtros });
      const achado = linhas.find((l) =>
        Object.entries(filtros).every(
          ([col, v]) => (l as unknown as Record<string, unknown>)[col] === v,
        ),
      );
      return Promise.resolve({ data: achado ?? null, error: null });
    };
    return c;
  }

  vi.mocked(createClient).mockResolvedValue({
    from: () => {
      chamadas++;
      return cadeia();
    },
  } as never);

  return { leiturasExatas, chamadas: () => chamadas };
}

function sessao() {
  const user = { id: "user-1" } as AuthUser;
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK["viewer" as Role] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: "viewer" as Role } }
      : { ok: false, response: fail("forbidden_role", "x", 403, {}) },
  );
}

function get(querystring: string) {
  return new NextRequest(`http://x/api/v1/products${querystring}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao();
});

describe("GET /api/v1/products — código exato primeiro", () => {
  it("o produto do EAN vem na frente da lista, sem duplicar", async () => {
    // A "multidão": 12 produtos cujo nome ordena antes do produto bipado.
    const multidao = Array.from({ length: 12 }, (_, i) =>
      produto({ id: `m-${i}`, codigo: `AGUA-${i}`, nome: `Água ${i}` }),
    );
    const exato = produto({ id: "p-ean", codigo: CODIGO, nome: "Zzz sanitária 5 L" });
    banco([...multidao, exato]);
    const { GET } = await import("@/app/api/v1/products/route");

    const res = await GET(get(`?busca=${CODIGO}&limite=12`));
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: Linha[] };
    expect(corpo.data[0]?.id).toBe("p-ean");
    expect(corpo.data.filter((l) => l.id === "p-ean")).toHaveLength(1);
  });

  it("a leitura exata filtra pela organização", async () => {
    // Mesmo código em outra org: sem o `.eq("organization_id")`, o editor
    // mostraria o produto de outro cliente como se fosse da loja.
    const alheio = produto({ id: "p-alheio", codigo: CODIGO, organization_id: OUTRA_ORG });
    const { leiturasExatas } = banco([alheio]);
    const { GET } = await import("@/app/api/v1/products/route");

    const res = await GET(get(`?busca=${CODIGO}`));
    const corpo = (await res.json()) as { data: Linha[] };

    expect(leiturasExatas[0]).toMatchObject({ organization_id: ORG, codigo: CODIGO });
    // O dublê aplica o filtro: a linha da outra org não é encontrada.
    expect(corpo.data.some((l) => l.id === "p-alheio")).toBe(false);
  });

  it("busca vazia não faz leitura extra por chave", async () => {
    const { leiturasExatas, chamadas } = banco([]);
    const { GET } = await import("@/app/api/v1/products/route");

    const res = await GET(get(""));
    expect(res.status).toBe(200);
    expect(leiturasExatas).toHaveLength(0);
    expect(chamadas()).toBe(1);
  });
});
