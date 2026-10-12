/**
 * A NOMENCLATURA COMUM DO BRASIL PELO SISCOMEX (fonte federal oficial).
 *
 * ─── Por que um segundo importador, quando já existe o do IBPT ─────────────
 *
 * Porque os dois não dão a mesma coisa. O IBPT é o texto do IBGE com o ICMS de
 * cada estado — melhor nome para casar produto com descrição, mas é CSV
 * baixado na mão e para na próxima alteração. O Siscomex é a nomenclatura
 * federal pura, com um endpoint público e atualizado por ato (Resolução
 * Gecex). Os dois convivem na mesma tabela: um traz o nome, o outro a
 * vigência.
 *
 * ─── O problema que este arquivo resolve ───────────────────────────────────
 *
 * O JSON oficial traz a descrição **de um nível só**. O `28289011` vem como
 * `"De sódio"` — sem nenhuma palavra que case com "ÁGUA SANITARIA" na tela.
 * Jogar isso na tabela faria o suggester casar nada, e o sintoma seria o pior
 * possível: a tabela cheia, a rota respondendo 200, e zero NCM preenchido.
 *
 * A descrição útil está no **caminho até ele**:
 *
 *   28      Produtos químicos inorgânicos…
 *   2828    Hipocloritos; hipoclorito de cálcio comercial; cloritos…
 *   282890  - Outros
 *   28289011 - De sódio
 *
 * "Hipocloritos" é exatamente o termo de água sanitária. Sem remontar a
 * hierarquia, a fonte serve para nada.
 *
 * ─── A hierarquia é irregular e é por isso que o remontador sonda ──────────
 *
 * A nomenclatura tem 2, 4, 5, 6, 7 e 8 dígitos — os níveis de 5 e 7 existem só
 * em partes da tabela (subitens do Gecex). Remover dois dígitos do fim até
 * chegar ao capítulo FUNCIONA para a maioria e QUEBRA nos subitem: de
 * `0102.29.1` (7) o pai seria `01022` (5), que não existe — o pai real é
 * `0102.29` (6). Por isso a remontagem não assume passo fixo: ela varre todos
 * os prefixos do código, do maior para o menor, e usa os que existem.
 */
/** Fonte oficial. Pública, sem token — por isso pode ser importada sem segredo. */
export const URL_DO_SISCOMEX =
  "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json";

/** O NCM que vai na nota é o item, com 8 dígitos. */
export const DIGITOS_DO_ITEM = 8;

export interface LinhaNcmSiscomex {
  /** Só dígitos, sem os pontos do JSON (`0101.21.00` → `01012100`). */
  codigo: string;
  descricao: string;
  vigencia_inicio: string;
  /** `null` quando o item não tem prazo de término (`31/12/9999`). */
  vigencia_fim: string | null;
}

export interface LeituraSiscomex {
  valido: boolean;
  linhas: LinhaNcmSiscomex[];
  lidas: number;
  /** Descartadas por não serem item de 8 dígitos (capítulos, posições…). */
  ignoradas: number;
  /** Itens cuja descrição remontada ficou vazia. */
  sem_descricao: number;
  /** Metadados do ato, quando o JSON traz. */
  ato: string | null;
  atualizacao: string | null;
  /** Motivo da recusa, quando `valido` é falso. */
  erro: string | null;
}

interface NomenclaturaCrua {
  Codigo?: unknown;
  Descricao?: unknown;
  Data_Inicio?: unknown;
  Data_Fim?: unknown;
}

/**
 * Limpa o prefixo de nível que o Siscomex usa para marcar profundidade.
 *
 * O JSON escreve `- Outros` no nível de 6 e `-- Reprodutores` no de 7/8. Juntar
 * esses marcadores na descrição final produziria "Produtos químicos — - Outros
 * - De sódio", que casa mal com nome de produto e polui o campo.
 */
