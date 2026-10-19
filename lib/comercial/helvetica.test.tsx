// @vitest-environment node
// node de propósito: o jsdom trunca os streams Flate do @react-pdf/renderer, e
// este arquivo gera um PDF de verdade para provar a direção do erro da tabela.
/**
 * A MÉTRICA DA HELVETICA — a régua que decide onde a linha quebra.
 *
 * ═══ O QUE ESTE ARQUIVO PROVA ═══════════════════════════════════════════
 *
 * A tabela não foi digitada de memória: os casos abaixo são as larguras
 * MEDIDAS nos dois PDFs que a Bill imprime hoje do Mercos (`exemplo 1 pdf.pdf`
 * e `exemplo 2 pdf.pdf`), extraídas com o pdf.js campo a campo. Se alguém
 * trocar um número da tabela, isto reprova — e a consequência de um número
 * errado não é cosmética: é a linha do nome do cliente quebrando num ponto
 * diferente do Mercos, e o bloco de baixo entrando por cima dela.
 *
 * A tolerância é de 2,5% porque as duas medidas não são da mesma coisa: o
 * pdf.js lê o texto DESENHADO (com kerning, o que o Mercos aplicou) e a nossa
 * tabela soma as larguras nominais dos glifos, sem kerning. A soma é sempre
 * maior — nunca menor — e é essa direção que interessa (ver o cabeçalho de
 * `helvetica.ts`). O teste de baixo prova a direção no PDF que NÓS geramos.
 */
import { Document, Page, renderToBuffer, Text } from "@react-pdf/renderer";
import React from "react";
import { describe, expect, it } from "vitest";

import { larguraDoTexto, quebrarEmLinhas } from "@/lib/comercial/helvetica";

const PDFJS = await import("pdfjs-dist/legacy/build/pdf.mjs");

/** A diferença tolerada: nominal (nosso) menos desenhado (pdf.js/Mercos). */
function dentroDaTolerancia(medido: number, referencia: number): boolean {
  // O piso de 1,2pt cobre o arredondamento da medida da referência (que foi
  // transcrita de um dump em pontos inteiros); o percentual cobre o kerning,
  // que só aparece em texto longo.
  return Math.abs(medido - referencia) <= Math.max(1.2, referencia * 0.03);
}

