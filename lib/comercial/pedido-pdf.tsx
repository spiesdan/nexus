/**
 * O PEDIDO EM PDF — a impressão "Imprimir pedidos" do Mercos, reproduzida.
 *
 * Renderizado para Buffer via @react-pdf/renderer pelas rotas
 * `GET /api/v1/commercial-orders/[id]/pdf` (um pedido) e
 * `GET /api/v1/commercial-orders/pdf?ids=…` (o lote, um pedido por página).
 *
 * ## O que este documento é
 *
 * É a CÓPIA da impressão do Mercos, medida campo a campo nos arquivos que a
 * Bill usa hoje (`exemplo 1 pdf.pdf` — A4, 1 item; `exemplo 2 pdf.pdf` —
 * Letter, 5 itens): a mesma caixa com réguas, o mesmo logo no topo à direita,
 * o mesmo título centralizado, os mesmos rótulos, as mesmas colunas da grade
 * e as mesmas coordenadas. Nada aqui foi desenhado por nós — o desenho
 * anterior (faixa marinho, cartão do cliente em 2 colunas, tabela zebrada)
 * foi substituído justamente porque a régua é o impresso deles.
 *
 * Como a medida foi feita: PDF de referência → texto e posição de cada trecho
 * (pdf.js) + espessura de cada régua e borda (pixels da página rasterizada).
 * Os números vivem em `GEO` e `Y`, em pontos, no referencial MEDIDO no PDF de
 * referência: o `y` é a distância da BORDA INFERIOR para cima, que é como o
 * pdf.js devolve a linha de base. Quem converte para o `top` do @react-pdf é
 * `topo()` — e é ela a única fronteira entre os dois referenciais.
 *
 * ## O que não vem do modelo do Mercos, porque o dado não existe
 *
 * - **"Qtde. volumes"** é contagem de embalagens do Mercos. Não existe em
 *   `commercial_orders`/`commercial_order_items`. Sai `0 Vol`, que é
 *   exatamente o que o Mercos imprime quando ninguém preencheu o campo
 *   (medido no `exemplo 1`: um pedido com o campo vazio imprime `0 Vol`).
 *   Não é um número inventado nosso: é o valor deles para "não informado".
 * - **"Desc."** do item sai `-----` quando não há desconto — igual ao
 *   Mercos — e `N%` quando há (o modelo não mostra desconto nos dois
 *   arquivos, então o formato do valor positivo é o nosso).
 *
 * O que o Mercos imprime e nós NÃO temos, portanto não aparece: nada. O
 * emitente entra inteiro (nome no título, CNPJ na linha da representada);
 * telefone e endereço da loja não são impressos no modelo deles.
 *
 * ## Identidade
 *
 * O EMITENTE é a loja (`organizations.display_name/legal_name` + CNPJ) —
 * nunca a marca do software (doutrina white-label: `branding.test.ts` reprova
 * "Nexus" em código que alcança o usuário). Este documento não leva marca
 * nenhuma do produto.
 */
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { nomeDoEstado } from "@/lib/format/estados";
import type { StatusDoPedido } from "@/lib/schemas/pedidos";

import { larguraDoTexto, quebrarEmLinhas } from "./helvetica";

/** A4 em pontos — a página da referência (exemplo 1) e o que nós imprimimos. */
const A4 = { largura: 595.28, altura: 841.89 };

/**
 * @react-pdf posiciona um `Text` pela CAIXA; a referência foi medida pela
 * LINHA DE BASE. Esta é a distância entre as duas na Helvetica (mesma métrica
 * da Arial do Mercos) — calibrada contra o arquivo de referência.
 */
const BASE = 0.9;

/** Espessuras medidas nas réguas do arquivo de referência. */
const TRACO = { forte: 1.27, fina: 0.64 };

/** Horizontal: a caixa do documento, medida da referência. */
const GEO = {  esquerda: 36,
  direita: 302,
  caixaEsquerda: 33,
  caixaDireita: 566,
  /** As colunas da grade; cada caixa é a régua usada pelo valor E pelo rótulo. */
  numero: 36,
  codigo: 57,
  produto: 133,
  qtdeValor: { esquerda: 260, largura: 33 },
  unidade: { esquerda: 312, largura: 40 },
  desconto: { esquerda: 373, largura: 23 },
  precoValor: { esquerda: 430, largura: 66 },
  subtotalValor: { esquerda: 500, largura: 64 },
  /** Bloco de totais: rótulos alinhados à direita e valores à direita da caixa. */
  rotuloTotal: { esquerda: 380, largura: 90 },
  valorTotal: { esquerda: 500, largura: 64 },
  /** Coluna da direita dos blocos de cliente/condição. */
  segundaColuna: 377,
};

/** Vertical: linha de base (a que a referência usa) de cada linha do documento. */
const Y = {
  titulo: 778,
  numeroDoPedido: 766,
  representada: 732,
  representadaDoc: 719,
  cliente: 704,
  clienteDoc: 691,
  endereco: 677,
  bairro: 664,
  cidade: 651,
  telefone: 637,
  cabecalhoDaGrade: 623,
  primeiroItem: 607,
  /** Distância entre duas linhas da grade. */
  passoDaLinha: 16,
};

/**
 * Distâncias da CAUDA (totais, condição, vendedor) para a última linha da
 * grade. Medidas na referência com 1 item e conferidas com 5 itens no
 * exemplo 2 (Letter): a cauda anda junto com os itens, o resto não.
 */
const CAUDA = {
  volumes: 16,
  reguaDevolumes: 19.7,
  total: 30,
  reguaDoTotal: 33.7,
  reguaForteDoTotal: 34.3,
  condicao: 45,
  valorDaCondicao: 55,
  reguaDaCondicao: 58.4,
  reguaForteDaCondicao: 59.1,
  vendedor: 70,
  reguaDoVendedor: 73.7,
  baseDaCaixa: 88.3,
  /** Régua sob cada linha da grade. */
  reguaDoItem: 5.7,
  /** Régua sob o cabeçalho da grade. */
  reguaDoCabecalho: 3.9,
};

