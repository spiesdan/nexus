/**
 * JÁ ESTÁ CADASTRADO — a checagem difusa, com os casos REAIS do corpus.
 *
 * Os nomes deste arquivo saíram da instalação (2026-10-17): 893 contatos
 * pessoa jurídica cruzados com 21.668 empresas da base. Os limiares 0.90/0.80
 * saíram dessa medição (103 e 141 acertos) e estão presos aqui por valor,
 * porque um limiar que ninguém vê trocar é como o teto de capacidades: volta
 * ao valor antigo em silêncio e o defeito volta junto.
 */
import { describe, expect, it } from "vitest";

import {
  brutoDeNomes,
  classificar,
  chaveDeNome,
  IndiceDeNomes,
  LIMIAR_CLIENTE,
  LIMIAR_REVISAR,
  mesmoNome,
  mesmaCidade,
  similaridade,
} from "@/lib/prospeccao/ja-cadastrada";

describe("limiares — o número é da medição, não do gosto", () => {
  it("⭐ 0.90 é cliente; 0.80 é revisar", () => {
    expect(LIMIAR_CLIENTE).toBe(0.9);
    expect(LIMIAR_REVISAR).toBe(0.8);
  });
});

describe("chaveDeNome — a mesma empresa escrita de três jeitos", () => {
  it.each([
    ["Auto Mecanica Salomon LTDA", "auto mecânica salomon"],
    ["MECÂNICA SALOMON", "Mecanica Salomon"],
    ["Auto Mecânica Amiga", "AUTO MECANICA AMIGA LTDA"],
  ])("%s ≈ %s", (a, b) => {
    expect(chaveDeNome(a)).toBe(chaveDeNome(b));
  });

  it("razão social some; o resto fica", () => {
    expect(chaveDeNome("Posto São Benedito Ltda ME")).toBe("posto sao benedito");
  });
});

describe("mesmoNome — o caso que o usuário descreveu (letra errada)", () => {
  it("⭐ nomes reais do corpus", () => {
    // Chave igual (razão social fora): 1.00 exato.
    expect(mesmoNome({ nome: "AUTO POSTO CAMP LTDA" }, { nome: "Auto Posto Camp" })).toBe(1);
    // Digitação diferente no MEIO do nome ("Camargo" por "Cargo"): 0.97 — acima
    // do limiar, e é por isso que o limiar existe.
    expect(
      mesmoNome(
        { nome: "CAMARGO DIESEL AUTO PEÇAS E MECÂNICA LTDA" },
        { nome: "Cargo Diesel Auto Peças e Mecânica Ltda" },
      ),
    ).toBeGreaterThanOrEqual(LIMIAR_CLIENTE);
  });

  it("⭐ letra trocada e acento fora ainda é o mesmo nome", () => {
    const sim = mesmoNome({ nome: "Oficina Mecanica Joao" }, { nome: "Oficina Mecânica João" });
    expect(sim).toBeGreaterThanOrEqual(LIMIAR_CLIENTE);
  });

  it("⭐ nome curto com uma letra trocada fica em REVISAR, não em cliente", () => {
    // "Uniao" → "Uniiao" dá 0.888: acima da revisão, abaixo do corte de cliente.
    // Declarar cliente aqui seria decidir por cima de alguém; marcar e deixar
    // o humano decidir é o que este par precisa ensinar.
    const bruto = brutoDeNomes({ nome: "Uniao" }, { nome: "Uniiao" });
    expect(bruto).toBeGreaterThanOrEqual(LIMIAR_REVISAR);
    expect(bruto).toBeLessThan(LIMIAR_CLIENTE);
    // `mesmoNome` com o corte de cliente devolve 0 — a resposta honesta.
    expect(mesmoNome({ nome: "Uniao" }, { nome: "Uniiao" })).toBe(0);
    // E o veredito que a fila lê é "revisar": fica na fila, marcado.
    expect(classificar({ nome: "Uniao" }, [{ nome: "Uniiao" }]).estado).toBe("revisar");
  });

  it("⭐ barra o falso positivo com letra alike e nome diferente", () => {
    // "Farmácia São João" e "Auto Peças São João" compartilham "São João" e
    // letra alike; não são a mesma empresa, e declarar cliente aqui esconderia
    // prospect bom da campanha.
    expect(mesmoNome({ nome: "Farmacia Sao Joao" }, { nome: "Auto Pecas Sao Joao" })).toBe(0);
  });

  it("empresas claramente diferentes: zero", () => {
    expect(mesmoNome({ nome: "Posto Ipiranga" }, { nome: "Padaria Santa Maria" })).toBe(0);
  });

  it("similaridade é 1 só quando a chave bate", () => {
    expect(similaridade("posto ipiranga", "posto ipiranga")).toBe(1);
    expect(similaridade("posto ipiranga", "padaria santa maria")).toBeLessThan(0.3);
  });
});

