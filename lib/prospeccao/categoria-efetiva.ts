/**
 * CATEGORIA EFETIVA — o rótulo que o operador vê e a campanha usa.
 *
 * ═══ O DEFEITO QUE ISTO RESOLVE ═══════════════════════════════════════════
 *
 * `business_prospects.categoria` guarda o rótulo CRU do Google Maps. Ele é a
 * melhor evidência que a base tem — mas não é a verdade: o Google classifica
 * como "Gas station" uma cafeteria dentro do posto, como "Auto repair shop" um
 * posto com oficina, e como "Store" qualquer coisa que não achou melhor. O
 * operador via "Posto de combustível" numa empresa que não vende combustível e
 * a campanha mandava mensagem para ela.
 *
 * ─── A REGRA DE OURO ──────────────────────────────────────────────────────
 *
 * 1. O rótulo cru CONTINUA sendo a evidência primária. Não inventamos categoria
 *    a partir do nome sem sinal positivo: "Branca" pode ser um posto; "Ellg"
 *    também. Nesses casos a linha fica marcada `revisar`, NÃO é reclassificada
 *    no escuro — e a campanha não a usa até alguém olhar.
 *
 * 2. Só reclassificamos com sinal EXPLÍCITO no nome/website/categorias
 *    secundárias: "Estação Café", "Posto de Saúde", "Lava-jato", "Posto de
 *    Molas", "Posto Ipiranga" (marca de combustível). Aí a evidência é mais
 *    forte que o rótulo genérico do Google.
 *
 * 3. Categoria genérica ("Store", "Service", "Establishment") só serve quando
 *    há uma secundária específica. Sem ela, `revisar` — a campanha não adivinha.
 *
 * 4. `revisar` é a trava de segurança: a empresa aparece na tela com o rótulo
 *    e o aviso, mas NÃO entra em campanha nem em disparo. É melhor não mandar
 *    do que mandar para a empresa errada — o dano do segundo não aparece como
 *    erro em lugar nenhum.
 *
 * Função pura: sem banco, sem relógio. É a mesma nos três lugares que precisam
 * concordar — a tabela de Empresas, o público da campanha e o envio.
 */
import {
  CATEGORIA_PT,
  categoriasQueCasam,
  semAcento,
  traduzirCategoria,
} from "@/lib/prospeccao/categoria-pt";

export type ConfiancaCategoria = "alta" | "media" | "baixa";

export interface CategoriaEfetiva {
  /** O rótulo canônico em português — é o que a tela mostra. */
  rotulo: string;
  /** O rótulo cru gravado no banco (para auditoria e para o filtro). */
  original: string | null;
  /** `true` quando o rótulo efetivo NÃO é o cru (corrigimos com evidência). */
  reclassificada: boolean;
  /** `true` = não usar em campanha/disparo até revisão humana. */
  revisar: boolean;
  confianca: ConfiancaCategoria;
  /** Por que o rótulo é este — a tela pode mostrar no detalhe. */
  motivo: string;
  /**
   * Todos os rótulos efetivos (canônico + secundárias traduzidas) para a
   * comparação com a campanha. Quando reclassificamos, o rótulo cru primário
   * NÃO entra: é justamente ele que estava errado.
   */
  categorias: string[];
}

/**
 * Rótulos crus que não descrevem nada por si sós. A secundária do Google é
 * mais específica; sem ela, a linha vai para revisão.
 */
const GENERICAS = new Set(
  [
    "Store",
    "Service",
    "Establishment",
    "Point of interest",
    "Business",
    "Local business",
    "Corporate office",
    "Organization",
    "Association or organization",
    "Non-profit organization",
  ].map((v) => semAcento(v)),
);

/**
 * Sinais de que o nome NÃO é de posto, apesar de o Google dizer "Gas station".
 * A ordem importa: café antes de loja (a loja do posto pode ser uma cafeteria).
 */