/** O topo da caixa do documento — a régua de cima, medida na referência. */
const TOPO_DA_CAIXA = 808.9;

/**
 * As réguas que NÃO dependem do conteúdo, medidas na referência.
 *
 * Elas vivem no fluxo do cabeçalho (ver `montarCabecalho`) porque também
 * descem quando um campo acima delas quebra em duas linhas: a régua que separa
 * o cliente da grade não pode ficar para trás se o nome do cliente ocupar duas
 * linhas — ela passaria por dentro do texto.
 */
const REGUAS_FIXAS = {
  /** O topo da caixa, acima do título. */
  topoDaCaixa: TOPO_DA_CAIXA,
  /** Fecha o bloco do título, acima da representada. */
  fimDoTitulo: 742.9,
  /** Separa o emitente do cliente. */
  fimDoEmitente: 714.9,
  /** Separa o cliente da grade. */
  fimDoCliente: 633.7,
} as const;

/** As larguras úteis das colunas do cabeçalho. */
const COLUNA = {
  /** A linha inteira (representada, endereço). */
  cheia: GEO.caixaDireita - GEO.esquerda - 3,
  /** A coluna da esquerda (cliente, bairro, cidade, telefone). */
  esquerda: GEO.direita - GEO.esquerda - 6,
  /** A coluna da direita (fantasia, CEP, estado, e-mail). */
  direita: GEO.caixaDireita - GEO.direita - 3,
};

/**
 * As DIVISÓRIAS VERTICAIS da tabela, medidas na referência.
 *
 * A impressão do Mercos é HTML: a grade e a cauda são uma tabela com bordas de
 * célula, não um conjunto de réguas soltas. As divisórias existem no arquivo
 * (retângulos de 1pt na largura, no fluxo do PDF) e são o que dá o aspecto de
 * tabela — sem elas o impresso fica visivelmente diferente do que o cliente
 * recebe hoje, mesmo com todo o texto no lugar.
 *
 * Cada coluna da grade é fechada dos dois lados, e a divisória atravessa o
 * cabeçalho E todas as linhas de item.
 */
const COLUNAS_DA_GRADE = [55.2, 130.9, 267.6, 313.4, 350.3, 418.3, 497.8];

/** A linha dos totais tem UMA divisória: rótulo à esquerda dela, valor à direita. */
const COLUNA_DOS_TOTAIS = 472.4;

/** A linha da condição tem uma divisória entre a condição e a data de emissão. */
const COLUNA_DA_CONDICAO = 374.4;

/**
 * Quantos itens cabem numa página quando o cabeçalho ocupa UMA linha em cada
 * campo.
 *
 * O 30 não veio do Mercos — a referência para na quinta linha de item (e é
 * outro papel, Letter). Ele vem do pé da caixa: com 30 itens a cauda termina a
 * 54,7pt da borda de baixo, que é a mesma folga que o `exemplo 1` deixa com um
 * item (607 − 88,3). É a lotação que a página aguenta sem apertar a margem.
 */
const ITENS_POR_PAGINA_BASE = 30;

/**
 * Quanto o cabeçalho pode empurrar a grade e quantas linhas cabem na página.
 *
 * Um campo quebrado em duas linhas empurra a grade (e a cauda) em 13,4pt, e a
 * página não estica: cada linha a mais se paga tirando um item da fatia (o
 * item vale 16pt, então cobre a linha). O número de "slots" continua sendo o
 * de antes para linha de uma linha só (30, menos o que o cabeçalho quebrado
 * consome): é a régua coberta pelos testes e a que deixa a cauda com a mesma
 * folga da referência. O que mudou é que cada item agora PESA o que ocupa —
 * uma descrição de duas linhas vale 29,4pt, não 16 — então a fatia é calculada
 * pelas alturas medidas, não por uma contagem fixa.
 */
function paginarGrade(linhas: LinhaDaGrade[], empurrao: number): LinhaDaGrade[][] {
  const slots = Math.max(
    1,
    ITENS_POR_PAGINA_BASE - Math.ceil(Math.max(0, empurrao) / Y.passoDaLinha),
  );
  // Linha de base da última linha visual do último item que ainda deixa a
  // cauda (totais/condição/vendedor) acima do pé da caixa.
  const minimo = Y.primeiroItem - empurrao - (slots - 1) * Y.passoDaLinha;

  const paginas: LinhaDaGrade[][] = [];
  let atual: LinhaDaGrade[] = [];
  let y = Y.primeiroItem - empurrao;

  for (const linha of linhas) {
    // A última linha VISUAL do item, não a primeira: um nome de duas linhas
    // ocupa a segunda antes de a cauda começar.
    const ultimaLinhaVisual = y - (linha.linhas - 1) * TAMANHO.alturaDaLinha;
    if (atual.length > 0 && ultimaLinhaVisual < minimo) {
      paginas.push(atual);
      atual = [];
      y = Y.primeiroItem - empurrao;
    }
    atual.push(linha);
    y -= linha.altura;
  }

  if (atual.length > 0 || paginas.length === 0) paginas.push(atual);
  return paginas;
}

const TAMANHO = { titulo: 10.2, corpo: 8.5, grade: 8.3, alturaDaLinha: 13.4 };

const styles = StyleSheet.create({
  pagina: { fontFamily: "Helvetica", color: "#000000", fontSize: TAMANHO.corpo },
  branco: { color: "#ffffff" },
});

export interface PedidoPdfLogo {
  data: string;
  format: "png" | "jpeg";
}

