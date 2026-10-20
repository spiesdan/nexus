/**
 * O PÚBLICO DA CAMPANHA — quem a campanha alcança dentro da base já coletada.
 *
 * ═══ O QUE ESTE ARQUIVO PROVA QUE NÃO É ÓBVIO ════════════════════════════
 *
 * A base grava o rótulo **cru** da API do Google — inglês: "Auto repair shop",
 * "Gas station", "Tire repair shop". A campanha é montada em **português**:
 * "Oficina mecânica", "Posto de combustível", "Borracharia". Comparar as duas
 * strings direto é o mesmo erro de comparar "Salomon" com "Salomón".
 *
 * Medido em Videira/SC (17/10/2026): a campanha "Oficinas - SC" alcançava
 * **1** das 1.268 empresas da cidade — "Oficina mecânica" ≠ "Auto repair shop".
 * Um filtro que apaga a lista sem dizer por quê é bug, não filtro.
 *
 * ═══ MUTAÇÕES PROVADAS ═════════════════════════════════════════════════════
 *
 *  1. `empresaServe` voltar a comparar `daEmpresa.includes(criterio)` → reprova
 *     5 testes ("a campanha em português alcança o rótulo em inglês da base")
 *  2. a consulta perder o `order("id")` → reprova "ordena por id" — sem ele a
 *     janela de leitura é ordem física de tabela, que muda sem mudar um dado
 *  3. a UF da campanha parar de ir para a consulta → reprova "empurra o estado
 *     para o banco" (a varredura de uma campanha de SC leria a base inteira)
 *  4. duplicata voltar a ser "primeira chegada vence" → reprova os dois casos
 *     de desempate (a fila mudava de execução para execução, medido: 16 e 17
 *     empresas sem telefone em duas rodadas)
 *  5. `criterioDaCampanha` NÃO pré-computar `aceitas` → reprova "traduz uma vez
 *     por campanha": 21.668 linhas × 536 rótulos é trabalho que a tela paga a
 *     cada clique
 *  6. `semAcento` deixar de tirar acento em `chaveDeCidade` → reprova "cidade
 *     com acento casa com a que o operador digitou sem"
 *
 * E uma medição que tirou código, não confirmou: `categoriasAceitas` tinha um
 * passo "tradução exata" varrendo o mapa ao contrário. A mutação que o
 * desligou passou a suíte inteira — `categoriasQueCasam` compara por
 * `includes` no rótulo em português, e igualdade ⊂ `includes`. O passo foi
 * removido; o que a mutação não derruba é código que ninguém sabe se
 * trabalha.
 */
import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { categoriasQueCasam } from "@/lib/prospeccao/categoria-pt";

import {
  LIMITE_POR_PAGINA,
  MAX_PAGINAS,
  categoriasAceitas,
  chaveDeCidade,
  criterioDaCampanha,
  empresaServe,
  publicoDaBase,
  type CriterioDaBase,
  type LinhaDaBase,
  type ProspectoDaBase,
} from "@/lib/prospeccao/publico-da-base";

/** Empresa da base: o que o Google devolve, em inglês, como está no banco. */
function daBase(over: Partial<ProspectoDaBase> = {}): ProspectoDaBase {
  return {
    nome: "Auto Peças Videira",
    cidade: "Videira",
    estado: "SC",
    categoria: "Auto parts store",
    categorias: null,
    ...over,
  };
}

/** Critério cru (sem `aceitas`), como se viesse de fora da campanha. */
function criterio(categorias: string[], cidades = ["Videira"]): CriterioDaBase {
  return { cidades: cidades.map((cidade) => ({ cidade })), categorias, estado: "SC" };
}

