/**
 * PEDIDO LIDO PELO OCR — do texto da foto até a proposta de itens.
 *
 * ═══ O que é "treinar com os nossos produtos" aqui ══════════════════════════
 *
 * O motor de OCR (PaddleOCR) NÃO é retreinado. Retreinar exige centenas de
 * fotos de pedidos reais com cada linha transcrita à mão — dado que esta
 * instalação ainda não tem, e um modelo retreinado com pouco dado erra MAIS
 * que o genérico. O que "aprende" o catálogo é a etapa seguinte:
 *
 *   texto do OCR → `casarItensComCatalogo` → produto + confiança
 *
 * Essa busca já é a mesma do agente no WhatsApp e já é tolerante a erro de
 * digitação, acento, plural e número. "AGUA SANITARIA BILL SL" (o OCR trocou
 * o 5 por S) casa com "ÁGUA SANITÁRIA BILL 5L"; "ALVEJAMTE" casa "ALVEJANTE".
 * Produto novo no catálogo passa a valer na próxima leitura, sem retreino.
 *
 * ═══ Por que existe um PORTÃO ═══════════════════════════════════════════════
 *
 * OCR de manuscrito erra. Devolver uma proposta com metade dos itens faria o
 * vendedor fechar um pedido incompleto — pior que gastar uma chamada de IA.
 * Então o resultado do OCR só é usado quando passa em três testes: alguma
 * linha casou com o catálogo, a maioria dos itens casou, e a confiança média
 * das linhas aproveitadas é alta. Fora disso, `null` e a rota cai na IA.
 */
import type { Produto } from "@/lib/schemas/produtos";

import { casarItensComCatalogo, LIMITE_DE_ITENS, type ItemCasado, type ItemExtraido } from "./importar-ia";
import type { LeituraOcr, LinhaOcr } from "./ocr";

/**
 * Confiança média mínima das linhas que viraram item.
 *
 * Medido na foto de referência (`evidence/mercos-ia/pedido-manuscrito.png`,
 * letra de bloco): as linhas de produto ficam acima de 0.90. Texto impresso
 * fica acima de 0.95. Manuscrito cursivo e foto torta caem para 0.4–0.7, e é
 * exatamente aí que a IA é melhor. O limiar é o que separa os dois mundos.
 */
export const LIMIAR_DE_CONFIANCA = 0.7;

/** Linhas que nunca são produto: cabeçalho, total, dados do cliente. */
const RUIDO =
  /^(pedido|lista|itens|total|subtotal|desconto|acr[eé]scimo|cliente|endere[cç]o|data|telefone|fone|celular|whatsapp|cnpj|cpf|obs|observa[cç][aã]o|assinatura|recebido|entregue|pago|valor|vendedor|representante)\b/i;

/** Unidades que, coladas ao número, são MEDIDA do produto — não quantidade. */
const UNIDADES_DE_MEDIDA = "ml|l|lt|litro|litros|g|gr|grama|gramas|kg|cm|mm|m|%";

/** Unidades que, depois do número, dizem QUANTIDADE ("3 caixas"). */
const UNIDADES_DE_CONTAGEM =
  "un|und|unid|unidade|unidades|cx|caixa|caixas|pct|pacote|pacotes|dz|duzia|duzias";

const NUMERAIS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  doze: 12,
  duzia: 12,
};

function inteiro(bruto: string | undefined): number {
  const n = Number(bruto);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.min(100000, Math.round(n)));
}