export interface PedidoPdfEmitente {
  nome: string;
  documento: string | null;
  /** Não é impresso no modelo do Mercos; segue no tipo porque a loja o tem. */
  telefone?: string | null;
  /** Idem: o modelo deles não imprime o endereço da loja. */
  endereco?: string | null;
  logo?: PedidoPdfLogo | null;
}

/** Bloco do cliente — os mesmos campos da impressão do Mercos. */
export interface PedidoPdfCliente {
  nome: string;
  fantasia: string | null;
  /** "CPF" ou "CNPJ" conforme o tipo da pessoa. */
  rotuloDocumento: string;
  documento: string | null;
  ie: string | null;
  endereco: string | null;
  bairro: string | null;
  cep: string | null;
  cidade: string | null;
  uf: string | null;
  fone: string | null;
  email: string | null;
}

export interface PedidoPdfItem {
  produto_codigo: string;
  produto_nome: string;
  quantidade: number;
  unidade: string;
  preco_unit_cents: number;
  desconto_pct: number;
  subtotal_cents: number;
}

export interface PedidoPdfDados {
  numero: number;
  status: StatusDoPedido;
  subtotal_cents: number;
  desconto_cents: number;
  frete_cents: number;
  total_cents: number;
  condicao_pagamento: string | null;
  observacoes: string | null;
  endereco_entrega: string | null;
  created_at: string;
  cliente: PedidoPdfCliente;
  vendedor_nome: string | null;
  itens: PedidoPdfItem[];
}

function moeda(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function dataFmt(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/**
 * Preço líquido do item: tabela × (1 − desconto). Mesmo arredondamento do
 * `subtotalDoItem` (round, não truncamento) para o impresso bater com a tela.
 */
export function precoLiquidoCents(precoUnitCents: number, descontoPct: number): number {
  return Math.round(precoUnitCents * (1 - Number(descontoPct ?? 0) / 100));
}

/** O nome do arquivo baixado — "PED-0007.pdf". Não é o que sai no papel. */
export function numeroDoPedidoPdf(numero: number): string {
  return `PED-${String(numero).padStart(4, "0")}`;
}

/** O que a referência imprime quando o campo está vazio. */
function ouTraco(valor: string | null | undefined): string {
  return valor?.trim() ? valor.trim() : "-----";
}

/** Larguras úteis das colunas da grade (as mesmas usadas no desenho). */
const LARGURA_DO_PRODUTO = 126;
const LARGURA_DO_CODIGO = 70;

/**
 * Quebra o texto na largura da coluna e, se uma palavra sozinha ainda passar,
 * corta por caractere.
 *
 * `quebrarEmLinhas` imita o navegador e NÃO corta palavra comprida — o que é
 * certo para nome de cliente (um nome cortado no meio engana mais). Na grade
 * é o contrário: um código ou descrição sem espaços (SKU colado, "60x80",
 * "C/100") atravessaria as colunas de Qtde./Unidade e borraria o impresso.
 */
function quebrarNaColuna(texto: string, largura: number, tamanho: number): string[] {
  const linhas = quebrarEmLinhas(
    texto,
    { primeira: largura, seguintes: largura },
    tamanho,
  );
  const saida: string[] = [];
  for (const linha of linhas) {
    if (larguraDoTexto(linha, tamanho) <= largura) {
      saida.push(linha);
      continue;
    }
    let atual = "";
    let larguraAtual = 0;
    for (const caractere of linha) {
      const doCaractere = larguraDoTexto(caractere, tamanho);
      if (atual !== "" && larguraAtual + doCaractere > largura) {
        saida.push(atual);
        atual = caractere;
        larguraAtual = doCaractere;
      } else {
        atual += caractere;
        larguraAtual += doCaractere;
      }
    }
    if (atual !== "") saida.push(atual);
  }
  return saida.length > 0 ? saida : [""];
}

/**
 * Corta o texto na largura da coluna com reticências.
 *
 * A coluna Código é um identificador, não prosa: nas notas importadas ela
 * carrega descrições longas ("RODO DE ALUMINIO 1MT C/ CABO 1,50MT REF025") e,
 * se quebrasse como o nome do produto, uma linha viraria cinco e abriria um
 * clarão branco nas colunas de valor. Um código truncado é honesto; uma linha
 * de 60pt de altura por causa dele não é.
 */
function truncarNaColuna(texto: string, largura: number, tamanho: number): string {
  if (larguraDoTexto(texto, tamanho) <= largura) return texto;
  const reticencias = "...";
  const limite = Math.max(0, largura - larguraDoTexto(reticencias, tamanho));
  let saida = "";
  let larguraAtual = 0;
  for (const caractere of texto) {
    const doCaractere = larguraDoTexto(caractere, tamanho);
    if (larguraAtual + doCaractere > limite) break;
    saida += caractere;
    larguraAtual += doCaractere;
  }
  return `${saida.trimEnd()}${reticencias}`;
}

/** Uma linha da grade já medida: o texto quebrado e a altura que ela ocupa. */
interface LinhaDaGrade {
  item: PedidoPdfItem;
  nome: string[];
  codigo: string;
  /** Quantas linhas de texto a linha mais alta da grade ocupa. */
  linhas: number;
  /** Altura total em pontos: 16 com uma linha, +13,4 por linha extra. */
  altura: number;
}

/**
 * Mede cada item ANTES de desenhar.
 *
 * O defeito que isto corrige: a descrição era desenhada numa linha só e
 * passava por cima das colunas de Qtde./Unidade/Preço — visível em qualquer
 * pedido com nome de produto acima de ~30 caracteres. A página é posicionada
 * por coordenada, então quem não mede o texto não tem como empurrar o resto.
 */
function montarLinhasDaGrade(itens: PedidoPdfItem[]): LinhaDaGrade[] {
  return itens.map((item) => {
    const nome = quebrarNaColuna(
      item.produto_nome?.trim() ?? "",
      LARGURA_DO_PRODUTO,
      TAMANHO.grade,
    );
    const codigo = truncarNaColuna(
      ouTraco(item.produto_codigo),
      LARGURA_DO_CODIGO,
      TAMANHO.grade,
    );
    const linhas = Math.max(nome.length, 1);
    return {
      item,
      nome,
      codigo,
      linhas,
      altura: Y.passoDaLinha + (linhas - 1) * TAMANHO.alturaDaLinha,
    };
  });
}

/** Posição da CAIXA de texto a partir da linha de base medida. */
function topo(y: number, tamanho: number): number {
  return A4.altura - y - tamanho * BASE;
}

/**
 * Uma linha do documento, posicionada pela LINHA DE BASE e pela largura da
 * coluna — o mesmo par que a referência usa. O conteúdo pode misturar
 * negrito (rótulo) e normal (valor) dentro do mesmo `Text`, como no HTML
 * deles.
 */
function Linha({
  y,
  x,
  largura,
  tamanho = TAMANHO.corpo,
  alinhamento,
  negrito,
  cor,
  children,
}: {
  y: number;
  x: number;
  largura: number;
  tamanho?: number;
  alinhamento?: "left" | "right" | "center";
  negrito?: boolean;
  /** Cor do texto — o rodapé de página usa um cinza discreto. */
  cor?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ position: "absolute", left: x, top: topo(y, tamanho), width: largura }}>
      <Text
        style={{
          fontSize: tamanho,
          fontWeight: negrito ? "bold" : "normal",
          textAlign: alinhamento ?? "left",
          ...(cor ? { color: cor } : {}),
        }}
      >
        {children}
      </Text>
    </View>
  );
}

