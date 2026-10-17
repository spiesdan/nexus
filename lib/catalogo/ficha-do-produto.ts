/**
 * FICHA DO PRODUTO — o "estudo de catálogo" que roda sobre TODOS os produtos.
 *
 * ═══ O DEFEITO MEDIDO ═══
 *
 * Quem pediu "vassoura" recebeu "cabo de vassoura avulso" e "PÁ COM COLETOR +
 * VASSOURA". Os dois estão no catálogo com o nome em CAIXA ALTA e o campo
 * `descricao` VAZIO — medido em 2026-10-16 na org da VPS: **1137 produtos
 * ativos, 1137 sem descrição**. O modelo só tinha o nome para decidir o que o
 * produto é, e nome de catálogo é escrito para o olho humano ("PÁ COM COLETOR +
 * VASSOURA" tem um "+" que ninguém lê como conjunção).
 *
 * ═══ POR QUE ISTO É DADO E NÃO PROMPT ═══
 *
 * Pedir ao modelo "não confunda kit com produto" devolve o defeito ao mesmo
 * lugar que o criou: a decisão volta a ser dele. Aqui a decisão é do código,
 * roda em toda busca de todo produto de toda org, e custa zero token de
 * raciocínio. E como o texto sai do que a LOJA cadastrou (nome, categoria,
 * marca, medida, quantidade de embalagem), ele não afirma nada que não esteja
 * no cadastro.
 *
 * ═══ SEPARADORES: MEDIDOS, NÃO ADIVINHADOS ═══
 *
 * A primeira versão desta régua acusou 374 "kits" num catálogo que tem 17. O
 * erro é dela, e é o motivo de a régua estar presa aos números:
 *
 *   - `+` com espaço dos dois lados = conjunto de produtos (17 no catálogo).
 *     `C/AP+01` NÃO é conjunto: o "+" está colado em letras, é parte do código;
 *   - `C/100`, `C/ 8 ROLOS` = EMBALAGEM com N unidades (151) — uma só peça,
 *     vendida em caixa. Não é kit, e é informação que o cliente pergunta;
 *   - `/` = faixa de medida ou referência ("DISPENSER 180/200ML", "REF. 3533/3534")
 *     (340) — nunca conjunto;
 *   - `,` = vírgula DECIMAL em nome brasileiro ("BALDE 13,5L") (58) — nunca
 *     separador;
 *   - a palavra KIT/CONJUNTO/COMBO, quando no começo, declara o conjunto (7).
 *
 * ` com ` e ` e ` NÃO declaram conjunto: "VASSOURA DE PELO COM CABO DE MADEIRA"
 * é uma vassoura que vem com cabo. Dizer que uma coisa só são duas é o mesmo
 * erro do outro lado.
 */
import { normalizar } from './busca';
import {
  atributosDoNome,
  complementoDeAtributos,
  type AtributosDoNome,
} from './atributos-do-nome';

/** Que tipo de coisa é o produto — o que a pessoa precisa saber antes de comprar. */
export type TipoProduto = 'simples' | 'kit' | 'acessorio';

export interface ProdutoParaFicha {
  nome: string;
  descricao?: string | null;
  categoria?: string | null;
  marca?: string | null;
}

export interface FichaProduto {
  tipo: TipoProduto;
  /** Nomes dos componentes de um kit (>= 2), na ordem do nome. Vazio nos outros. */
  itens: string[];
  /** Medida de venda declarada no nome ("5 L", "500ML", "10KG", "2 x 5 L"). */
  medida: string | null;
  /** Concentração declarada ("70%"). */
  concentracao: string | null;
  /** Quantidade por embalagem quando o nome declara ("C/100" → 100). */
  quantidadeEmbalagem: number | null;
  /** Descrição legível, montada só com o que o cadastro tem. Null se não há nada a dizer. */
  descricao: string | null;
  /**
   * O que o NOME diz além da medida: material, comprimento, cor, aplicação.
   * Vazio quando o nome não diz — e é o caso comum: produto cujo nome é só o
   * nome não ganha atributo inventado.
   */
  atributos: AtributosDoNome;
}

