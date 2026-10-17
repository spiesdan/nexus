/**
 * ATRIBUTOS DO NOME — o que o cadastro DIZ, lido como gente lê.
 *
 * ═══ POR QUE ISTO EXISTE ═══
 *
 * A ficha determinística separa kit de peça e acha medida. Mas o nome de um
 * catálogo de material de limpeza carrega mais do que a regex via:
 * "VASSOURA CERLON 40 CM PLASTICA" diz material (cerlon), medida (40 cm) e que
 * é plástico — e a regex de volume/peso achava zero disso. Aqui está o
 * vocabulário que fecha essa conta, em três eixos: **de que é feito**, **como
 * é**, **onde serve**.
 *
 * ═══ O LEXICO FOI MEDIDO, NÃO INVENTADO ═══
 *
 * Toda palavra aqui saiu da contagem de frequência dos 1141 nomes do catálogo
 * real (41 categorias), não de imaginação de catálogo. "estopa(16)", "celulose(5)",
 * "nitrilica(6)", "basculante(38)", "pedal(52)", "interfolha(7)", "girando(6)".
 * Palavra que o catálogo não usa não entra: léxico de material de limpeza
 * pronto de mercado erra justamente nas palavras que esta loja não tem.
 *
 * ═══ REGRA ÚNICA ═══
 *
 * **Só entra o que está LITERALMENTE no nome.** Nada de "provavelmente nylon"
 * para uma vassoura que não diz nylon. E atributo que a loja não escreveu é
 * atributo que o cliente não reconhece quando o atendente fala — e o que ele não
 * reconhece, ele desconfia.
 */

/** De que é feito. */
const MATERIAIS: ReadonlyArray<{ termos: string[]; rotulo: string }> = [
  { termos: ['cerlon'], rotulo: 'cerlon (plástico rígido)' },
  { termos: ['plastica', 'plastico', 'plástico'], rotulo: 'plástico' },
  { termos: ['inox'], rotulo: 'inox' },
  { termos: ['aco'], rotulo: 'aço' },
  { termos: ['aluminio', 'alumínio'], rotulo: 'alumínio' },
  { termos: ['borracha'], rotulo: 'borracha' },
  { termos: ['nylon'], rotulo: 'nylon' },
  { termos: ['pelo'], rotulo: 'pelo' },
  { termos: ['palha'], rotulo: 'palha' },
  { termos: ['la', 'lã'], rotulo: 'lã' },
  { termos: ['algodao', 'algodão'], rotulo: 'algodão' },
  { termos: ['estopa'], rotulo: 'estopa' },
  { termos: ['celulose'], rotulo: 'celulose' },
  { termos: ['microfibra', 'micro fibrado'], rotulo: 'microfibra' },
  { termos: ['flanela'], rotulo: 'flanela' },
  { termos: ['couro'], rotulo: 'couro sintético' },
  { termos: ['papel'], rotulo: 'papel' },
  { termos: ['papelao', 'papelão'], rotulo: 'papelão' },
  { termos: ['espuma'], rotulo: 'espuma' },
  { termos: ['latex'], rotulo: 'látex' },
  { termos: ['lurex'], rotulo: 'látex (lurex)' },
  { termos: ['vinil'], rotulo: 'vinil' },
  { termos: ['nitrilica', 'nitrilico', 'nitrílica', 'nitrílico'], rotulo: 'nitrilo' },
  { termos: ['zinco'], rotulo: 'zinco' },
  { termos: ['metal'], rotulo: 'metal' },
  { termos: ['poliester', 'poliéster'], rotulo: 'poliéster' },
  { termos: ['fibra'], rotulo: 'fibra' },
  { termos: ['vidro'], rotulo: 'vidro' },
  { termos: ['silicone', 'siliconado'], rotulo: 'silicone' },
];

/**
 * COMO É — a variação que muda o produto dentro da mesma categoria. É o que o
 * cliente escolhe quando pergunta "qual a diferença?" ("lixeira com pedal" vs
 * "lixeira com tampa"), e por isso entra antes da aplicação.
 */
