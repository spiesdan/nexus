import { describe, expect, it } from "vitest";

import {
  devolverNumeroDaNota,
  FALTA_NUMERACAO,
  falhouAntesDaSefaz,
  reservarNumeroDaNota,
} from "./numeracao";
import type { ResultadoDeEmissao } from "./provedor";

/**
 * O NÚMERO DA NOTA NÃO É O NÚMERO DO PEDIDO.
 *
 * O contador vive no banco (0291) e é reservado por `update ... returning` —
 * duas emissões simultâneas nunca recebem o mesmo número. Aqui ficam as três
 * decisões que o app toma em volta dele:
 *
 *  1. contador nulo = recusa nomeada, nunca um número inventado;
 *  2. falha local devolve o número (a sequência continua de onde parou);
 *  3. falha ambígua NÃO devolve — depois de enviar, reusar número duplica nota.
 */

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

/** Fila de operações registradas no "banco" falso. */
type Operacao = { tabela: string; acao: string; valores: Record<string, unknown>; filtros: [string, unknown][] };

/**
 * Admin falso que sustenta as duas metades da devolução: o `rpc` do contador e
 * o `update` da linha da nota. Sem a segunda, o teste não veria o defeito de
 * 04/11/2026 — número devolvido ao contador e ainda preso na nota.
 */
function adminFalso(rpc: Rpc, operacoes: Operacao[] = []) {
  const encadeavel = (tabela: string, acao: string, valores: Record<string, unknown> = {}) => {
    const op: Operacao = { tabela, acao, valores, filtros: [] };
    const alvo = {
      update: (v: Record<string, unknown>) => encadeavel(tabela, "update", v),
      eq: (coluna: string, valor: unknown) => {
        op.filtros.push([coluna, valor]);
        return alvo;
      },
      neq: (coluna: string, valor: unknown) => {
        op.filtros.push([`neq:${coluna}`, valor]);
        return alvo;
      },
      then: (ok: (v: unknown) => unknown) => {
        operacoes.push(op);
        return Promise.resolve({ data: null, error: null }).then(ok);
      },
    };
    return alvo;
  };
  return {
    rpc,
    from: (tabela: string) => encadeavel(tabela, "select"),
  } as unknown as Parameters<typeof reservarNumeroDaNota>[0];
}

function resultado(parcial: Partial<ResultadoDeEmissao>): ResultadoDeEmissao {
  return {
    status: "erro",
    erro: "motivo",
    numero: null,
    chave_acesso: null,
    xml: null,
    ...parcial,
  };
}