const NAO_E_POSTO: Array<{ re: RegExp; rotulo: string; motivo: string }> = [
  {
    re: /esta(?:c|ç)(?:a|ã)o\s*caf[eé]|\bcaf[eé]\b|cafeteria|coffee\s*shop/i,
    rotulo: "Café",
    motivo: "o nome indica café/cafeteria, não posto",
  },
  {
    re: /posto\s+de\s+sa[uú]de|\bubs\b|\busf\b|unidade\s+b[aá]sica\s+de\s+sa[uú]de|posto\s+de\s+vacina|posto\s+de\s+enfermagem/i,
    rotulo: "Centro público de saúde",
    motivo: "o nome indica posto de saúde, não posto de combustível",
  },
  {
    re: /posto\s+de\s+atendimento|posto\s+de\s+coleta|posto\s+policial|posto\s+de\s+assist[eê]ncia/i,
    rotulo: "Órgão público",
    motivo: "o nome indica atendimento/serviço público, não posto",
  },
  {
    re: /posto\s+de\s+molas|\bmolas\b|suspens(?:a|ã)o|alinhamento/i,
    rotulo: "Oficina mecânica",
    motivo: "o nome indica oficina de molas/suspensão, não posto",
  },
  {
    re: /lava(?:c|ç)(?:a|ã)o|lavagem|lava[\s-]?jato/i,
    rotulo: "Lavejão",
    motivo: "o nome indica lava-jato, não posto",
  },
  {
    re: /restaurante/i,
    rotulo: "Restaurante",
    motivo: "o nome indica restaurante, não posto",
  },
  {
    re: /lanchonete/i,
    rotulo: "Lanchonete",
    motivo: "o nome indica lanchonete, não posto",
  },
  {
    re: /padaria|panificadora/i,
    rotulo: "Padaria",
    motivo: "o nome indica padaria, não posto",
  },
  {
    re: /farm[aá]cia|drogaria/i,
    rotulo: "Farmácia",
    motivo: "o nome indica farmácia, não posto",
  },
  {
    re: /supermercado|hipermercado/i,
    rotulo: "Supermercado",
    motivo: "o nome indica supermercado, não posto",
  },
  {
    re: /\bloja\b|conveni[eê]ncia|\bmercado\b/i,
    rotulo: "Mercearia de bairro",
    motivo: "o nome indica loja/conveniência, não posto",
  },
];

/** Marca de combustível: evidência forte de que é posto. */
const MARCA_DE_POSTO =
  /auto\s*posto|posto\s+(?:ipiranga|shell|petrobras|vibra|br|bandeira)|posto\s+de\s+gasolina|posto\s+de\s+combust[ií]vel|ipiranga|shell|petrobras|vibra/i;

/** Evidência fraca: "posto" sozinho só vale quando o Google já diz Gas station. */
const SINAL_DE_POSTO =
  /posto|combust[ií]vel|gasolina|etanol|diesel|\bgnv\b|ipiranga|shell|petrobras|vibra|auto\s*posto/i;

/** Domínio de bandeira — o "Auto Desk" com site da Shell é posto. */
const DOMINIO_DE_POSTO = /(^|\.)(shell|ipiranga|petrobras|vibra|postos?|combustiveis?)\./i;

/** A tradução do rótulo cru; `null` quando ele é genérico/vazio. */
function traduzidoEspecifico(
  bruto: string | null | undefined,
  secundarias: readonly string[] | null | undefined,
): { rotulo: string; original: string } | null {
  const candidatos = [bruto ?? "", ...(secundarias ?? [])].map((c) => c.trim()).filter(Boolean);
  for (const c of candidatos) {
    if (GENERICAS.has(semAcento(c))) continue;
    const rotulo = traduzirCategoria(c);
    // Rótulo desconhecido (não está no mapa) não é "específico": pode ser um
    // tipo novo do Google que ninguém traduziu. Melhor revisar que adivinhar.
    if (rotulo === c && !Object.hasOwn(CATEGORIA_PT, c)) continue;
    return { rotulo, original: c };
  }
  return null;
}

/** Constrói o conjunto de rótulos efetivos (canônico + secundárias). */
function juntarCategorias(
  canonico: string,
  bruto: string | null,
  secundarias: readonly string[] | null | undefined,
  incluirBruto: boolean,
): string[] {
  const saida = new Set<string>();
  const adicionar = (v: string | null | undefined) => {
    const t = v?.trim();
    if (!t) return;
    saida.add(t);
    const traduzido = traduzirCategoria(t);
    if (traduzido !== t) saida.add(traduzido);
  };
  adicionar(canonico);
  if (incluirBruto) adicionar(bruto);
  for (const s of secundarias ?? []) {
    if (GENERICAS.has(semAcento(s))) continue;
    // O rótulo cru que acabou de ser corrigido não pode voltar pela porta das
    // secundárias: o Google repete o primário na lista de categorias.
    if (!incluirBruto && bruto && semAcento(s) === semAcento(bruto)) continue;
    adicionar(s);
  }
  return [...saida];
}

