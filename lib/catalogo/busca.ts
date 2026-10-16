/**
 * ACHAR O PRODUTO QUE O CLIENTE DESCREVEU — e não o parecido.
 *
 * ═══ Por que não é `ilike '%termo%'` ════════════════════════════════════════
 *
 * Porque o cliente não digita o nome do catálogo. Ele escreve "ifone 15",
 * "15 pro max 256", "perfume 212 masculino". Medido num corpus de 20 mil
 * títulos de importados:
 *
 *     ilike '%ifone 15%'              -> 0 linhas
 *     ilike '%perfume 212 masculino%' -> 0 linhas
 *
 * E o trigrama da frase INTEIRA também não resolve: a similaridade entre
 * "ifone 15" e "iphone 15 pro 256gb titanio natural" é 0,154 — abaixo do limiar
 * padrão —, porque a métrica pune a diferença de tamanho. Pontuar a consulta
 * inteira não funciona; tem de ser token a token.
 *
 * ═══ A regra que decide tudo: PALAVRA é difusa, NÚMERO é exato ══════════════
 *
 * A similaridade entre "iPhone 15 Pro 256GB" e "iPhone 15 Pro 128GB" é
 * altíssima — nenhum ajuste de limiar separa 128 de 256. E é exatamente aí que
 * o preço erra, que é o erro que não se pode cometer com um cliente.
 *
 * Então o número não é ranqueado: ele FILTRA. Um número que a pessoa disse e
 * que não existe no produto elimina o produto, não o rebaixa.
 *
 *   - token de PALAVRA ("ifone", "perfume", "titanio") → prefixo/trigrama,
 *     tolerante a erro de digitação;
 *   - token de NÚMERO ("15", "256", "212") → casamento exato, aceitando só um
 *     sufixo de unidade ("256" casa "256gb"; "15" NÃO casa "153ml").
 *
 * O sufixo de unidade não é detalhe: com a regra ingênua de prefixo, "ifone 15"
 * trouxe um "Fone Bluetooth A54 153ml" na frente dos iPhones — o "15" casou
 * "153ml" e o "ifone" casou "fone". Medido, e é o motivo de a regra existir.
 *
 * ═══ O que a busca faz quando há empate ════════════════════════════════════
 *
 * Devolve os dois. "iphone 15 pro 256" casa o Pro e o Pro Max com nota idêntica
 * — a ambiguidade é REAL, e a resposta certa é a pessoa escolher, não o modelo
 * chutar. Quem decide o que fazer com isso é a ferramenta, que avisa o agente.
 */

/** Sem `unaccent` no banco: a normalização de acento é nossa, e é a mesma dos dois lados. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Palavras que não distinguem produto nenhum e só atrapalham a nota.
 *
 * Curta de propósito: lista grande de stopword começa a comer termo que importa
 * ("pro", "air", "max" são modelo, não ruído).
 */
const RUIDO = new Set(["de", "do", "da", "com", "para", "por", "the", "e", "o", "a", "um", "uma"]);

/**
 * VOCABULÁRIO DO BALCÃO — apelido que o cliente fala → nome do catálogo.
 *
 * Decretado pelo dono em 2026-10-15, depois de o agente perguntar "solubill
 * ou produto da girando sol?" para quem pediu "solupa": a dúvida nunca
 * existiu. "Solupa" SEMPRE é Solubill, "intercap" SEMPRE é Billcap.
 * Gravado na FERRAMENTA (não só no prompt) para valer em todo agente:
 * com o token já canônico, o "girando sol" nem empata.
 */
const SINONIMOS_DE_BALCAO: Record<string, string> = {
  solupa: "solubill",
  intercap: "billcap",
};

export interface TokensDaBusca {
  /** Tokens difusos — casam por prefixo/semelhança. */
  palavras: string[];
  /** Tokens exatos — filtram, não pontuam. */
  numeros: string[];
}

