import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  autorizacaoPodeSubstituir,
  notaPodeSerTransmitida,
  processarJob,
} from "./drain";

/**
 * A NOTA AUTORIZADA NÃO PODE SER TRANSMITIDA DE NOVO.
 *
 * Medido em 16/11/2026: o pedido 19631 recebeu DUAS NF-e autorizadas — 4641
 * (18:40, protocolo 242260552859580) e 4642 (18:44, protocolo 242260552871224).
 * A segunda transmissão sobrescreveu número, chave e XML da linha, e a 4641
 * sumiu da tela mesmo existindo no fisco.
 *
 * A trava tem três perguntas, testadas aqui:
 *
 *  1. `notaPodeSerTransmitida`: status `em_emissao` E sem `chave_acesso`;
 *  2. `autorizacaoPodeSubstituir`: chave diferente nunca substitui a gravada;
 *  3. `processarJob`: nota que já tem chave encerra o job sem ir à SEFAZ.
 */

function notaAutorizada(extra: Record<string, unknown> = {}) {
  return {
    id: "nota-1",
    organization_id: "org-1",
    order_id: "pedido-1",
    serie: "1",
    status: "em_emissao",
    provedor: "spednfe",
    numero: 4641,
    chave_acesso: "42261135233142000183550010000046411361083248",
    created_at: "2026-11-16T18:40:00.000Z",
    extras_fiscais: null,
    ...extra,
  };
}

/**
 * Admin falso mínimo para o caminho de guarda: o claim do job e a leitura da
 * nota. `processarJob` retorna antes de qualquer consulta de configuração.
 */
function adminFalso(nota: Record<string, unknown> | null): SupabaseClient {
  const encadeavel = (tabela: string) => {
    let acao = "select";
    const alvo = {
      update: () => {
        acao = "update";
        return alvo;
      },
      select: () => alvo,
      eq: () => alvo,
      maybeSingle: async () => ({ data: nota, error: null }),
      then: (ok: (v: unknown) => unknown) =>
        Promise.resolve({
          data: acao === "update" && tabela === "fiscal_jobs" ? [{ id: "job-1" }] : null,
          error: null,
        }).then(ok),
    };
    return alvo;
  };
  return { from: (tabela: string) => encadeavel(tabela) } as unknown as SupabaseClient;
}

describe("notaPodeSerTransmitida", () => {
  it("nota em emissão e sem chave pode ir para a SEFAZ", () => {
    expect(notaPodeSerTransmitida({ status: "em_emissao", chave_acesso: null })).toBe(true);
  });

  it("nota com chave já está autorizada — não se transmite de novo", () => {
    expect(
      notaPodeSerTransmitida({ status: "em_emissao", chave_acesso: notaAutorizada().chave_acesso }),
    ).toBe(false);
  });

  it("status terminal também barra", () => {
    for (const status of ["autorizada", "denegada", "cancelada", "erro", "pendente"]) {
      expect(notaPodeSerTransmitida({ status, chave_acesso: null })).toBe(false);
    }
    expect(notaPodeSerTransmitida(null)).toBe(false);
  });
});

describe("autorizacaoPodeSubstituir", () => {
  it("linha sem chave aceita a primeira autorização", () => {
    expect(autorizacaoPodeSubstituir({ chave_acesso: null }, "chave-1")).toBe(true);
  });

  it("a MESMA chave pode ser regravada (replay da resposta)", () => {
    expect(autorizacaoPodeSubstituir({ chave_acesso: "chave-1" }, "chave-1")).toBe(true);
  });

  it("chave diferente não substitui a autorização gravada", () => {
    expect(autorizacaoPodeSubstituir({ chave_acesso: "chave-4641" }, "chave-4642")).toBe(false);
  });

  it("resultado sem chave não é autorização", () => {
    expect(autorizacaoPodeSubstituir({ chave_acesso: "chave-1" }, null)).toBe(true);
  });
});

describe("processarJob", () => {
  it("job de nota já autorizada encerra sem transmitir", async () => {
    const r = await processarJob(adminFalso(notaAutorizada()), {
      id: "job-1",
      organization_id: "org-1",
      invoice_id: "nota-1",
      tentativas: 0,
      max_tentativas: 5,
    });

    expect(r).toEqual({ saidas: "ignorado", motivo: "nota fora de emissão" });
  });

  it("job de nota cancelada também é ignorado", async () => {
    const r = await processarJob(adminFalso(notaAutorizada({ status: "cancelada", chave_acesso: null })), {
      id: "job-1",
      organization_id: "org-1",
      invoice_id: "nota-1",
      tentativas: 0,
      max_tentativas: 5,
    });

    expect(r).toEqual({ saidas: "ignorado", motivo: "nota fora de emissão" });
  });
});
