/**
 * O NÚMERO DA CAMPANHA — a escolha do operador, não um detalhe de transporte.
 *
 * O que este teste prende:
 *   1. a lista da tela só oferece número que ACEITA o tipo — o oficial fica de
 *      fora porque exige template (a resposta vem da matriz de capabilities,
 *      não de uma comparação de string com "waha");
 *   2. número parado/arquivado nem aparece: seria uma opção que o tick pausaria
 *      no primeiro minuto;
 *   3. a validação do escolhido é fail-closed e distingue os TRÊS motivos —
 *      cada um tem um conserto diferente na tela.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  listarNumerosDaCampanha,
  mensagemDoNumeroInvalido,
  validarNumeroDaCampanha,
} from "./numero-da-campanha";

interface SessaoDeTeste {
  id: string;
  organization_id?: string;
  display_name?: string | null;
  phone_number?: string | null;
  provider?: string | null;
  status?: string;
  archived_at?: string | null;
  created_at?: string;
}

/**
 * O mínimo do PostgREST que o módulo usa. Aplica os filtros `eq`/`is` de
 * verdade: é assim que o teste prova que a rota não oferece sessão parada.
 */
function fakeSupabase(sessoes: SessaoDeTeste[]) {
  function consulta() {
    const filtros: Array<{ col: string; val: unknown }> = [];
    const q: Record<string, unknown> = {};
    const volta = () => q;
    q.select = vi.fn(volta);
    q.eq = vi.fn((col: string, val: unknown) => {
      filtros.push({ col, val });
      return q;
    });
    q.is = vi.fn((col: string, val: unknown) => {
      filtros.push({ col, val });
      return q;
    });
    q.order = vi.fn(volta);
    q.maybeSingle = vi.fn(() => {
      const linhas = sessoes.filter((s) =>
        filtros.every((f) => (s as unknown as Record<string, unknown>)[f.col] === f.val),
      );
      return Promise.resolve({ data: linhas[0] ?? null, error: null });
    });
    q.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      const linhas = sessoes.filter((s) =>
        filtros.every((f) => (s as unknown as Record<string, unknown>)[f.col] === f.val),
      );
      return Promise.resolve({ data: linhas, error: null }).then(onF, onR);
    };
    return q;
  }
  return { from: vi.fn(() => consulta()) } as unknown as SupabaseClient;
}

const ORG = "org-1";

const sessao = (id: string, extra: Partial<SessaoDeTeste> = {}): SessaoDeTeste => ({
  id,
  organization_id: ORG,
  display_name: id,
  phone_number: "+5549999990000",
  provider: "waha",
  status: "WORKING",
  archived_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  ...extra,
});

describe("listarNumerosDaCampanha", () => {
  it("só devolve o que aceita TEXTO livre — o oficial exige template", async () => {
    const supabase = fakeSupabase([
      sessao("qr-1", { display_name: "Comercial", provider: "waha" }),
      sessao("oficial-1", { provider: "meta_cloud" }),
      sessao("zernio-1", { provider: "zernio" }),
    ]);

    const numeros = await listarNumerosDaCampanha(supabase, ORG, "texto");

    expect(numeros.map((n) => n.id)).toEqual(["qr-1"]);
    expect(numeros[0]).toEqual({
      id: "qr-1",
      rotulo: "Comercial",
      telefone: "+5549999990000",
    });
  });

  it("para TEMPLATE a régua se inverte: só o canal que exige modelo", async () => {
    const supabase = fakeSupabase([
      sessao("qr-1", { provider: "waha" }),
      sessao("oficial-1", { display_name: "Oficial", provider: "meta_cloud" }),
    ]);

    const numeros = await listarNumerosDaCampanha(supabase, ORG, "template");

    expect(numeros.map((n) => n.id)).toEqual(["oficial-1"]);
  });

  it("sessão parada ou arquivada não vira opção", async () => {
    const supabase = fakeSupabase([
      sessao("parada", { status: "STOPPED" }),
      sessao("arquivada", { archived_at: "2026-05-01T00:00:00.000Z" }),
      sessao("ok"),
    ]);

    const numeros = await listarNumerosDaCampanha(supabase, ORG, "texto");

    expect(numeros.map((n) => n.id)).toEqual(["ok"]);
  });

  it("sem nome, o rótulo cai no telefone — nunca em 'undefined'", async () => {
    const supabase = fakeSupabase([
      sessao("sem-nome", { display_name: null }),
      sessao("sem-nada", { display_name: "  ", phone_number: null }),
    ]);

    const numeros = await listarNumerosDaCampanha(supabase, ORG, "texto");

    expect(numeros[0]?.rotulo).toBe("+5549999990000");
    expect(numeros[1]?.rotulo).toBe("Número sem nome");
    expect(numeros[1]?.telefone).toBeNull();
  });
});

describe("validarNumeroDaCampanha", () => {
  it("aceita o número da organização que está WORKING e fala texto", async () => {
    const supabase = fakeSupabase([sessao("qr-1", { display_name: "Comercial" })]);
    const veredito = await validarNumeroDaCampanha(supabase, ORG, "qr-1", "texto");
    expect(veredito).toEqual({
      ok: true,
      numero: { id: "qr-1", rotulo: "Comercial", telefone: "+5549999990000" },
    });
  });

  it("número de outra organização é 'nao_encontrada' — o filtro é da consulta", async () => {
    const supabase = fakeSupabase([sessao("qr-1", { organization_id: "org-2" })]);
    const veredito = await validarNumeroDaCampanha(supabase, ORG, "qr-1", "texto");
    expect(veredito).toEqual({ ok: false, motivo: "nao_encontrada" });
  });

  it("parado ou arquivado é 'desconectado'", async () => {
    const parado = await validarNumeroDaCampanha(
      fakeSupabase([sessao("qr-1", { status: "STOPPED" })]),
      ORG,
      "qr-1",
      "texto",
    );
    expect(parado).toEqual({ ok: false, motivo: "desconectado" });

    const arquivado = await validarNumeroDaCampanha(
      fakeSupabase([sessao("qr-1", { archived_at: "2026-05-01T00:00:00.000Z" })]),
      ORG,
      "qr-1",
      "texto",
    );
    expect(arquivado).toEqual({ ok: false, motivo: "desconectado" });
  });

  it("oficial escolhido para campanha de texto é 'capability', não 'desconectado'", async () => {
    const veredito = await validarNumeroDaCampanha(
      fakeSupabase([sessao("oficial-1", { provider: "meta_cloud" })]),
      ORG,
      "oficial-1",
      "texto",
    );
    expect(veredito).toEqual({ ok: false, motivo: "capability" });
  });
});

describe("mensagemDoNumeroInvalido", () => {
  it("cada motivo diz o que consertar — e o de capability nomeia a saída", () => {
    expect(mensagemDoNumeroInvalido("nao_encontrada")).toContain("não está nesta organização");
    expect(mensagemDoNumeroInvalido("desconectado")).toContain("não está conectado");
    expect(mensagemDoNumeroInvalido("capability")).toContain("número por QR");
  });
});