const CARACTERISTICAS: ReadonlyArray<{ termos: string[]; rotulo: string }> = [
  { termos: ['reforcado', 'reforçado'], rotulo: 'reforçado' },
  { termos: ['basculante'], rotulo: 'basculante' },
  { termos: ['pedal'], rotulo: 'com pedal' },
  { termos: ['tampa'], rotulo: 'com tampa' },
  { termos: ['aro'], rotulo: 'com aro' },
  { termos: ['alca'], rotulo: 'com alça' },
  { termos: ['capa'], rotulo: 'com capa' },
  { termos: ['rodas'], rotulo: 'com rodas' },
  { termos: ['click'], rotulo: 'com sistema click' },
  { termos: ['girando', 'giratorio', 'giratório'], rotulo: 'com rodízio giratório' },
  { termos: ['rotatorio', 'rotatório'], rotulo: 'rotatório' },
  { termos: ['rotacao', 'rotação'], rotulo: 'com rotação' },
  { termos: ['de canto'], rotulo: 'formato de canto' },
  { termos: ['tufos'], rotulo: 'com tufos' },
  { termos: ['plana', 'flat'], rotulo: 'plana' },
  { termos: ['transparente'], rotulo: 'transparente' },
  { termos: ['interfolha'], rotulo: 'interfolha' },
  { termos: ['autocorte', 'auto corte'], rotulo: 'auto-corte' },
  { termos: ['frontal'], rotulo: 'frontal' },
  { termos: ['ranhurada'], rotulo: 'ranhurada' },
  { termos: ['simples'], rotulo: 'simples' },
  { termos: ['duplo'], rotulo: 'duplo' },
  { termos: ['magico', 'mágico'], rotulo: 'esponja mágica' },
  { termos: ['atomizador', 'spray'], rotulo: 'com atomizador' },
  { termos: ['avulso', 'avulsa'], rotulo: 'avulso' },
  { termos: ['cabo longo', 'cabosalongo'], rotulo: 'cabo longo' },
  { termos: ['manipulador', 'manipuladora'], rotulo: 'com manipulador' },
];

/**
 * Cores — o catálogo escreve cor em caixa alta, e no GÊNERO QUE O NOME USA:
 * "LUVA PRETA" e "CESTO BRANCO" são o mesmo produto com palavra diferente. Ler só
 * "preto" deixava metade das cores do catálogo (todas as feminineiras) sem cor.
 */
const CORES = [
  'azul',
  'vermelha',
  'vermelho',
  'amarela',
  'amarelo',
  'verde',
  'preta',
  'preto',
  'branca',
  'branco',
  'cinza',
  'laranja',
  'rosa',
  'bege',
  'transparente',
  'incolor',
  'metalica',
  'metalico',
];

/**
 * Tamanho de luva/vestuário: "G(9)", "M(8)", "P(7)".
 *
 * ⚠️ A PRIMEIRA VERSÃO aceitava letra solta e produziu 120 falsos positivos
 * medidos: "P/" de "PAPEL HIG. P/ COZINHA" virava tamanho P, e o "M" de
 * "CABO EXTENSOR 2 M" virava tamanho M. Em catálogo de limpeza a letra
 * sozinha é RUÍDO — `p/` significa "para". Por isso o tamanho só é aceito com
 * o número entre parênteses (forma que o catálogo usa na luva) ou nas três
 * siglas duplas, que não têm outro uso em português.
 */
const TAMANHOS_COM_NUMERO_RE = /(?:^|[^a-z0-9])(pp|mm|gg|p|m|g)\((\d)\)(?![a-z0-9])/g;
const TAMANHOS_DUPLOS_RE = /(?:^|[^a-z0-9])(pp|mm|gg)(?![a-z0-9/])/g;

/** ONDE serve — o `p/` do catálogo brasileiro é declaração de uso. */
const APLICACOES: ReadonlyArray<{ termos: string[]; rotulo: string }> = [
  { termos: ['vidraria', 'vidrarias'], rotulo: 'vidrarias' },
  { termos: ['cozinha'], rotulo: 'cozinha' },
  { termos: ['banheiro'], rotulo: 'banheiro' },
  { termos: ['mao', 'maos', 'mãos'], rotulo: 'mãos' },
  { termos: ['multiuso'], rotulo: 'multiuso' },
  { termos: ['grama'], rotulo: 'jardim/grama' },
  { termos: ['industrial'], rotulo: 'uso industrial' },
  { termos: ['hospitalar'], rotulo: 'uso hospitalar' },
  { termos: ['automotivo', 'automovel', 'automóvel'], rotulo: 'automotivo' },
  { termos: ['carro', 'veiculo', 'veículo'], rotulo: 'veículo' },
  { termos: ['piscina'], rotulo: 'piscina' },
  { termos: ['alimentacao', 'alimentos'], rotulo: 'áreas de alimentação' },
  { termos: ['escritorio', 'escritório'], rotulo: 'escritório' },
  { termos: ['lavanderia'], rotulo: 'lavanderia' },
  { termos: ['tapete', 'tapetes'], rotulo: 'tapetes' },
  { termos: ['lixo'], rotulo: 'coleta de lixo' },
];

