/**
 * O STATUS DO PROSPECT SÓ ANDA PARA A FRENTE — E SÓ COM FATO.
 *
 * O defeito que este arquivo vigia, medido em 10/11/2026: 71 empresas
 * contatadas por campanha, 11 mensagens de clientes (10 contatos) e o card da
 * campanha em "0 respostas", porque `status_comercial` nunca saía de `novo` e
 * `contact_id` era nulo em todas — o funil do §28 não tinha de onde contar.
 *
 * Duas coisas aqui não são detalhe de implementação:
 *
 *   - o update de `contatado`/`respondeu` carrega a lista de status de ORIGEM.
 *     Sem ela, um envio de campanha ressuscitaria `sem_interesse` (quem já
 *     disse não) e `cliente` (quem já comprou) como "contatado";
 *   - o vínculo só preenche `contact_id` NULL. Sobrescrever juntaria duas
 *     empresas no mesmo contato quando o import já tinha ligado outra.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger";

import {
  marcarComoContatado,
  marcarProspectComoRespondeu,
  vincularContatoAoProspect,
} from "@/lib/prospeccao/estado-do-prospect";

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const ORG = "22222222-2222-4222-8222-222222222222";
const PROSPECT = "33333333-3333-4333-8333-333333333333";
const CONTATO = "66666666-6666-4666-8666-666666666666";

interface Filtro {
  op: "eq" | "is" | "in";
  coluna: string;
  valor: unknown;
}

interface Update {
  tabela: string;
  valores: Record<string, unknown>;
  filtros: Filtro[];
}

function dbFalso(resposta: { data?: unknown[]; error?: { message: string } | null } = {}) {
  const updates: Update[] = [];
  function from(tabela: string) {
    const atual: Update = { tabela, valores: {}, filtros: [] };
    const resultado = { data: resposta.data ?? [], error: resposta.error ?? null };
    const api = {
      update(valores: Record<string, unknown>) {
        atual.valores = valores;
        updates.push(atual);
        return api;
      },
      eq(coluna: string, valor: unknown) {
        atual.filtros.push({ op: "eq", coluna, valor });
        return api;
      },
      is(coluna: string, valor: unknown) {
        atual.filtros.push({ op: "is", coluna, valor });
        return api;
      },
      in(coluna: string, valor: unknown) {
        atual.filtros.push({ op: "in", coluna, valor });
        return api;
      },
      select: async () => resultado,
      // As funções que NÃO pedem `.select()` são aguardadas na própria cadeia.
      then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
        Promise.resolve({ error: resultado.error }).then(ok, erro),
    };
    return api;
  }
  return { db: { from } as unknown as SupabaseClient, updates };
}

function filtro(update: Update, op: Filtro["op"], coluna: string): Filtro | undefined {
  return update.filtros.find((f) => f.op === op && f.coluna === coluna);
}

describe("estado do prospect", () => {
  beforeEach(() => {
    vi.mocked(logger.info).mockClear();
    vi.mocked(logger.warn).mockClear();
  });

  it("vincula o contato só quando o prospect ainda não tem um", async () => {
    const { db, updates } = dbFalso();
    await vincularContatoAoProspect(db, {
      organizationId: ORG,
      prospectId: PROSPECT,
      contactId: CONTATO,
    });

    expect(updates).toHaveLength(1);
    const [update] = updates;
    expect(update!.tabela).toBe("business_prospects");
    expect(update!.valores).toEqual({ contact_id: CONTATO });
    expect(filtro(update!, "eq", "id")).toEqual({ op: "eq", coluna: "id", valor: PROSPECT });
    // A condição que impede sobrescrever um vínculo já existente.
    expect(filtro(update!, "is", "contact_id")).toEqual({
      op: "is",
      coluna: "contact_id",
      valor: null,
    });
  });

  it("falha ao vincular não derruba o envio (só loga)", async () => {
    const { db } = dbFalso({ error: { message: "conexão caiu" } });
    await expect(
      vincularContatoAoProspect(db, {
        organizationId: ORG,
        prospectId: PROSPECT,
        contactId: CONTATO,
      }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("envio aceito marca contatado — mas nunca por cima de sem_interesse/cliente", async () => {
    const { db, updates } = dbFalso();
    await marcarComoContatado(db, { organizationId: ORG, prospectId: PROSPECT });

    const [update] = updates;
    expect(update!.valores).toEqual({ status_comercial: "contatado" });
    expect(filtro(update!, "in", "status_comercial")).toEqual({
      op: "in",
      coluna: "status_comercial",
      valor: ["novo", "nao_analisado", "contato_pendente"],
    });
  });

  it("resposta do contato marca respondeu e loga os prospects tocados", async () => {
    const { db, updates } = dbFalso({ data: [{ id: PROSPECT }] });
    await marcarProspectComoRespondeu(db, { organizationId: ORG, contactId: CONTATO });

    const [update] = updates;
    expect(update!.valores).toEqual({ status_comercial: "respondeu" });
    expect(filtro(update!, "eq", "contact_id")).toEqual({
      op: "eq",
      coluna: "contact_id",
      valor: CONTATO,
    });
    expect(filtro(update!, "in", "status_comercial")).toEqual({
      op: "in",
      coluna: "status_comercial",
      valor: ["novo", "nao_analisado", "contato_pendente", "contatado"],
    });
    expect(logger.info).toHaveBeenCalledWith(
      "pos-entrada: prospect marcado como respondeu",
      expect.objectContaining({ prospect_ids: [PROSPECT] }),
    );
  });

  it("conversa de quem nunca foi prospect não vira log de nada", async () => {
    const { db } = dbFalso({ data: [] });
    await marcarProspectComoRespondeu(db, { organizationId: ORG, contactId: CONTATO });
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