export function tokenizar(consulta: string): TokensDaBusca {
  const palavras: string[] = [];
  const numeros: string[] = [];
  for (const t of normalizar(consulta).split(" ")) {
    if (t === "" || RUIDO.has(t)) continue;
    // Apelido de balcão vira nome de catálogo ANTES de pontuar: "solupa"
    // chega aqui já como "solubill", e o empate fantasma com "girando sol"
    // nem nasce.
    const canonico = SINONIMOS_DE_BALCAO[t] ?? t;
    // "256gb" é número com unidade colada: o número é a identidade.
    const comUnidade = /^(\d+)([a-z]{1,4})?$/.exec(canonico);
    if (comUnidade?.[1] !== undefined) numeros.push(comUnidade[1]);
    else palavras.push(canonico);
  }
  return { palavras, numeros };
}

/**
 * O número aparece neste texto como NÚMERO?
 *
 * `256` casa "256gb" e "256 gb"; NÃO casa "1256" nem "153ml" quando o número é
 * 15. A âncora de início e o sufixo curto são o que separam os dois casos.
 */
function temONumero(alvoNormalizado: string, numero: string): boolean {
  return new RegExp(`(^|\\s)${numero}([a-z]{1,4})?($|\\s)`).test(alvoNormalizado);
}

export interface ProdutoBuscavel {
  nome: string;
  codigo: string;
  marca?: string | null;
  categoria?: string | null;
}

/**
 * Principal × acessório — a distinção que a nota NÃO faz (e que causou o caso
 * da "vassoura" que voltou "cabo de vassoura avulso" em primeiro lugar).
 *
 * A pontuação mede QUALIDADE de casamento textual: "vassoura" casa
 * "Cabo de vassoura avulso" com nota 1.0, igual às vassouras de verdade — e o
 * desempate alfabético põe "Cabo…" na frente. O modelo lê de cima para baixo e
 * apresenta o primeiro. A relação abaixo diz QUEM o produto é diante do
 * pedido, para a ferramenta ordenar e instruir em cima de dado, não de texto:
 *
 * - `direta`: o pedido nomeia o produto (cabeça do nome ou categoria casam).
 * - `relacionada`: o produto é um acessório/peça do que foi pedido (a cabeça
 *   do nome é um marcador de acessório que o pedido NÃO contém) ou vive numa
 *   categoria de acessório que o pedido não menciona. Nunca é eliminada — vira
 *   alternativa explícita, nunca resposta.
 *
 * Pedido explícito de acessório ("quero um cabo de vassoura") casa a cabeça e
 * volta `direta`: a regra protege a intenção, não uma lista de produtos.
 */
export type RelacaoProduto = 'direta' | 'relacionada';

/**
 * Cabeças de nome que fazem de um item um acessório/peça — e não o produto.
 * Conservadora de propósito: só o que é acessório em QUALQUER loja entra aqui
 * ("cabo", "refil"); o resto ("tampa", "suporte de parede"?) varia por
 * catálogo e seria regra rígida demais. Precisão acima de cobertura: o que
 * não está aqui continua passando pela categoria.
 */