describe("empresaServe — categoria nas duas línguas", () => {
  it("a campanha em português alcança o rótulo em inglês que a base gravou", () => {
    // O defeito medido: "Oficina mecânica" (campanha) × "Auto repair shop"
    // (base). Sem a tradução, a campanha alcançava 1 empresa em 1.268.
    expect(empresaServe(daBase({ categoria: "Auto repair shop" }), criterio(["Oficina mecânica"]))).toBe(
      true,
    );
    expect(empresaServe(daBase({ categoria: "Gas station", nome: "Posto Videira" }), criterio(["Posto de combustível"]))).toBe(
      true,
    );
    expect(empresaServe(daBase({ categoria: "Tire repair shop" }), criterio(["Borracharia"]))).toBe(
      true,
    );
  });

  it("o termo digitado no teclado, sem acento e flexionado, ainda acha", () => {
    const c = criterio(["mecanica"]);
    expect(empresaServe(daBase({ categoria: "Auto repair shop" }), c)).toBe(true);
    expect(empresaServe(daBase({ categoria: "Mechanic" }), c)).toBe(true);
    const borracha = criterio(["borracharias"]);
    expect(empresaServe(daBase({ categoria: "Tire repair shop" }), borracha)).toBe(true);
  });

  it("categoria fora da campanha não entra — nem por resemble", () => {
    expect(
      empresaServe(daBase({ categoria: "Gas station", nome: "Posto Videira" }), criterio(["Oficina mecânica"])),
    ).toBe(false);
    // "Oficina mecânica" puxa a oficina; NÃO traz o catálogo inteiro
    // ("Auto parts store" é outra empresa, e a campanha não pediu autopeças).
    expect(empresaServe(daBase({ categoria: "Auto parts store" }), criterio(["Oficina mecânica"]))).toBe(
      false,
    );
  });

  it("categoria duvidosa fica fora da campanha até revisão", () => {
    // "Branca" existe na base como Gas station, sem site e sem sinal de posto.
    // Pode ser posto — mas a campanha não aposta.
    expect(
      empresaServe(daBase({ categoria: "Gas station", nome: "Branca" }), criterio(["Posto de combustível"])),
    ).toBe(false);
    // "Estação Café - Loja Posto Carretão II" é café, não posto.
    expect(
      empresaServe(
        daBase({ categoria: "Gas station", nome: "Estação Café - Loja Posto Carretão II" }),
        criterio(["Posto de combustível"]),
      ),
    ).toBe(false);
    expect(
      empresaServe(
        daBase({ categoria: "Gas station", nome: "Estação Café - Loja Posto Carretão II" }),
        criterio(["Café"]),
      ),
    ).toBe(true);
  });

  it("empresa sem categoria não entra quando a campanha tem categorias", () => {
    expect(
      empresaServe(daBase({ categoria: null, categorias: null }), criterio(["Oficina mecânica"])),
    ).toBe(false);
    // Categoria no plural (jsonb) também conta.
    expect(
      empresaServe(
        daBase({ categoria: null, categorias: ["Car wash", "Tire repair shop"] }),
        criterio(["Borracharia"]),
      ),
    ).toBe(true);
  });

  it("campanha sem categoria aceita a empresa da cidade", () => {
    expect(empresaServe(daBase({ categoria: null, categorias: null }), criterio([]))).toBe(true);
  });

  it("o mesmo resultado com o conjunto pré-computado e sem ele", () => {
    const cat = criterio(["Oficina mecânica", "Posto de combustível"]);
    const comSet: CriterioDaBase = { ...cat, aceitas: categoriasAceitas(cat.categorias) };
    for (const categoria of ["Auto repair shop", "Gas station", "Auto parts store"]) {
      const e = daBase({
        categoria,
        nome: categoria === "Gas station" ? "Posto Videira" : "Auto Peças Videira",
      });
      expect(empresaServe(e, comSet)).toBe(empresaServe(e, cat));
    }
  });
});

