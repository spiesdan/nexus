/**
 * CHECKPOINT DA BUSCA — a unidade é TERMO × CIDADE, nunca a busca inteira.
 *
 * O sidecar não tem `-resume`; quem retoma é o nosso tick. Este módulo é puro
 * (sem banco, sem rede): recebe o `progresso` jsonb lido de
 * `prospecting_searches` e devolve o próximo estado a gravar. A conclusão de
 * um termo (contadores + upsert dos prospects) é uma transação do chamador.
 *
 * Regras do plano v5 (§4):
 * - termo morto no meio não fecha: o tick seguinte o reexecuta;
 * - termo concluído não repete;
 * - 120 s por termo, 3 tentativas com backoff, depois
 *   `falhou_apos_retentativas`;
 * - bloqueio pausa a busca e grava motivo; não contorna;
 * - `parcial` é DERIVADO do progresso — não existe status novo.
 */

export const TIMEOUT_TERMO_MS = 120_000;
export const TENTATIVAS_POR_TERMO = 3;

export interface BloqueioDaBusca {
  motivo: string;
  em: string;
}

export interface ProgressoDaBusca {
  termos_total: number;
  termos_concluidos: string[];
  /** Termos que esgotaram as tentativas; fecham a busca como parcial. */
  termos_falhos: string[];
  termo_atual: string | null;
  tentativas: number;
  bloqueio: BloqueioDaBusca | null;
  /** Quantos negócios cada termo trouxe; a soma é `encontradas` (idempotente). */
  termos_encontradas?: Record<string, number>;
}

export interface ResumoDaBusca {
  total: number;
  concluidos: number;
  falhos: number;
  pendentes: number;
  percentual: number;
  completa: boolean;
  parcial: boolean;
  bloqueada: boolean;
  /** Texto para a tela; nunca "0 de 0" quando há termos. */
  motivo: string;
}

function unicos(termos: string[]): string[] {
  return [...new Set(termos.map((t) => t.trim()).filter(Boolean))];
}

function fechado(p: ProgressoDaBusca, termo: string): boolean {
  return p.termos_concluidos.includes(termo) || p.termos_falhos.includes(termo);
}

/** Cria o progresso inicial; o primeiro termo já fica como atual. */
export function criarProgresso(termos: string[]): ProgressoDaBusca {
  const lista = unicos(termos);
  return {
    termos_total: lista.length,
    termos_concluidos: [],
    termos_falhos: [],
    termo_atual: lista[0] ?? null,
    tentativas: 0,
    bloqueio: null,
    termos_encontradas: {},
  };
}

/** Registra quantos negócios o termo trouxe (sobrescreve em retomada). */
export function registrarEncontrados(
  p: ProgressoDaBusca,
  termo: string,
  encontrados: number,
): ProgressoDaBusca {
  return {
    ...p,
    termos_encontradas: {
      ...(p.termos_encontradas ?? {}),
      [termo]: Math.max(0, Math.trunc(encontrados)),
    },
  };
}

/** Soma dos encontrados por termo; nunca depende de contador em memória. */
export function totalEncontrado(p: ProgressoDaBusca): number {
  return Object.values(p.termos_encontradas ?? {}).reduce((s, n) => s + n, 0);
}

/**
 * Próximo termo a executar. Respeita bloqueio e não repete termo fechado;
 * um termo que falhou mas ainda tem tentativa volta (reexecução).
 */
export function proximoTermo(p: ProgressoDaBusca, termos: string[]): string | null {
  if (p.bloqueio) return null;
  const lista = unicos(termos);
  if (p.termo_atual && !fechado(p, p.termo_atual)) return p.termo_atual;
  return lista.find((t) => !fechado(p, t)) ?? null;
}

/** O tick começou a executar o termo; zera as tentativas só ao trocar de termo. */
export function iniciarTermo(p: ProgressoDaBusca, termo: string): ProgressoDaBusca {
  if (fechado(p, termo)) return p;
  return {
    ...p,
    termo_atual: termo,
    tentativas: p.termo_atual === termo ? p.tentativas : 0,
  };
}

