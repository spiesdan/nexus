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

function adminFalso(rpc: Rpc) {
  return { rpc } as unknown as Parameters<typeof reservarNumeroDaNota>[0];
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
  it("devolve true só quando o banco confirma que a faixa voltou", async () => {
    const admin = adminFalso(async (fn, args) => {
      expect(fn).toBe("fn_devolver_numero_nfe");
      expect(args).toEqual({ p_organization_id: "org-1", p_numero: 1942 });
      return { data: true, error: null };
    });
    await expect(devolverNumeroDaNota(admin, "org-1", 1942)).resolves.toBe(true);
  });

  it("número já seguido por outro não volta (false, sem exceção)", async () => {
    const admin = adminFalso(async () => ({ data: false, error: null }));
    await expect(devolverNumeroDaNota(admin, "org-1", 1942)).resolves.toBe(false);
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