/** Cabeças de nome que são peça/reposição/accessório. */
const CABECA_DE_ACESSORIO = new Set([
  'cabo',
  'cabos',
  'refil',
  'refis',
  'alca',
  'alcas',
  'filtro',
  'filtros',
  'capa',
  'capas',
  'peca',
  'pecas',
  'reposicao',
  'reposicoes',
  'bico',
  'bicos',
  'anel',
  'aneis',
]);

const CATEGORIA_DE_ACESSORIO = new Set([
  'acessorio',
  'acessorios',
  'peca',
  'pecas',
  'reposicao',
  'reposicoes',
]);

/** Palavra que liga, articula, ou nomeia o próprio conjunto. */
const RUIDO = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'para',
  'com',
  'a',
  'o',
  'e',
  'p',
  'kg',
  'un',
  'kit',
  'kits',
  'combo',
  'combos',
  'conjunto',
  'conjuntos',
]);

/** Palavra que DECLARA conjunto quando abre o nome. */
const PALAVRAS_DE_CONJUNTO = new Set(['kit', 'kits', 'combo', 'combos', 'conjunto', 'conjuntos']);

/**
 * Componentes da lista entre parênteses: "Conjunto super mop (cabo alum.
 * telescopico 1,40m./sup./refil, KD-8040)" → as TRÊS peças, não o nome inteiro.
 * Devolve [] quando não há lista — e a medição diz que são 7 produtos com
 * parênteses informative no catálogo, todos kits.
 */
export function componentesEntreParenteses(nome: string): string[] {
  const achado = nome.match(/\(([^)]*)\)/);
  if (!achado) return [];
  const partes = achado[1]!
    .split(/\/|,|;|\+/)
    .map((p) => p.trim())
    // Código de referência não é peça ("KD-8040", "REF 3533").
    .filter((p) => p.length >= 2 && !/^(ref|referencia|cod|kd)[\s.-]*\d*$/i.test(p))
    .map((p) => normalizar(p).replace(/\b\d+(?:[.,]\d+)?\s*(m|mts?|ml|l|cm)?\b/g, '').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length >= 2 && palavrasDeConteudo(p).length > 0);
  return [...new Set(partes)];
}

