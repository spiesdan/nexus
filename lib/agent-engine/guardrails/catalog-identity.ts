/**
 * Identidade de catálogo no before_send — a garantia DURA de que o que o modelo
 * CITA (nome, preço, código) veio do que a busca DEVOLVEU neste turno.
 *
 * ═══ O defeito que motiva ═══════════════════════════════════════════════════
 *
 * "Vocês têm vassoura?" → a busca devolveu [cabo avulso, vassoura de pelo,
 * vassoura de nylon] e o modelo respondeu SÓ o cabo, com o preço certo. Nenhum
 * gate pegou: o `promiseGate` valida preço contra tabela (R$ 5,00 existia), e o
 * produto citado EXISTIA no catálogo — só não era o pedido. Preço certo +
 * produto existente, intenção trocada.
 *
 * ═══ O que este gate enxerga ════════════════════════════════════════════════
 *
 * Só o que o turno registrou: `ctx.catalogo.itens` (acumulado das chamadas a
 * `crm_search_products` NESTE turno — quem monta o run injeta; ausente = gate
 * no-op, como os demais). Sem resultado registrado não há contra o que
 * conferir, e chutar seria vetar preço vindo de RAG/prompt do tenant.
 *
 * Quatro verificações, todas determinísticas:
 *
 * 1. preço citado ∈ preços devolvidos (cenário G);
 * 2. código citado ∄ nos devolvidos (cenário H);
 * 3. amostra apresentada como catálogo: a busca cortou em `limite`, e a
 *    resposta cita preço sem dizer que há mais opções (o caso do papel
 *    higiênico, medido em 2026-11-09);
 * 4. produto citado como resposta sendo `relacionada` com `direta` ignorada e
 *    sem marca explícita de alternativa (o caso da vassoura).
 *
 * Veto volta como erro instrutivo (o modelo reformula no mesmo turno); o trace
 * registra camada + código, nunca o trecho (pode carregar PII).
 */
import { normalizar } from '@/lib/catalogo/busca';

export interface ItemCitavel {
  codigo: string;
  nome: string;
  preco_cents: number;
  /** Ausente = `direta` (a tool só marca `relacionada`). */
  relacao?: 'direta' | 'relacionada';
}

export interface CatalogoDoTurno {
  itens: ItemCitavel[];
  /**
   * Uma entrada por chamada a `crm_search_products` NESTE turno.
   *
   * `total_encontrados` é quantos produtos casaram o pedido antes do corte do
   * `limite`; `devolvidos` é quantos vieram. Quando o primeiro é maior, a
   * resposta do modelo está falando de uma AMOSTRA — e amostra apresentada
   * como catálogo é o defeito que a checagem 4 barra.
   */
  buscas?: Array<{ total_encontrados: number; devolvidos: number }>;
}

export type CatalogIdentityCode =
  | 'catalogo_preco_inconsistente'
  | 'catalogo_troca_por_acessorio'
  | 'catalogo_codigo_desconhecido'
  | 'catalogo_amostra_como_total';

export interface CatalogIdentityVerdict {
  ok: boolean;
  code?: CatalogIdentityCode;
  reason?: string;
}

/** "R$ 5,00" → 500. Formatos BR com milhar opcional; "R$ 5" → 500. */
function centavosDoTexto(valor: string, decimal?: string): number | null {
  const inteiros = valor.replace(/\./g, '');
  const cents = Number(`${inteiros}${decimal !== undefined ? `.${decimal}` : ''}`) * 100;
  if (!Number.isFinite(cents)) return null;
  return Math.round(cents);
}

export function precosCitadosNoCorpo(body: string): number[] {
  const achados: number[] = [];
  const re = /R\$\s?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const cents = centavosDoTexto(m[1]!, m[2]);
    if (cents !== null) achados.push(cents);
  }
  return achados;
}

function corpoNormalizado(body: string): string {
  return ` ${normalizar(body)} `;
}

function menciona(corpo: string, nome: string): boolean {
  const alvo = normalizar(nome);
  if (alvo === '') return false;
  return corpo.includes(` ${alvo} `) || corpo.includes(` ${alvo},`) || corpo.includes(` ${alvo}.`);
}

function mencionaCodigo(corpo: string, codigo: string): boolean {
  const alvo = normalizar(codigo);
  if (alvo.length < 3) return false;
  return corpo.includes(alvo);
}

/** Códigos que o modelo escreveu como código ("código X", "(X)", "ref X"). */
export function codigosCitadosNoCorpo(body: string): string[] {
  const achados = new Set<string>();
  const re = /c[oó]digo\s*:?\s*([A-Za-z0-9][A-Za-z0-9\-_.]{2,})|\bref\.?\s*:?\s*([A-Za-z0-9][A-Za-z0-9\-_.]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const codigo = m[1] ?? m[2];
    if (codigo) achados.add(normalizar(codigo));
  }
  return [...achados];
}

/**
 * Marca explícita de alternativa em pt-BR — o que separa "só temos o cabo"
 * (oferta honesta, cenário B) de "aqui está o cabo" como se fosse o pedido.
 */
const MARCADORES_ALTERNATIVA =
  /\b(mas|por[eé]m|contudo|alternativa|tamb[eé]m temos|tamb[eé]m tem|outra op[cç][aã]o|se (te |lhe )?interessar|poderia servir|n[aã]o temos|n[aã]o encontrei|infelizmente)\b/i;

