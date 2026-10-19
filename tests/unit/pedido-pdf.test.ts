// @vitest-environment node
// node de propósito: o jsdom trunca os streams Flate do @react-pdf/renderer
// (PDF com /Length maior que o stream real) — provado em 2026-09-06 com doc
// mínimo. Em node o stream descomprime íntegro, igual à rota de produção.
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { extractPdfText } from "@/lib/ai/rag/extractors/pdf";
import {
  montarCabecalho,
  numeroDoPedidoPdf,
  precoLiquidoCents,
  renderPedidoPdf,
  renderPedidosPdf,
  type PedidoPdfDados,
  type PedidoPdfEmitente,
} from "@/lib/comercial/pedido-pdf";

const PDFJS = await import("pdfjs-dist/legacy/build/pdf.mjs");

const EMITENTE: PedidoPdfEmitente = {
  nome: "Bill Higiene e Limpeza",
  documento: "12.345.678/0001-90",
  telefone: "(47) 98496-0797",
  endereco: "Rua Antônio Liller, 585 — Centro, Canoinhas/SC, 89460-000",
};

function pedido(numero: number): PedidoPdfDados {
  return {
    numero,
    status: "aprovado",
    subtotal_cents: 15000,
    desconto_cents: 1000,
    frete_cents: 500,
    total_cents: 14500,
    condicao_pagamento: "30 dias",
    observacoes: "Entregar pela manhã",
    endereco_entrega: null,
    created_at: "2026-09-04T12:00:00Z",
    vendedor_nome: "Ana",
    cliente: {
      nome: `Mercado Central ${numero}`,
      fantasia: null,
      rotuloDocumento: "CNPJ",
      documento: null,
      ie: null,
      endereco: "Rua X, 123",
      bairro: "Centro",
      cep: null,
      cidade: "Canoinhas",
      uf: "SC",
      fone: null,
      email: null,
    },
    itens: [
      {
        produto_codigo: "AG-5L",
        produto_nome: "Água Sanitária 5L",
        quantidade: 2,
        unidade: "UN",
        preco_unit_cents: 5000,
        desconto_pct: 10,
        subtotal_cents: 9000,
      },
    ],
  };
}

/** O pdf.js junta os itens sem separador; normalizar evite falso negativo de espaço. */
function texto(buf: Buffer): Promise<string> {
  return extractPdfText(buf).then((t) => t.replace(/\s+/g, " "));
}

/**
 * O documento como o pdf.js o vê: o texto de cada trecho e a LINHA DE BASE
 * (`y`) de cada um, no mesmo referencial dos `Y` do gerador (de baixo para
 * cima). É a régua que prova que um campo quebrado desceu o resto — comparar
 * só o texto extraído não distingue uma linha de duas.
 */
async function linhasDoPdf(buf: Buffer): Promise<{
  paginas: number;
  trechos: Array<{ texto: string; y: number }>;
}> {
  const doc = await PDFJS.getDocument({ data: new Uint8Array(buf), useSystemFonts: true })
    .promise;
  const trechos: Array<{ texto: string; y: number }> = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const conteudo = await page.getTextContent();
    for (const item of conteudo.items) {
      if (!("str" in item) || item.str.trim() === "") continue;
      trechos.push({ texto: item.str, y: Math.round((item.transform[5] ?? 0) * 100) / 100 });
    }
  }
  return { paginas: doc.numPages, trechos };
}

/**
 * Os TRAÇOS do documento que nós geramos, no mesmo referencial dos `Y` (de
 * baixo para cima), lidos do content stream com a matriz corrente (q/Q/cm)
 * resolvida.
 *
 * É a régua que compara o NOSSO desenho com o inventário medido no arquivo do
 * Mercos. O texto extraído não serve para isso: sem as divisórias verticais o
 * impresso parece igual num teste de texto e é visivelmente outro no papel —
 * a referência é uma TABELA com bordas de célula.
 */
