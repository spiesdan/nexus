/**
 * O "Emitido por" da tela de Pedidos.
 *
 * O que se mede: o nome vem de `created_by` (quem criou), cai para o
 * vendedor quando o criador é desconhecido, e vira `null` — nunca UUID —
 * quando não há nome a resolver. Rede: o lookup de nome é mockado; o custo
 * de HTTP por id é assunto de `nome-do-atendente`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";

import { comNomeDoEmitente } from "./emitente";

vi.mock("@/lib/users/nome-do-atendente", () => ({
  nomesDosAtendentes: vi.fn(),
}));

const nomes = vi.mocked(nomesDosAtendentes);

describe("comNomeDoEmitente", () => {
  beforeEach(() => {
    nomes.mockReset();
    nomes.mockImplementation(async (ids) => {
      const unicos = (ids ?? []).filter((id): id is string => Boolean(id));
      return new Map<string, string | null>(unicos.map((id) => [id, id === "u-daniel" ? "Daniel" : "Ana"]));
    });
  });

  it("nomeia quem criou o pedido", async () => {
    const linhas = await comNomeDoEmitente([
      { created_by: "u-daniel", vendedor_user_id: null, numero: 18558 },
      { created_by: "u-ana", vendedor_user_id: null, numero: 18559 },
    ]);
    expect(linhas.map((l) => l.emitente_nome)).toEqual(["Daniel", "Ana"]);
    // Uma leitura por página, ids deduplicados — não uma por linha.
    expect(nomes).toHaveBeenCalledTimes(1);
    expect(nomes.mock.calls[0]?.[0]).toEqual(["u-daniel", "u-ana"]);
  });

  it("sem criador conhecido, cai no vendedor do pedido", async () => {
    const linhas = await comNomeDoEmitente([{ created_by: null, vendedor_user_id: "u-ana" }]);
    expect(linhas[0]?.emitente_nome).toBe("Ana");
  });

  it("sem nome a resolver, devolve null (a tela cai no badge de origem)", async () => {
    nomes.mockResolvedValue(new Map());
    const linhas = await comNomeDoEmitente([{ created_by: null, vendedor_user_id: null }]);
    expect(linhas[0]?.emitente_nome).toBeNull();
  });

  it("sem linhas nem sequer consulta o GoTrue", async () => {
    expect(await comNomeDoEmitente([])).toEqual([]);
    expect(nomes).not.toHaveBeenCalled();
  });

  it("preserva as colunas originais (a lista vira PedidoComercial)", async () => {
    const linhas = await comNomeDoEmitente([
      { created_by: "u-daniel", vendedor_user_id: null, numero: 18558, status: "faturado" },
    ]);
    expect(linhas[0]).toMatchObject({ numero: 18558, status: "faturado", emitente_nome: "Daniel" });
  });
});
