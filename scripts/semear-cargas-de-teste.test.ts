import { describe, expect, it } from "vitest";

import { CARGAS, ehAmbienteLocal } from "./semear-cargas-de-teste";

/**
 * O SCRIPT DE CARGAS DE TESTE NUNCA PODE ESCREVER EM PRODUÇÃO.
 *
 * `scripts/semear-cargas-de-teste.ts` cria contatos, pedidos, cargas e destinos.
 * Um `SUPABASE_URL` herdado do ambiente de desenvolvimento (que neste repo
 * aponta para a VPS do cliente) transformaria "dado fake para testar" em lixo no
 * banco real — e ninguém perceberia, porque o script termina dizendo "pronto".
 *
 * A única defesa é esta: a URL é conferida antes da primeira escrita.
 */
describe("semear-cargas-de-teste — guarda-corpo de ambiente", () => {
  it("aceita só endereço local", () => {
    expect(ehAmbienteLocal("http://127.0.0.1:54321")).toBe(true);
    expect(ehAmbienteLocal("http://localhost:54321")).toBe(true);
    expect(ehAmbienteLocal("https://crm.billhigiene.tech")).toBe(false);
    expect(ehAmbienteLocal("https://rrydmwnporysaiysiztn.supabase.co")).toBe(false);
    expect(ehAmbienteLocal("não é url")).toBe(false);
  });

  it("as três cargas cobrem os três regimes de geocodificação", () => {
    expect(CARGAS).toHaveLength(3);
    // Cada carga tem pelo menos 3 paradas — uma rota de 2 não testa ordem.
    for (const carga of CARGAS) expect(carga.paradas.length).toBeGreaterThanOrEqual(3);
    // Pelo menos uma carga atravessa estado: o veto geográfico e a rota entre
    // UFs é justamente o que o PED-19566 quebrou.
    expect(CARGAS.some((c) => new Set(c.paradas.map((p) => p.uf)).size > 1)).toBe(true);
  });

  it("toda parada tem endereço completo — a carga exige pino de NÚMERO", () => {
    // O script aborta se alguma parada não sair com precisão de casa. Isso só
    // é possível porque todos estes endereços existem no OSM com número; o
    // teste trava o contrato das fixtures para ninguém trocar por "Rua X, 500".
    for (const p of CARGAS.flatMap((c) => c.paradas)) {
      expect(p.numero).toMatch(/^\d+$/);
      expect(p.rua.length).toBeGreaterThan(5);
      expect(p.cep).toMatch(/^\d{8}$/);
      expect(p.cidade.length).toBeGreaterThan(2);
      expect(["PR", "SC"]).toContain(p.uf);
    }
    // O endereço plausível-inventado de 2026-11-14 (rodovia sem nó no OSM) não
    // volta: ele caía no centro do bairro e foi o que motivou esta revisão.
    expect(CARGAS.flatMap((c) => c.paradas).some((p) => /BR[-\s]?476/i.test(p.rua))).toBe(false);
  });

  it("nenhuma parada usa endereço com nó DUPLICADO no OSM", () => {
    // Medido em 2026-11-15: Mafra tem dois nós 484 na Rua Marechal Deodoro,
    // Paula Freitas dois nós 80 na Rua Gustavo Schuartz e União da Vitória dois
    // nós 490 na Avenida Interventor Manoel Ribas. O geocodificador acerta um
    // deles e o pino fica a 79 m / 290 m / 1.043 m do outro — dado ambíguo, não
    // defeito de código. Carga de QA não pode depender de sorte de desempate.
    const ambiguos = [
      /^Rua Marechal Deodoro\|484$/, // Mafra
      /^Rua Gustavo Schuartz\|80$/, // Paula Freitas
      /^Avenida Interventor Manoel Ribas\|490$/, // União da Vitória
    ];
    const assinatura = (p: { rua: string; numero: string | null }) =>
      `${p.rua}|${p.numero ?? ""}`;
    for (const carga of CARGAS) {
      for (const p of carga.paradas) {
        expect(ambiguos.some((re) => re.test(assinatura(p))), `${assinatura(p)} tem nó duplicado no OSM`).toBe(false);
      }
      // Duas paradas na mesma rua e no mesmo número colapsariam no mesmo pino.
      const chaves = carga.paradas.map(assinatura);
      expect(new Set(chaves).size).toBe(chaves.length);
    }
  });

  it("todo cliente e motorista nasce marcado como teste", () => {
    // O prefixo é o que permite ao próprio script apagar as fixtures anteriores
    // sem tocar em dado de verdade.
    for (const carga of CARGAS) {
      expect(carga.motorista).toContain("TESTE");
      for (const p of carga.paradas) expect(p.cliente).not.toContain("TESTE");
    }
  });
});
