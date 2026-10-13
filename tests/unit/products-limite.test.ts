/**
 * `GET /api/v1/products` — o teto de linhas e o parâmetro `limite`.
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ══════════════════════════════════════════
 *
 * O `.limit(500)` era um número solto no fim da cadeia. A instalação real tem
 * **635 produtos**, e o editor de itens do pedido precisa do catálogo inteiro
 * para o seletor: com 500 fixos, os produtos além do 500º **não apareceriam**,
 * sem erro e sem aviso — o usuário veria "esse produto não existe" e não teria
 * como saber que a lista foi cortada.
 *
 * Falha silenciosa é a pior das três, e nenhuma delas é aceitável num produto
 * que é vendido como código.
 *
 * ═══ O QUE ESTE TESTO TRAVA ══════════════════════════════════════════════
 *
 * Que o padrão é 500 (compatibilidade), que `limite` amplia e que números
 * absurdos não viram `NaN` no `.limit()` do Postgres — que lá é erro de
 * execução, não de validação.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";

/**
 * Banco dublado que **guarda o limite que a rota pediu** — é esse o que se
 * mede. Devolver linhas fixas faria o teste passar com qualquer `limit`.
 */
function bancoQueGuardaOLimite() {
  const capturados: number[] = [];
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    or: () => q,
    order: () => q,
    limit: (n: number) => {
      capturados.push(n);
      return Promise.resolve({ data: [], error: null });
    },
  };
  vi.mocked(createClient).mockReturnValue({ from: () => q } as never);
  return capturados;
}

function sessao(papel: Role = "viewer") {
  const user: AuthUser = {
    id: ANA,
    email: "ana@example.com",
    full_name: "Ana",
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG, organization_name: "Org", role: papel }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      // O `fail()` de verdade, e não um `Response` montado à mão: o dublê tem
      // que ter o MESMO formato do retorno real, senão o teste passaria com
      // uma assinatura que a rota nunca produz.
      : { ok: false, response: fail("forbidden_role", "papel insuficiente.", 403, {}) },
  );
}

function get(busca: string) {
  return new NextRequest(`http://x/api/v1/products${busca}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessao();
});

describe("GET /api/v1/products — teto de linhas", () => {
  it("sem `limite`, mantém 500 (comportamento anterior)", async () => {
    const capturados = bancoQueGuardaOLimite();
    const { GET } = await import("@/app/api/v1/products/route");
    const res = await GET(get(""));
    expect(res.status).toBe(200);
    expect(capturados).toEqual([500]);
  });

  it("`limite=2000` amplia — é o que o editor de itens pede", async () => {
    const capturados = bancoQueGuardaOLimite();
    const { GET } = await import("@/app/api/v1/products/route");
    await GET(get("?limite=2000"));
    expect(capturados).toEqual([2000]);
  });

  it("MUTAÇÃO: voltar ao 500 fixo reprova o editor com 635 produtos", async () => {
    // A guarda: se o teto voltar a ser constante, o editor perde 135 produtos
    // sem nenhum sinal — e este teste é o que impede.
    const capturados = bancoQueGuardaOLimite();
    const { GET } = await import("@/app/api/v1/products/route");
    await GET(get("?limite=2000"));
    expect(capturados[0]).toBeGreaterThan(500);
  });

  it("`limite` acima do teto é aparado, não obedecido às cegas", async () => {
    const capturados = bancoQueGuardaOLimite();
    const { GET } = await import("@/app/api/v1/products/route");
    await GET(get("?limite=999999"));
    expect(capturados).toEqual([2000]);
  });

  it("`limite=0` e negativo caem no piso de 1, não em 0", async () => {
    // `limit(0)` no Postgres devolve zero linhas — a tela ficaria vazia sem
    // erro. O piso de 1 é melhor que isso.
    const capturados = bancoQueGuardaOLimite();
    const { GET } = await import("@/app/api/v1/products/route");
    await GET(get("?limite=0"));
    expect(capturados).toEqual([1]);
  });

  it("`limite` não numérico volta ao padrão, e não vira NaN", async () => {
    const capturados = bancoQueGuardaOLimite();
    const { GET } = await import("@/app/api/v1/products/route");
    await GET(get("?limite=abc"));
    expect(capturados).toEqual([500]);
  });

  it("`busca` continua filtrando e não mexe no teto", async () => {
    const capturados = bancoQueGuardaOLimite();
    const { GET } = await import("@/app/api/v1/products/route");
    await GET(get("?busca=detergente&limite=2000"));
    expect(capturados).toEqual([2000]);
  });
});