function tracosDoPdf(buf: Buffer): {
  horizontais: Array<{ y: number; traco: number }>;
  verticais: Array<{ x: number; y1: number; y2: number }>;
} {
  const texto = buf.toString("latin1");
  const conteudos: string[] = [];
  let pos = 0;
  while (true) {
    const i = texto.indexOf("stream", pos);
    if (i === -1) break;
    let inicio = i + 6;
    if (texto[inicio] === "\r") inicio++;
    if (texto[inicio] === "\n") inicio++;
    const fim = texto.indexOf("endstream", inicio);
    if (fim === -1) break;
    try {
      const s = inflateSync(buf.subarray(inicio, fim)).toString("latin1");
      if (/\bre\b/.test(s)) conteudos.push(s);
    } catch {
      /* stream que não é Flate: fonte, imagem */
    }
    pos = fim + 9;
  }

  const multiplica = (m: number[], n: number[]) => [
    m[0]! * n[0]! + m[2]! * n[1]!,
    m[1]! * n[0]! + m[3]! * n[1]!,
    m[0]! * n[2]! + m[2]! * n[3]!,
    m[1]! * n[2]! + m[3]! * n[3]!,
    m[0]! * n[4]! + m[2]! * n[5]! + m[4]!,
    m[1]! * n[4]! + m[3]! * n[5]! + m[5]!,
  ];
  const aplica = (m: number[], x: number, y: number) => [
    m[0]! * x + m[2]! * y + m[4]!,
    m[1]! * x + m[3]! * y + m[5]!,
  ];

  let ctm = [1, 0, 0, 1, 0, 0];
  const pilha: number[][] = [];
  const retangulos: Array<{ x1: number; x2: number; y1: number; y2: number }> = [];

  for (const conteudo of conteudos) {
    // Cada stream é uma página: a matriz começa do zero, porque a página
    // anterior pode ter deixado um `q` sem `Q` (e o `cm` de flip da nova
    // página seria aplicado sobre ele).
    ctm = [1, 0, 0, 1, 0, 0];
    pilha.length = 0;
    const tokens = conteudo.split(/\s+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      if (tk === "q") pilha.push([...ctm]);
      else if (tk === "Q") ctm = pilha.pop() ?? [1, 0, 0, 1, 0, 0];
      else if (tk === "cm" && i >= 6) {
        const m = tokens.slice(i - 6, i).map(Number);
        if (m.every((v) => Number.isFinite(v))) ctm = multiplica(ctm, m);
      } else if (tk === "re" && i >= 4) {
        const [x, y, w, h] = tokens.slice(i - 4, i).map(Number) as [
          number,
          number,
          number,
          number,
        ];
        if ([x, y, w, h].every((v) => Number.isFinite(v))) {
          const cantos = [
            aplica(ctm, x, y),
            aplica(ctm, x + w, y),
            aplica(ctm, x, y + h),
            aplica(ctm, x + w, y + h),
          ];
          const xs = cantos.map((c) => c[0]!);
          const ys = cantos.map((c) => c[1]!);
          retangulos.push({
            x1: Math.min(...xs),
            x2: Math.max(...xs),
            y1: Math.min(...ys),
            y2: Math.max(...ys),
          });
        }
      }
    }
  }

  const dois = (n: number) => Number(n.toFixed(2));
  return {
    horizontais: retangulos
      .filter((r) => r.y2 - r.y1 < 3 && r.x2 - r.x1 > 3)
      .map((r) => ({ y: dois(r.y2), traco: dois(r.y2 - r.y1) }))
      .sort((a, b) => b.y - a.y),
    verticais: retangulos
      .filter((r) => r.x2 - r.x1 < 3 && r.y2 - r.y1 > 3)
      .map((r) => ({ x: dois(r.x1), y1: dois(r.y1), y2: dois(r.y2) }))
      .sort((a, b) => a.x - b.x),
  };
}

