/**
 * A VALIDAÇÃO DO MODELO POR CATEGORIA (0285).
 *
 * O caminho de erro importa mais que o de sucesso: um bind torto na borda vira
 * uma reserva queimada no tick. Aqui se cobra o que a rota não pode deixar
 * passar — categoria sem modelo, item incompleto e modelo ausente do espelho —
 * além do cache que evita 200 leituras para 200 categorias do mesmo modelo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { validarTemplatesDaCampanha } from "./validacao-da-campanha";

/** Supabase falso que só responde "esse modelo não está no espelho". */
function adminSemModelo() {
  const leituras: Array<{ tabela: string; name: string; language: string }> = [];
  const client = {
    from(tabela: string) {
      const filtros: Record<string, string> = {};
      const consulta = {
        select: () => consulta,
        eq: (coluna: string, valor: string) => {
          filtros[coluna] = valor;
          return consulta;
        },
        maybeSingle: async () => {
          leituras.push({
            tabela,
            name: filtros.name ?? "",
            language: filtros.language ?? "",
          });
          return { data: null, error: null };
        },
      };
      return consulta;
    },
  };
  return { admin: client as unknown as SupabaseClient, leituras };
}

const bind = (categoria: string, name = "modelo") => ({
  categoria,
  name,
  language: "pt_BR",
  contract_hash: `hash-${name}`,
  values: {},
});

describe("validarTemplatesDaCampanha", () => {
  it("bind incompleto recusa ANTES de tocar o banco, nomeando a categoria", async () => {
    const { admin, leituras } = adminSemModelo();
    const veredito = await validarTemplatesDaCampanha(
      admin,
      "org-1",
      [bind("Oficina", ""), bind("Posto")],
      { exigirCanal: false },
    );
    expect(veredito).toMatchObject({
      ok: false,
      codigo: "template_incompleto",
    });
    if (!veredito.ok) expect(veredito.erro).toContain('"Oficina"');
    expect(leituras).toHaveLength(0);
  });

  it("modelo ausente do espelho vira erro da categoria (não estoura com null)", async () => {
    const { admin } = adminSemModelo();
    const veredito = await validarTemplatesDaCampanha(admin, "org-1", [bind("Oficina")], {
      exigirCanal: false,
    });
    expect(veredito).toMatchObject({ ok: false, codigo: "template_invalido" });
    if (!veredito.ok) {
      expect(veredito.erro).toContain('"Oficina"');
      expect(veredito.erro).toContain("espelho");
    }
  });

  it("o espelho é lido UMA vez por (nome, idioma), não uma vez por categoria", async () => {
    const { admin, leituras } = adminSemModelo();
    const veredito = await validarTemplatesDaCampanha(
      admin,
      "org-1",
      [bind("Oficina"), bind("Posto"), bind("Borracharia")],
      { exigirCanal: false },
    );
    expect(veredito.ok).toBe(false);
    // Três categorias, o MESMO modelo: uma leitura só. Sem cache seriam três.
    expect(leituras).toEqual([{ tabela: "meta_templates", name: "modelo", language: "pt_BR" }]);
  });

  it("lista vazia é ok: campanha sem recorte usa o bind legado", async () => {
    const { admin, leituras } = adminSemModelo();
    const veredito = await validarTemplatesDaCampanha(admin, "org-1", [], { exigirCanal: true });
    expect(veredito).toEqual({ ok: true, templates: [] });
    expect(leituras).toHaveLength(0);
  });
});