/**
 * Resolve a categoria que a tela mostra e a campanha compara.
 *
 * `categoria` é o rótulo primário do Google; `categorias` são as secundárias;
 * `website`/`nome` são a evidência que corrige o primário.
 */
export function categoriaEfetiva(prospect: {
  nome: string | null;
  categoria: string | null;
  categorias?: readonly string[] | null;
  website?: string | null;
  /** Correção já gravada (backfill ou revisão humana). Manda sobre a regra. */
  categoria_canonica?: string | null;
  /** `true` = revisão humana pendente; `false`/null = não decidido pela coluna. */
  categoria_revisar?: boolean | null;
}): CategoriaEfetiva {
  const nome = prospect.nome?.trim() ?? "";
  const bruto = prospect.categoria?.trim() || null;
  const secundarias = prospect.categorias ?? [];
  const website = prospect.website?.trim() || null;
  const canonicaGravada = prospect.categoria_canonica?.trim() || null;

  // 0. Uma correção já gravada (o backfill do 0277 ou uma revisão humana) é a
  //    decisão mais recente — não a sobrescrevemos com a heurística.
  if (canonicaGravada) {
    const revisar = prospect.categoria_revisar === true;
    return {
      rotulo: canonicaGravada,
      original: bruto,
      reclassificada:
        semAcento(canonicaGravada) !==
        semAcento(bruto ? traduzirCategoria(bruto) : ""),
      revisar,
      confianca: revisar ? "baixa" : "alta",
      motivo: revisar
        ? "revisão humana pendente (marcada na base)"
        : "categoria corrigida/confirmada na base",
      categorias: juntarCategorias(canonicaGravada, bruto, secundarias, false),
    };
  }

  // 0b. Revisão humana pedida sem corrigir o rótulo: respeita o veto.
  if (!canonicaGravada && prospect.categoria_revisar === true) {
    const rotulo = bruto ? traduzirCategoria(bruto) : "Não classificado";
    return {
      rotulo,
      original: bruto,
      reclassificada: false,
      revisar: true,
      confianca: "baixa",
      motivo: "marcada para revisão na base",
      categorias: bruto ? juntarCategorias(rotulo, bruto, secundarias, true) : [],
    };
  }


  if (bruto && semAcento(bruto) === semAcento("Gas station")) {
    for (const sinal of NAO_E_POSTO) {
      if (sinal.re.test(nome)) {
        return {
          rotulo: sinal.rotulo,
          original: bruto,
          reclassificada: true,
          revisar: false,
          confianca: "alta",
          motivo: sinal.motivo,
          categorias: juntarCategorias(sinal.rotulo, bruto, secundarias, false),
        };
      }
    }

    const temSiteDePosto = website !== null && DOMINIO_DE_POSTO.test(website);
    const temMarca = MARCA_DE_POSTO.test(nome);
    const temSinal = SINAL_DE_POSTO.test(nome);
    // A secundária só CONFIRMA se disser algo além do primário. O Google
    // repete "Gas station" na lista de categorias com frequência; contar a
    // repetição como evidência independente anulava a revisão de "Branca".
    const secundariaDePosto = secundarias.some(
      (c) =>
        semAcento(c) !== semAcento(bruto) &&
        /gas station|fuel supplier|fuel/i.test(c),
    );

    if (temSiteDePosto || temMarca || secundariaDePosto) {
      return {
        rotulo: traduzirCategoria("Gas station"),
        original: bruto,
        reclassificada: false,
        revisar: false,
        confianca: "alta",
        motivo: temSiteDePosto
          ? "website de bandeira de combustível"
          : temMarca
            ? "nome traz marca/expressão de posto"
            : "categoria secundária confirma combustível",
        categorias: juntarCategorias(traduzirCategoria("Gas station"), bruto, secundarias, true),
      };
    }

    if (temSinal) {
      return {
        rotulo: traduzirCategoria("Gas station"),
        original: bruto,
        reclassificada: false,
        revisar: false,
        confianca: "media",
        motivo: "nome contém sinal de posto, mas sem bandeira/website",
        categorias: juntarCategorias(traduzirCategoria("Gas station"), bruto, secundarias, true),
      };
    }

    // O Google diz posto, mas nada no nome/site/secundária confirma. NÃO
    // reclassificamos no escuro — marcamos para revisão e tiramos da campanha.
    return {
      rotulo: traduzirCategoria("Gas station"),
      original: bruto,
      reclassificada: false,
      revisar: true,
      confianca: "baixa",
      motivo:
        "Google classifica como posto, mas nome/website/secundárias não confirmam — revisar antes de usar em campanha",
      categorias: juntarCategorias(traduzirCategoria("Gas station"), bruto, secundarias, true),
    };
  }

  // 2. O Google disse "Auto repair shop" (ou similar), mas o nome é de posto
  //    com marca: o combustível é a evidência mais forte.
  if (bruto && MARCA_DE_POSTO.test(nome) && !/oficina|mec[aâ]nica|borracharia|funilaria/i.test(nome)) {
    return {
      rotulo: traduzirCategoria("Gas station"),
      original: bruto,
      reclassificada: true,
      revisar: false,
      confianca: "media",
      motivo: "nome traz marca/expressão de posto; o rótulo do Google era outro",
      categorias: juntarCategorias(traduzirCategoria("Gas station"), bruto, secundarias, false),
    };
  }

  // 3. Rótulo específico conhecido: é a evidência primária.
  const especifico = traduzidoEspecifico(bruto, secundarias);
  if (especifico) {
    const canonico = traduzirCategoria(especifico.original);
    return {
      rotulo: canonico,
      original: bruto,
      reclassificada: canonico !== (bruto ? traduzirCategoria(bruto) : canonico),
      revisar: false,
      confianca: "alta",
      motivo:
        bruto && semAcento(especifico.original) !== semAcento(bruto)
          ? "rótulo primário genérico; usei a categoria secundária"
          : "rótulo do Google",
      categorias: juntarCategorias(canonico, bruto, secundarias, true),
    };
  }

  // 4. Nada específico: não inventamos. A linha fica visível e fora da campanha.
  return {
    rotulo: bruto ? traduzirCategoria(bruto) : "Não classificado",
    original: bruto,
    reclassificada: false,
    revisar: true,
    confianca: "baixa",
    motivo: bruto
      ? "categoria genérica/desconhecida sem secundária específica — revisar"
      : "empresa sem categoria — revisar",
    categorias: bruto
      ? juntarCategorias(traduzirCategoria(bruto), bruto, secundarias, true)
      : [],
  };
}