/**
 * Uma régua horizontal da caixa (a espessura foi medida, não escolhida).
 *
 * A espessura é a NOMINAL do arquivo de referência (0,64pt nas linhas da
 * grade, 1,27pt nas bordas e nas réguas de seção). Numa rasterização a 72dpi
 * ela sai mais clara que no arquivo do Mercos — artefato do leitor para
 * traços de sub-pixel, não do documento: em papel (300dpi+) os dois são a
 * mesma linha preta.
 */
function Regua({ y, traco }: { y: number; traco: number }) {
  return (
    <View
      style={{
        position: "absolute",
        left: GEO.caixaEsquerda,
        top: A4.altura - y,
        width: GEO.caixaDireita - GEO.caixaEsquerda,
        height: traco,
        backgroundColor: "#000000",
      }}
    />
  );
}

/**
 * Uma DIVISÓRIA VERTICAL da tabela — as colunas da grade e as duas da cauda.
 *
 * `y` é o TOPO da divisória (o maior y, no referencial do documento), e ela
 * desce `altura` pontos a partir dali.
 */
function Coluna({
  x,
  y,
  altura,
  traco,
}: {
  x: number;
  y: number;
  altura: number;
  traco: number;
}) {
  return (
    <View
      style={{
        position: "absolute",
        left: x,
        top: A4.altura - y,
        width: traco,
        height: altura,
        backgroundColor: "#000000",
      }}
    />
  );
}

/** "Rótulo: valor" — o rótulo em negrito, o valor normal, como na referência. */
function Campo({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <>
      <Text style={{ fontWeight: "bold" }}>{rotulo}: </Text>
      <Text>{ouTraco(valor)}</Text>
    </>
  );
}

// ---------------------------------------------------------------------------
// O CABEÇALHO COMO FLUXO
//
// A referência é uma página de HTML: cada linha ocupa a altura que o texto
// precisa, e o que vem abaixo desce junto. Nós posicionamos por coordenada —
// mais fiel enquanto tudo cabe numa linha, e um desastre quando não cabe (o
// nome quebrado passava por cima da linha de baixo).
//
// Então o cabeçalho é montado em FLUXO: as linhas e as réguas na ordem em que
// aparecem, cada uma reservando a altura das linhas de texto que realmente
// ocupa, e o empurrão acumulado desce o resto — inclusive a grade e a cauda.
// Quando nada quebra (o caso da referência), o empurrão é zero e cada linha
// cai exatamente na coordenada medida.
// ---------------------------------------------------------------------------

/** Uma célula do cabeçalho: o rótulo em negrito e o valor, numa largura. */
interface Celula {
  x: number;
  largura: number;
  rotulo: string;
  /** Já resolvido por `ouTraco`: nunca vazio. */
  valor: string;
}

/** Uma linha do cabeçalho: as células que dividem a mesma linha de base. */
interface LinhaDoCabecalho {
  y: number;
  celulas: Celula[];
}

/** O fluxo do cabeçalho, de cima para baixo: réguas e linhas. */
type ItemDoFluxo =
  | { tipo: "regua"; y: number; traco: number }
  | { tipo: "linha"; linha: LinhaDoCabecalho };

/** Uma célula já resolvida, com o valor quebrado nas linhas que vai ocupar. */
interface CelulaMontada extends Celula {
  linhas: string[];
}

/** O cabeçalho pronto para desenhar, com o empurrão que ele impõe ao resto. */
export interface CabecalhoMontado {
  linhas: Array<{ y: number; celulas: CelulaMontada[] }>;
  reguas: Array<{ y: number; traco: number }>;
  /** Quantos pontos o bloco cresceu por causa de campo quebrado (0 = nenhum). */
  empurrao: number;
}

