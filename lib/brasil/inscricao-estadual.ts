/**
 * INSCRIÇÃO ESTADUAL — o dado que falta e para a fila de notas (rejeição 232).
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE SEPARADO DO CNPJ ──────────────────────────
 *
 * A BrasilAPI (`/api/cnpj/v1`) devolve o cadastro da Receita e **não** devolve
 * IE — verificado em 16/11/2026: a chave `inscricoes_estaduais` não existe na
 * resposta, nem para CNPJ que tem IE ativa. O cadastro da Receita é federal; a
 * IE é estadual, e por isso nunca veio junto.
 *
 * A fonte que publica as duas coisas é `publica.cnpj.ws`, que espelha o
 * cadastro e traz `estabelecimento.inscricoes_estaduais` com uma entrada por
 * UF, cada uma com `ativo` e a data de atualização. É pública e sem chave.
 *
 * ─── A REGRA QUE IMPORTA: IE DE OUTRA UF NÃO SERVE ─────────────────────────
 *
 * A NF-e leva a IE **do destinatário na UF do destinatário**. Preencher com a
 * IE de outro estado é trocar a rejeição 232 por uma rejeição pior — o dado
 * parece certo e o documento é recusado por divergência de UF. Por isso
 * `escolherIe` recebe a UF e **nunca** devolve IE de outra: se não houver IE
 * naquela UF, devolve `null` e a tela instrui (ISENTO ou correção manual).
 *
 * ─── O QUE ELE NÃO FAZ ─────────────────────────────────────────────────────
 *
 * Não valida o dígito da IE: a regra é diferente em cada UF (algumas usam
 * módulo 11 com pesos próprios, outras módulo 10, outras nenhum). Inventar um
 * validador único reprovaria IE legítima — o que se mede aqui é presença e UF,
 * não dígito.
 */

const CNPJ_DIGITS = /^\d{14}$/;

/** Uma IE publicada para um CNPJ, com o estado a que pertence. */
export interface InscricaoEstadual {
  /** Número como publicado, sem máscara (ex.: "283058749"). */
  ie: string;
  /** Sigla da UF, maiúscula (ex.: "RJ"). */
  uf: string;
  /** `true` quando o cadastro marca a inscrição como ativa. */
  ativo: boolean;
}

export type ErroInscricaoEstadual = "cnpj_invalido" | "nao_encontrado" | "servico_indisponivel";

export interface RespostaInscricoes {
  ok: boolean;
  inscricoes: InscricaoEstadual[];
  erro?: ErroInscricaoEstadual;
}

const VAZIO: InscricaoEstadual[] = [];

/**
 * Busca as IEs publicadas para um CNPJ. **Nunca lança** e nunca bloqueia o
 * cadastro: IE é dado complementar, e fonte fora do ar não pode impedir criar
 * cliente. Timeout curto (6 s) porque esta chamada acompanha outra.
 */
export async function buscarInscricoesEstaduais(
  raw: string,
  fetchFn: typeof fetch = fetch,
): Promise<RespostaInscricoes> {
  const digitos = (raw || "").replace(/\D/g, "");
  if (!CNPJ_DIGITS.test(digitos)) {
    return { ok: false, erro: "cnpj_invalido", inscricoes: VAZIO };
  }
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 6000);
  try {
    const res = await fetchFn(`https://publica.cnpj.ws/cnpj/${digitos}`, {
      signal: controle.signal,
      headers: {
        accept: "application/json",
        // Mesmo motivo da BrasilAPI: cliente identificado não é tratado como bot.
        "user-agent": "nexus-selfhost/1.0 (+https://github.com/spiesdan/nexus)",
      },
    });
    if (res.status === 404) return { ok: false, erro: "nao_encontrado", inscricoes: VAZIO };
    if (!res.ok) return { ok: false, erro: "servico_indisponivel", inscricoes: VAZIO };
    const corpo = (await res.json()) as {
      estabelecimento?: { inscricoes_estaduais?: unknown };
    };
    return { ok: true, inscricoes: normalizarLista(corpo?.estabelecimento?.inscricoes_estaduais) };
  } catch {
    return { ok: false, erro: "servico_indisponivel", inscricoes: VAZIO };
  } finally {
    clearTimeout(limite);
  }
}

/**
 * Aceita o formato da fonte e devolve só o que é utilizável.
 *
 * A fonte já mudou de forma uma vez (lista de objetos → lista de objetos com
 * `estado` aninhado), e um parser que confia no formato quebra em silêncio,
 * devolvendo `[]` para quem tem IE. Aqui as duas formas são aceitas e o que não
 * tem número é descartado.
 */
export function normalizarLista(bruto: unknown): InscricaoEstadual[] {
  if (!Array.isArray(bruto)) return VAZIO;
  const saida: InscricaoEstadual[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object") continue;
    const registro = item as Record<string, unknown>;
    const numero = String(registro.inscricao_estadual ?? registro.ie ?? "").trim();
    if (!numero) continue;
    const estado = registro.estado;
    const uf = String(
      (estado && typeof estado === "object" ? (estado as Record<string, unknown>).sigla : estado) ??
        registro.uf ??
        "",
    )
      .trim()
      .toUpperCase();
    if (uf.length !== 2) continue;
    saida.push({ ie: numero, uf, ativo: registro.ativo !== false });
  }
  return saida;
}

/**
 * A IE que serve para a nota — a da UF do destinatário, ativa primeiro.
 *
 * Devolve `null` em vez de "a que tiver": IE de outra UF na NF-e é rejeição
 * garantida, e escolher a errada seria pior que deixar o campo vazio com a
 * instrução na tela. Com mais de uma IE ativa na mesma UF (raro, acontece em
 * inscrição antiga não baixada), a escolha é determinística — a de número
 * menor — para o mesmo CNPJ não gerar documentos diferentes a cada consulta.
 */
export function escolherIe(
  inscricoes: readonly InscricaoEstadual[] | undefined,
  uf: string | null | undefined,
): string | null {
  const alvo = (uf || "").trim().toUpperCase();
  if (alvo.length !== 2 || !inscricoes?.length) return null;
  const daUf = inscricoes.filter((i) => i.uf === alvo && i.ie.trim() !== "");
  if (daUf.length === 0) return null;
  const ordenadas = [...daUf].sort((a, b) => {
    if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
    return a.ie.localeCompare(b.ie, "pt-BR", { numeric: true });
  });
  return ordenadas[0]!.ie;
}

/** A IE ativa, se houver exatamente uma — usada só para exibir "há IE em X". */
export function ufsComInscricao(inscricoes: readonly InscricaoEstadual[] | undefined): string[] {
  if (!inscricoes?.length) return [];
  return [...new Set(inscricoes.filter((i) => i.ativo).map((i) => i.uf))].sort();
}