/**
 * As categorias que a campanha aceita, nas duas línguas em que a base grava.
 * Mora aqui (e não em `publico-da-base`) para o validador da campanha e o
 * público usarem a MESMA régua — duas cópias divergiriam.
 */
export function categoriasAceitas(categorias: readonly string[]): Set<string> {
  const aceitas = new Set<string>();
  for (const c of categorias) {
    aceitas.add(semAcento(c).trim());
    for (const bruta of categoriasQueCasam(c)) aceitas.add(semAcento(bruta).trim());
  }
  return aceitas;
}

/**
 * A empresa pode receber esta campanha?
 *
 * `revisar` veta. Campanha sem categoria (ou com o curinga histórico
 * "empresas", usado pela tela quando o operador seleciona à mão) não filtra
 * por categoria — foi o operador que escolheu a lista.
 */
export function categoriaCombinaComCampanha(
  efetiva: CategoriaEfetiva,
  categoriasDaCampanha: readonly string[],
  aceitasDaCampanha?: Set<string>,
): boolean {
  if (efetiva.revisar) return false;
  const uteis = categoriasDaCampanha.map((c) => c.trim()).filter(Boolean);
  if (uteis.length === 0) return true;
  if (uteis.some((c) => semAcento(c) === "empresas")) return true;
  const aceitas = aceitasDaCampanha ?? categoriasAceitas(uteis);
  return efetiva.categorias.some((c) => aceitas.has(semAcento(c).trim()));
}
