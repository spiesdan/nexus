/**
 * A DECISÃO DO CATÁLOGO DO MERCOS, EXERCITADA — sem navegador e sem banco.
 *
 * O que este arquivo prova:
 *
 *  - **coluna vem do cabeçalho**, não da posição. É o que impede preço virar
 *    nome quando o ERP reordena a grade — o modo de falha silencioso do extrator
 *    legado (`docs/legacy/mercos-scrape/extrair-catalogo.ts`, que lê 2/3/7 fixo);
 *  - **preço em BRL** vira centavos inteiros, com milhar e decimal nos dois
 *    formatos (`1.234,56` e `1,234.56`);
 *  - **o relatório separa** criados / atualizados / divergentes / sem código, e
 *    divergente de nome preserva o nome do banco;
 *  - **o pareamento histórico casa só por código.** Nome é candidato; nome com
 *    mais de um produto é ambíguo e NÃO entra como candidato — o caso dos dois
 *    "ESPONJA COM 4 UN" (códigos 806 e 8147) que a produção mediu.
 */
import { describe, expect, it } from "vitest";

import {
  chaveSemZeros,
  classificarLinhas,
  coletaIncompleta,
  COLUNAS_LEGADO,
  indexarCatalogo,
  mapearColunas,
  montarLinhasDeUpsert,
  normalizarCodigo,
  normalizarNome,
  motivoDoVazio,
  planejarPareamento,
  planejarUpsert,
  precoParaCents,
  rotasDoCatalogo,
  STATUS_DA_GRADE,
} from "../../workers/mercos/catalogo-logica.mjs";

describe("cabeçalho manda nas colunas", () => {
  it("mapeia pelo texto, em qualquer ordem", () => {
    const { mapa, completo } = mapearColunas(["Preço", "Produto", "Código", "Un."]);
    expect(completo).toBe(true);
    expect(mapa.preco).toBe(0);
    expect(mapa.nome).toBe(1);
    expect(mapa.codigo).toBe(2);
    expect(mapa.unidade).toBe(3);
  });

  it("aceita os cabeçalhos como o ERP escreve de fato", () => {
    const { mapa, completo } = mapearColunas([
      "Foto",
      "Cód.",
      "Descrição",
      "IPI",
      "Unidade",
      "Comissão",
      "Preço de venda",
    ]);
    expect(completo).toBe(true);
    expect(mapa.codigo).toBe(1);
    expect(mapa.nome).toBe(2);
    expect(mapa.preco).toBe(6);
  });

  it("sem código ou sem nome, o lote é recusado e diz o que faltou", () => {
    const { completo, faltando, mapa } = mapearColunas(["Produto", "Preço"]);
    expect(completo).toBe(false);
    expect(faltando).toEqual(["codigo"]);
    expect(mapa.nome).toBe(0);
  });

  it("o plano B do legado continua declarado", () => {
    // Se um dia a grade não tiver `<thead>` legível, é esta a posição usada —
    // e cada linha sai marcada com `cabecalho_lido: false`.
    expect(COLUNAS_LEGADO).toEqual({
      codigo: 2,
      nome: 3,
      ipi: 4,
      unidade: 5,
      comissao: 6,
      preco: 7,
    });
  });
});

describe("preço do ERP vira centavos", () => {
  it.each([
    ["R$ 1.234,56", 123456],
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1,234.56", 123456],
    ["49,90", 4990],
    ["49.90", 4990],
    ["1.234", 123400], // 3 dígitos depois do ponto = milhar
    ["0,05", 5],
  ])("%s → %i", (entrada, esperado) => {
    expect(precoParaCents(entrada)).toBe(esperado);
  });

  it("valor sem número é null, não zero", () => {
    // Zero silencioso viraria preço grátis no catálogo — pior que recusar.
    expect(precoParaCents("—")).toBeNull();
    expect(precoParaCents("")).toBeNull();
    expect(precoParaCents(null)).toBeNull();
  });
});

