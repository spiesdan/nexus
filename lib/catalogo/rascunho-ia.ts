/**
 * RASCUNHO DE PRODUTO POR IA — separado do texto da loja, sempre.
 *
 * ═══ POR QUE UMA COLUNA E NÃO A `descricao` ═══
 *
 * A descrição do produto é a palavra da LOJA. Um rascunho de modelo nesse mesmo
 * campo é um acidente esperando: alguém corrige o texto, um `update` de catálogo
 * sobrescreve, e nobody sabe qual dos dois está no ar — que é a pior das duas
 * respostas possíveis para um atendente que perguntou "isso é de nylon?".
 *
 * Então o rascunho mora em `descricao_rascunho_ia` (jsonb), com o carimbo do
 * que ele foi derivado. Quem lê o rascunho sabe, pelo próprio campo, que é
 * hipótese.
 *
 * ═══ O QUE O MODELO PODE E NÃO PODE FAZER ═══
 *
 * Pode: dizer o que o nome e a categoria sugerem (classe, uso típico, para quem
 *serve), porque isso é inferência de texto, e o operador revisa.
 * NÃO pode: afirmar especificação que não está no cadastro — composição
 * química do produto, norma, compatibilidade de modelo, indicação de uso. Por isso o
 * schema é todo de campos APERTAVEL, e `validarRascunho` DERRUBA qualquer campo
 * que veio com linguagem de certeza sem lastro no nome ("é 100% nylon").
 *
 * A regra é simples e verificável: **cada campo tem que poder ser lido como
 * hipótese**. Se não dá, o campo não entra.
 */

/** Campos do rascunho. Todos opcionais de propósito: o que não se sabe fica vazio. */
export const CAMPOS_RASCUNHO = [
  'o_que_e',
  'material',
  'tamanho',
  'uso',
  'para_quem',
  'como_usar',
  'observacoes',
] as const;

export type CampoRascunho = (typeof CAMPOS_RASCUNHO)[number];

export interface RascunhoProduto {
  o_que_e?: string;
  material?: string;
  tamanho?: string;
  uso?: string;
  para_quem?: string;
  como_usar?: string;
  observacoes?: string;
}

/** O que se guarda junto do rascunho: de onde ele saiu e quando. */
export interface RascunhoGravado {
  rascunho: RascunhoProduto;
  /** "nome|categoria|marca" no momento do estudo — se mudar, o rascunho envelhece. */
  origem: string;
  gerado_em: string;
  modelo: string;
}

const LIMITE_CAMPO = 220;

/**
 * Frases de CERTIDADE que não têm lastro no cadastro. O modelo escreve
 * "é 100% nylon" o tempo todo; isso é exatamente o tipo de afirmação que o
 * atendente não pode repetir para o cliente. Aqui o campo é descartado — não
 * corrigido, não suavizado: descartado.
 */
const CERTIDOES_SEM_LASTRO =
  /\b(100%|totalmente|comprovadamente|garantid[oa]|certificad[oa]|anvisa|iso ?\d|nbr ?\d|at[óo]xic|livre de|hipoalergenic|antibacterian|profissional|indicad[oa] para)\b/i;

/** Número que o cadastro não tem: afirmação quantitativa sem lastro. */
function temNumeroNaoLastro(texto: string, lastroDoNome: string): boolean {
  const numeros = texto.match(/\d+[.,]?\d*\s*(?:%|ml|l|kg|g|cm|mm|m|un|dz)?/gi) ?? [];
  return numeros.some((n) => {
    const limpo = n.trim().toLowerCase();
    return limpo.length > 0 && !lastroDoNome.toLowerCase().includes(limpo);
  });
}

/** O que o cadastro realmente diz — o único lastro aceito. */
export function lastroDoCadastro(produto: {
  nome: string;
  categoria?: string | null;
  marca?: string | null;
}): string {
  return [produto.nome, produto.categoria ?? '', produto.marca ?? ''].join(' ');
}

/**
 * Valida e normaliza um rascunho vindo do modelo.
 *
 * Campo a campo: corta tamanho, tira campo vazio, e DERRUBA o campo quando ele
 * afirma uma certeza que o cadastro não sustenta. O que sobra é hypothesis
 * defensável; o resto, silêncio — e silêncio é a resposta certa quando não se
 * sabe.
 */