function limparDescricao(bruta: string): string {
  return bruta
    .replace(/^[\s-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** `31/12/9999` (e qualquer "9999") é ausência de prazo, não uma data. */
function converterData(bruta: string | null | undefined): string | null {
  if (typeof bruta !== "string") return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(bruta.trim());
  if (!m) return null;
  const [, dia, mes, ano] = m;
  // O sentinela é 9999 — trata como "sem fim" em vez de gravar uma data que
  // não existe e que a consulta de vigência não entenderia.
  if (ano === "9999") return null;
  return `${ano}-${mes}-${dia}`;
}

/**
 * Remonta a descrição completa de um item somando os níveis acima dele.
 *
 * Sonda todos os prefixos do maior para o menor — a justificativa de não usar
 * passo fixo está no cabeçalho deste arquivo.
 */
function remontar(codigo: string, descricaoDoItem: string, porCodigo: Map<string, string>): string {
  // A descrição do PRÓPRIO item entra como último pedaço: é ela que distingue
  // "De sódio" de "De potássio". Sem esta linha o caminho terminava um nível
  // acima e o item virava indistinguível do seu irmão.
  const partes: string[] = descricaoDoItem === "" ? [] : [descricaoDoItem];
  for (let tamanho = codigo.length - 1; tamanho >= 2; tamanho--) {
    const prefixo = codigo.slice(0, tamanho);
    const achado = porCodigo.get(prefixo);
    if (achado !== undefined && !partes.includes(achado)) partes.unshift(achado);
  }
  return partes.join(" > ");
}

/**
 * Lê o JSON do Siscomex e devolve os itens de 8 dígitos com a descrição
 * remontada.
 *
 * Devolve `valido: false` com `erro` quando o JSON não é do Siscomex — uma
 * resposta de erro da fonte (HTML de portal, `{}`) precisa falhar aqui, e não
 * virar "0 linhas importadas" que o operador leva como sucesso.
 */
export function lerJsonSiscomex(texto: string): LeituraSiscomex {
  const vazia = (erro: string): LeituraSiscomex => ({
    valido: false,
    linhas: [],
    lidas: 0,
    ignoradas: 0,
    sem_descricao: 0,
    ato: null,
    atualizacao: null,
    erro,
  });

  if (typeof texto !== "string" || texto.trim() === "") {
    return vazia("Resposta vazia do Siscomex.");
  }

  let cru: unknown;
  try {
    cru = JSON.parse(texto) as unknown;
  } catch {
    return vazia("Resposta não é JSON — o portal pode ter devolvido HTML de erro.");
  }

  if (typeof cru !== "object" || cru === null || Array.isArray(cru)) {
    return vazia("JSON unexpectedo: esperado um objeto com 'Nomenclaturas'.");
  }

  const envelope = cru as { Nomenclaturas?: unknown };
  if (!Array.isArray(envelope.Nomenclaturas)) {
    return vazia("JSON sem a lista 'Nomenclaturas' — não é o arquivo do Siscomex.");
  }

  const brutas = envelope.Nomenclaturas as NomenclaturaCrua[];
  if (brutas.length === 0) return vazia("O Siscomex devolveu uma lista vazia.");

  // Índice de descrição por código, em TODOS os níveis: é o que permite
  // remontar o caminho de um item.
  const porCodigo = new Map<string, string>();
  for (const bruto of brutas) {
    if (typeof bruto.Codigo !== "string") continue;
    const codigo = bruto.Codigo.replace(/\D/g, "");
    if (codigo.length < 2) continue;
    if (typeof bruto.Descricao !== "string") continue;
    porCodigo.set(codigo, limparDescricao(bruto.Descricao));
  }

  const linhas: LinhaNcmSiscomex[] = [];
  let ignoradas = 0;
  let semDescricao = 0;

  for (const bruto of brutas) {
    if (typeof bruto.Codigo !== "string") {
      ignoradas++;
      continue;
    }
    const codigo = bruto.Codigo.replace(/\D/g, "");
    if (codigo.length !== DIGITOS_DO_ITEM) {
      // Capítulo, posição, subposição e subitens: o suggester e a nota trabalham
      // com o item.
      ignoradas++;
      continue;
    }

    const descricao = typeof bruto.Descricao === "string" ? limparDescricao(bruto.Descricao) : "";
    const completa = remontar(codigo, descricao, porCodigo);
    if (completa === "") {
      semDescricao++;
      continue;
    }

    const vigenciaInicio = converterData(
      typeof bruto.Data_Inicio === "string" ? bruto.Data_Inicio : null,
    );
    if (vigenciaInicio === null) {
      // Sem data de início não dá para decidir vigência na consulta — melhor
      // descartar do que gravar uma linha que nunca vai ser considerada.
      ignoradas++;
      continue;
    }

    linhas.push({
      codigo,
      descricao: completa,
      vigencia_inicio: vigenciaInicio,
      vigencia_fim: converterData(typeof bruto.Data_Fim === "string" ? bruto.Data_Fim : null),
    });
  }

  const meta = cru as { Ato?: unknown; Data_Ultima_Atualizacao_NCM?: unknown };

  return {
    valido: true,
    linhas,
    lidas: brutas.length,
    ignoradas,
    sem_descricao: semDescricao,
    ato: typeof meta.Ato === "string" ? meta.Ato : null,
    atualizacao:
      typeof meta.Data_Ultima_Atualizacao_NCM === "string"
        ? meta.Data_Ultima_Atualizacao_NCM
        : null,
    erro: null,
  };
}