/** Comprimento: a medida que a ficha de volume não cobre ("VASSOURA 40 CM"). */
const COMPRIMENTOS_RE = /(\d+(?:[.,]\d+)?)\s*(cm|mm)\b/g;

export interface AtributosDoNome {
  materiais: string[];
  caracteristicas: string[];
  cores: string[];
  aplicacoes: string[];
  comprimento: string | null;
  /** Tamanho de luva/vestuário ("G(9)"), quando o nome declara. */
  tamanho: string | null;
}

function normalizaParaAtributos(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** A palavra aparece como PALAVRA no nome (não como parte de outra: "lacrar"). */
function temPalavra(alvo: string, termo: string): boolean {
  const escapado = termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escapado}([^a-z0-9]|$)`).test(alvo);
}

export function atributosDoNome(nome: string): AtributosDoNome {
  const alvo = normalizaParaAtributos(nome);

  const materiais = MATERIAIS.filter((m) => m.termos.some((t) => temPalavra(alvo, t))).map(
    (m) => m.rotulo,
  );
  const caracteristicas = CARACTERISTICAS.filter((c) =>
    c.termos.some((t) => temPalavra(alvo, t)),
  ).map((c) => c.rotulo);
  const cores = CORES.filter((c) => temPalavra(alvo, c));
  const aplicacoes = APLICACOES.filter((a) => a.termos.some((t) => temPalavra(alvo, t))).map(
    (a) => a.rotulo,
  );

  const comprimentos: string[] = [];
  for (const achado of alvo.matchAll(COMPRIMENTOS_RE)) {
    const valor = Number(achado[1]!.replace(',', '.'));
    if (Number.isFinite(valor) && valor > 0) {
      comprimentos.push(`${achado[1]!.replace(',', '.')} ${achado[2]!.toUpperCase()}`);
    }
  }

  let tamanho: string | null = null;
  for (const achado of alvo.matchAll(TAMANHOS_COM_NUMERO_RE)) {
    tamanho = `${achado[1]!.toUpperCase()}(${achado[2]!})`;
    break;
  }
  if (tamanho === null) {
    for (const achado of alvo.matchAll(TAMANHOS_DUPLOS_RE)) {
      // "CABO DE 28 MM" é medida de milímetro, não tamanho M. Número antes da
      // sigla = a sigla é unidade.
      const antes = (achado.index ?? 0) > 0 ? alvo[achado.index! - 1]! : ' ';
      if (/\d/.test(antes)) continue;
      tamanho = achado[1]!.toUpperCase();
      break;
    }
  }

  return {
    materiais,
    caracteristicas,
    cores,
    aplicacoes,
    comprimento: comprimentos.length > 0 ? comprimentos[0]! : null,
    tamanho,
  };
}

/** O que vai escrito na descrição, na ordem em que o cliente lê. */
export function complementoDeAtributos(atributos: AtributosDoNome): string[] {
  const partes: string[] = [];
  if (atributos.materiais.length > 0) partes.push(`Material: ${atributos.materiais.join(', ')}.`);
  if (atributos.comprimento !== null) partes.push(`Comprimento: ${atributos.comprimento}.`);
  if (atributos.cores.length > 0) partes.push(`Cor: ${atributos.cores.join(', ')}.`);
  if (atributos.tamanho !== null) partes.push(`Tamanho: ${atributos.tamanho}.`);
  if (atributos.caracteristicas.length > 0) {
    partes.push(`Características: ${atributos.caracteristicas.join(', ')}.`);
  }
  if (atributos.aplicacoes.length > 0) partes.push(`Serve para: ${atributos.aplicacoes.join(', ')}.`);
  return partes;
}
