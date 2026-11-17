import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { buscarCnpj } from "@/lib/brasil/cnpj";
import type * as ModuloCnpj from "@/lib/brasil/cnpj";
import { GET } from "@/app/api/v1/fiscal/cadastro-do-cnpj/route";

/**
 * A ROTA QUE ALIMENTA A CORREÇÃO AUTOMÁTICA.
 *
 * Ela junta duas fontes que antes não se falavam: a Receita (BrasilAPI, para
 * endereço e razão social) e o cadastro estadual (`publica.cnpj.ws`, para IE).
 * O contrato importa porque a tela monta o plano a partir dele: `ie` é **só a
 * da UF pedida**, e `ufs_com_inscricao` existe para explicar quando não há.
 */
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/brasil/cnpj", async () => {
  const real = await vi.importActual<typeof ModuloCnpj>("@/lib/brasil/cnpj");
  return { ...real, buscarCnpj: vi.fn() };
});

const ORG = "22222222-2222-4222-8222-222222222222";

function autorizado() {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "ana@example.com",
      full_name: "Ana",
      avatar_url: null,
      is_platform_admin: false,
      idioma: "pt-BR",
      organizations: [{ organization_id: ORG, organization_name: "Org", role: "agent" }],
    },
    org: { orgId: ORG, name: "Org", role: "agent" },
  } as never);
}

function negado() {
  vi.mocked(requireRole).mockResolvedValue({
    ok: false,
    response: fail("forbidden_role", "Requer role >= agent.", 403, {}),
  } as never);
}

const EMPRESA = {
  cnpj: "11222333000181",
  razao_social: "EMPRESA EXEMPLO LTDA",
  nome_fantasia: "EXEMPLO",
  email: null,
  telefone: null,
  logradouro: "AVENIDA PAULISTA",
  numero: "1000",
  bairro: "BELA VISTA",
  municipio: "SAO PAULO",
  uf: "SP",
  cep: "01310100",
  situacao: "ATIVA",
  inscricoes_estaduais: [
    { ie: "111", uf: "RJ", ativo: false },
    { ie: "222", uf: "SP", ativo: true },
  ],
};

const pedido = (query: string) =>
  new NextRequest(`http://localhost/api/v1/fiscal/cadastro-do-cnpj?${query}`);

describe("GET /api/v1/fiscal/cadastro-do-cnpj", () => {
  it("sem permissão, não consulta a fonte", async () => {
    negado();
    const res = await GET(pedido("cnpj=11222333000181&uf=SP"));
    expect(res.status).toBe(403);
    expect(vi.mocked(buscarCnpj)).not.toHaveBeenCalled();
  });

  it("CNPJ inválido é 422 e não sai à rede", async () => {
    autorizado();
    vi.mocked(buscarCnpj).mockClear();
    const res = await GET(pedido("cnpj=123"));
    expect(res.status).toBe(422);
    expect(vi.mocked(buscarCnpj)).not.toHaveBeenCalled();
  });

  it("CNPJ não encontrado vira erro nomeado, não 500", async () => {
    autorizado();
    vi.mocked(buscarCnpj).mockResolvedValue({ ok: false, erro: "nao_encontrado" });
    const res = await GET(pedido("cnpj=11222333000181&uf=SP"));
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { message: string } };
    expect(corpo.error.message).toContain("não encontrado");
  });

  it("devolve a IE da UF pedida e a lista de UFs com IE", async () => {
    autorizado();
    vi.mocked(buscarCnpj).mockResolvedValue({ ok: true, empresa: EMPRESA });
    const res = await GET(pedido("cnpj=11222333000181&uf=SP"));
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      data: { ie: string | null; ufs_com_inscricao: string[]; logradouro: string };
    };
    // A IE de RJ está na lista, mas não é a resposta: só a da UF pedida serve.
    expect(corpo.data.ie).toBe("222");
    expect(corpo.data.ufs_com_inscricao).toEqual(["SP"]);
    expect(corpo.data.logradouro).toBe("AVENIDA PAULISTA");
  });

  it("UF sem IE devolve `ie: null` — a tela precisa saber que não há", async () => {
    autorizado();
    vi.mocked(buscarCnpj).mockResolvedValue({ ok: true, empresa: EMPRESA });
    const res = await GET(pedido("cnpj=11222333000181&uf=MG"));
    const corpo = (await res.json()) as { data: { ie: string | null } };
    expect(corpo.data.ie).toBeNull();
  });

  it("sem `uf`, usa a UF do próprio cadastro", async () => {
    autorizado();
    vi.mocked(buscarCnpj).mockResolvedValue({ ok: true, empresa: EMPRESA });
    const res = await GET(pedido("cnpj=11222333000181"));
    const corpo = (await res.json()) as { data: { ie: string | null } };
    expect(corpo.data.ie).toBe("222");
  });

  it("UF fora do formato é 422", async () => {
    autorizado();
    const res = await GET(pedido("cnpj=11222333000181&uf=SAO"));
    expect(res.status).toBe(422);
  });
});