const MARCADORES_ACESSORIO = new Set([
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

/** Categorias que dizem "sou acessório" sem precisar ler o nome. */
const CATEGORIAS_ACESSORIO = new Set([
  'acessorio',
  'acessorios',
  'peca',
  'pecas',
  'reposicao',
  'reposicoes',
]);

/** Primeira palavra com conteúdo do nome — o "quem" do produto ("Cabo …", "Vassoura …"). */
function cabecaDoNome(nome: string): string {
  for (const t of normalizar(nome).split(' ')) {
    if (t !== '' && !RUIDO.has(t)) return t;
  }
  return '';
}

/**
 * Esta palavra do catálogo é o que o pedido disse? Mesma tolerância da
 * pontuação (exato, prefixo, distância 1) — "vassourao" é "vassouras" para
 * este efeito, e "cabo" NÃO é "acabou".
 */
function casaComPedido(palavra: string, tokens: TokensDaBusca): boolean {
  if (palavra === '') return false;
  for (const q of [...tokens.palavras, ...tokens.numeros]) {
    if (palavra === q) return true;
    if (
      palavra.length >= 3 &&
      q.length >= 3 &&
      (palavra.startsWith(q) || q.startsWith(palavra))
    ) {
      return true;
    }
    if (palavra.length >= 4 && q.length >= 4 && distanciaAte(palavra, q, 1)) return true;
  }
  return false;
}

export function classificarRelacao(consulta: string, produto: ProdutoBuscavel): RelacaoProduto {
  const tokens = tokenizar(consulta);
  if (tokens.palavras.length === 0) return 'direta';
  // O pedido nomeia a cabeça do produto (ou a categoria): é ele, mesmo sendo
  // acessório — "quero um cabo de vassoura" TEM de devolver o cabo.
  const cabeca = cabecaDoNome(produto.nome);
  if (casaComPedido(cabeca, tokens)) return 'direta';
  const categoria = normalizar(produto.categoria ?? '');
  if (categoria !== '' && categoria.split(' ').some((c) => casaComPedido(c, tokens))) {
    return 'direta';
  }
  // Cabeça acessória que o pedido não contém ("Cabo …" para quem pediu
  // "vassoura"): relacionado, nunca resposta.
  if (MARCADORES_ACESSORIO.has(cabeca)) return 'relacionada';
  // Categoria acessória que o pedido não menciona: mesmo veredito.
  if (categoria !== '' && categoria.split(' ').some((c) => CATEGORIAS_ACESSORIO.has(c))) {
    return 'relacionada';
  }
  return 'direta';
}

/**
 * Nota de 0 a 1 — ou `null` quando o produto é ELIMINADO.
 *
 * `null` não é "nota zero": é "este produto está descartado", e a diferença
 * importa para quem chama. Um número que a pessoa disse e o produto não tem é
 * eliminação, porque é o que impede o 128GB de aparecer para quem pediu 256GB.
 */
export function pontuar(produto: ProdutoBuscavel, tokens: TokensDaBusca): number | null {
  const alvo = normalizar(
    [produto.nome, produto.marca ?? "", produto.categoria ?? "", produto.codigo].join(" "),
  );

  // ── O FILTRO DURO ──────────────────────────────────────────────────────────
  for (const n of tokens.numeros) {
    if (!temONumero(alvo, n)) return null;
  }

  if (tokens.palavras.length === 0) {
    // Só números, e todos casaram: é um acerto legítimo ("256", "212").
    return tokens.numeros.length > 0 ? 1 : null;
  }

  const doAlvo = alvo.split(" ");
  let soma = 0;
  for (const p of tokens.palavras) {
    // A nota do token é a QUALIDADE do melhor casamento, não um sim/não. É o
    // que faz "ifone" preferir "iphone" a "fone": os dois casam, e o primeiro
    // casa melhor. Com nota binária os dois empatavam, e o empate punha um fone
    // de ouvido ao lado de um celular de dez mil reais.
    let melhor = 0;
    for (const t of doAlvo) {
      // ⚠️ A INICIAL VALE MAIS QUE A DISTÂNCIA, e isto foi medido: sem ela,
      // "ifone" devolvia o "Fone Bluetooth" (distância 1) NA FRENTE do "iPhone"
      // (distância 2) — um fone de ouvido no lugar de um celular de dez mil.
      // Quem digita rápido erra o meio da palavra; quase ninguém erra a
      // primeira letra. É o sinal que separa "faltou uma letra" de "é outra
      // palavra que por acaso se parece".
      const mesmaInicial = t[0] === p[0];
      let nota = 0;
      if (t === p) nota = 1;
      // ⚠️ Prefixo exige ao menos TRÊS letras na palavra da consulta. Medido:
      // "me ve 5" devolvia um perfume porque "me" casa "Men" por prefixo com
      // nota 0.9 — enchimento de conversa virando produto. Duas letras não
      // identificam nada; a partir de três, "pro", "max" e "air" seguem
      // funcionando.
      else if (p.length >= 3 && t.length >= 3 && (t.startsWith(p) || p.startsWith(t))) nota = 0.9;
      // ^^^  (11/10/2026): sem ele, palavra-alvo de 1 letra
      // ("a", "e", "o" — toda descrição tem) casa por prefixo com qualquer
      // consulta que comece com ela: "alcool".startsWith("a") valia 0.9.
      // O comentário acima já dizia que 2 letras não identificam nada — valia
      // só para a consulta; agora vale para os dois lados.
      else if (p.length >= 4 && distanciaAte(p, t, 1)) nota = mesmaInicial ? 0.75 : 0.5;
      // Distância 2 só para palavra longa: é o caso de "ifone" × "iphone" (falta
      // uma letra E troca outra). Abaixo de 5 letras a tolerância vira ruído —
      // "mac" alcançaria "max", que é outro produto.
      else if (p.length >= 5 && distanciaAte(p, t, 2)) nota = mesmaInicial ? 0.6 : 0;
      if (nota > melhor) melhor = nota;
    }
    soma += melhor;
  }

  if (soma === 0) return null;
  return soma / tokens.palavras.length;
}

/** As duas palavras diferem por no máximo `teto` edições? */
function distanciaAte(a: string, b: string, teto: number): boolean {
  if (Math.abs(a.length - b.length) > teto) return false;
  // Levenshtein com corte: para palavras desta ordem de grandeza a matriz é
  // barata, e o corte evita percorrer tudo quando já passou do teto.
  const anterior: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const atual = [i];
    let menorNaLinha = i;
    for (let j = 1; j <= b.length; j += 1) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(
        (atual[j - 1] ?? 0) + 1,
        (anterior[j] ?? 0) + 1,
        (anterior[j - 1] ?? 0) + custo,
      );
      atual.push(v);
      if (v < menorNaLinha) menorNaLinha = v;
    }
    if (menorNaLinha > teto) return false;
    for (let k = 0; k <= b.length; k += 1) anterior[k] = atual[k] ?? 0;
  }
  return (anterior[b.length] ?? teto + 1) <= teto;
}

