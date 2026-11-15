import { describe, expect, it } from "vitest";

import {
  FONTE_MANUAL,
  chaveDoEndereco,
  precisaDeEntrada,
  pinoEhDaPorta,
  situacaoDoNumero,
} from "./entradas";

describe("situacaoDoNumero", () => {
  it("número de casa tem dígito", () => {
    expect(situacaoDoNumero("484")).toBe("casa");
    expect(situacaoDoNumero(" 1230 ")).toBe("casa");
    expect(situacaoDoNumero("123-A")).toBe("casa");
  });

  it("S/N, S/N com espaço e vazio são sem número", () => {
    expect(situacaoDoNumero("S/N")).toBe("sem_numero");
    expect(situacaoDoNumero("SN")).toBe("sem_numero");
    expect(situacaoDoNumero("s/n")).toBe("sem_numero");
    expect(situacaoDoNumero("")).toBe("sem_numero");
    expect(situacaoDoNumero(null)).toBe("sem_numero");
    expect(situacaoDoNumero(undefined)).toBe("sem_numero");
    expect(situacaoDoNumero("sem numero")).toBe("sem_numero");
  });

  it("marco de km NÃO é sem número — numa rodovia ele é a localização", () => {
    expect(situacaoDoNumero("KM 12")).toBe("km");
    expect(situacaoDoNumero("km 12, sentido norte")).toBe("km");
  });

  it("'km' no meio de um número de casa não vira marco", () => {
    // "12 KM" é digitação de quem mora em rodovia, mas "120" é casa.
    expect(situacaoDoNumero("120")).toBe("casa");
  });
});

describe("chaveDoEndereco", () => {
  it("endereço vazio não tem chave — memória não existe para o nada", () => {
    expect(chaveDoEndereco("")).toBeNull();
    expect(chaveDoEndereco("   ")).toBeNull();
    expect(chaveDoEndereco(null)).toBeNull();
  });

  it("chave degenerada (só 'S/N', sem rua) não tem chave — memória de outro endereço é pior que nenhuma", () => {
    expect(chaveDoEndereco("S/N")).toBeNull();
    expect(chaveDoEndereco("SN")).toBeNull();
    expect(chaveDoEndereco("sem numero")).toBeNull();
    // Sem rua, mas COM bairro e cidade: a chave pareceria boa ("S N CENTRO
    // MAFRA SC") e duas entregas sem rua no mesmo bairro dividiriam a mesma
    // memória. Endereço começa pela rua; se começa pelo marcador, não é
    // endereço para lembrar.
    expect(chaveDoEndereco("S/N — Centro, Mafra/SC")).toBeNull();
    expect(chaveDoEndereco("Sem Numero — Centro, Mafra/SC")).toBeNull();
    // Mas "S/N" junto de rua é endereço de verdade.
    expect(chaveDoEndereco("Rua X, S/N, Centro")).toBe("RUA X S N CENTRO");
  });

  it("a mesma rua escrita de dois jeitos cai na mesma chave", () => {
    const a = chaveDoEndereco("Rua Marechal Deodoro, 484 — Centro, Mafra/SC");
    const b = chaveDoEndereco("rua marechal deodoro 484 centro mafra sc");
    expect(a).toBe(b);
  });

  it("acento e caixa não separam a memória do endereço", () => {
    expect(chaveDoEndereco("Rua São João, 10")).toBe(chaveDoEndereco("RUA SAO JOAO 10"));
  });

  it("CEP não é parte da identidade do endereço", () => {
    expect(chaveDoEndereco("Rua X, 100, Centro, Canoinhas - PR, 89460-000")).toBe(
      chaveDoEndereco("Rua X, 100, Centro, Canoinhas - PR"),
    );
  });

  it("ruas diferentes não colidem", () => {
    expect(chaveDoEndereco("Rua A, 10")).not.toBe(chaveDoEndereco("Rua B, 10"));
    expect(chaveDoEndereco("Rua A, 10")).not.toBe(chaveDoEndereco("Rua A, 100"));
  });

  it("é determinística — escrita e leitura precisam concordar", () => {
    const entrada = "Estrada do Cerne, S/N, Bairro Alto, Rio Negro - PR";
    expect(chaveDoEndereco(entrada)).toBe(chaveDoEndereco(entrada));
  });
});

describe("pinoEhDaPorta", () => {
  it("entrada marcada é a porta", () => {
    expect(pinoEhDaPorta({ geo_status: "ok", geo_fonte: "entrada" })).toBe(true);
  });

  it("nó de casa do OSM é a porta", () => {
    expect(pinoEhDaPorta({ geo_status: "ok", geo_fonte: "nominatim:numero" })).toBe(true);
  });

  it("pino manual anterior à 0311 também é a porta — foi um humano que marcou", () => {
    expect(pinoEhDaPorta({ geo_status: "ok", geo_fonte: FONTE_MANUAL })).toBe(true);
  });

  it("rua, bairro e cidade NÃO são a porta", () => {
    for (const fonte of ["nominatim:rua", "nominatim:bairro", "nominatim:cidade", null]) {
      expect(pinoEhDaPorta({ geo_status: "ok", geo_fonte: fonte })).toBe(false);
    }
  });

  it("sem pino válido não é a porta, mesmo com fonte boa", () => {
    expect(pinoEhDaPorta({ geo_status: "pendente", geo_fonte: "nominatim:numero" })).toBe(false);
  });
});

describe("precisaDeEntrada", () => {
  it("parada com entrada marcada não pede de novo", () => {
    expect(
      precisaDeEntrada({
        geo_status: "ok",
        geo_fonte: "entrada",
        entrada: { id: "e1", referencia: null, marcado_em: "2026-11-15T10:00:00Z", confirmacoes: 0, confirmado_em: null },
      }),
    ).toBe(false);
  });

  it("endereço sem número e pino de cidade precisa de entrada", () => {
    expect(precisaDeEntrada({ numero: "S/N", geo_status: "ok", geo_fonte: "nominatim:cidade" })).toBe(true);
  });

  it("endereço COM número que só chegou na rua também precisa", () => {
    expect(precisaDeEntrada({ numero: "484", geo_status: "ok", geo_fonte: "nominatim:rua" })).toBe(true);
  });

  it("pino de nó de casa não precisa", () => {
    expect(precisaDeEntrada({ numero: "484", geo_status: "ok", geo_fonte: "nominatim:numero" })).toBe(false);
  });

  it("pino manual anterior à 0311 não precisa — alguém já disse onde é", () => {
    expect(precisaDeEntrada({ numero: "S/N", geo_status: "ok", geo_fonte: FONTE_MANUAL })).toBe(false);
  });

  it("pino pendente precisa — sem coordenada não há entrega", () => {
    expect(precisaDeEntrada({ numero: "10", geo_status: "pendente", geo_fonte: null })).toBe(true);
  });
});