/** As linhas de conteúdo do cabeçalho (sem as réguas), medidas na referência. */
function linhasDoCabecalho(emitente: PedidoPdfEmitente, pedido: PedidoPdfDados): LinhaDoCabecalho[] {
  const c = pedido.cliente;
  const estado = c.uf ? (nomeDoEstado(c.uf) ?? c.uf) : null;

  const representada = [emitente.nome, pedido.vendedor_nome ? ` / ${emitente.nome} - ${pedido.vendedor_nome}` : ""].join("");

  const linhas: LinhaDoCabecalho[] = [
    {
      y: Y.representada,
      celulas: [
        { x: GEO.esquerda, largura: COLUNA.cheia, rotulo: "Representada", valor: representada },
      ],
    },
    {
      y: Y.representadaDoc,
      celulas: [
        { x: GEO.esquerda, largura: COLUNA.cheia, rotulo: "CNPJ", valor: ouTraco(emitente.documento) },
      ],
    },
    {
      y: Y.cliente,
      celulas: [
        { x: GEO.esquerda, largura: COLUNA.esquerda, rotulo: "Cliente", valor: ouTraco(c.nome) },
        // Campo sem valor some inteiro (rótulo e valor): o Mercos não imprime
        // "Nome Fantasia: -----", ele não imprime nada — medido nos exemplos.
        ...(c.fantasia?.trim()
          ? [{ x: GEO.direita, largura: COLUNA.direita, rotulo: "Nome Fantasia", valor: c.fantasia.trim() }]
          : []),
      ],
    },
    {
      y: Y.clienteDoc,
      celulas: [
        { x: GEO.esquerda, largura: COLUNA.esquerda, rotulo: c.rotuloDocumento, valor: ouTraco(c.documento) },
        ...(c.ie?.trim()
          ? [{ x: GEO.direita, largura: COLUNA.direita, rotulo: "Inscrição Estadual", valor: c.ie.trim() }]
          : []),
      ],
    },
    {
      y: Y.endereco,
      celulas: [
        {
          x: GEO.esquerda,
          largura: COLUNA.cheia,
          rotulo: "Endereço",
          valor: ouTraco(c.endereco ?? pedido.endereco_entrega),
        },
      ],
    },
    {
      y: Y.bairro,
      celulas: [
        { x: GEO.esquerda, largura: COLUNA.esquerda, rotulo: "Bairro", valor: ouTraco(c.bairro) },
        { x: GEO.direita, largura: COLUNA.direita, rotulo: "CEP", valor: ouTraco(c.cep) },
      ],
    },
    {
      y: Y.cidade,
      celulas: [
        { x: GEO.esquerda, largura: COLUNA.esquerda, rotulo: "Cidade", valor: ouTraco(c.cidade) },
        { x: GEO.direita, largura: COLUNA.direita, rotulo: "Estado", valor: ouTraco(estado) },
      ],
    },
    {
      y: Y.telefone,
      celulas: [
        { x: GEO.esquerda, largura: COLUNA.esquerda, rotulo: "Telefone", valor: ouTraco(c.fone) },
        { x: GEO.direita, largura: COLUNA.direita, rotulo: "E-mail", valor: ouTraco(c.email) },
      ],
    },
  ];

  return linhas;
}

/** O fluxo completo: as réguas fixas intercaladas nas linhas medidas. */
function fluxoDoCabecalho(emitente: PedidoPdfEmitente, pedido: PedidoPdfDados): ItemDoFluxo[] {
  const [representada, representadaDoc, cliente, clienteDoc, endereco, bairro, cidade, telefone] =
    linhasDoCabecalho(emitente, pedido);

  return [
    { tipo: "regua", y: REGUAS_FIXAS.topoDaCaixa, traco: TRACO.forte },
    { tipo: "regua", y: REGUAS_FIXAS.fimDoTitulo, traco: TRACO.forte },
    { tipo: "linha", linha: representada! },
    { tipo: "linha", linha: representadaDoc! },
    { tipo: "regua", y: REGUAS_FIXAS.fimDoEmitente, traco: TRACO.forte },
    { tipo: "linha", linha: cliente! },
    { tipo: "linha", linha: clienteDoc! },
    { tipo: "linha", linha: endereco! },
    { tipo: "linha", linha: bairro! },
    { tipo: "linha", linha: cidade! },
    { tipo: "linha", linha: telefone! },
    { tipo: "regua", y: REGUAS_FIXAS.fimDoCliente, traco: TRACO.forte },
    // A régua fina sob o cabeçalho da grade pertence à GRADE, não ao bloco do
    // cliente: ela desce junto com a grade (e é a última coisa do fluxo).
    { tipo: "regua", y: Y.cabecalhoDaGrade - CAUDA.reguaDoCabecalho, traco: TRACO.fina },
  ];
}

/**
 * Monta o cabeçalho: quebra o valor de cada célula, mede quantas linhas cada
 * linha da página ocupa e acumula o empurrão.
 *
 * O empurrão de uma linha é a diferença entre a altura que ela ocupa e uma
 * linha só — e vale para TUDO que vem abaixo dela (inclusive para as réguas,
 * que por isso estão no fluxo).
 */
export function montarCabecalho(
  emitente: PedidoPdfEmitente,
  pedido: PedidoPdfDados,
): CabecalhoMontado {
  const linhas: CabecalhoMontado["linhas"] = [];
  const reguas: CabecalhoMontado["reguas"] = [];
  let empurrao = 0;

  for (const item of fluxoDoCabecalho(emitente, pedido)) {
    if (item.tipo === "regua") {
      reguas.push({ y: item.y - empurrao, traco: item.traco });
      continue;
    }

    const celulas = item.linha.celulas.map((celula) => ({
      ...celula,
      linhas: quebrarEmLinhas(
        celula.valor,
        {
          // O rótulo em negrito ocupa a frente da primeira linha.
          primeira: Math.max(1, celula.largura - larguraDoTexto(`${celula.rotulo}: `, TAMANHO.corpo, true)),
          seguintes: celula.largura,
        },
        TAMANHO.corpo,
      ),
    }));

    linhas.push({ y: item.linha.y - empurrao, celulas });

    const alturaEmLinhas = Math.max(...celulas.map((celula) => celula.linhas.length), 1);
    empurrao += (alturaEmLinhas - 1) * TAMANHO.alturaDaLinha;
  }

  return { linhas, reguas, empurrao };
}