describe("mesmaCidade — mesma empresa em duas cidades são duas lojas", () => {
  it("cidade e estado batem", () => {
    expect(
      mesmaCidade({ cidade: "Caçador", uf: "SC" }, { cidade: "Cacador", uf: "sc" }),
    ).toBe(true);
  });
  it("cidade diferente, não", () => {
    expect(mesmaCidade({ cidade: "Caçador", uf: "SC" }, { cidade: "Videira", uf: "SC" })).toBe(false);
  });
  it("estado diferente, não", () => {
    expect(mesmaCidade({ cidade: "Mafra", uf: "SC" }, { cidade: "Mafra", uf: "PR" })).toBe(false);
  });
  it("sem cidade no dado, quem decide é o nome", () => {
    expect(mesmaCidade({ cidade: "", uf: "" }, { cidade: "Caçador", uf: "SC" })).toBe(true);
  });
});

describe("classificar — o veredito que a fila lê", () => {
  it("⭐ cliente sai da fila", () => {
    const v = classificar({ nome: "Auto Posto Camp Ltda" }, [{ nome: "Auto Posto Camp" }]);
    expect(v.estado).toBe("cliente");
    expect(v.comQuem).toBe("Auto Posto Camp");
  });

  it("revisar fica na fila, marcado", () => {
    // Um acento a mais: 0.83. Fica marcado para o humano, não sai da fila.
    const v = classificar({ nome: "Padaria Bom Gosto" }, [{ nome: "Padaria Bom Gusto" }]);
    expect(v.estado).toBe("revisar");
    expect(v.comQuem).toBe("Padaria Bom Gusto");
  });

  it("limpo é o caso comum e não sai com nome de ninguém", () => {
    const v = classificar({ nome: "Mecânica Salomon" }, [{ nome: "Padaria Santa Maria" }]);
    expect(v.estado).toBe("limpo");
    expect(v.comQuem).toBeNull();
  });
});

describe("IndiceDeNomes — o que mantém o clique em milissegundos", () => {
  it("⭐ acha pelo nome com acento diferente", () => {
    const indice = new IndiceDeNomes();
    indice.add("c1", "Auto Posto Camp Ltda", "Prudentópolis", "PR");
    const candidatos = indice.candidatos("AUTO POSTO CAMP", "Prudentópolis", "PR");
    expect(candidatos.map((c) => c.nome)).toEqual(["Auto Posto Camp Ltda"]);
    expect(classificar({ nome: "AUTO POSTO CAMP" }, candidatos).estado).toBe("cliente");
  });

  it("sem cidade no dado, acha pelo prefixo", () => {
    const indice = new IndiceDeNomes();
    indice.add("c1", "Auto Posto Camp Ltda", "", "");
    const candidatos = indice.candidatos("Auto Posto Camp", "", "");
    expect(candidatos).toHaveLength(1);
  });

  it("nome sem nada não entra no índice (senão vira candidáta de todo mundo)", () => {
    const indice = new IndiceDeNomes();
    indice.add("c1", "---", "Caçador", "SC");
    expect(indice.tamanho).toBe(0);
  });
});
