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
  COLUNAS_LEGADO,
  indexarCatalogo,
  mapearColunas,
  montarLinhasDoUpsert,
  normalizarCodigo,
  normalizarNome,
  motivoDoVazio,
  planejarPareamento,
  planejarUpsert,
  precoParaCents,
  resolverAtivoNoUpsert,
  rotasDoCatalogo,
  urlComStatus,
  visoesDoCatalogo,
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

  it("mesmo código nas duas visões: o registro ATIVO vence e não é sobrescrito pelo inativo", () => {
    // Medido em 19/11/2026: 8 códigos existem nas duas visões do ERP (ex.: 875,
    // ALCOOL PERFUMADO 5 L, um ativo e um inativo). O inativo não pode ditar
    // preço/nome do produto que o operador vê na grade padrão.
    const { validas, divergentes } = classificarLinhas([
      { codigo: "875", nome: "ALCOOL PERFUMADO 5 L", preco: "10,00", ativo: true, situacao: "ativos" },
      { codigo: "875", nome: "ALCOOL PERFUMADO 5 L", preco: "99,00", ativo: false, situacao: "inativos" },
    ]);
    expect(validas).toHaveLength(1);
    expect(validas[0]).toMatchObject({ ativo: true, preco_cents: 1000 });
    expect(divergentes[0]!.motivo).toContain("registro ativo vence");
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
    expect(rotasDoCatalogo("338282")[0]).toBe("https://app.mercos.com/industria/338282/produtos/");
  });

  it("a rota antiga continua como rede, não como primeira tentativa", () => {
    const rotas = rotasDoCatalogo("338282");
    expect(rotas).toContain("https://app.mercos.com/338282/produtos/");
    expect(rotas[0]).not.toBe("https://app.mercos.com/338282/produtos/");
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
 * ATIVOS × INATIVOS — o filtro real e o status que a coleta carrega.
 *
 * O parâmetro `situacao` era chute: medido na página real do `crm-mercos-1` em
 * 19/11/2026, `?situacao=inativos` devolve a MESMA grade de ativos. A grade
 * filtra por `status`: 1 = ativos, 2 = inativos, 0 = todos. O teste fixa isso
 * para que o chute não volte.
 */
describe("visões da grade: ativos por default, inativos só com --todos", () => {
  it("default continua só ativos, e com o status que a paginação usa", () => {
    expect(visoesDoCatalogo()).toEqual([{ situacao: "ativos", status: "1", ativo: true }]);
  });

  it("--todos acrescenta inativos com status=2", () => {
    expect(visoesDoCatalogo(true)).toEqual([
      { situacao: "ativos", status: "1", ativo: true },
      { situacao: "inativos", status: "2", ativo: false },
    ]);
  });

  it("não existe visão com `situacao` — esse parâmetro é ignorado pelo ERP", () => {
    expect(JSON.stringify(visoesDoCatalogo(true))).not.toContain("situacao=inativos");
  });

  it("monta a URL sobre a rota descoberta no menu, preservando o filtro", () => {
    expect(urlComStatus("https://app.mercos.com/industria/338282/produtos/", "2")).toBe(
      "https://app.mercos.com/industria/338282/produtos/?status=2&p=1",
    );
    expect(urlComStatus("https://app.mercos.com/industria/338282/produtos/?x=1", "1")).toBe(
      "https://app.mercos.com/industria/338282/produtos/?x=1&status=1&p=1",
    );
  });
});

/**
 * A SEMÂNTICA DO UPSERT POR `(organization_id, codigo)`.
 *
 * O risco que estes testes cobrem não é duplicar produto — é mudar `ativo` em
 * silêncio. Rebaixar tira o produto do catálogo que o agente consulta;
 * promover reativa item que alguém desligou de propósito. Os dois são decisão
 * de negócio, e o importador não tem contexto para nenhum dos dois.
 */
describe("upsert: status de produto existente nunca é sobrescrito", () => {
  it("ativo sobre ativo: preserva ativo", () => {
    expect(resolverAtivoNoUpsert({ existente: { ativo: true }, ativoEntrante: true })).toEqual({
      ativo: true,
      motivo: "preserva_ativo",
    });
  });

  it("inativo sobre inativo: preserva inativo", () => {
    expect(resolverAtivoNoUpsert({ existente: { ativo: false }, ativoEntrante: false })).toEqual({
      ativo: false,
      motivo: "preserva_inativo",
    });
  });

  it("inativo sobre ativo: NÃO rebaixa (o caso que o modo --todos não pode causar)", () => {
    expect(resolverAtivoNoUpsert({ existente: { ativo: true }, ativoEntrante: false })).toEqual({
      ativo: true,
      motivo: "nao_rebaixa_ativo",
    });
  });

  it("ativo sobre inativo: NÃO promove — decisão documentada, igual ao upsert atual", () => {
    // O upsert atual preserva `existente.ativo`. Promover em silêncio seria
    // reativar item em fim de linha/preço em revisão sem contexto humano.
    expect(resolverAtivoNoUpsert({ existente: { ativo: false }, ativoEntrante: true })).toEqual({
      ativo: false,
      motivo: "nao_promove_inativo",
    });
  });

  it("produto novo adota o status da coleta — inativo nasce inativo", () => {
    expect(resolverAtivoNoUpsert({ existente: null, ativoEntrante: false })).toEqual({
      ativo: false,
      motivo: "novo_inativo",
    });
    expect(resolverAtivoNoUpsert({ existente: null, ativoEntrante: true })).toEqual({
      ativo: true,
      motivo: "novo_ativo",
    });
  });

  it("linha sem marcador (coleta antiga/default) é ativa — não desliga produto por campo ausente", () => {
    expect(resolverAtivoNoUpsert({ existente: null, ativoEntrante: undefined })).toEqual({
      ativo: true,
      motivo: "novo_ativo",
    });
  });

  it("`ativo` nulo no banco é tratado como ativo (default do schema)", () => {
    expect(resolverAtivoNoUpsert({ existente: { ativo: null }, ativoEntrante: false })).toEqual({
      ativo: true,
      motivo: "nao_rebaixa_ativo",
    });
  });
});

describe("montagem das linhas do upsert com o status decidido", () => {
  const existentes = new Map([
    ["411", { id: "p-411", codigo: "411", nome: "Toalhinha 5kg", preco_cents: 1000, ativo: true, unidade: "UN", imagem_url: "https://foto/curada.jpg" }],
    ["806", { id: "p-806", codigo: "806", nome: "ESPONJA COM 4 UN", preco_cents: 500, ativo: false, unidade: "UN", imagem_url: null }],
  ]);

  const { linhas, status } = montarLinhasDoUpsert({
    organizationId: "org-1",
    criados: [
      { codigo: "900", nome: "PRODUTO NOVO ATIVO", preco_cents: 100, unidade: "CX", foto: null, ativo: true },
      { codigo: "901", nome: "PRODUTO NOVO INATIVO", preco_cents: 200, unidade: "CX", foto: null, ativo: false },
    ],
    atualizados: [
      // inativo no ERP sobre ativo no banco: preço atualiza, status não.
      { codigo: "411", nome: "Toalhinha 5kg", preco_cents: 1250, unidade: "UN", foto: "https://foto/erp.jpg", ativo: false },
      // ativo no ERP sobre inativo no banco: status do banco vence.
      { codigo: "806", nome: "ESPONJA COM 4 UN", preco_cents: 550, unidade: "UN", foto: "https://foto/erp2.jpg", ativo: true },
    ],
    existentesPorCodigo: existentes,
  });

  it("inativo sobre ativo mantém ativo=true e o preço novo", () => {
    const linha = linhas.find((l) => l.codigo === "411");
    expect(linha).toMatchObject({ ativo: true, preco_cents: 1250, nome: "Toalhinha 5kg" });
  });

  it("ativo sobre inativo mantém ativo=false — promoção não é automática", () => {
    const linha = linhas.find((l) => l.codigo === "806");
    expect(linha).toMatchObject({ ativo: false, preco_cents: 550, nome: "ESPONJA COM 4 UN" });
  });

  it("produto novo nasce com o status da coleta", () => {
    expect(linhas.find((l) => l.codigo === "900")!.ativo).toBe(true);
    expect(linhas.find((l) => l.codigo === "901")!.ativo).toBe(false);
  });

  it("nome e foto curados do banco continuam vencendo", () => {
    const linha = linhas.find((l) => l.codigo === "411")!;
    expect(linha.nome).toBe("Toalhinha 5kg");
    expect(linha.imagem_url).toBe("https://foto/curada.jpg");
  });

  it("o relatório conta cada decisão (o dono vê o que foi contido)", () => {
    expect(status).toEqual({
      novos_ativos: 1,
      novos_inativos: 1,
      preservados_ativos: 0,
      preservados_inativos: 0,
      rebaixamentos_bloqueados: 1,
      promocoes_bloqueadas: 1,
    });
  });
});

describe("classificação carrega o marcador de status da coleta", () => {
  it("linha inativa da visão de inativos chega ao upsert como ativo=false", () => {
    const { validas } = classificarLinhas([
      { codigo: "723", nome: "AGUA OXIGENADA 1L", preco: "16,00", ativo: false, situacao: "inativos" },
    ]);
    expect(validas[0]!.ativo).toBe(false);
  });

  it("linha sem marcador continua ativa (compatível com JSONL antigo)", () => {
    const { validas } = classificarLinhas([
      { codigo: "411", nome: "TOALHINHA 5KG", preco: "10,00" },
    ]);
    expect(validas[0]!.ativo).toBe(true);
  });
});