/**
 * As linhas de base de cada item na página, de cima para baixo. A altura de
 * cada linha já inclui as linhas extras do nome (ver `montarLinhasDaGrade`).
 */
function posicoesDosItens(linhas: LinhaDaGrade[], primeiroY: number): number[] {
  const posicoes: number[] = [];
  let y = primeiroY;
  for (const linha of linhas) {
    posicoes.push(y);
    y -= linha.altura;
  }
  return posicoes;
}

/**
 * UMA PÁGINA do impresso, com a fatia de itens que couber nela.
 *
 * A cauda (totais, condição, vendedor) sai só na última página: repeti-la no
 * meio de um pedido longo somaria o mesmo total duas vezes numa pilha de papel
 * que o cliente lê de cima a baixo.
 */
function Pagina({
  emitente,
  pedido,
  cabecalho,
  linhas,
  continuacao,
  ultima,
  pagina,
  paginas,
}: {
  emitente: PedidoPdfEmitente;
  pedido: PedidoPdfDados;
  cabecalho: CabecalhoMontado;
  linhas: LinhaDaGrade[];
  continuacao: boolean;
  ultima: boolean;
  pagina: number;
  paginas: number;
}) {
  // Quanto o cabeçalho cresceu; a grade e a cauda descem o mesmo tanto (o
  // referencial do documento cresce para cima, então "descer" é subtrair).
  const empurrao = cabecalho.empurrao;
  const primeiroY = Y.primeiroItem - empurrao;

  // A linha de base de cada item, na ordem. A altura de cada um já inclui as
  // linhas extras do nome/código (ver `montarLinhasDaGrade`).
  const posicoes = posicoesDosItens(linhas, primeiroY);
  const ultimaLinha = linhas[linhas.length - 1];
  // Onde a cauda começa: a última linha VISUAL do último item. Com uma linha
  // só é a própria base (o caso da referência, coordenada intacta).
  const baseDoConteudo = ultimaLinha
    ? (posicoes[posicoes.length - 1] ?? primeiroY) -
      (ultimaLinha.linhas - 1) * TAMANHO.alturaDaLinha
    : primeiroY;
  const baseDaCaixa = ultima ? baseDoConteudo - CAUDA.baseDaCaixa : baseDoConteudo - 6;

  // Réguas da cauda — só quando a cauda existe (última página).
  const reguas = [
    ...cabecalho.reguas,
    ...linhas.map((linha, i) => ({
      y:
        (posicoes[i] ?? primeiroY) -
        (linha.linhas - 1) * TAMANHO.alturaDaLinha -
        CAUDA.reguaDoItem,
      traco: TRACO.fina,
    })),
    ...(ultima
      ? [
          { y: baseDoConteudo - CAUDA.reguaDevolumes, traco: TRACO.fina },
          { y: baseDoConteudo - CAUDA.reguaDoTotal, traco: TRACO.fina },
          { y: baseDoConteudo - CAUDA.reguaForteDoTotal, traco: TRACO.forte },
          { y: baseDoConteudo - CAUDA.reguaDaCondicao, traco: TRACO.fina },
          { y: baseDoConteudo - CAUDA.reguaForteDaCondicao, traco: TRACO.forte },
          { y: baseDoConteudo - CAUDA.reguaDoVendedor, traco: TRACO.forte },
        ]
      : []),
  ];

  // As divisórias verticais. A grade é fechada por coluna do cabeçalho até a
  // régua do ÚLTIMO item (as divisórias atravessam todas as linhas); a cauda,
  // que só existe na última página, fecha os totais numa coluna e a data de
  // emissão na outra.
  const topoDaGrade = REGUAS_FIXAS.fimDoCliente - empurrao;
  const colunas = [
    ...COLUNAS_DA_GRADE.map((x) => ({
      x,
      y: topoDaGrade,
      altura: topoDaGrade - (baseDoConteudo - CAUDA.reguaDoItem),
    })),
    ...(ultima
      ? [
          {
            // Do rótulo do item (a régua de cima) até a régua dos totais: a
            // coluna que fecha "Qtde. volumes" e "Valor total".
            x: COLUNA_DOS_TOTAIS,
            y: baseDoConteudo - CAUDA.reguaDoItem,
            altura: CAUDA.reguaDoTotal - CAUDA.reguaDoItem,
          },
          {
            x: COLUNA_DA_CONDICAO,
            y: baseDoConteudo - CAUDA.reguaDoTotal,
            altura: CAUDA.reguaDaCondicao - CAUDA.reguaDoTotal,
          },
        ]
      : []),
  ];

  return (
    <Page size="A4" style={styles.pagina}>
      {/* A caixa do documento: as quatro bordas, como na referência. */}
      <View
        style={{
          position: "absolute",
          left: GEO.caixaEsquerda,
          top: A4.altura - TOPO_DA_CAIXA,
          width: GEO.caixaDireita - GEO.caixaEsquerda,
          height: TOPO_DA_CAIXA - baseDaCaixa,
          borderWidth: TRACO.forte,
          borderColor: "#000000",
        }}
      />
      {/* Fundo do cabeçalho da grade: um cinza bem claro que separa os rótulos
          das linhas de item sem virar faixa pesada no papel. Desenhado antes
          das réguas para não cobrir as divisórias. */}
      <View
        style={{
          position: "absolute",
          left: GEO.caixaEsquerda + 0.5,
          top: A4.altura - topoDaGrade,
          width: GEO.caixaDireita - GEO.caixaEsquerda - 1,
          height: topoDaGrade - (Y.cabecalhoDaGrade - empurrao - CAUDA.reguaDoCabecalho),
          backgroundColor: "#f2f2f2",
        }}
      />
      {reguas.map((r, i) => (
        <Regua key={`r${i}`} y={r.y} traco={r.traco} />
      ))}
      {colunas.map((c, i) => (
        <Coluna key={`c${i}`} x={c.x} y={c.y} altura={c.altura} traco={TRACO.fina} />
      ))}

      {/* Cabeçalho: logo à direita, título e número centralizados. */}
      {emitente.logo && (
        <Image
          src={`data:image/${emitente.logo.format};base64,${emitente.logo.data}`}
          style={{ position: "absolute", left: 433, top: A4.altura - 805.9, width: 127 }}
        />
      )}
      <Linha y={Y.titulo} x={GEO.caixaEsquerda} largura={GEO.caixaDireita - GEO.caixaEsquerda} tamanho={TAMANHO.titulo} alinhamento="center" negrito>
        {emitente.nome}
      </Linha>
      <Linha y={Y.numeroDoPedido} x={GEO.caixaEsquerda} largura={GEO.caixaDireita - GEO.caixaEsquerda} tamanho={TAMANHO.titulo} alinhamento="center">
        Pedido Nº {pedido.numero}
        {continuacao ? " (continuação)" : ""}
      </Linha>

      {/* O cabeçalho do Mercos, montado em fluxo (ver `montarCabecalho`). */}
      {cabecalho.linhas.map((linha, i) => (
        <React.Fragment key={`cl${i}`}>
          {linha.celulas.map((celula, j) => (
            <React.Fragment key={`cc${j}`}>
              <Linha y={linha.y} x={celula.x} largura={celula.largura}>
                <Text style={{ fontWeight: "bold" }}>{celula.rotulo}: </Text>
                <Text>{celula.linhas[0]}</Text>
              </Linha>
              {/* As linhas seguintes do mesmo campo voltam à margem da coluna,
                  como no navegador — sem o rótulo na frente. */}
              {celula.linhas.slice(1).map((continuacaoDoCampo, k) => (
                <Linha
                  key={`cl${k}`}
                  y={linha.y - TAMANHO.alturaDaLinha * (k + 1)}
                  x={celula.x}
                  largura={celula.largura}
                >
                  {continuacaoDoCampo}
                </Linha>
              ))}
            </React.Fragment>
          ))}
        </React.Fragment>
      ))}

      {/* A grade: cabeçalho e itens, nas mesmas colunas da referência. */}
      <Linha y={Y.cabecalhoDaGrade - empurrao} x={GEO.numero} largura={40} tamanho={TAMANHO.grade} negrito>#</Linha>
      <Linha y={Y.cabecalhoDaGrade - empurrao} x={GEO.codigo} largura={70} tamanho={TAMANHO.grade} negrito>Código</Linha>
      <Linha y={Y.cabecalhoDaGrade - empurrao} x={GEO.produto} largura={140} tamanho={TAMANHO.grade} negrito>Produto</Linha>
      <Linha y={Y.cabecalhoDaGrade - empurrao} x={GEO.qtdeValor.esquerda} largura={GEO.qtdeValor.largura} tamanho={TAMANHO.grade} alinhamento="right" negrito>Qtde.</Linha>
      <Linha y={Y.cabecalhoDaGrade - empurrao} x={GEO.unidade.esquerda} largura={GEO.unidade.largura} tamanho={TAMANHO.grade} alinhamento="center" negrito>Unidade</Linha>
      <Linha y={Y.cabecalhoDaGrade - empurrao} x={GEO.desconto.esquerda} largura={GEO.desconto.largura} tamanho={TAMANHO.grade} alinhamento="center" negrito>Desc.</Linha>
      <Linha y={Y.cabecalhoDaGrade - empurrao} x={GEO.precoValor.esquerda} largura={GEO.precoValor.largura} tamanho={TAMANHO.grade} alinhamento="right" negrito>Preço Líquido</Linha>
      <Linha y={Y.cabecalhoDaGrade - empurrao} x={GEO.subtotalValor.esquerda} largura={GEO.subtotalValor.largura} tamanho={TAMANHO.grade} alinhamento="right" negrito>Subtotal</Linha>

      {linhas.map((linha, i) => {
        const y = posicoes[i] ?? primeiroY;
        const { item } = linha;
        return (
          <React.Fragment key={`item-${i}`}>
            <Linha y={y} x={GEO.numero} largura={20} tamanho={TAMANHO.grade}>{i + 1}</Linha>
            <Linha y={y} x={GEO.codigo} largura={LARGURA_DO_CODIGO} tamanho={TAMANHO.grade}>
              {linha.codigo}
            </Linha>
            {linha.nome.map((parte, k) => (
              <Linha
                key={`nome-${k}`}
                y={y - TAMANHO.alturaDaLinha * k}
                x={GEO.produto}
                largura={LARGURA_DO_PRODUTO}
                tamanho={TAMANHO.grade}
              >
                {parte}
              </Linha>
            ))}
            <Linha y={y} x={GEO.qtdeValor.esquerda} largura={GEO.qtdeValor.largura} tamanho={TAMANHO.grade} alinhamento="right">{item.quantidade}</Linha>
            <Linha y={y} x={GEO.unidade.esquerda} largura={GEO.unidade.largura} tamanho={TAMANHO.grade} alinhamento="center">{item.unidade || "UN"}</Linha>
            <Linha y={y} x={GEO.desconto.esquerda} largura={GEO.desconto.largura} tamanho={TAMANHO.grade} alinhamento="center">
              {Number(item.desconto_pct) > 0 ? `${Number(item.desconto_pct)}%` : "-----"}
            </Linha>
            <Linha y={y} x={GEO.precoValor.esquerda} largura={GEO.precoValor.largura} tamanho={TAMANHO.grade} alinhamento="right">
              {moeda(precoLiquidoCents(item.preco_unit_cents, item.desconto_pct))}
            </Linha>
            <Linha y={y} x={GEO.subtotalValor.esquerda} largura={GEO.subtotalValor.largura} tamanho={TAMANHO.grade} alinhamento="right">
              {moeda(item.subtotal_cents)}
            </Linha>
          </React.Fragment>
        );
      })}

      {ultima && (
        <>
          <Linha y={baseDoConteudo - CAUDA.volumes} x={GEO.rotuloTotal.esquerda} largura={GEO.rotuloTotal.largura} alinhamento="right" negrito>
            Qtde. volumes:
          </Linha>
          <Linha y={baseDoConteudo - CAUDA.volumes} x={GEO.valorTotal.esquerda} largura={GEO.valorTotal.largura} alinhamento="right">
            0 Vol
          </Linha>

          <Linha y={baseDoConteudo - CAUDA.total} x={GEO.rotuloTotal.esquerda} largura={GEO.rotuloTotal.largura} alinhamento="right" negrito>
            Valor total:
          </Linha>
          <Linha y={baseDoConteudo - CAUDA.total} x={GEO.valorTotal.esquerda} largura={GEO.valorTotal.largura} tamanho={9.4} alinhamento="right" negrito>
            {moeda(pedido.total_cents)}
          </Linha>

          <Linha y={baseDoConteudo - CAUDA.condicao} x={GEO.esquerda} largura={330} negrito>Condição de Pagamento:</Linha>
          <Linha y={baseDoConteudo - CAUDA.condicao} x={GEO.segundaColuna} largura={180} negrito>Data de Emissão:</Linha>
          <Linha y={baseDoConteudo - CAUDA.valorDaCondicao} x={GEO.esquerda} largura={330}>
            {ouTraco(pedido.condicao_pagamento)}
          </Linha>
          <Linha y={baseDoConteudo - CAUDA.valorDaCondicao} x={GEO.segundaColuna} largura={180}>
            {dataFmt(pedido.created_at)}
          </Linha>

          <Linha y={baseDoConteudo - CAUDA.vendedor} x={GEO.esquerda} largura={GEO.caixaDireita - GEO.esquerda - 3}>
            <Campo rotulo="Vendedor" valor={pedido.vendedor_nome} />
          </Linha>
        </>
      )}

      {/* Rodapé de paginação: só quando o pedido ocupa mais de uma folha —
          numa página só ele seria ruído, e na pilha de papel é o que evita
          perder a ordem das folhas. */}
      {paginas > 1 && (
        <Linha
          y={20}
          x={GEO.caixaEsquerda}
          largura={GEO.caixaDireita - GEO.caixaEsquerda}
          tamanho={7}
          alinhamento="center"
          cor="#666666"
        >
          Pedido Nº {pedido.numero} · página {pagina} de {paginas}
        </Linha>
      )}
    </Page>
  );
}