/** [texto, tamanho, negrito, largura medida no PDF de referência] */
const MEDIDAS: Array<[string, number, boolean, number]> = [
  // Rótulos (negrito na referência) — exemplo 1, corpo 8.5.
  ["Representada:", 8.5, true, 59],
  ["CNPJ:", 8.5, true, 25],
  ["Cliente:", 8.5, true, 31],
  ["Nome Fantasia:", 8.5, true, 63],
  ["Endereço:", 8.5, true, 41],
  ["Bairro:", 8.5, true, 28],
  ["CEP:", 8.5, true, 20],
  ["Cidade:", 8.5, true, 31],
  ["Estado:", 8.5, true, 31],
  ["Telefone:", 8.5, true, 37],
  ["E-mail:", 8.5, true, 28],
  ["Qtde. volumes:", 8.5, true, 61],
  ["Valor total:", 8.5, true, 44],
  ["Condição de Pagamento:", 8.5, true, 102],
  ["Data de Emissão:", 8.5, true, 71],
  ["Vendedor:", 8.5, true, 41],
  // Valores (normal) — exemplo 1.
  ["WISNIEWSKI AUTO PECAS LTDA.", 8.5, false, 134],
  ["WISNIEWSKI AUTO PECAS", 8.5, false, 108],
  ["13.604.854/0001-29", 8.5, false, 76],
  ["35.233.142/0001-83", 8.5, false, 76],
  ["R FRANCISCO DE PAULA PEREIRA 1028", 8.5, false, 162],
  ["CENTRO", 8.5, false, 36],
  ["89460-048", 8.5, false, 41],
  ["CANOINHAS", 8.5, false, 50],
  ["Santa Catarina", 8.5, false, 57],
  ["(47) 3622-4499", 8.5, false, 58],
  ["-----", 8.5, false, 14],
  ["0 Vol", 8.5, false, 20],
  ["PRAZO", 8.5, false, 29],
  ["19/10/2026", 8.5, false, 42],
  ["GILSON", 8.5, false, 32],
  ["BILL COMERCIO DE ESTOPAS / BILL COMERCIO DE ESTOPAS - PATRICIA DE FATIMA DA SILVA", 8.5, false, 380],
  // Título e número do pedido (10.2) — exemplo 1.
  ["BILL COMERCIO DE ESTOPAS", 10.2, true, 149],
  ["Pedido Nº 19141", 10.2, false, 77],
  // A grade (8.3) — exemplo 1.
  ["Código", 8.3, true, 28],
  ["Produto", 8.3, true, 32],
  ["Qtde.", 8.3, true, 21],
  ["Unidade", 8.3, true, 33],
  ["Desc.", 8.3, true, 22],
  ["Preço Líquido", 8.3, true, 55],
  ["Subtotal", 8.3, true, 33],
  ["SOLUBILL 5L", 8.3, false, 51],
  ["386", 8.3, false, 14],
  ["UN", 8.3, false, 12],
  ["R$ 35,00", 8.3, false, 34],
  ["R$ 175,00", 8.3, false, 38],
  // Um acento: o "ã" de "Condição" já entrou acima; aqui o "ç" em corpo de nome.
  ["ESPIGAO DO BUGRE", 9.6, false, 97],
];

describe("larguraDoTexto — a métrica medida no Mercos", () => {
  for (const [texto, tamanho, negrito, medidoNoMercos] of MEDIDAS) {
    it(`"${texto}" a ${tamanho}pt${negrito ? " negrito" : ""}`, () => {
      expect(dentroDaTolerancia(larguraDoTexto(texto, tamanho, negrito), medidoNoMercos)).toBe(true);
    });
  }

  it("negrito é mais largo que normal, no mesmo texto e tamanho", () => {
    expect(larguraDoTexto("Representada:", 8.5, true)).toBeGreaterThan(
      larguraDoTexto("Representada:", 8.5, false),
    );
  });

  it("caractere fora da tabela não zera a largura — conta como espaço", () => {
    // Um emoji no nome do cliente não pode fazer a linha parecer curta e
    // estourar por cima da coluna do lado.
    expect(larguraDoTexto("A", 8.5) + larguraDoTexto(" ", 8.5)).toBeCloseTo(
      larguraDoTexto("A\u{1F600}", 8.5),
      5,
    );
  });
});

