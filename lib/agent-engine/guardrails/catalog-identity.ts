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
 * Três verificações, todas determinísticas:
 *
 * 1. preço citado ∈ preços devolvidos (cenário G);
 * 2. produto citado como resposta sendo `relacionada` com `direta` ignorada e
 *    sem marca explícita de alternativa (o caso da vassoura);
 * 3. código citado ∄ nos devolvidos (cenário H).
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
}

export type CatalogIdentityCode =
  | 'catalogo_preco_inconsistente'
  | 'catalogo_troca_por_acessorio'
  | 'catalogo_codigo_desconhecido';

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

export function validarCitacaoCatalogo(
  body: string,
  itens: readonly ItemCitavel[],
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

  // 3. Relacionada apresentada como SE fosse o pedido, com direta ignorada.
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