/**
 * O impresso de UM pedido — uma página por fatia de itens.
 *
 * O nome ficou no singular por continuidade com quem já o chamava; um pedido
 * com mais itens do que cabe numa página devolve mais de uma.
 */
export function PedidoPagina({
  emitente,
  pedido,
}: {
  emitente: PedidoPdfEmitente;
  pedido: PedidoPdfDados;
}) {
  // O cabeçalho é montado UMA vez: ele é o mesmo em todas as páginas do pedido,
  // e é ele que diz quantos itens a página aceita (campo quebrado desce a
  // grade e encurta a fatia).
  const cabecalho = montarCabecalho(emitente, pedido);
  const grade = montarLinhasDaGrade(pedido.itens);
  const fatias = paginarGrade(grade, cabecalho.empurrao);
  return (
    <>
      {fatias.map((linhas, i) => (
        <Pagina
          key={i}
          emitente={emitente}
          pedido={pedido}
          cabecalho={cabecalho}
          linhas={linhas}
          continuacao={i > 0}
          ultima={i === fatias.length - 1}
          pagina={i + 1}
          paginas={fatias.length}
        />
      ))}
    </>
  );
}

/** Um pedido só: um `<Document>` com uma página. */
export function PedidoPdf({
  emitente,
  pedido,
}: {
  emitente: PedidoPdfEmitente;
  pedido: PedidoPdfDados;
}) {
  return (
    <Document>
      <PedidoPagina emitente={emitente} pedido={pedido} />
    </Document>
  );
}