/**
 * Uma tentativa falhou (timeout, JSON inválido, sidecar fora). Com menos de 3,
 * o mesmo termo fica atual e será reexecutado; na terceira, ele fecha como
 * falho e o próximo assume. Nada é apagado do progresso.
 */
export function registrarFalha(
  p: ProgressoDaBusca,
  termo: string,
  _motivo: string,
): ProgressoDaBusca {
  const tentativas = p.termo_atual === termo ? p.tentativas + 1 : 1;
  if (tentativas >= TENTATIVAS_POR_TERMO) {
    return {
      ...p,
      termos_falhos: p.termos_falhos.includes(termo)
        ? p.termos_falhos
        : [...p.termos_falhos, termo],
      termo_atual: null,
      tentativas: 0,
    };
  }
  return { ...p, termo_atual: termo, tentativas };
}

/**
 * Conclui um termo (sucesso). A gravação dos prospects e este estado devem
 * acontecer na MESMA transação do chamador; aqui só o estado é calculado.
 */
export function concluirTermo(p: ProgressoDaBusca, termo: string): ProgressoDaBusca {
  return {
    ...p,
    termos_concluidos: p.termos_concluidos.includes(termo)
      ? p.termos_concluidos
      : [...p.termos_concluidos, termo],
    termos_falhos: p.termos_falhos.filter((t) => t !== termo),
    termo_atual: null,
    tentativas: 0,
  };
}

/** Bloqueio do fornecedor: pausa sem contorno, com motivo visível. */
export function bloquear(p: ProgressoDaBusca, motivo: string, em: string): ProgressoDaBusca {
  return { ...p, bloqueio: { motivo, em }, termo_atual: null, tentativas: 0 };
}

/** Retomada explícita depois de resolvido o bloqueio. */
export function retomar(p: ProgressoDaBusca): ProgressoDaBusca {
  return { ...p, bloqueio: null };
}

/**
 * `parcial` deriva do progresso; não inventa status. "Completa" = todo termo
 * fechado (concluído ou falho após retentativas). Falha fechada não é sucesso:
 * a tela mostra o motivo e o número.
 */
export function resumo(p: ProgressoDaBusca, _termos: string[]): ResumoDaBusca {
  const total = p.termos_total;
  const concluidos = p.termos_concluidos.length;
  const falhos = p.termos_falhos.length;
  const pendentes = Math.max(0, total - concluidos - falhos);
  const completa = pendentes === 0 && !p.bloqueio;
  const percentual = total === 0 ? 0 : Math.round(((concluidos + falhos) / total) * 100);

  let motivo: string;
  if (p.bloqueio) {
    motivo = `Busca pausada: ${p.bloqueio.motivo}`;
  } else if (total === 0) {
    motivo = "Nenhum termo para buscar.";
  } else if (completa && falhos === 0) {
    motivo = `${concluidos} de ${total} termos concluídos.`;
  } else if (completa) {
    motivo = `${concluidos} de ${total} termos concluídos; ${falhos} falharam após as tentativas.`;
  } else if (falhos > 0) {
    motivo = `${concluidos} de ${total} termos concluídos, ${pendentes} pendente(s); ${falhos} falharam.`;
  } else if (p.termo_atual && p.tentativas > 0) {
    motivo = `${concluidos} de ${total} termos concluídos, ${p.termo_atual} em reexecução (tentativa ${p.tentativas + 1}/${TENTATIVAS_POR_TERMO}).`;
  } else {
    motivo = `${concluidos} de ${total} termos concluídos, ${pendentes} pendente(s).`;
  }

  return {
    total,
    concluidos,
    falhos,
    pendentes,
    percentual,
    completa,
    parcial: !completa,
    bloqueada: Boolean(p.bloqueio),
    motivo,
  };
}