/** Corpo do nome legível, sem o rótulo de conjunto e sem artigo de ligação. */
function descricaoDoCorpo(parte: string): string {
  return semAcento(parte)
    .replace(/^(de|da|do|dos|das)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const UNIDADES: Record<string, string> = {
  ml: 'ML',
  lt: 'L',
  l: 'L',
  kg: 'KG',
  g: 'G',
  un: 'UN',
  cx: 'CX',
  pc: 'PC',
  pct: 'PCT',
  rolo: 'ROLO',
  par: 'PAR',
  dz: 'DZ',
  mt: 'M',
};

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function palavrasDeConteudo(nome: string): string[] {
  return normalizar(nome)
    .split(' ')
    .filter((p) => p.length >= 2 && !RUIDO.has(p));
}

/** "o que é isto" de um trecho: primeira palavra com conteúdo, pulando número. */
function cabeca(parte: string): string {
  for (const p of normalizar(parte).split(' ')) {
    if (p.length >= 2 && !RUIDO.has(p) && !/^\d+$/.test(p)) return p;
  }
  return '';
}

/**
 * Partes do conjunto — declaradas por " + " com espaço dos dois lados, ou pelo
 * nome que começa com KIT/CONJUNTO/COMBO.
 *
 * `C/AP+01` fica de fora de propósito: o "+" colado em letras é de código, e
 * tratá-lo como conjunto diria ao cliente que um gel é dois produtos.
 */
export function partesDoConjunto(nome: string): string[] {
  const porMais = nome
    .split(/\s+\+\s+/)
    .map((p) => p.trim())
    .filter((p) => palavrasDeConteudo(p).length > 0);
  if (porMais.length >= 2) return porMais;
  // "KIT LIXEIRA SELETIVA 30L - 3 LIXEIRAS" / "CONJUNTO DE ADAPTADORES":
  // a palavra declara o conjunto; o resto é o que ele é.
  const marcacao = normalizar(nome).split(' ')[0] ?? '';
  if (RUIDO.has(marcacao) && ['kit', 'kits', 'combo', 'combos', 'conjunto', 'conjuntos'].includes(marcacao)) {
    const resto = nome.trim().split(/\s+/).slice(1).join(' ').trim();
    return resto.length > 0 && palavrasDeConteudo(resto).length > 0 ? [resto] : [];
  }
  return [];
}

/**
 * Medida de venda: "5L", "500ML", "10KG", "2X5L", "5X10 UN".
 *
 * Três guardas que a medição exigiu:
 * - zero não é medida ("500M0L" — erro de digitação na origem — produzia "0 L");
 * - o número não pode estar COLADO depois de letra ("M0L", "KD8040" não são
 *   medida nem quantidade);
 * - a vírgula é decimal em nome brasileiro: "13,5L" são treze e meio, não
 *   treze vírgula cinco.
 */
export function medidaDoNome(nome: string): string | null {
  const alvo = semAcento(nome);
  // Duas passadas, e a ORDEM é o que acerta:
  //
  //  A) ESTRITA — a unidade encerra o nome ou é seguida de separador. Vale
  //     "AGUA SANITARIA 2L", "CABO EXTENSOR 4,50 MT".
  //  B) COLADA — o catálogo gruda a medida no resto do nome ("BALDE
  //     13,5LREFORÇADO", "10KGBALDE"). Sem esta passada a medida
  //     DESAPARECE do produto, que é perda de informação real.
  //
  // Na B, uma letra solta (L, G) só entra com número de vírgula decimal: sem
  // esse cuidado "ALCOOL 80 GEL ACEN.10KG" vira "80 G", com o G de GEL lido
  // como grama. Regra medida, não regra bonita.
  const UNIDADES_RE = 'ml|lt|l|kg|g|un|cx|pc|pct|rolo|par|dz|mt';
  const estrita = [
    ...alvo.matchAll(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIDADES_RE})(?![a-z0-9])`, 'g')),
  ];
  const achados: RegExpExecArray[] =
    estrita.length > 0
      ? estrita
      : [
          ...alvo.matchAll(
            new RegExp(`(\\d+[.,]\\d+)\\s*(${UNIDADES_RE})`, 'g'),
          ),
          ...alvo.matchAll(
            new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(ml|lt|kg|cx|pc|pct|rolo|par|dz|mt)`, 'g'),
          ),
        ];
  for (const achado of achados) {
    const numero = achado[1]!;
    const inicio = achado.index ?? 0;
    const antes = inicio > 0 ? alvo[inicio - 1]! : ' ';
    // Número colado em letra anterior é parte de outro token (código, "M0L").
    if (/[a-z0-9]/.test(antes)) continue;
    const valor = Number(numero.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) continue;
    return `${numero.replace(',', '.')} ${UNIDADES[achado[2]!]!}`;
  }
  const comMultiplicador = alvo.match(
    /(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*(ml|lt|l|kg|g|un|cx|pc|pct|rolo|par|dz|mt)/,
  );
  if (comMultiplicador) {
    const primeiro = Number(comMultiplicador[1]!.replace(',', '.'));
    const segundo = Number(comMultiplicador[2]!.replace(',', '.'));
    if (primeiro > 0 && segundo > 0) {
      return `${comMultiplicador[1]!.replace(',', '.')} x ${comMultiplicador[2]!.replace(',', '.')} ${UNIDADES[comMultiplicador[3]!]!}`;
    }
  }
  return null;
}

/** Concentração no nome cru: "70%", "46,5%". Null quando o nome não declara. */
export function concentracaoDoNome(nome: string): string | null {
  const achado = nome.match(/(\d+(?:[.,]\d+)?)\s*%/);
  return achado ? `${achado[1]!.replace(',', '.')}%` : null;
}

/**
 * Quantidade por embalagem: "C/100", "C/ 2500", "C/ 8 ROLOS", "1 CART/3DZ".
 * É a information que o cliente pergunta depois do preço ("vende caixa fechada?").
 */