/**
 * O que faz uma resposta sobre uma AMOSTRA ser honesta: dizer que há mais.
 *
 * Sem este marcador a resposta está tratando as N primeiras como o catálogo —
 * foi o que aconteceu em 2026-11-09 ("oi, tem papel higiênico?" → 2 produtos
 * de 8, sem uma palavra sobre os outros 6). A lista é generosa de propósito:
 * qualquer forma de "há mais" serve, e o gate só arma quando há preço citado.
 */
const MARCADORES_DE_COMPLETUDE =
  /\b(outras?|demais|mais)\s+(op[cç][õo]es|op[cç][aã]o|modelos?|tamanhos?|varia[cç][õo]es|vers[õo]es|itens|faixas?)\b|\bno total\b|\bao todo\b|\bal[eé]m d(?:ess[ae]s?|isso)\b|\btemos\s+\d+\b|\bs[aã]o\s+\d+\s+(?:op[cç][õo]es|modelos|tipos|tamanhos)\b|\bentre\s+\d+/i;

export function validarCitacaoCatalogo(
  body: string,
  itens: readonly ItemCitavel[],
  buscas?: CatalogoDoTurno['buscas'],
): CatalogIdentityVerdict {
  if (itens.length === 0) return { ok: true };
  const corpo = corpoNormalizado(body);
  const norm = (s: string) => normalizar(s);

  // 1. Todo preço citado precisa existir no que a busca devolveu.
  const precos = new Set(itens.map((i) => i.preco_cents));
  for (const cents of precosCitadosNoCorpo(body)) {
    if (!precos.has(cents)) {
      return {
        ok: false,
        code: 'catalogo_preco_inconsistente',
        reason:
          `você citou um preço que não está nos produtos que a busca devolveu neste turno. ` +
          `Responda SÓ com os preços devolvidos por crm_search_products — se nenhum serve, ` +
          `diga que vai confirmar com a equipe em vez de ajustar o valor.`,
      };
    }
  }

  // 2. Código citado precisa existir no que a busca devolveu.
  const codigos = new Set(itens.map((i) => norm(i.codigo)));
  for (const citado of codigosCitadosNoCorpo(body)) {
    if (!codigos.has(citado)) {
      return {
        ok: false,
        code: 'catalogo_codigo_desconhecido',
        reason:
          `você citou um código que a busca não devolveu neste turno. Não invente ` +
          `identificador: cite só código que veio de crm_search_products, ou responda sem código.`,
      };
    }
  }

  // 3. Amostra apresentada como catálogo. Dois gatilhos:
  //    a) a busca CRIOU a amostra (o `limite` cortou);
  //    b) o modelo criou a amostra sozinho: devolveram 3+ opções e ele citou
  //       preço de menos de um terço delas, sem dizer que há mais.
  // Só arma quando a resposta está APRESENTANDO produtos (cita preço): quem
  // pergunta "qual tamanho você precisa?" sem preço não afirma completude e
  // não pode ser vetado.
  const precosNoTurno = new Set(itens.map((i) => i.preco_cents));
  const citados = new Set(
    precosCitadosNoCorpo(body).filter((c) => precosNoTurno.has(c)),
  );
  const amostra = (buscas ?? []).find(
    (b) =>
      b.total_encontrados > b.devolvidos ||
      (b.devolvidos >= 3 && citados.size * 3 < b.devolvidos),
  );
  if (amostra !== undefined && citados.size > 0 && !MARCADORES_DE_COMPLETUDE.test(body)) {
    const quantas =
      amostra.total_encontrados > amostra.devolvidos
        ? `a busca devolveu ${amostra.devolvidos} das ${amostra.total_encontrados} opções`
        : `a busca devolveu ${amostra.devolvidos} opções`;
    return {
      ok: false,
      code: 'catalogo_amostra_como_total',
      reason:
        `${quantas} e você citou preço de ${citados.size} sem dizer que há mais. Diga QUANTAS ` +
        `opções existem e resuma por faixa (campo "resumo.faixas" da busca) — se não couber ` +
        `listar, diga que há mais e pergunte qual. Não responda como se a sua lista fosse o ` +
        `catálogo inteiro.`,
    };
  }

  // 4. Relacionada apresentada como SE fosse o pedido, com direta ignorada.
  const mencionadas = new Set(
    itens.filter((i) => menciona(corpo, i.nome) || mencionaCodigo(corpo, i.codigo)).map((i) => i.codigo),
  );
  if (mencionadas.size === 0) return { ok: true };
  const diretasIgnoradas = itens.filter(
    (i) => (i.relacao ?? 'direta') === 'direta' && !mencionadas.has(i.codigo),
  );
  const relacionadaComoResposta = itens.find(
    (i) => i.relacao === 'relacionada' && mencionadas.has(i.codigo),
  );
  if (relacionadaComoResposta !== undefined && diretasIgnoradas.length > 0) {
    if (!MARCADORES_ALTERNATIVA.test(body)) {
      return {
        ok: false,
        code: 'catalogo_troca_por_acessorio',
        reason:
          `você apresentou "${relacionadaComoResposta.nome}" como se fosse o que a pessoa pediu, ` +
          `mas a busca marcou esse item como acessório/alternativa — e há opções diretas que você ` +
          `não mencionou. Apresente primeiro as opções diretas; o acessório só entra como ` +
          `alternativa EXPLÍCITA ("não temos X, mas temos Y — quer?").`,
      };
    }
  }

  return { ok: true };
}
