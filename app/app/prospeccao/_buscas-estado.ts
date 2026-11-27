/**
 * A BUSCA NO MAPA — o que a tela decide, sem React.
 *
 * O contrato (`docs/prospeccao-maps-contrato.md`) separa quatro leituras que
 * não são status no banco: em andamento/parando, parcial, zero e degradada.
 * Elas se sobrepõem (uma busca degradada também é parcial), então cada uma é
 * uma função — e é isso que o teste fixa, em vez de um `if` no JSX que some
 * quando alguém reorganiza o cartão.
 *
 * Puro de propósito: importa só o rótulo comercial.
 *
 * O formato do `progresso` é ESPELHADO aqui (e não importado de
 * `lib/prospeccao/checkpoint`) porque esta tela sobe sozinha, antes do #969: a
 * `main` ainda não tem o módulo do motor Maps. Quando o #969 entrar, o import
 * pode substituir o espelho — o formato é o mesmo do contrato.
 */
import { ROTULO_STATUS_BUSCA } from "@/lib/schemas/prospeccao";

export interface ProgressoDaBusca {
  termos_total: number;
  termos_concluidos: string[];
  termos_falhos: string[];
  termo_atual: string | null;
  tentativas: number;
  bloqueio: { motivo: string; em: string } | null;
  termos_encontradas?: Record<string, number>;
}

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
  latitude?: number | null;
  longitude?: number | null;
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

/** Capacidade do Places resolvida no servidor (flag + chave) e de quem é a chave. */
export interface CapacidadePlaces {
  habilitado: boolean;
  motivo: string | null;
  origem: "tenant" | "instalacao" | "nenhuma" | null;
}

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
 * checkpoint, 0%; a contagem exibida é "0 de N termos" (N = categorias), não
 * "0 de 0 células" — que era o que a captura de `carregando` reprovava.
 */
export function percentualDaBusca(busca: BuscaDaTela): number {
  if (typeof busca.progresso_pct === "number" && Number.isFinite(busca.progresso_pct)) {
    return limitar(busca.progresso_pct);
  }
  if (usaTermosDaBusca(busca)) {
    const termos = termosDaBusca(busca);
    return termos ? percentualPorTermo(termos) : 0;
  }
  const total = busca.total_celulas ?? 0;
  if (total > 0) {
    return limitar(Math.round(((busca.celulas_processadas ?? 0) / total) * 100));
  }
  return 0;
}

/**
 * A tela do Radar fala em TERMOS para o Maps, sempre. `células` é vocabulário
 * do caminho antigo (grade) e só aparece em provider que não é Maps.
 */
export function usaTermosDaBusca(busca: BuscaDaTela): boolean {
  return busca.provider === "maps_browser" || termosDaBusca(busca) !== null;
}