describe("categoriasAceitas — o conjunto traduzido", () => {
  it("contém o termo da campanha e o rótulo gravado que ele descreve", () => {
    const aceitas = categoriasAceitas(["Oficina mecânica"]);
    expect(aceitas.has("oficina mecanica")).toBe(true); // o próprio termo
    expect(aceitas.has("auto repair shop")).toBe(true); // como a base grava
  });

  it("recolhe todo rótulo do mapa que traduz para o mesmo termo", () => {
    // "Hardware store" e "Iron ware dealer" são rótulos diferentes que a base
    // grava para o mesmo rótulo PT ("Loja de ferragens"). A campanha pediu o
    // termo em português — ela quer as duas, não só a que alguém digitou em
    // inglês. (40 pares do mapa são assim, medido.)
    const aceitas = categoriasAceitas(["Loja de ferragens"]);
    expect(aceitas.has("hardware store")).toBe(true);
    expect(aceitas.has("iron ware dealer")).toBe(true);
  });

  it("sem passo de 'tradução exata' — o conjunto é o que a busca devolve", () => {
    // Trava a remoção de código morto: este conjunto é EXATAMENTE o que
    // `categoriasQueCasam` devolve, mais o termo da campanha. Se alguém
    // repuser o passo inverso, esta asserção reprova e a pergunta volta.
    const aceitas = categoriasAceitas(["Loja de ferragens"]);
    const esperada = new Set(
      ["Loja de ferragens", ...categoriasQueCasam("Loja de ferragens")].map((v) =>
        v
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim(),
      ),
    );
    expect([...aceitas].sort()).toEqual([...esperada].sort());
  });

  it("aceita o termo já em inglês, que é o idioma da origem", () => {
    expect(categoriasAceitas(["Auto repair shop"]).has("auto repair shop")).toBe(true);
  });

  it("não engole o catálogo inteiro", () => {
    // O oposto de aceitar demais também é defeito: "Oficina" sozinho (termo
    // parcial) é BUSCA na tela, mas como categoria da campanha tem que ser o
    // rótulo que descreve. O conjunto cresceu de 3 para 5 quando a campanha
    // passou a alcançar "Auto tune up service" e "Car service" — as duas são
    // a mesma oficina com outro nome do Google. Continua sendo um punhado,
    // não o catálogo.
    const aceitas = categoriasAceitas(["Oficina mecânica"]);
    expect(aceitas.size).toBeLessThan(8);
    expect(aceitas.has("auto parts store")).toBe(false);
  });
});

describe("empresaServe — cidade e estado", () => {
  it("cidade com acento casa com a que o operador digitou sem", () => {
    expect(chaveDeCidade("Caçador")).toBe(chaveDeCidade("Cacador"));
    expect(
      empresaServe(
        daBase({ cidade: "Caçador", categoria: "Auto repair shop" }),
        criterio(["Oficina mecânica"], ["Cacador"]),
      ),
    ).toBe(true);
  });

  it("cidade diferente não entra, e cidade vazia também não", () => {
    expect(empresaServe(daBase({ cidade: "Caçador" }), criterio(["Borracharia"], ["Videira"]))).toBe(
      false,
    );
    expect(empresaServe(daBase({ cidade: "  " }), criterio(["Oficina mecânica"]))).toBe(false);
    expect(empresaServe(daBase({ cidade: null }), criterio(["Oficina mecânica"]))).toBe(false);
  });

  it("o estado só filtra quando a campanha declare um só", () => {
    const borracha = daBase({ estado: "sc", categoria: "Tire repair shop" });
    expect(empresaServe(borracha, criterio(["Borracharia"]))).toBe(true);
    expect(empresaServe({ ...borracha, estado: "PR" }, criterio(["Borracharia"]))).toBe(false);
    const duasUfs = criterioDaCampanha({
      cidades: [{ cidade: "Videira", estado: "SC" }, { cidade: "Curitiba", estado: "PR" }],
      categorias: ["Borracharia"],
    });
    expect(duasUfs.estado).toBeNull();
    expect(empresaServe({ ...borracha, estado: "PR", cidade: "Curitiba" }, duasUfs)).toBe(true);
  });
});