describe("classificação do lote", () => {
  it("separa válidas, divergentes e sem código", () => {
    const { validas, divergentes, semCodigo } = classificarLinhas([
      { codigo: " 411 ", nome: "TOALHINHA 5KG", preco: "R$ 12,50", unidade: "UN" },
      { codigo: "806", nome: "", preco: "10,00" },
      { codigo: "8147", nome: "ESPONJA COM 4 UN", preco: "—" },
      { codigo: "", nome: "SEM CÓDIGO NENHUM", preco: "1,00" },
      { codigo: null, nome: null, preco: null },
    ]);

    expect(validas).toHaveLength(1);
    expect(validas[0]!.codigo).toBe("411");
    expect(divergentes.map((d) => d.motivo)).toEqual(["sem nome", "preço ilegível"]);
    expect(semCodigo).toHaveLength(2);
  });

  it("código repetido no lote vence o último e vira divergência reportada", () => {
    const { validas, divergentes } = classificarLinhas([
      { codigo: "411", nome: "TOALHINHA 5KG", preco: "10,00" },
      { codigo: "411", nome: "TOALHINHA 5KG", preco: "11,00" },
    ]);
    expect(validas).toHaveLength(1);
    expect(validas[0]!.preco_cents).toBe(1100);
    expect(divergentes[0]!.motivo).toContain("código repetido");
  });
});

describe("upsert: criados, atualizados e nome divergente", () => {
  const existentes = new Map([
    ["411", { id: "p-411", codigo: "411", nome: "Toalhinha 5kg", preco_cents: 1000 }],
  ]);

  it("classifica e PRESERVA o nome do banco quando divergir", () => {
    const { criados, atualizados, divergentes } = planejarUpsert(
      [
        { codigo: "411", nome: "TOALHINHA 5 KG PREMIUM", preco_cents: 1250, unidade: "UN" },
        { codigo: "900", nome: "PRODUTO NOVO", preco_cents: 500, unidade: "CX" },
      ],
      existentes,
    );

    expect(criados.map((p) => p.codigo)).toEqual(["900"]);
    expect(atualizados).toHaveLength(1);
    // O nome que vai para o upsert é o do BANCO, não o do ERP.
    expect(atualizados[0]!.nome).toBe("Toalhinha 5kg");
    expect(divergentes).toEqual([
      expect.objectContaining({
        codigo: "411",
        nome_no_banco: "Toalhinha 5kg",
        nome_no_mercos: "TOALHINHA 5 KG PREMIUM",
      }),
    ]);
  });
});

describe("pareamento histórico: código exato, nome só como candidato", () => {
  const catalogo = indexarCatalogo([
    { id: "p-411", codigo: "411", nome: "TOALHINHA 5KG" },
    { id: "p-806", codigo: "806", nome: "ESPONJA COM 4 UN" },
    { id: "p-8147", codigo: "8147", nome: "ESPONJA COM 4 UN" },
    { id: "p-0411", codigo: "0411", nome: "TOALHA DE BANHO" },
    { id: "p-77", codigo: "77", nome: "SABONETE" },
  ]);

  it("casa por código exato — o caso 411", () => {
    const { porCodigo } = planejarPareamento(
      [{ id: "i1", produto_codigo: " 411 ", produto_nome: "TOALHINHA 5KG" }],
      catalogo,
    );
    expect(porCodigo).toEqual([{ itemId: "i1", codigo: "411", produtoId: "p-411" }]);
  });

  it("NÃO casa por nome quando há dois produtos com o mesmo nome — 806 × 8147", () => {
    const plano = planejarPareamento(
      [{ id: "i2", produto_codigo: null, produto_nome: "ESPONJA COM 4 UN" }],
      catalogo,
    );
    expect(plano.porNome).toEqual([]);
    expect(plano.ambiguos).toEqual([
      { itemId: "i2", nome: "ESPONJA COM 4 UN", candidatos: ["806", "8147"] },
    ]);
  });

  it("nome único vira CANDIDATO, nunca aplicação", () => {
    const plano = planejarPareamento(
      [{ id: "i3", produto_codigo: null, produto_nome: "sabonete" }],
      catalogo,
    );
    expect(plano.porNome).toEqual([
      { itemId: "i3", nome: "SABONETE", produtoId: "p-77", produtoCodigo: "77" },
    ]);
    // O conjunto aplicável continua vazio: este item não entra em porCodigo.
    expect(plano.porCodigo).toEqual([]);
  });

  it("código que só casa sem zeros à esquerda é candidato, não pareamento", () => {
    const plano = planejarPareamento(
      [{ id: "i4", produto_codigo: "411", produto_nome: "TOALHA DE BANHO" }],
      catalogo,
    );
    // `411` casa exato (p-411); o candidato por zero é para o código que NÃO existe.
    expect(plano.porCodigo).toHaveLength(1);
    const soZero = planejarPareamento(
      [{ id: "i5", produto_codigo: "", produto_nome: "TOALHA DE BANHO" }],
      catalogo,
    );
    expect(soZero.porZero).toEqual([]);
    expect(soZero.porNome).toEqual([
      { itemId: "i5", nome: "TOALHA DE BANHO", produtoId: "p-0411", produtoCodigo: "0411" },
    ]);
  });

  it("sem código e sem nome, vai para `sem_produto` — a lista de compras da coleta", () => {
    const plano = planejarPareamento(
      [{ id: "i6", produto_codigo: "12345", produto_nome: "PRODUTO QUE NÃO EXISTE" }],
      catalogo,
    );
    expect(plano.semProduto).toEqual([
      { itemId: "i6", codigo: "12345", nome: "PRODUTO QUE NÃO EXISTE" },
    ]);
  });
});