export interface Achado<T> {
  produto: T;
  nota: number;
  /**
   * Quem o produto é diante do pedido (ver `classificarRelacao`). A ordenação
   * põe `direta` antes de `relacionada` — antes do desempate alfabético, que
   * punha "Cabo de vassoura avulso" na frente das vassouras de verdade.
   */
  relacao: RelacaoProduto;
}

/**
 * Ordena os candidatos pela nota, descartando os eliminados.
 *
 * Empate é preservado: quem chama precisa saber que houve mais de um, para
 * perguntar em vez de escolher.
 */
/**
 * O NÚMERO QUE NÃO É ATRIBUTO NÃO PODE ZERAR A BUSCA — MAS TAMBÉM NÃO PODE
 * OFERECER A CAPACIDADE ERRADA EM SILÊNCIO.
 *
 * ═══ Os dois defeitos, e por que consertar um sozinho cria o outro ══════════
 *
 * O filtro numérico existe para impedir que quem pede 128GB veja o 256GB. Mas
 * ele tratava TODO número da frase como atributo, e o cliente diz números que
 * não descrevem produto:
 *
 *     "quero 2 iphone 15"      -> 0 resultados
 *     "tenho 3000 pra gastar"  -> 0 resultados
 *
 * Zero resultado num pedido de compra explícito é o pior desfecho: o agente
 * responde "não encontrei" para quem estava comprando.
 *
 * ⚠️ A PRIMEIRA VERSÃO DESTE CONSERTO DESCARTAVA o número que não aparece em
 * nenhum produto — "se o catálogo não conhece, não é atributo". Parece
 * auto-calibrado e NÃO É: ele depende de a variante existir em ALGUM produto.
 *
 *     loja com MacBook 512GB:  "iphone 15 pro 512" -> vazio      (seguro)
 *     loja só com 128 e 256:   "iphone 15 pro 512" -> 128 e 256  (ERRADO)
 *
 * A segunda é a loja pequena e homogênea, que é o cliente deste produto. Lá o
 * 512 deixa de ser vocabulário, some do filtro, e quem pediu 512 recebe o preço
 * do 128 — exatamente o erro que esta busca existe para não cometer.
 *
 * ═══ A regra que fecha os dois ═════════════════════════════════════════════
 *
 * O número SEMPRE elimina. Quando a eliminação esvazia o resultado, a busca
 * refaz sem os números que o catálogo não conhece e devolve o que achou
 * MARCADO como relaxado, dizendo QUAIS números ignorou.
 *
 * Assim "quero 2 iphone 15" acha o iPhone 15 (relaxando o "2"), e
 * "iphone 15 pro 512" numa loja sem 512 também acha — mas nos dois casos quem
 * chama sabe que houve relaxamento e qual número saiu. A ferramenta então
 * manda o agente CONFIRMAR com o cliente em vez de responder um preço como se
 * fosse o pedido. Nenhuma capacidade errada sai em silêncio.
 */
