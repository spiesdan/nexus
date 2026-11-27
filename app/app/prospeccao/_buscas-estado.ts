/**
 * A BUSCA NO MAPA — o que a tela decide, sem React.
 *
 * O contrato (`docs/prospeccao-maps-contrato.md`) separa quatro leituras que
 * não são status no banco: em andamento/parando, parcial, zero e degradada.
 * Elas se sobrepõem (uma busca degradada também é parcial), então cada uma é
 * uma função — e é isso que o teste fixa, em vez de um `if` no JSX que some
 * quando alguém reorganiza o cartão.
 *
 * Puro de propósito: importa só o contrato do motor e o rótulo comercial.
 */
import {
  resumo as resumoDoProgresso,
  type ProgressoDaBusca,
} from "@/lib/prospeccao/checkpoint";
import { ROTULO_STATUS_BUSCA } from "@/lib/schemas/prospeccao";

export type StatusDaBusca =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

/** O que a listagem devolve — o detalhe tem os mesmos campos. */
export interface BuscaDaTela {
  id: string;
  categorias: string[];
  cidade: string | null;
  estado?: string | null;
  raio_km: number;
  max_empresas?: number;
  provider?: string | null;
  status: string;
  total_celulas?: number;
  celulas_processadas?: number;
  encontradas: number;
  novas: number;
  duplicadas: number;
  erros?: number;
  custo_estimado_cents?: number;
  progresso?: ProgressoDaBusca | null;
  progresso_pct?: number;
  parcial?: boolean | null;
  parcial_motivo?: string | null;
  motivo_zero?: string | null;
  degradada?: boolean;
  degradacao_motivo?: string | null;
  parada_solicitada_em?: string | null;
  estado_parada?: "parando" | "parado" | null;
  parada_maxima_s?: number;
  ultimo_erro?: string | null;
  created_at?: string;
  finished_at?: string | null;
}

/**
 * Normaliza qualquer formato que chegue da API/servidor para lista.
 * A API responde o envelope canônico `{ data }`, mas em erro parcial, `null`
 * ou objeto inesperado a tela NÃO pode quebrar (`buscas.some is not a
 * function`) — vira lista vazia com estado vazio desenhado.
 */
export function comoListaBuscas(valor: unknown): BuscaDaTela[] {
  if (Array.isArray(valor)) return valor as BuscaDaTela[];
  if (valor && typeof valor === "object" && Array.isArray((valor as { data?: unknown }).data)) {
    return (valor as { data: BuscaDaTela[] }).data;
  }
  return [];
}

export const PROVIDER_OSM = "osm_overpass";
export const PROVIDER_PLACES = "google_places";

export function rotuloDoStatus(status: string): string {
  return ROTULO_STATUS_BUSCA[status as StatusDaBusca] ?? status;
}

export function estaAtiva(busca: BuscaDaTela): boolean {
  return busca.status === "queued" || busca.status === "running";
}

/**
 * "Parando" NÃO é "pausada": o status continua `running` até o motor fechar o
 * termo em curso. A tela mostra o pedido de parada como um estado próprio, com
 * o prazo máximo — senão o operador acha que já parou e recarrega à toa.
 */
export function estaParando(busca: BuscaDaTela): boolean {
  return busca.estado_parada === "parando";
}

export function parouDeFato(busca: BuscaDaTela): boolean {
  return busca.estado_parada === "parado";
}

/** Progresso por termo — `null` em busca antiga/sem checkpoint (`{}`). */
export function termosDaBusca(busca: BuscaDaTela): ProgressoDaBusca | null {
  const p = busca.progresso;
  return p && typeof p.termos_total === "number" ? p : null;
}

/**
 * Percentual da tela.
 *
 * Maps usa o resumo do motor (mesma conta do detalhe da API: termos fechados
 * sobre o total) — nunca a grade de células, que é de outro provider. Sem
 * checkpoint, cai nas células; sem nada, 0.
 */
export function percentualDaBusca(busca: BuscaDaTela): number {
  if (typeof busca.progresso_pct === "number" && Number.isFinite(busca.progresso_pct)) {
    return limitar(busca.progresso_pct);
  }
  const termos = termosDaBusca(busca);
  if (busca.provider === "maps_browser" && termos) {
    return limitar(resumoDoProgresso(termos, busca.categorias).percentual);
  }
  const total = busca.total_celulas ?? 0;
  if (total > 0) {
    return limitar(Math.round(((busca.celulas_processadas ?? 0) / total) * 100));
  }
  return 0;
}

export function termosConcluidosDaBusca(busca: BuscaDaTela): {
  concluidos: number;
  falhos: number;
  total: number;
} {
  const termos = termosDaBusca(busca);
  return {
    concluidos: termos?.termos_concluidos.length ?? 0,
    falhos: termos?.termos_falhos.length ?? 0,
    total: termos?.termos_total ?? 0,
  };
}

/**
 * PARCIAL — resultado que existe e não vai desaparecer.
 *
 * A API já manda `parcial`/`parcial_motivo` para Maps. Quando a descoberta
 * está degradada, o bloco próprio dela explica o motivo; repetir o mesmo fato
 * como "parcial" só faria barulho.
 *
 * Busca que ainda corre NÃO é "parcial": 1 de 2 termos é o progresso normal, e
 * o selo "Parcial" ali alarmaria sem motivo. Parcial é o desfecho — pausada,
 * cancelada, terminada ou já pedindo para parar — com cobertura incompleta ou
 * termo morto. A listagem não traz `parcial`; a cobertura vem de `progresso`,
 * que é o dado do contrato, não uma dedução.
 */
export function deveMostrarParcial(busca: BuscaDaTela): boolean {
  if (busca.degradada) return false;
  const ativa = busca.status === "queued" || busca.status === "running";
  if (ativa && !estaParando(busca)) return false;
  return parcialDaBusca(busca);
}

/** Cobertura incompleta ou termo falho — `parcial` do detalhe, senão `progresso`. */
export function parcialDaBusca(busca: BuscaDaTela): boolean {
  if (typeof busca.parcial === "boolean") return busca.parcial;
  const termos = termosDaBusca(busca);
  if (!termos) return false;
  const fechados = termos.termos_concluidos.length + termos.termos_falhos.length;
  return fechados < termos.termos_total || termos.termos_falhos.length > 0;
}

/** ZERO — terminou sem nenhum negócio; a tela precisa oferecer saída. */
export function deveMostrarZero(busca: BuscaDaTela): boolean {
  return busca.motivo_zero === "sem_resultados" && busca.encontradas === 0;
}

/** DEGRADADA — o Maps não foi o executor; a escolha de outro provider é humana. */
export function deveMostrarDegradada(busca: BuscaDaTela): boolean {
  return busca.degradada === true;
}

/**
 * "Ampliar o raio e repetir" — o dobro, com teto do próprio contrato (500 km).
 * Fica na tela da busca porque o botão diz o número que vai usar; não é regra
 * escondida no servidor.
 */
export function raioAmpliado(raioKm: number): number {
  const atual = Number.isFinite(raioKm) && raioKm > 0 ? Math.trunc(raioKm) : 30;
  return Math.min(500, atual * 2);
}

function limitar(valor: number): number {
  return Math.min(100, Math.max(0, Math.round(valor)));
}