describe("normalização", () => {
  it("código: trim e nada mais", () => {
    expect(normalizarCodigo("  411\u00a0")).toBe("411");
    expect(normalizarCodigo("   ")).toBeNull();
  });

  it("nome: upper + espaços colapsados, igual ao resto do repositório", () => {
    expect(normalizarNome("  Esponja   com 4 un ")).toBe("ESPONJA COM 4 UN");
  });

  it("chave sem zeros só existe para código numérico", () => {
    expect(chaveSemZeros("0411")).toBe("411");
    expect(chaveSemZeros("000")).toBe("0");
    expect(chaveSemZeros("A0411")).toBeNull();
  });
});

/**
 * A COLETA VAZIA NÃO É SUCESSO — e a rota do catálogo não é a que se supunha.
 *
 * Medido em produção em 18/11/2026, dentro do `crm-mercos-1`: o coletor pediu
 * `/<empresa>/produtos/`, recebeu **404**, não achou `<table>`, gravou zero
 * linhas e terminou `{"produtos_lidos":0,"paginas":0}` com **exit 0**. O
 * relatório do dono dizia "catálogo vazio" — e o catálogo nunca foi lido.
 *
 * A rota real é `/industria/<empresa>/produtos/`. Estes testes vigiam as duas
 * metades da correção: a candidata certa existe, e o vazio vira falha com
 * motivo — separado por causa, porque a ação de quem lê o log é diferente.
 */
describe("rota do catálogo", () => {
  it("a primeira candidata é a que o menu aponta de fato (industria)", () => {
    expect(rotasDoCatalogo("338282")[0]).toBe(
      "https://app.mercos.com/industria/338282/produtos/?p=1&status=1&nome_codigo=",
    );
  });

  it("a rota antiga continua como rede, não como primeira tentativa", () => {
    const rotas = rotasDoCatalogo("338282");
    expect(rotas).toContain("https://app.mercos.com/338282/produtos/?p=1&status=1&nome_codigo=");
    expect(rotas[0]).not.toBe(rotas[1]);
    expect(rotas[0]).toContain("/industria/");
  });
});

