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
    // A armadilha do PED-19566 continua no fixture: rodovia sem número no OSM
    // e bairro genérico "centro" é o que fazia o pino ir para outro estado.
    const armadilha = CARGAS.flatMap((c) => c.paradas).find((p) => p.rua.includes("BR 476"));
    expect(armadilha?.cidade).toBe("Paula Freitas");
    expect(armadilha?.uf).toBe("PR");
    expect(armadilha?.bairro.toLowerCase()).toBe("centro");
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