export function validarRascunho(
  bruto: unknown,
  lastro: { nome: string; categoria?: string | null; marca?: string | null },
): RascunhoProduto {
  const entrada = (bruto ?? {}) as Record<string, unknown>;
  const textoDoLastro = lastroDoCadastro(lastro);
  const saida: RascunhoProduto = {};
  const descartados: string[] = [];

  for (const campo of CAMPOS_RASCUNHO) {
    const cru = entrada[campo];
    if (typeof cru !== 'string') continue;
    const texto = cru.replace(/\s+/g, ' ').trim();
    if (texto.length === 0) continue;
    if (CERTIDOES_SEM_LASTRO.test(texto) || temNumeroNaoLastro(texto, textoDoLastro)) {
      descartados.push(campo);
      continue;
    }
    saida[campo] = texto.slice(0, LIMITE_CAMPO);
  }

  return saida;
}

/** Campos que o validador derrubou — o operador vê o que a IA quis afirmar. */
export function camposDescartados(
  bruto: unknown,
  lastro: { nome: string; categoria?: string | null; marca?: string | null },
): string[] {
  const entrada = (bruto ?? {}) as Record<string, unknown>;
  const textoDoLastro = lastroDoCadastro(lastro);
  const descartados: string[] = [];
  for (const campo of CAMPOS_RASCUNHO) {
    const cru = entrada[campo];
    if (typeof cru !== 'string') continue;
    const texto = cru.replace(/\s+/g, ' ').trim();
    if (texto.length === 0) continue;
    if (CERTIDOES_SEM_LASTRO.test(texto) || temNumeroNaoLastro(texto, textoDoLastro)) {
      descartados.push(campo);
    }
  }
  return descartados;
}

/**
 * Texto que o assistente recebe quando o produto não tem descrição da loja:
 * a ficha DETERMINÍSTICA (fato) mais o rascunho, marcado como rascunho.
 *
 * A marcação não é enfeite: é o que impede o modelo de repassar hipótese como
 * verdade. Sem ela, o texto entraria no mesmo lugar da descrição e o cliente
 * receberia "parece ser de nylon" como se fosse ficha técnica.
 */
export function textoParaOAssistente(
  ficha: { descricao: string | null },
  rascunho: RascunhoProduto | null,
): { descricao: string; rascunho: string } | null {
  const partesFicha = ficha.descricao ? [ficha.descricao] : [];
  const partesRascunho = rascunho
    ? Object.entries(rascunho).map(([campo, valor]) => `${rotuloDoCampo(campo)}: ${valor}`)
    : [];
  if (partesFicha.length === 0 && partesRascunho.length === 0) return null;
  return {
    descricao: partesFicha.join(' '),
    rascunho: partesRascunho.length > 0 ? `[RASCUNHO — não confirmado] ${partesRascunho.join(' ')}` : '',
  };
}

function rotuloDoCampo(campo: string): string {
  const rotulos: Record<string, string> = {
    o_que_e: 'o que é',
    material: 'material sugerido',
    tamanho: 'tamanho',
    uso: 'uso típico',
    para_quem: 'serve para',
    como_usar: 'como se usa',
    observacoes: 'observação',
  };
  return rotulos[campo] ?? campo;
}

/** Prompt do estudo: as regras que mantêm o rascunho honesto. */
export const INSTRUCAO_ESTUDO = [
  'Você vai escrever uma FICHA RASCUNHO de um produto de loja de material de limpeza.',
  'Você recebe APENAS o que está cadastrado: nome, categoria e marca.',
  '',
  'Regras, na ordem de importância:',
  '1. Escreva o que o NOME e a CATEGORIA mostram. Se não está no cadastro, o campo fica VAZIO.',
  '2. É proibido afirmar especificação que não está no nome: composição, norma, certificação,',
  '   quantidade, concentração, compatibilidade de modelo, benefício clínico.',
  '3. Escreva como HIPÓTESE de leitura de catálogo ("vassoura de limpeza geral", não "vassoura profissional").',
  '4. Nada de elogio nem de superlativo ("o melhor", "impecável", "premium").',
  '5. Responda SÓ com o objeto JSON dos campos pedidos, sem texto em volta.',
  '',
  'Campos: o_que_e (o que é, em até 12 palavras), material, tamanho, uso (para que serve),',
  'para_quem, como_usar, observacoes.',
].join('\n');