function letras(texto: string): number {
  return (texto.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length;
}

function limpar(texto: string): string {
  return texto
    .replace(/\s+/g, " ")
    .replace(/^[\s•·\-–—*]+/, "")
    .replace(/[\s•·\-–—*]+$/, "")
    .trim();
}

/** Tira preço no fim da linha ("... 5L 12,50", "... R$ 12,50"). */
function semPreco(nome: string): string {
  return nome
    .replace(/\s+r?\$\s*\d+(?:[.,]\d{2})?\s*$/i, "")
    .replace(/\s+\d+[.,]\d{2}\s*$/, "")
    .trim();
}

/**
 * Separa a quantidade do nome.
 *
 * A ordem das regras importa. "5L" é TAMANHO; "5x" é QUANTIDADE. Por isso o
 * `x` vem antes de qualquer número solto, e a regra do número solto recusa
 * unidade de medida logo depois ("500 ml" não é 500 unidades de nada).
 */
export function separarQuantidade(texto: string): { quantidade: number; nome: string } {
  const comX = /^(\d{1,4})\s*[x×*]\s*(.+)$/i.exec(texto);
  if (comX?.[1] !== undefined && comX[2] !== undefined) {
    return { quantidade: inteiro(comX[1]), nome: comX[2] };
  }

  const comUnidade = new RegExp(
    `^(\\d{1,4})\\s*(?:${UNIDADES_DE_CONTAGEM})\\.?\\s+(.+)$`,
    "i",
  ).exec(texto);
  if (comUnidade?.[1] !== undefined && comUnidade[2] !== undefined) {
    return { quantidade: inteiro(comUnidade[1]), nome: comUnidade[2] };
  }

  const solto = new RegExp(
    `^(\\d{1,4})\\s+(?!(?:${UNIDADES_DE_MEDIDA})\\b)(.+)$`,
    "i",
  ).exec(texto);
  if (solto?.[1] !== undefined && solto[2] !== undefined) {
    return { quantidade: inteiro(solto[1]), nome: solto[2] };
  }

  const escrito = /^(um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|doze|meia\s+d[uú]zia|d[uú]zia)\s+(.+)$/i.exec(
    texto,
  );
  if (escrito?.[1] !== undefined && escrito[2] !== undefined) {
    const chave = escrito[1]
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
    return {
      quantidade: chave === "meia duzia" ? 6 : (NUMERAIS[chave] ?? 1),
      nome: escrito[2],
    };
  }

  return { quantidade: 1, nome: texto };
}

/**
 * CONSERTA O TAMANHO QUE O OCR TROCOU POR LETRA.
 *
 * Medido na foto de referência em 2026-10-24, com os modelos v5 mobile: a linha
 * "3X ÁLCOOL 46% 1L" volta do PaddleOCR como "3X ÁLCOOL 46% IL" — o "1" virou
 * "I". A busca então recebe a palavra "il", que não casa com nada, a nota do
 * item cai para 0,5 e a linha deixa de ser pré-selecionada mesmo com o produto
 * certo no catálogo. É a mesma família do "5L" que volta "SL".
 *
 * A regra é estreita de propósito: só o token que é UMA letra confundível
 * colada numa unidade de volume ("il", "sl", "ol"). "SOL", "BILL" e "GEL" não
 * são tocados porque a letra não está colada numa unidade — e um conserto largo
 * aqui viraria invenção de texto, que é pior que a leitura errada.
 */
const DIGITO_POR_LETRA: Record<string, string> = {
  // Só as duas confusões MEDIDAS nesta instalação. "o"→0, "z"→2 e "b"→8 são
  // plausíveis e não estão aqui de propósito: regra sem medição inventa texto.
  i: "1",
  l: "1",
  s: "5",
};

const CONFUSAO_DE_TAMANHO = /\b([ils])\s?(ml|l|lt)\b/gi;

export function consertarTamanhosDoOcr(texto: string): string {
  return texto.replace(CONFUSAO_DE_TAMANHO, (todo, letra: string, unidade: string) => {
    const digito = DIGITO_POR_LETRA[letra.toLowerCase()];
    return digito === undefined ? todo : `${digito}${unidade}`;
  });
}

/** Uma linha do OCR vira item — ou `null` quando é cabeçalho/ruído. */
export function itemDaLinha(bruta: string): ItemExtraido | null {
  const texto = consertarTamanhosDoOcr(limpar(bruta));
  if (texto.length < 3) return null;
  if (letras(texto) < 3) return null;
  if (RUIDO.test(texto)) return null;

  const { quantidade, nome } = separarQuantidade(texto);
  const nomeLimpo = semPreco(limpar(nome));
  if (nomeLimpo.length < 3 || letras(nomeLimpo) < 3) return null;

  return {
    nome: nomeLimpo.slice(0, 200),
    quantidade,
  };
}

interface LinhaAproveitada {
  item: ItemExtraido;
  confianca: number;
}

function aproveitarLinhas(linhas: readonly LinhaOcr[]): LinhaAproveitada[] {
  const aproveitadas: LinhaAproveitada[] = [];
  for (const linha of linhas) {
    const item = itemDaLinha(linha.texto);
    if (item !== null) aproveitadas.push({ item, confianca: linha.confianca });
  }
  return aproveitadas;
}

/** Só os itens, na ordem do papel. Exportado para teste e reuso. */
export function itensDeLinhasOcr(linhas: readonly LinhaOcr[]): ItemExtraido[] {
  return aproveitarLinhas(linhas)
    .map((aproveitada) => aproveitada.item)
    .slice(0, LIMITE_DE_ITENS);
}

export interface LeituraDoPedidoPorOcr {
  itens: ItemCasado[];
  total_extraido: number;
  /** Confiança média das linhas que viraram item (não das linhas de ruído). */
  confianca_media: number;
  linhas_lidas: number;
}

/**
 * A leitura do OCR que merece ser mostrada — ou `null` para cair na IA.
 *
 * O portão é conservador de propósito. O custo de recusar um OCR bom é uma
 * chamada de modelo; o custo de aceitar um OCR ruim é um pedido com item
 * faltando ou quantidade errada. Os dois erros não têm o mesmo preço.
 */
export function lerPedidoComOcr(
  leitura: LeituraOcr,
  produtos: readonly Produto[],
): LeituraDoPedidoPorOcr | null {
  const aproveitadas = aproveitarLinhas(leitura.linhas).slice(0, LIMITE_DE_ITENS);
  if (aproveitadas.length === 0) return null;

  const itens = casarItensComCatalogo(
    aproveitadas.map((aproveitada) => aproveitada.item),
    produtos,
  );

  const comProduto = itens.filter((item) => item.produto_id !== null).length;
  const fortes = itens.filter(
    (item) => item.confianca === "alta" || item.confianca === "media",
  ).length;
  const confiancaMedia =
    aproveitadas.reduce((soma, aproveitada) => soma + aproveitada.confianca, 0) /
    aproveitadas.length;

  // Nenhum item reconhecido: o OCR leu texto, mas não o NOSSO catálogo. A IA
  // (que vê a imagem inteira) tem mais chance de entender o contexto.
  if (fortes === 0 || comProduto === 0) return null;

  // Menos da metade reconhecida: o papel foi lido pela metade. O piso é 0,6
  // (maioria), não 0,5: num pedido de dois itens, um reconhecido e um perdido
  // é metade do pedido faltando — e a IA ainda pode ler os dois.
  if (comProduto / itens.length < 0.6) return null;

  // Confiança baixa = manuscrito difícil ou foto ruim. A IA lê melhor.
  if (confiancaMedia < LIMIAR_DE_CONFIANCA) return null;

  return {
    itens,
    total_extraido: itens.length,
    confianca_media: Math.round(confiancaMedia * 1000) / 1000,
    linhas_lidas: leitura.linhas.length,
  };
}