describe("zero não é sucesso", () => {
  it("nenhuma página lida é falha, com motivo próprio", () => {
    expect(motivoDoVazio({ paginas: 0, produtosLidos: 0 })).toBe("nenhuma pagina lida");
  });

  it("página lida e zero linha utilizável é OUTRA falha", () => {
    expect(motivoDoVazio({ paginas: 3, produtosLidos: 0 })).toBe(
      "pagina lida, nenhuma linha utilizavel",
    );
  });

  it("coleta com produto é `null` (não há o que falhar)", () => {
    expect(motivoDoVazio({ paginas: 1, produtosLidos: 15 })).toBeNull();
  });

  it("número ausente não vira sucesso por acidente", () => {
    expect(motivoDoVazio({ paginas: Number.NaN, produtosLidos: 10 })).toBe("nenhuma pagina lida");
  });
});

/**
 * IMPORTAR "TODOS" NÃO DESATIVA NINGUÉM — e produto novo nasce como o ERP diz.
 *
 * A pergunta do dono é se vale importar o catálogo com os inativos dentro. A
 * resposta depende de uma coisa só: **importar um produto inativo do ERP pode
 * desativar um produto ativo no banco?** Não pode, e é aqui que isso está preso.
 *
 * As três regras, nesta ordem:
 *  1. produto que JÁ existe mantém o `ativo` do banco (quem desativou foi uma
 *     pessoa; o ERP não manda na vitrine);
 *  2. produto NOVO nasce como o ERP disse — inativo no ERP entra inativo, senão
 *     ele apareceria na vitrine e na tabela de preço sem ninguém pedir;
 *  3. sem informação da fonte, nasce ativo (comportamento de antes).
 */
describe("upsert do catálogo: `ativo` nunca é rebaixado pelo ERP", () => {
  const org = "00000000-0000-0000-0000-000000000001";
  const existente = (codigo: string, ativo: boolean) =>
    new Map([
      [codigo, { id: `id-${codigo}`, codigo, nome: `PRODUTO ${codigo}`, ativo, preco_cents: 100 }],
    ]);

  const produto = (codigo: string, ativo_erp: boolean | null) => ({
    codigo,
    nome: `PRODUTO ${codigo}`,
    preco_cents: 199,
    unidade: "UN",
    foto: null,
    ativo_erp,
    bruto: null,
  });

  it("produto ativo no banco que vem INATIVO do ERP continua ativo", () => {
    const linha = montarLinhasDeUpsert(
      org,
      [],
      [produto("480", false)],
      existente("480", true),
    )[0]!;
    expect(linha.ativo).toBe(true);
    expect(linha.preco_cents).toBe(199); // preço atualiza; visibilidade não
  });

  it("produto já inativo no banco que vem ATIVO do ERP continua inativo", () => {
    const linha = montarLinhasDeUpsert(
      org,
      [],
      [produto("480", true)],
      existente("480", false),
    )[0]!;
    expect(linha.ativo).toBe(false);
  });

  it("produto NOVO que vem inativo do ERP nasce inativo", () => {
    const linha = montarLinhasDeUpsert(org, [produto("901", false)], [], new Map())[0]!;
    expect(linha).toMatchObject({ codigo: "901", ativo: false, origem: "mercos" });
  });

  it("produto NOVO sem informação de situação nasce ativo", () => {
    const linha = montarLinhasDeUpsert(org, [produto("902", null)], [], new Map())[0]!;
    expect(linha.ativo).toBe(true);
  });

  it("produto NOVO ativo no ERP nasce ativo", () => {
    const linha = montarLinhasDeUpsert(org, [produto("903", true)], [], new Map())[0]!;
    expect(linha.ativo).toBe(true);
  });

  it("nome do banco vence e foto curada não é sobrescrita", () => {
    const mapa = new Map([
      [
        "480",
        {
          id: "id-480",
          codigo: "480",
          nome: "CESTO INOX DO BANCO",
          ativo: true,
          imagem_url: "https://exemplo/foto-curada.jpg",
        },
      ],
    ]);
    const linha = montarLinhasDeUpsert(
      org,
      [],
      [
        {
          ...produto("480", true),
          nome: "CESTO INOX DO MERCOS",
          foto: "https://exemplo/erp.jpg",
        },
      ],
      mapa,
    )[0]!;
    expect(linha.nome).toBe("CESTO INOX DO MERCOS"); // a linha usa o nome já decidido
    expect(linha.imagem_url).toBe("https://exemplo/foto-curada.jpg");
  });
});