function numerosQueOCatalogoConhece<T extends ProdutoBuscavel>(
  produtos: readonly T[],
  numeros: readonly string[],
): Set<string> {
  const conhecidos = new Set<string>();
  if (numeros.length === 0) return conhecidos;

  for (const produto of produtos) {
    const alvo = normalizar(
      [produto.nome, produto.marca ?? "", produto.categoria ?? "", produto.codigo].join(" "),
    );
    for (const n of numeros) {
      if (!conhecidos.has(n) && temONumero(alvo, n)) conhecidos.add(n);
    }
    if (conhecidos.size === numeros.length) break;
  }
  return conhecidos;
}

function pontuarTodos<T extends ProdutoBuscavel>(
  produtos: readonly T[],
  tokens: TokensDaBusca,
  consulta: string,
): Achado<T>[] {
  const achados: Achado<T>[] = [];
  for (const produto of produtos) {
    const nota = pontuar(produto, tokens);
    if (nota !== null) achados.push({ produto, nota, relacao: classificarRelacao(consulta, produto) });
  }
  return achados.sort(
    (a, b) =>
      (a.relacao === b.relacao ? 0 : a.relacao === 'direta' ? -1 : 1) ||
      b.nota - a.nota ||
      a.produto.nome.localeCompare(b.produto.nome),
  );
}

export interface BuscaRelaxada<T> {
  achados: Achado<T>[];
  /** Números que a busca teve de ignorar para achar alguma coisa. Vazio = busca exata. */
  ignorados: string[];
}

/**
 * A busca com o desfecho completo: o que achou e o que teve de ignorar.
 *
 * `ignorados` não vazio é um contrato com quem chama: NÃO responda como se
 * fosse o pedido — confirme. É a mesma disciplina do empate, que também devolve
 * a ambiguidade em vez de escolher.
 */
export function buscarComRelaxamento<T extends ProdutoBuscavel>(
  produtos: readonly T[],
  consulta: string,
): BuscaRelaxada<T> {
  const tokens = tokenizar(consulta);
  if (tokens.palavras.length === 0 && tokens.numeros.length === 0) {
    return { achados: [], ignorados: [] };
  }

  const exatos = pontuarTodos(produtos, tokens, consulta);
  if (exatos.length > 0 || tokens.numeros.length === 0) {
    return { achados: exatos, ignorados: [] };
  }

  // Vazio COM números na consulta: vale tentar de novo sem os que o catálogo
  // não conhece. Os que ele conhece continuam eliminando — quem pede 256 numa
  // loja que tem 256 e 128 continua sem ver o 128.
  const conhecidos = numerosQueOCatalogoConhece(produtos, tokens.numeros);
  const ignorados = tokens.numeros.filter((n) => !conhecidos.has(n));
  if (ignorados.length === 0) return { achados: exatos, ignorados: [] };

  const relaxados = pontuarTodos(
    produtos,
    {
      palavras: tokens.palavras,
      numeros: tokens.numeros.filter((n) => conhecidos.has(n)),
    },
    consulta,
  );

  // Sem palavra nenhuma sobrando, "quero 2" viraria o catálogo inteiro.
  if (tokens.palavras.length === 0) return { achados: [], ignorados: [] };

  return { achados: relaxados, ignorados };
}

export function ordenarPorRelevancia<T extends ProdutoBuscavel>(
  produtos: readonly T[],
  consulta: string,
): Achado<T>[] {
  return buscarComRelaxamento(produtos, consulta).achados;
}
