/**
 * Configuração do Sentinel — defaults, kill switch e a leitura da linha por org.
 *
 * Ausência de linha em `sentinel_settings` significa "usa o padrão", não
 * "desligado". É o que faz uma instalação nova ter o Sentinel funcionando sem
 * pedir que o operador edite nada.
 */
import { env } from "@/lib/env";

export interface ConfiguracaoSentinel {
  ativo: boolean;
  intervaloMinutos: number;
  retencaoDias: number;
  limiteOcorrencias: number;
  detectoresDesativados: string[];
  ultimaExecucaoEm: string | null;
}

export const PADROES_SENTINEL: ConfiguracaoSentinel = {
  ativo: true,
  intervaloMinutos: 360,
  retencaoDias: 180,
  limiteOcorrencias: 500,
  detectoresDesativados: [],
  ultimaExecucaoEm: null,
};

export const LIMITE_MINIMO = 50;
export const LIMITE_MAXIMO = 2000;

/** A instalação inteira está ligada? (`.env` — kill switch de emergência.) */
export function sentinelLigadoNoAmbiente(): boolean {
  return env.SENTINEL_ENABLED !== "false";
}

/** Linha do banco (ou ausência) → configuração efetiva, já normalizada. */
export function interpretarConfiguracao(
  linha:
    | {
        ativo?: boolean | null;
        intervalo_minutos?: number | null;
        retencao_dias?: number | null;
        limite_ocorrencias?: number | null;
        detectores_desativados?: string[] | null;
        ultima_execucao_em?: string | null;
      }
    | null
    | undefined,
): ConfiguracaoSentinel {
  if (!linha) return { ...PADROES_SENTINEL };

  const intervalo = Number(linha.intervalo_minutos);
  const retencao = Number(linha.retencao_dias);
  const limite = Number(linha.limite_ocorrencias);

  return {
    ativo: linha.ativo ?? PADROES_SENTINEL.ativo,
    intervaloMinutos:
      Number.isFinite(intervalo) && intervalo >= 15
        ? Math.min(10_080, Math.floor(intervalo))
        : PADROES_SENTINEL.intervaloMinutos,
    retencaoDias:
      Number.isFinite(retencao) && retencao >= 30
        ? Math.min(3_650, Math.floor(retencao))
        : PADROES_SENTINEL.retencaoDias,
    limiteOcorrencias:
      Number.isFinite(limite) && limite >= LIMITE_MINIMO
        ? Math.min(LIMITE_MAXIMO, Math.floor(limite))
        : PADROES_SENTINEL.limiteOcorrencias,
    detectoresDesativados: Array.isArray(linha.detectores_desativados)
      ? linha.detectores_desativados.filter((x): x is string => typeof x === "string")
      : [],
    ultimaExecucaoEm: linha.ultima_execucao_em ?? null,
  };
}

/**
 * A organização está devida para o cron? Execução manual ignora o intervalo,
 * mas nunca o kill switch (decidido antes, no runner).
 */
export function organizacaoDevida(
  ultimaExecucaoEm: string | null,
  intervaloMinutos: number,
  agoraMs: number,
): boolean {
  if (!ultimaExecucaoEm) return true;
  const ms = Date.parse(ultimaExecucaoEm);
  if (Number.isNaN(ms)) return true;
  return agoraMs - ms >= Math.max(15, intervaloMinutos) * 60_000;
}