export function quantidadeDeEmbalagem(nome: string): number | null {
  const alvo = semAcento(nome);
  const achado = alvo.match(/\bc\s*\/\s*(\d+(?:\.\d+)?)\b/);
  if (!achado) return null;
  const valor = Number(achado[1]);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

export function fichaDoProduto(produto: ProdutoParaFicha): FichaProduto {
  const { nome } = produto;
  const partes = partesDoConjunto(nome);
  const medida = medidaDoNome(nome);
  const concentracao = concentracaoDoNome(nome);
  const quantidadeEmbalagem = quantidadeDeEmbalagem(nome);
  const categoria =
    produto.categoria && produto.categoria.trim().length > 0
      ? produto.categoria.trim()
      : null;
  const marca =
    produto.marca && produto.marca.trim().length > 0 ? produto.marca.trim() : null;

  const atributos = atributosDoNome(nome);
  const fatos = (extra?: string): string[] => {
    const lista: string[] = [];
    if (extra !== undefined) lista.push(extra);
    if (medida !== null) lista.push(`Medida: ${medida}.`);
    if (concentracao !== null) lista.push(`Concentração: ${concentracao}.`);
    if (quantidadeEmbalagem !== null) lista.push(`Embalagem com ${quantidadeEmbalagem} unidades.`);
    lista.push(...complementoDeAtributos(atributos));
    if (marca !== null) lista.push(`Marca: ${marca}.`);
    if (categoria !== null) lista.push(`Categoria: ${categoria}.`);
    return lista;
  };

  // 1. Conjunto declarado. Três formas, na ordem de força do sinal:
  //    " + " com espaço (17 no catálogo), nome que começa por KIT/CONJUNTO
  //    (7), e a lista entre parênteses que esses nomes trazem
  //    ("Conjunto super mop ... (cabo/sup./refil, KD-8040)").
  const itens = partes.map(cabeca).filter((c) => c !== '');
  const unicaParte = partes[0] ?? '';
  const primeiraPalavra = normalizar(nome).split(' ')[0] ?? '';
  const nomeDeclaraConjunto = PALAVRAS_DE_CONJUNTO.has(primeiraPalavra);
  if ((partes.length >= 2 && new Set(itens).size >= 2) || nomeDeclaraConjunto) {
    // A lista entre parênteses é a composição, quando existe — e vale mais que
    // qualquer palpite sobre o nome.
    const entreParenteses = componentesEntreParenteses(nome);
    const componentes = entreParenteses.length >= 2 ? entreParenteses : itens;
    const descricao =
      componentes.length >= 2
        ? [`KIT com ${componentes.length} itens: ${componentes.join(' + ')}.`, ...fatos()].join(' ')
        : [
            `KIT declarado no nome: ${descricaoDoCorpo(unicaParte)}.`,
            ...fatos(),
          ].join(' ');
    return {
      tipo: 'kit',
      itens: componentes,
      medida,
      concentracao,
      quantidadeEmbalagem,
      descricao,
      atributos,
    };
  }

  // 2. Peça/reposição: a cabeça do nome ou a categoria dizem.
  const cabecaPrincipal = cabeca(nome);
  const acessorio =
    CABECA_DE_ACESSORIO.has(cabecaPrincipal) ||
    (categoria !== null && CATEGORIA_DE_ACESSORIO.has(normalizar(categoria)));
  if (acessorio) {
    return {
      tipo: 'acessorio',
      itens: [],
      medida,
      concentracao,
      quantidadeEmbalagem,
      descricao: fatos('Peça de reposição/acessório.').join(' '),
      atributos,
    };
  }

  // 3. Produto único. Mesmo sem medida, a ficha leva o que a loja cadastrou
  //    (categoria, marca, embalagem) — e o que ela não tem, ela não diz.
  const extras = fatos('Produto único.');
  const semInformacao =
    extras.length === 1 &&
    (categoria === null || normalizar(categoria).length === 0) &&
    marca === null;
  return {
    tipo: 'simples',
    itens: [],
    medida,
    concentracao,
    quantidadeEmbalagem,
    descricao: semInformacao ? null : extras.join(' '),
    atributos,
  };
}

/**
 * Descrição para GRAVAR no produto: a que a loja cadastrou quando existe (a
 * loja é dona da palavra), senão a gerada pela ficha. Null quando não há o que
 * acrescentar — o backfill não grava texto vazio.
 */
export function descricaoParaGravar(produto: ProdutoParaFicha): string | null {
  const cadastrada = (produto.descricao ?? '').trim();
  if (cadastrada.length > 0) return null;
  return fichaDoProduto(produto).descricao;
}