describe("criterioDaCampanha", () => {
  it("traduz as categorias UMA vez, e não por linha da base", () => {
    const c = criterioDaCampanha({ cidades: [{ cidade: "Videira" }], categorias: ["Oficina mecânica"] });
    expect(c.aceitas).toBeInstanceOf(Set);
    expect(c.aceitas?.has("auto repair shop")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  A CONSULTA — o que o Postgres filtra antes de a decisão rodar em JS.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Um cliente Supabase que NÃO consulta nada: registra a cadeia de filtros e
 * devolve as páginas que o teste mandar. É o jeito de olhar a consulta sem
 * banco — e é a consulta que decide *quais* linhas a decisão em JS chega a ver.
 */
function clienteFalso(paginas: Array<Array<Partial<LinhaDaBase>>>) {
  const chamadas: Array<{ metodo: string; args: unknown[] }> = [];
  const cliente = {
    from(tabela: string) {
      chamadas.push({ metodo: "from", args: [tabela] });
      return cliente;
    },
    select(...args: unknown[]) {
      chamadas.push({ metodo: "select", args });
      return cliente;
    },
    eq(...args: unknown[]) {
      chamadas.push({ metodo: "eq", args });
      return cliente;
    },
    in(...args: unknown[]) {
      chamadas.push({ metodo: "in", args });
      return cliente;
    },
    order(...args: unknown[]) {
      chamadas.push({ metodo: "order", args });
      return cliente;
    },
    range(de: number, ate: number) {
      chamadas.push({ metodo: "range", args: [de, ate] });
      return Promise.resolve({ data: paginas[de / 1000] ?? [], error: null });
    },
  };
  return { cliente: cliente as unknown as SupabaseClient, chamadas };
}

/** Uma linha que serve à campanha de Videira × Oficina mecânica. */
function servindo(i: number): Partial<LinhaDaBase> {
  return {
    id: `id-${i}`,
    nome: `Mecânica ${i}`,
    telefone: "+554935660000",
    cidade: "Videira",
    estado: "SC",
    categoria: "Auto repair shop",
    categorias: [],
    whatsapp_potencial: true,
    do_not_contact: false,
  };
}

describe("publicoDaBase — a consulta", () => {
  it("ordena por id: sem isso a janela de leitura muda quando o Postgres muda", () => {
    const { cliente, chamadas } = clienteFalso([[servindo(1)]]);
    return publicoDaBase(cliente, {
      organizationId: "org",
      cidades: [{ cidade: "Videira", estado: "SC" }],
      categorias: ["Oficina mecânica"],
    }).then(() => {
      expect(chamadas.some((c) => c.metodo === "order" && c.args[0] === "id")).toBe(true);
    });
  });

  it("empresa bloqueada não entra na fila — o filtro é do banco, não da tela", async () => {
    const { cliente, chamadas } = clienteFalso([[servindo(1)]]);
    await publicoDaBase(cliente, {
      organizationId: "org",
      cidades: [{ cidade: "Videira", estado: "SC" }],
      categorias: ["Oficina mecânica"],
    });
    const filtro = chamadas.find((c) => c.metodo === "eq" && c.args[0] === "bloqueado");
    expect(filtro, "a consulta não excluiu empresa bloqueada").toBeDefined();
    expect(filtro!.args[1]).toBe(false);
  });

  it("campanha de uma UF empurra o estado para o banco", () => {
    const { cliente, chamadas } = clienteFalso([[servindo(1)]]);
    return publicoDaBase(cliente, {
      organizationId: "org",
      cidades: [{ cidade: "Videira", estado: "SC" }],
      categorias: ["Oficina mecânica"],
    }).then(() => {
      const filtroUf = chamadas.find((c) => c.metodo === "in" && c.args[0] === "estado");
      // Sem o filtro, a varredura de uma campanha de SC lê a base inteira.
      expect(filtroUf, "a UF da campanha não foi para a consulta").toBeDefined();
      expect(filtroUf!.args[1]).toEqual(expect.arrayContaining(["SC", "sc"]));
    });
  });

  it("campanha de duas UFs NÃO filtra estado — a regra em JS aceita qualquer estado", () => {
    const { cliente, chamadas } = clienteFalso([[servindo(1)]]);
    return publicoDaBase(cliente, {
      organizationId: "org",
      cidades: [
        { cidade: "Videira", estado: "SC" },
        { cidade: "Curitiba", estado: "PR" },
      ],
      categorias: ["Oficina mecânica"],
    }).then(() => {
      expect(chamadas.some((c) => c.metodo === "in" && c.args[0] === "estado")).toBe(false);
    });
  });

  it("base maior que o teto diz que NÃO leu tudo", async () => {
    // 51 páginas de 1.000 linhas que NÃO servem à campanha: a varredura tem de
    // chegar ao fim do teto sem nunca encher a fila, e é aí que ela declara
    // `completa: false`. É o número que a tela mostra quando falta base.
    const paginas: Array<Array<Partial<LinhaDaBase>>> = [];
    for (let p = 0; p < MAX_PAGINAS + 1; p++) {
      paginas.push(Array.from({ length: LIMITE_POR_PAGINA }, (_, i) => ({
        ...servindo(p * 1000 + i),
        categoria: "Pharmacy", // fora da campanha
      })));
    }
    const { cliente } = clienteFalso(paginas);
    const r = await publicoDaBase(cliente, {
      organizationId: "org",
      cidades: [{ cidade: "Videira", estado: "SC" }],
      categorias: ["Oficina mecânica"],
      limite: 5000,
    });
    expect(r.completa).toBe(false);
    expect(r.varridas).toBe(MAX_PAGINAS * LIMITE_POR_PAGINA);
    expect(r.total).toBe(0);
  });

  it("linha em revisão fica fora até de campanha sem categoria", async () => {
    // "Branca" é Gas station sem site e sem sinal de posto: o resolvedor não
    // aposta. Campanha sem recorte é "toda a cidade", mas não é licença para
    // mandar mensagem em cima da dúvida — a linha vai para revisão e sai.
    const { cliente } = clienteFalso([
      [{ ...servindo(1), nome: "Branca", categoria: "Gas station" }],
    ]);
    const r = await publicoDaBase(cliente, {
      organizationId: "org",
      cidades: [{ cidade: "Videira", estado: "SC" }],
      categorias: [],
    });
    expect(r.total).toBe(0);
    expect(r.categoria_a_revisar).toBe(1);
  });

  it("entre duas duplicatas vence a que tem telefone — e a ordem de leitura não decide", async () => {
    // A ordem de leitura é por `id`, e id é uuid: muda a cada execução. Medido
    // em 18/10/2026 — duas execuções da mesma campanha deram 16 e 17 empresas
    // sem telefone na fila. Aqui a duplicata SEM telefone vem PRIMEIRO, que é
    // o caso que a "primeira chegada vence" resolvia errado.
    const semTel = { ...servindo(1), id: "a", nome: "Mecânica Aliança", telefone: null };
    const comTel = { ...servindo(2), id: "b", nome: "Mecânica Aliança", telefone: "+5549998887777" };
    for (const lote of [[semTel, comTel], [comTel, semTel]]) {
      const { cliente } = clienteFalso([lote]);
      const r = await publicoDaBase(cliente, {
        organizationId: "org",
        cidades: [{ cidade: "Videira", estado: "SC" }],
        categorias: ["Oficina mecânica"],
      });
      expect(r.total, "a duplicata entrou duas vezes").toBe(1);
      expect(r.duplicadas).toBe(1);
      expect(r.linhas[0]?.telefone, "a fila ficou com a linha sem telefone").toBe(
        "+5549998887777",
      );
    }
  });

  it("entre duas duplicatas com telefone vence a que tem WhatsApp potencial", async () => {
    const fixa = { ...servindo(1), id: "a", nome: "Mecânica Aliança", telefone: "+554833334444", whatsapp_potencial: false };
    const movel = { ...servindo(2), id: "b", nome: "Mecânica Aliança", telefone: "+5549998887777", whatsapp_potencial: true };
    const { cliente } = clienteFalso([[fixa, movel]]);
    const r = await publicoDaBase(cliente, {
      organizationId: "org",
      cidades: [{ cidade: "Videira", estado: "SC" }],
      categorias: ["Oficina mecânica"],
    });
    expect(r.total).toBe(1);
    expect(r.linhas[0]?.telefone).toBe("+5549998887777");
  });
});