/** "0 de N termos" — N cai nas categorias quando o checkpoint não existe. */
export function rotuloDoProgresso(busca: BuscaDaTela): {
  concluidos: number;
  total: number;
  unidade: "termos" | "células";
} {
  if (usaTermosDaBusca(busca)) {
    const termos = termosDaBusca(busca);
    return {
      concluidos: termos?.termos_concluidos.length ?? 0,
      total: termos?.termos_total ?? busca.categorias.length,
      unidade: "termos",
    };
  }
  return {
    concluidos: busca.celulas_processadas ?? 0,
    total: busca.total_celulas ?? 0,
    unidade: "células",
  };
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
 * cancelada, terminada — com cobertura incompleta ou termo morto. Enquanto o
 * pedido de parada não se completa, o bloco é "Parando…": o design não quer os
 * dois ao mesmo tempo. A listagem não traz `parcial`; a cobertura vem de
 * `progresso`, que é o dado do contrato, não uma dedução.
 */
export function deveMostrarParcial(busca: BuscaDaTela): boolean {
  if (busca.degradada) return false;
  if (estaParando(busca)) return false;
  const ativa = busca.status === "queued" || busca.status === "running";
  if (ativa) return false;
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
 * MOTIVO DA DEGRADAÇÃO EM PORTUGUÊS.
 *
 * O motor grava códigos/prefixos técnicos (`sidecar_em_modo_navegador: …`).
 * Eles ficam no detalhe técnico; a frase principal é para o operador. Código
 * novo sem tradução cai num texto genérico honesto — nunca no código cru.
 */
export function motivoDaDegradacao(motivo: string | null | undefined): {
  texto: string;
  tecnico: string | null;
} {
  const bruto = (motivo ?? "").trim();
  if (!bruto) {
    return {
      texto: "A descoberta pelo Maps não rodou nesta busca; o resultado pode estar incompleto.",
      tecnico: null,
    };
  }
  const codigo = bruto.split(":")[0]?.trim() ?? "";
  const mapa: Record<string, string> = {
    sidecar_em_modo_navegador:
      "O navegador do Maps não estava no modo rápido; a busca foi interrompida antes de rodar.",
    sidecar_fora: "O serviço do Maps estava fora do ar; a busca não rodou.",
    sidecar_indisponivel: "O serviço do Maps não respondeu; a busca não rodou.",
    sidecar_timeout: "O serviço do Maps demorou demais; a busca foi interrompida.",
    fast_mode_nao_confirmado:
      "O Maps não confirmou o modo rápido; a busca foi interrompida antes de rodar.",
    provider_trocado: "O provedor do Maps foi trocado; o resultado pode estar incompleto.",
    maps_browser_desligado: "A descoberta pelo Maps está desligada nesta instalação.",
    maps_browser_sem_url: "O endereço do serviço do Maps não está configurado nesta instalação.",
    maps_browser_indisponivel: "O serviço do Maps não respondeu; a busca não rodou.",
    maps_browser_timeout: "O Maps demorou demais; a busca foi interrompida.",
    maps_browser_job_falhou:
      "O trabalho do Maps falhou antes de terminar; o resultado pode estar incompleto.",
  };
  const texto = /provider ativo é/i.test(bruto)
    ? "O Maps não é o provedor ativo desta organização; a busca caiu no caminho degradado."
    : (mapa[codigo] ??
      "A descoberta pelo Maps falhou nesta busca; o resultado pode estar incompleto.");
  return { texto, tecnico: bruto };
}

export type BlocoDeEstado = "parando" | "degradada" | "parcial" | "zero" | null;

/**
 * UM bloco explicativo por cartão, na ordem fixada pela spec:
 * parando → degradada → parcial → zero. Antes eles eram independentes e uma
 * busca parando com cobertura incompleta mostrava "Parando…" e "Resultado
 * parcial" ao mesmo tempo (W1 do design).
 */
export function blocoDeEstado(busca: BuscaDaTela): BlocoDeEstado {
  if (estaParando(busca)) return "parando";
  if (deveMostrarDegradada(busca)) return "degradada";
  if (deveMostrarParcial(busca)) return "parcial";
  if (deveMostrarZero(busca)) return "zero";
  return null;
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

/**
 * CORPO DA REPETIÇÃO — a MESMA coordenada que a listagem devolveu (PR #969),
 * com a cidade só como fallback. Em zero, ampliar o raio a partir da cidade
 * pode cobrir área diferente da busca original; lat/lng mantém o centro.
 *
 * `null` quando não há nem coordenada nem cidade — a tela então não desenha a
 * ação, em vez de oferecer um botão que a rota recusaria.
 */
export function entradaDeRepeticao(
  busca: BuscaDaTela,
  opcoes: { raioKm?: number; provider?: string },
): Record<string, unknown> | null {
  const cidade = busca.cidade?.trim();
  const porArea = busca.latitude != null && busca.longitude != null;
  if (!cidade && !porArea) return null;
  return {
    categorias: busca.categorias,
    ...(porArea
      ? { latitude: busca.latitude, longitude: busca.longitude }
      : { cidade, ...(busca.estado ? { estado: busca.estado } : {}) }),
    raio_km: opcoes.raioKm ?? busca.raio_km,
    max_empresas: busca.max_empresas ?? 500,
    // Sem `forcar`, o cache devolveria a mesma busca de zero resultados.
    forcar: true,
    ...(opcoes.provider ? { provider: opcoes.provider } : {}),
  };
}

/**
 * PLACES SÓ EXISTE COM FLAG **E** CHAVE — a mesma regra da rota.
 *
 * Quando falta uma das duas, o botão aparece desabilitado com o motivo, nunca
 * some nem fica clicável para falhar depois. Quem resolve as duas é o server
 * component da página (env da instalação + chave da organização/instalação).
 */
export function placesDisponivel(flagLigada: boolean, temChave: boolean): boolean {
  return flagLigada && temChave;
}

/** De quem é a chave que paga a busca no Google (contrato: dizer na tela). */
export type OrigemDaChave = "tenant" | "instalacao" | "nenhuma";

export interface CapacidadeDoPlaces {
  habilitado: boolean;
  motivo: string | null;
  /** `tenant` = organização; `instalacao` = chave da instalação. */
  origem: OrigemDaChave | null;
}

function limitar(valor: number): number {
  return Math.min(100, Math.max(0, Math.round(valor)));
}

/** Mesma conta do resumo do motor: termos fechados sobre o total. */
function percentualPorTermo(p: ProgressoDaBusca): number {
  if (p.termos_total <= 0) return 0;
  const fechados = p.termos_concluidos.length + p.termos_falhos.length;
  return limitar((fechados / p.termos_total) * 100);
}
