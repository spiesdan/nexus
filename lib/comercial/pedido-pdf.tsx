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
 * "Deskcomm" em código que alcança o usuário). Este documento não leva marca
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
  /** As colunas da grade, cada uma com o x do cabeçalho e a caixa do valor. */
  numero: 36,
  codigo: 57,
  produto: 133,
  qtdeCabecalho: 280,
  qtdeValor: { esquerda: 260, largura: 33 },
  unidade: { esquerda: 312, largura: 40 },
  desconto: { esquerda: 373, largura: 23 },
  precoCabecalho: 441,
  precoValor: { esquerda: 430, largura: 66 },
  subtotalCabecalho: 531,
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
 * Quantos itens a página aceita com o cabeçalho que ESTE pedido tem.
 *
 * Um campo quebrado em duas linhas empurra a grade (e a cauda) em 13,4pt, e a
 * página não estica: cada linha a mais se paga tirando um item da fatia (o
 * item vale 16pt, então cobre a linha). Sem isso, um pedido de 30 itens com o
 * nome do cliente quebrado imprimiria a cauda para fora do papel.
 */
function itensPorPagina(empurrao: number): number {
  const itensAMenos = Math.ceil(Math.max(0, empurrao) / Y.passoDaLinha);
  return Math.max(1, ITENS_POR_PAGINA_BASE - itensAMenos);
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
  children,
}: {
  y: number;
  x: number;
  largura: number;
  tamanho?: number;
  alinhamento?: "left" | "right" | "center";
  negrito?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ position: "absolute", left: x, top: topo(y, tamanho), width: largura }}>
      <Text
        style={{
          fontSize: tamanho,
          fontWeight: negrito ? "bold" : "normal",
          textAlign: alinhamento ?? "left",
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

/** Divide os itens nas páginas do impresso. */
function paginar(itens: PedidoPdfItem[], porPagina: number): PedidoPdfItem[][] {
  if (itens.length === 0) return [[]];
  const paginas: PedidoPdfItem[][] = [];
  for (let i = 0; i < itens.length; i += porPagina) {
    paginas.push(itens.slice(i, i + porPagina));
  }
  return paginas;
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
  itens,
  continuacao,
  ultima,
}: {
  emitente: PedidoPdfEmitente;
  pedido: PedidoPdfDados;
  cabecalho: CabecalhoMontado;
  itens: PedidoPdfItem[];
  continuacao: boolean;
  ultima: boolean;
}) {
  // Quanto o cabeçalho cresceu; a grade e a cauda descem o mesmo tanto (o
  // referencial do documento cresce para cima, então "descer" é subtrair).
  const empurrao = cabecalho.empurrao;
  const ultimoItem = Y.primeiroItem - Y.passoDaLinha * Math.max(itens.length - 1, 0) - empurrao;
  const baseDaCaixa = ultima ? ultimoItem - CAUDA.baseDaCaixa : ultimoItem - 6;

  // Réguas da cauda — só quando a cauda existe (última página).
  const reguas = [
    ...cabecalho.reguas,
    ...itens.map((_, i) => ({
      y: Y.primeiroItem - empurrao - Y.passoDaLinha * i - CAUDA.reguaDoItem,
      traco: TRACO.fina,
    })),
    ...(ultima
      ? [
          { y: ultimoItem - CAUDA.reguaDevolumes, traco: TRACO.fina },
          { y: ultimoItem - CAUDA.reguaDoTotal, traco: TRACO.fina },
          { y: ultimoItem - CAUDA.reguaForteDoTotal, traco: TRACO.forte },
          { y: ultimoItem - CAUDA.reguaDaCondicao, traco: TRACO.fina },
          { y: ultimoItem - CAUDA.reguaForteDaCondicao, traco: TRACO.forte },
          { y: ultimoItem - CAUDA.reguaDoVendedor, traco: TRACO.forte },
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
      altura: topoDaGrade - (ultimoItem - CAUDA.reguaDoItem),
    })),
    ...(ultima
      ? [
          {
            // Do rótulo do item (a régua de cima) até a régua dos totais: a
            // coluna que fecha "Qtde. volumes" e "Valor total".
            x: COLUNA_DOS_TOTAIS,
            y: ultimoItem - CAUDA.reguaDoItem,
            altura: CAUDA.reguaDoTotal - CAUDA.reguaDoItem,
          },
          {
            x: COLUNA_DA_CONDICAO,
            y: ultimoItem - CAUDA.reguaDoTotal,
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
      <Linha y={Y.cabecalhoDaGrade - empurrao} x={GEO.qtdeCabecalho} largura={40} tamanho={TAMANHO.grade} negrito>Qtde.</Linha>
      <Linha y={Y.cabecalhoDaGrade - empurrao} x={GEO.unidade.esquerda} largura={GEO.unidade.largura} tamanho={TAMANHO.grade} alinhamento="center" negrito>Unidade</Linha>
      <Linha y={Y.cabecalhoDaGrade - empurrao} x={GEO.desconto.esquerda} largura={GEO.desconto.largura} tamanho={TAMANHO.grade} alinhamento="center" negrito>Desc.</Linha>
      <Linha y={Y.cabecalhoDaGrade - empurrao} x={GEO.precoCabecalho} largura={120} tamanho={TAMANHO.grade} negrito>Preço Líquido</Linha>
      <Linha y={Y.cabecalhoDaGrade - empurrao} x={GEO.subtotalCabecalho} largura={40} tamanho={TAMANHO.grade} negrito>Subtotal</Linha>

      {itens.map((item, i) => {
        const y = Y.primeiroItem - empurrao - Y.passoDaLinha * i;
        return (
          <React.Fragment key={`item-${i}`}>
            <Linha y={y} x={GEO.numero} largura={20} tamanho={TAMANHO.grade}>{i + 1}</Linha>
            <Linha y={y} x={GEO.codigo} largura={70} tamanho={TAMANHO.grade}>{ouTraco(item.produto_codigo)}</Linha>
            <Linha y={y} x={GEO.produto} largura={126} tamanho={TAMANHO.grade}>{item.produto_nome}</Linha>
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
          <Linha y={ultimoItem - CAUDA.volumes} x={GEO.rotuloTotal.esquerda} largura={GEO.rotuloTotal.largura} alinhamento="right" negrito>
            Qtde. volumes:
          </Linha>
          <Linha y={ultimoItem - CAUDA.volumes} x={GEO.valorTotal.esquerda} largura={GEO.valorTotal.largura} alinhamento="right">
            0 Vol
          </Linha>

          <Linha y={ultimoItem - CAUDA.total} x={GEO.rotuloTotal.esquerda} largura={GEO.rotuloTotal.largura} alinhamento="right" negrito>
            Valor total:
          </Linha>
          <Linha y={ultimoItem - CAUDA.total} x={GEO.valorTotal.esquerda} largura={GEO.valorTotal.largura} alinhamento="right">
            {moeda(pedido.total_cents)}
          </Linha>

          <Linha y={ultimoItem - CAUDA.condicao} x={GEO.esquerda} largura={330} negrito>Condição de Pagamento:</Linha>
          <Linha y={ultimoItem - CAUDA.condicao} x={GEO.segundaColuna} largura={180} negrito>Data de Emissão:</Linha>
          <Linha y={ultimoItem - CAUDA.valorDaCondicao} x={GEO.esquerda} largura={330}>
            {ouTraco(pedido.condicao_pagamento)}
          </Linha>
          <Linha y={ultimoItem - CAUDA.valorDaCondicao} x={GEO.segundaColuna} largura={180}>
            {dataFmt(pedido.created_at)}
          </Linha>

          <Linha y={ultimoItem - CAUDA.vendedor} x={GEO.esquerda} largura={GEO.caixaDireita - GEO.esquerda - 3}>
            <Campo rotulo="Vendedor" valor={pedido.vendedor_nome} />
          </Linha>
        </>
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
  const fatias = paginar(pedido.itens, itensPorPagina(cabecalho.empurrao));
  return (
    <>
      {fatias.map((itens, i) => (
        <Pagina
          key={i}
          emitente={emitente}
          pedido={pedido}
          cabecalho={cabecalho}
          itens={itens}
          continuacao={i > 0}
          ultima={i === fatias.length - 1}
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