describe("reservarNumeroDaNota", () => {
  it("devolve o número que o banco reservou", async () => {
    const admin = adminFalso(async (fn, args) => {
      expect(fn).toBe("fn_reservar_numero_nfe");
      expect(args).toEqual({ p_organization_id: "org-1" });
      return { data: 1942, error: null };
    });
    await expect(reservarNumeroDaNota(admin, "org-1")).resolves.toEqual({ ok: true, numero: 1942 });
  });

  it("contador não configurado recusa com o caminho para resolver", async () => {
    const admin = adminFalso(async () => ({ data: null, error: null }));
    const r = await reservarNumeroDaNota(admin, "org-1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.falta).toBe(FALTA_NUMERACAO);
    expect(r.falta).toContain("Configuração fiscal");
  });

  it("resposta fora do contrato não vira número", async () => {
    const admin = adminFalso(async () => ({ data: 0, error: null }));
    await expect(reservarNumeroDaNota(admin, "org-1")).resolves.toEqual({
      ok: false,
      falta: FALTA_NUMERACAO,
    });
  });

  it("erro do banco é reportado, não engolido", async () => {
    const admin = adminFalso(async () => ({ data: null, error: { message: "sem permissão" } }));
    const r = await reservarNumeroDaNota(admin, "org-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.falta).toContain("sem permissão");
  });
});

describe("devolverNumeroDaNota", () => {
  it("devolve true só quando o banco confirma que a faixa voltou — e limpa o número da nota", async () => {
    const operacoes: Operacao[] = [];
    const admin = adminFalso(async (fn, args) => {
      expect(fn).toBe("fn_devolver_numero_nfe");
      expect(args).toEqual({ p_organization_id: "org-1", p_numero: 1942 });
      return { data: true, error: null };
    }, operacoes);

    await expect(devolverNumeroDaNota(admin, "org-1", 1942, "nota-1")).resolves.toBe(true);

    // ─── A SEGUNDA METADE, E O DEFEITO QUE ELA CONSERTA ────────────────────
    //
    // Em 04/11/2026 a devolução desfez só o contador. A nota continuou com
    // `numero = 1942`, a emissão seguinte reservou o mesmo número, a SEFAZ
    // autorizou e o UPDATE final morreu no índice único — a nota autorizada
    // ficou invisível. Aqui as duas metades têm de acontecer juntas.
    const limpeza = operacoes.find((o) => o.tabela === "invoices" && o.acao === "update");
    expect(limpeza, "a devolução não limpou o número da nota").toBeDefined();
    expect(limpeza!.valores).toMatchObject({ numero: null });
    expect(limpeza!.filtros).toContainEqual(["id", "nota-1"]);
    // Nunca limpa o número de nota AUTORIZADA: ali o número já foi para a SEFAZ.
    expect(limpeza!.filtros).toContainEqual(["neq:status", "autorizada"]);
  });

  it("número já seguido por outro não volta — e a nota mantém o número", async () => {
    const operacoes: Operacao[] = [];
    const admin = adminFalso(async () => ({ data: false, error: null }), operacoes);
    await expect(devolverNumeroDaNota(admin, "org-1", 1942, "nota-1")).resolves.toBe(false);
    expect(operacoes.filter((o) => o.tabela === "invoices")).toHaveLength(0);
  });

  it("erro do banco na devolução também não limpa a nota", async () => {
    const operacoes: Operacao[] = [];
    const admin = adminFalso(async () => ({ data: null, error: { message: "sem permissão" } }), operacoes);
    await expect(devolverNumeroDaNota(admin, "org-1", 1942, "nota-1")).resolves.toBe(false);
    expect(operacoes.filter((o) => o.tabela === "invoices")).toHaveLength(0);
  });
});

describe("falhouAntesDaSefaz", () => {
  it("validação, certificado e XML nunca chegaram à SEFAZ", () => {
    for (const codigo of ["VALIDACAO", "CERT_NAO_LIDO", "XML_INVALIDO", "CONFIG_INVALIDA"]) {
      expect(falhouAntesDaSefaz(resultado({ sefaz_cstat: codigo }))).toBe(true);
    }
    // A montagem do payload recusa com "Falta X" — e o sidecar nem é chamado.
    expect(falhouAntesDaSefaz(resultado({ erro: 'Falta NCM do produto "X".' }))).toBe(true);
  });

  it("rejeição da SEFAZ consome o número — reusar duplicaria nota", () => {
    expect(falhouAntesDaSefaz(resultado({ sefaz_cstat: "SEFAZ_539" }))).toBe(false);
    expect(falhouAntesDaSefaz(resultado({ sefaz_cstat: "LOTE_RECEBIDO" }))).toBe(false);
  });

  it("timeout e resposta ilegível são ambíguos: não devolve", () => {
    expect(falhouAntesDaSefaz(resultado({ erro: "Sidecar fiscal tempo esgotado (120s)." }))).toBe(false);
    expect(falhouAntesDaSefaz(resultado({ sefaz_cstat: "EXCECAO" }))).toBe(false);
    expect(falhouAntesDaSefaz(resultado({ sefaz_cstat: "RESPOSTA_ILEGIVEL" }))).toBe(false);
  });

  it("nota autorizada nunca devolve número", () => {
    expect(falhouAntesDaSefaz(resultado({ status: "autorizada", sefaz_cstat: "100" }))).toBe(false);
  });
});