describe("status da grade e rotas", () => {
  it("a rota leva o filtro na pílula de paginação (`?p=1&status=N`)", () => {
    expect(rotasDoCatalogo("338282", STATUS_DA_GRADE.ativos)[0]).toContain("?p=1&status=1");
    expect(rotasDoCatalogo("338282", STATUS_DA_GRADE.todos)[0]).toContain("?p=1&status=0");
  });

  it("os três valores medidos: ativos=1, todos=0, inativos=2", () => {
    // Contador do ERP em 19/11/2026: 601 / 847 / (só inativos).
    expect(STATUS_DA_GRADE).toEqual({ ativos: "1", todos: "0", inativos: "2" });
  });
});

/**
 * A COLETA QUE PARA NO MEIO NÃO É SUCESSO.
 *
 * Em 19/11/2026 a mesma coleta parou duas vezes: **75 de 601** produtos e
 * **495 de 601**, as duas com `ok: true`. O critério de "terminei" era comparar
 * 2.000 caracteres de `innerText` entre páginas — quando a grade demorava a
 * trocar, aquilo virava "fim de catálogo".
 *
 * A régua agora é o contador do próprio ERP (`/contar_produtos/<rep>/`): 601
 * com `status=1`, 847 com `status=0`. Estes casos prendem a decisão.
 */
describe("completude da coleta", () => {
  it("leu menos que o ERP disse: incompleta", () => {
    expect(coletaIncompleta({ lidos: 495, totalNoErp: 601 })).toBe(true);
    expect(coletaIncompleta({ lidos: 75, totalNoErp: 601 })).toBe(true);
  });

  it("leu o total: completa", () => {
    expect(coletaIncompleta({ lidos: 601, totalNoErp: 601 })).toBe(false);
    expect(coletaIncompleta({ lidos: 847, totalNoErp: 847 })).toBe(false);
  });

  it("ERP não informou total: não dá para cobrar", () => {
    expect(coletaIncompleta({ lidos: 10, totalNoErp: null })).toBe(false);
    expect(coletaIncompleta({ lidos: 10, totalNoErp: Number.NaN })).toBe(false);
  });

  it("`--limite` é amostra declarada, não truncamento", () => {
    expect(coletaIncompleta({ lidos: 10, totalNoErp: 601, limite: 10 })).toBe(false);
    expect(coletaIncompleta({ lidos: 9, totalNoErp: 601, limite: 10 })).toBe(true);
  });
});

describe("origem em toda linha do upsert", () => {
  it("linhas de ATUALIZAÇÃO também levam origem — NOT NULL no INSERT do upsert", async () => {
    // Medido em produção em 19/11/2026: o primeiro `--aplicar` real morreu com
    // `null value in column "origem"`. O Postgres valida a linha do INSERT mesmo
    // quando ela cai no DO UPDATE, então a lista de atualizados precisa do campo.
    const { montarLinhasDeUpsert } = await import("../../workers/mercos/catalogo-logica.mjs");
    const criados = [{ codigo: "1", nome: "NOVO", preco_cents: 100, unidade: "UN", ativo_erp: true }];
    const atualizados = [{ codigo: "2", nome: "EXISTENTE", preco_cents: 200, unidade: "UN", ativo_erp: true }];
    const existentes = new Map([
      [
        "2",
        {
          id: "produto-2",
          codigo: "2",
          nome: "EXISTENTE",
          ativo: true,
          origem: "odivix",
          unidade: "CX",
          imagem_url: null,
        },
      ],
    ]);

    const linhas = montarLinhasDeUpsert("org", criados, atualizados, existentes);

    expect(linhas).toHaveLength(2);
    for (const linha of linhas) {
      expect(linha.origem, `linha ${linha.codigo} sem origem`).toBeTruthy();
    }
    // Atualização preserva a origem do banco; criação nasce como mercos.
    expect(linhas[0]!.origem).toBe("mercos");
    expect(linhas[1]!.origem).toBe("odivix");
  });
});