/**
 * Um LOTE num arquivo só — um pedido por página.
 *
 * É o que o botão "Imprimir pedidos" da lista entrega: até 50 pedidos
 * selecionados viram um PDF de até 50 páginas, com o mesmo cabeçalho em cada
 * uma. Um arquivo em vez de 50 abas.
 */
export function PedidosPdf({
  emitente,
  pedidos,
}: {
  emitente: PedidoPdfEmitente;
  pedidos: PedidoPdfDados[];
}) {
  return (
    <Document>
      {pedidos.map((p, i) => (
        <PedidoPagina key={i} emitente={emitente} pedido={p} />
      ))}
    </Document>
  );
}

export async function renderPedidoPdf(
  emitente: PedidoPdfEmitente,
  pedido: PedidoPdfDados,
): Promise<Buffer> {
  const buf = await renderToBuffer(<PedidoPdf emitente={emitente} pedido={pedido} />);
  return buf as Buffer;
}

/** Um PDF com todos os pedidos do lote, um por página. */
export async function renderPedidosPdf(
  emitente: PedidoPdfEmitente,
  pedidos: PedidoPdfDados[],
): Promise<Buffer> {
  const buf = await renderToBuffer(<PedidosPdf emitente={emitente} pedidos={pedidos} />);
  return buf as Buffer;
}