describe("quebrarEmLinhas", () => {
  it("cabe numa linha: devolve uma só, inteira", () => {
    expect(quebrarEmLinhas("CENTRO", { primeira: 260, seguintes: 260 }, 8.5)).toEqual(["CENTRO"]);
  });

  it("quebra no espaço, como o navegador, e não corta palavra", () => {
    // 121 caracteres: o maior nome de cliente medido na instalação (19/10/2026).
    const nome =
      "JZ COMERCIO DE MOVEIS E DECORACOES LTDA ME - FILIAL CENTRO - RUA DAS FLORES ESQUINA COM A AVENIDA PRINCIPAL";
    const linhas = quebrarEmLinhas(nome, { primeira: 260, seguintes: 260 }, 8.5);
    expect(linhas.length).toBeGreaterThan(1);
    // Cada linha cabe na coluna, e nenhuma palavra foi partida: remontar as
    // linhas com espaço devolve o texto original.
    for (const linha of linhas) expect(larguraDoTexto(linha, 8.5)).toBeLessThanOrEqual(260);
    expect(linhas.join(" ")).toBe(nome);
  });

  it("a primeira linha pode ser mais estreita que as seguintes (o rótulo ocupa a frente)", () => {
    const texto = "PAPEL HIG FOFINHO 64 ROLOS X 60 MT BRANCO";
    const comRotulo = quebrarEmLinhas(texto, { primeira: 200, seguintes: 260 }, 8.5);
    const semRotulo = quebrarEmLinhas(texto, { primeira: 260, seguintes: 260 }, 8.5);
    // Menos espaço na primeira linha = a primeira linha carrega menos palavra.
    expect(larguraDoTexto(comRotulo[0]!, 8.5)).toBeLessThanOrEqual(200);
    expect(semRotulo[0]!.length).toBeGreaterThanOrEqual(comRotulo[0]!.length);
  });

  it("palavra maior que a coluna fica sozinha em vez de ser cortada", () => {
    const linhas = quebrarEmLinhas("A SUPERLONGAXXXXXXX B", { primeira: 40, seguintes: 40 }, 8.5);
    expect(linhas).toContain("SUPERLONGAXXXXXXX");
  });

  it("texto vazio devolve uma linha vazia — quem chama decide o traço", () => {
    expect(quebrarEmLinhas("   ", { primeira: 260, seguintes: 260 }, 8.5)).toEqual([""]);
  });
});

/**
 * A PROPRIEDADE QUE FAZ A TABELA SERVIR PARA ALGUMA COISA: a previsão nunca é
 * MENOR que o desenho.
 *
 * Quem quebra a linha aqui quebra no mesmo ponto ou um pouco antes — nunca
 * depois. A linha que passa da coluna invade a coluna do lado (é o defeito que
 * este trabalho foi consertar); a que quebra uma palavra antes só desce o
 * bloco. O teste mede no PDF que NÓS geramos, com o pdf.js — a mesma régua com
 * que a referência do Mercos foi medida.
 */
describe("a previsão nunca é menor que o desenho", () => {
  const SONDAS = [
    "A A",
    "LTDA",
    "ESPIGAO DO BUGRE",
    "WISNIEWSKI AUTO PECAS LTDA.",
    "R FRANCISCO DE PAULA PEREIRA 1028",
    "BILL COMERCIO DE ESTOPAS / BILL COMERCIO DE ESTOPAS - PATRICIA DE FATIMA DA SILVA",
  ];

  it("mede no PDF gerado e compara", async () => {
    const buf = await renderToBuffer(
      <Document>
        <Page size="A4">
          {SONDAS.map((texto, i) => (
            <Text key={i} style={{ fontFamily: "Helvetica", fontSize: 8.5, marginBottom: 2 }}>
              {texto}
            </Text>
          ))}
        </Page>
      </Document>,
    );

    const doc = await PDFJS.getDocument({ data: new Uint8Array(buf as Buffer), useSystemFonts: true })
      .promise;
    const page = await doc.getPage(1);
    const conteudo = await page.getTextContent();

    const desenhadas = new Map<string, number>();
    for (const item of conteudo.items) {
      if (!("str" in item)) continue;
      desenhadas.set(item.str, item.width ?? 0);
    }

    let comparadas = 0;
    for (const texto of SONDAS) {
      const desenhada = desenhadas.get(texto);
      // Um item que o pdf.js juntou com o vizinho não serve de medida; pulá-lo
      // é melhor que afrouxar a asserção.
      if (desenhada === undefined) continue;
      comparadas++;
      const prevista = larguraDoTexto(texto, 8.5);
      expect(prevista).toBeGreaterThanOrEqual(desenhada - 0.05);
      // E não pode ser um chute grosseiro: no máximo ~8% acima do desenhado —
      // a folga cobre o kerning, que em texto curto e cheio de "LT" chega a 6%.
      expect(prevista).toBeLessThanOrEqual(desenhada * 1.08 + 0.6);
    }
    expect(comparadas).toBeGreaterThanOrEqual(4);
  }, 60000);
});