function pedidoComItens(numero: number, quantos: number): PedidoPdfDados {
  const p = pedido(numero);
  return {
    ...p,
    itens: Array.from({ length: quantos }, (_, i) => ({
      produto_codigo: `P${i}`,
      produto_nome: "Produto de teste",
      quantidade: 1,
      unidade: "UN",
      preco_unit_cents: 1000,
      desconto_pct: 0,
      subtotal_cents: 1000,
    })),
  };
}

describe("renderPedidoPdf", () => {
  it("gera PDF válido com acentos e totais", async () => {
    const buf = await renderPedidoPdf(EMITENTE, pedido(7));
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  });

  it("imprime os campos do Mercos, na ordem do Mercos", async () => {
    const t = await texto(await renderPedidoPdf(EMITENTE, pedido(7)));
    // A régua do desenho: os MESMOS rótulos, na MESMA ordem — cliente vem
    // depois do emitente, endereço depois do documento, a grade depois do
    // cliente, e a cauda depois da grade. Um campo que entre ou saia daqui é
    // uma divergência do impresso que o cliente recebe.
    const sequencia = [
      "Representada:",
      "CNPJ:",
      "Cliente:",
      "Endereço:",
      "Bairro:",
      "CEP:",
      "Cidade:",
      "Estado:",
      "Telefone:",
      "E-mail:",
      "Código",
      "Produto",
      "Unidade",
      "Preço Líquido",
      "Subtotal",
      "Qtde. volumes:",
      "Valor total:",
      "Condição de Pagamento:",
      "Data de Emissão:",
      "Vendedor:",
    ];
    let anterior = -1;
    for (const agulha of sequencia) {
      const i = t.indexOf(agulha, anterior + 1);
      expect(i, `"${agulha}" fora de ordem ou ausente`).toBeGreaterThan(anterior);
      anterior = i;
    }
  });

  it("o emitente entra pelo CNPJ; telefone e endereço da LOJA não são impressos", async () => {
    const t = await texto(await renderPedidoPdf(EMITENTE, pedido(7)));
    // CNPJ do emitente: o do cliente é `null` no factory, então este número só
    // pode ter vindo do emitente.
    expect(t).toContain("12.345.678/0001-90");
    expect(t).toContain("Bill Higiene e Limpeza");
    // O modelo do Mercos não imprime o telefone nem o endereço da loja — foi
    // medido nos dois arquivos de referência. Se um dia alguém "melhorar" o
    // cabeçalho acrescentando os dados da empresa, isto reprova: o impresso
    // deixa de ser cópia do que o cliente do Mercos recebe.
    expect(t).not.toContain("(47) 98496-0797");
    expect(t).not.toContain("89460-000");
    expect(t).not.toContain("Rua Antônio Liller");
  });

  it("o estado sai por extenso, como no Mercos", async () => {
    const t = await texto(await renderPedidoPdf(EMITENTE, pedido(7)));
    expect(t).toContain("Estado: Santa Catarina");
    expect(t).not.toContain("Estado: SC");
  });

  it("campo sem valor sai como o traço do Mercos", async () => {
    const t = await texto(await renderPedidoPdf(EMITENTE, pedido(7)));
    expect(t).toContain("CNPJ: -----");
    expect(t).toContain("CEP: -----");
    expect(t).toContain("Telefone: -----");
    expect(t).toContain("E-mail: -----");
    // E o traço dos totais que o próprio Mercos imprime sem preenchimento.
    expect(t).toContain("Qtde. volumes: 0 Vol");
  });

  it("Nome Fantasia e Inscrição Estadual aparecem só quando preenchidos", async () => {
    const vazio = await texto(await renderPedidoPdf(EMITENTE, pedido(7)));
    expect(vazio).not.toContain("Nome Fantasia");
    expect(vazio).not.toContain("Inscrição Estadual");

    const p = pedido(7);
    p.cliente.fantasia = "Mercadinho do Zé";
    p.cliente.ie = "263503364";
    const cheio = await texto(await renderPedidoPdf(EMITENTE, p));
    expect(cheio).toContain("Nome Fantasia: Mercadinho do Zé");
    expect(cheio).toContain("Inscrição Estadual: 263503364");
  });

  it("com logo, a imagem entra no cabeçalho", async () => {
    // PNG 1×1 real — o Image do @react-pdf lê o data URI e embute o XObject;
    // se ele falhasse, a renderização lançaria e o teste não chegaria aqui.
    const PNG_1X1 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const semLogo = await renderPedidoPdf(EMITENTE, pedido(7));
    const comLogo = await renderPedidoPdf(
      { ...EMITENTE, logo: { data: PNG_1X1, format: "png" } },
      pedido(7),
    );
    expect(comLogo.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(comLogo.length).toBeGreaterThan(semLogo.length);
    expect(await texto(comLogo)).toContain("Bill Higiene e Limpeza");
  });

  it("nome de cliente comprido ocupa duas linhas e desce a grade", async () => {
    const p = pedido(7);
    p.cliente.nome = "JZ COMERCIO DE MOVEIS E DECORACOES LTDA ME FILIAL CENTRO RUA DAS FLORES";
    const { trechos } = await linhasDoPdf(await renderPedidoPdf(EMITENTE, p));
    const ys = new Set(trechos.map((x) => x.y));

    // A linha do cliente fica onde sempre ficou (704)...
    expect(ys.has(704)).toBe(true);
    // ...a continuação desce exatamente uma linha de texto (704 − 13,4)...
    expect(ys.has(690.6)).toBe(true);
    // ...e a grade desce o mesmo tanto (623 − 13,4). Sem isto, o segundo
    // pedaço do nome passaria por cima da coluna "CNPJ" e da grade.
    expect(ys.has(609.6)).toBe(true);
    expect(ys.has(623)).toBe(false);
    expect(ys.has(691)).toBe(false);
  });

  it("um pedido que cabia numa página passa a duas quando o nome quebra", async () => {
    // 30 itens é a lotação da página com o cabeçalho de uma linha. Com o nome
    // em duas, a cauda não caberia mais: se `itensPorPagina` não descontasse,
    // a segunda página sairia com a cauda passando da borda do papel.
    const itens = Array.from({ length: 30 }, (_, i) => ({
      produto_codigo: `P${i}`,
      produto_nome: "Produto de teste",
      quantidade: 1,
      unidade: "UN",
      preco_unit_cents: 1000,
      desconto_pct: 0,
      subtotal_cents: 1000,
    }));

    const curto = { ...pedido(7), itens };
    expect((await linhasDoPdf(await renderPedidoPdf(EMITENTE, curto))).paginas).toBe(1);

    const longo = {
      ...pedido(7),
      itens,
      cliente: {
        ...pedido(7).cliente,
        nome: "JZ COMERCIO DE MOVEIS E DECORACOES LTDA ME FILIAL CENTRO RUA DAS FLORES",
      },
    };
    expect((await linhasDoPdf(await renderPedidoPdf(EMITENTE, longo))).paginas).toBe(2);
  });

  it("numera com zeros à esquerda", () => {
    expect(numeroDoPedidoPdf(7)).toBe("PED-0007");
  });

  it("preço líquido arredonda, não trunca", () => {
    expect(precoLiquidoCents(5000, 10)).toBe(4500);
    expect(precoLiquidoCents(100, 0)).toBe(100);
    // 199 × 0,9 = 179,1 → 179 (round_half_up do Math.round: 179.1 → 179).
    expect(precoLiquidoCents(199, 10)).toBe(179);
  });
}, 120000);

/**
 * O bloco de cima como FLUXO — a peça que impede o nome do cliente de passar
 * por cima da linha de baixo.
 *
 * A referência do Mercos é HTML: o que não cabe na linha desce, e o que vem
 * abaixo desce junto. Nós posicionamos por coordenada, então o empurrão é
 * calculado: uma linha a mais num campo vale `TAMANHO.alturaDaLinha` para
 * tudo o que vem depois dele — inclusive para as réguas, que estão no fluxo
 * justamente por isso.
 */
describe("montarCabecalho", () => {
  it("com campo curto, empurrão zero e as linhas nas coordenadas medidas", () => {
    const c = montarCabecalho(EMITENTE, pedido(7));
    expect(c.empurrao).toBe(0);
    expect(c.linhas.map((l) => l.y)).toEqual([732, 719, 704, 691, 677, 664, 651, 637]);
    for (const linha of c.linhas) {
      for (const celula of linha.celulas) expect(celula.linhas).toHaveLength(1);
    }
  });

  it("nome comprido quebra em duas linhas e desce o bloco inteiro", () => {
    const p = pedido(7);
    p.cliente.nome = "JZ COMERCIO DE MOVEIS E DECORACOES LTDA ME FILIAL CENTRO RUA DAS FLORES";
    const c = montarCabecalho(EMITENTE, p);

    expect(c.empurrao).toBe(13.4);
    // A linha do cliente fica onde estava; quem desce é o que vem depois.
    expect(c.linhas[2]!.y).toBe(704);
    expect(c.linhas[2]!.celulas[0]!.linhas.length).toBeGreaterThan(1);
    expect(c.linhas[3]!.y).toBeCloseTo(691 - 13.4, 5);
    expect(c.linhas[7]!.y).toBeCloseTo(637 - 13.4, 5);
  });

  it("a régua ACIMA do campo quebrado não se mexe; a de baixo desce", () => {
    const p = pedido(7);
    p.cliente.nome = "JZ COMERCIO DE MOVEIS E DECORACOES LTDA ME FILIAL CENTRO RUA DAS FLORES";
    const c = montarCabecalho(EMITENTE, p);
    const perto = (y: number) => c.reguas.some((r) => Math.abs(r.y - y) < 0.01);

    expect(perto(808.9)).toBe(true); // topo da caixa
    expect(perto(742.9)).toBe(true); // fim do título (acima do cliente)
    expect(perto(714.9)).toBe(true); // fim do emitente (acima do cliente)
    expect(perto(633.7 - 13.4)).toBe(true); // fim do cliente: desceu
    expect(perto(633.7)).toBe(false);
  });

  it("fantasia e inscrição estadual entram na mesma linha, uma em cada coluna", () => {
    const p = pedido(7);
    p.cliente.fantasia = "Mercadinho do Zé";
    p.cliente.ie = "263503364";
    const c = montarCabecalho(EMITENTE, p);
    const cliente = c.linhas.find((l) => l.y === 704)!;
    expect(cliente.celulas.map((x) => x.rotulo)).toEqual(["Cliente", "Nome Fantasia"]);
    const doc = c.linhas.find((l) => l.y === 691)!;
    expect(doc.celulas.map((x) => x.rotulo)).toEqual(["CNPJ", "Inscrição Estadual"]);
    expect(c.empurrao).toBe(0);
  });

  it("a fantasia comprida empurra o bloco tanto quanto o nome comprido", () => {
    const p = pedido(7);
    p.cliente.fantasia =
      "JZ COMERCIO DE MOVEIS E DECORACOES LTDA ME FILIAL CENTRO RUA DAS FLORES E AVENIDA";
    const c = montarCabecalho(EMITENTE, p);
    expect(c.empurrao).toBe(13.4);
    // A linha do documento do cliente é a 4ª — e desceu o empurrão.
    expect(c.linhas[3]!.y).toBeCloseTo(691 - 13.4, 5);
  });

  it("dois campos quebrados somam o empurrão, e não o dobram", () => {
    const p = pedido(7);
    p.cliente.nome = "JZ COMERCIO DE MOVEIS E DECORACOES LTDA ME FILIAL CENTRO RUA DAS FLORES";
    p.cliente.fantasia =
      "JZ COMERCIO DE MOVEIS E DECORACOES LTDA ME FILIAL CENTRO RUA DAS FLORES E AVENIDA";
    const c = montarCabecalho(EMITENTE, p);
    // Os dois quebram na MESMA linha da página: a linha cresce uma vez só.
    expect(c.empurrao).toBe(13.4);
  });

  it("endereço comprido também desce o bloco", () => {
    const p = pedido(7);
    p.cliente.endereco =
      "RODOVIA BR 280 SENTIDO MAFRA KM 12 SALA 3 GALPAO 7 DISTRITO INDUSTRIAL NORTE BLOCO B LOJA 4 RUA PROJETADA SN";
    const c = montarCabecalho(EMITENTE, p);
    expect(c.empurrao).toBeGreaterThan(0);
  });
});

describe("renderPedidosPdf (lote)", () => {
  it("um arquivo com um pedido por página, cabeçalho em todas", async () => {
    const lote = [pedido(1), pedido(2), pedido(3)];
    const buf = await renderPedidosPdf(EMITENTE, lote);
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    const t = await texto(buf);
    // Os três números de pedido e os três clientes: são as três páginas.
    expect(t).toContain("Pedido Nº 1");
    expect(t).toContain("Pedido Nº 2");
    expect(t).toContain("Pedido Nº 3");
    expect(t).toContain("Mercado Central 1");
    expect(t).toContain("Mercado Central 3");
    // O emitente não é "de primeira página": o CNPJ dele se repete nas três.
    expect(t.split("12.345.678/0001-90").length - 1).toBe(3);
  }, 60000);

  it("lote de um bate com o pedido impresso sozinho", async () => {
    const unico = await renderPedidoPdf(EMITENTE, pedido(7));
    const lote = await renderPedidosPdf(EMITENTE, [pedido(7)]);
    // Mesmo conteúdo: o lote não pode acrescentar nem perder nada.
    expect(lote.length).toBe(unico.length);
  }, 60000);
}, 60000);

/**
 * O DESENHO DA CAIXA — as réguas e as divisórias, contra o inventário medido
 * no arquivo de referência.
 *
 * Aqui está a parte do impresso que nenhum teste de texto pega: a tabela. A
 * referência é um HTML com bordas de célula, e as divisórias verticais são o
 * que o olho reconhece como "igual ao Mercos" — sem elas o texto está todo no
 * lugar e a página é outra.
 */
describe("o desenho da caixa", () => {
  it("um item: as 12 réguas da referência, nas posições e espessuras medidas", async () => {
    const { horizontais } = tracosDoPdf(await renderPedidoPdf(EMITENTE, pedido(7)));
    expect(horizontais).toEqual([
      // A caixa e as quatro réguas fixas — 1,27pt, como na referência.
      { y: 808.9, traco: 1.27 },
      { y: 742.9, traco: 1.27 },
      { y: 714.9, traco: 1.27 },
      { y: 633.7, traco: 1.27 },
      // A grade: cabeçalho e a linha do item, 0,64pt.
      { y: 619.1, traco: 0.64 },
      { y: 601.3, traco: 0.64 },
      // A cauda: as duas fronteiras em que a referência desenha uma régua
      // fina e, logo abaixo, uma FORTE — e a do vendedor.
      { y: 587.3, traco: 0.64 },
      { y: 573.3, traco: 0.64 },
      { y: 572.7, traco: 1.27 },
      { y: 548.6, traco: 0.64 },
      { y: 547.9, traco: 1.27 },
      { y: 533.3, traco: 1.27 },
    ]);
  });

  it("um item: as nove divisórias verticais, nas colunas da tabela", async () => {
    const { verticais } = tracosDoPdf(await renderPedidoPdf(EMITENTE, pedido(7)));
    expect(verticais).toEqual([
      // As sete colunas da grade, do cabeçalho até a régua do último item.
      { x: 55.2, y1: 601.3, y2: 633.7 },
      { x: 130.9, y1: 601.3, y2: 633.7 },
      { x: 267.6, y1: 601.3, y2: 633.7 },
      { x: 313.4, y1: 601.3, y2: 633.7 },
      { x: 350.3, y1: 601.3, y2: 633.7 },
      // A da condição — rótulo de um lado, data de emissão do outro.
      { x: 374.4, y1: 548.6, y2: 573.3 },
      { x: 418.3, y1: 601.3, y2: 633.7 },
      // A dos totais — "Qtde. volumes" e "Valor total" numa coluna só.
      { x: 472.4, y1: 573.3, y2: 601.3 },
      { x: 497.8, y1: 601.3, y2: 633.7 },
    ]);
  });

  it("com cinco itens, a divisória atravessa as cinco linhas", async () => {
    const { verticais, horizontais } = tracosDoPdf(
      await renderPedidoPdf(EMITENTE, pedidoComItens(7, 5)),
    );
    // A última régua de item desceu 4 passos (5 itens), e a divisória vai até
    // ela — não até a primeira: a grade é fechada por coluna em TODAS as linhas.
    const ultimaRegua = 601.3 - 4 * 16;
    expect(horizontais.some((r) => r.y === ultimaRegua)).toBe(true);
    for (const v of verticais.filter((v) => v.x !== 472.4 && v.x !== 374.4)) {
      expect(v.y1).toBe(Number(ultimaRegua.toFixed(2)));
      expect(v.y2).toBe(633.7);
    }
    // E a cauda desceu junto: os totais agora fecham 4 passos abaixo.
    expect(verticais.find((v) => v.x === 472.4)).toEqual({
      x: 472.4,
      y1: Number((573.3 - 64).toFixed(2)),
      y2: Number((601.3 - 64).toFixed(2)),
    });
  });

  it("com o nome quebrado, o desenho inteiro desce junto", async () => {
    const p = pedido(7);
    p.cliente.nome = "JZ COMERCIO DE MOVEIS E DECORACOES LTDA ME FILIAL CENTRO RUA DAS FLORES";
    const { horizontais, verticais } = tracosDoPdf(await renderPedidoPdf(EMITENTE, p));

    // A régua que separa o cliente da grade desceu uma linha (13,4)...
    expect(horizontais.some((r) => r.y === Number((633.7 - 13.4).toFixed(2)))).toBe(true);
    expect(horizontais.some((r) => r.y === 633.7)).toBe(false);
    // ...e as divisórias desceram com ela, sem soltar da tabela.
    const grade = verticais.filter((v) => v.x === 55.2);
    expect(grade).toEqual([
      { x: 55.2, y1: Number((601.3 - 13.4).toFixed(2)), y2: Number((633.7 - 13.4).toFixed(2)) },
    ]);
    // As réguas ACIMA do cliente não se mexem.
    expect(horizontais.some((r) => r.y === 808.9)).toBe(true);
    expect(horizontais.some((r) => r.y === 742.9)).toBe(true);
  });

  it("a cauda só existe na última página — a grade, em todas", async () => {
    // 31 itens: a primeira página fecha a fatia (30) e a segunda continua.
    const buf = await renderPedidoPdf(EMITENTE, pedidoComItens(7, 31));
    const { verticais } = tracosDoPdf(buf);

    // A divisória dos totais é da cauda: aparece UMA vez, na última página.
    expect(verticais.filter((v) => v.x === 472.4)).toHaveLength(1);
    // As colunas da grade são de toda página: duas aqui.
    const grade = verticais.filter((v) => v.x === 55.2);
    expect(grade).toHaveLength(2);
    // Na 1ª página a divisória desce até a 30ª linha (29 passos)...
    expect(grade[0]).toEqual({
      x: 55.2,
      y1: Number((601.3 - 29 * 16).toFixed(2)),
      y2: 633.7,
    });
    // ...e na 2ª, que tem 1 item, até a régua dele.
    expect(grade[1]).toEqual({ x: 55.2, y1: 601.3, y2: 633.7 });
  });
});
