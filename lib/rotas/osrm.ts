/**
 * OSRM — provedor de ruas do prórIO servidor.
 *
 * NÃO existe default público: `router.project-osrm.org` é serviço compartilhado
 * sem SLA, recebe a posição do cliente e pode sumir/rate-limitar. Sem
 * `OSRM_URL` configurado, a rota devolve `osrm_nao_configurado` e a cabine
 * oferece Google Maps/Waze — nunca chama um terceiro em silêncio.
 *
 * Timeout curto (5 s): `osrm_timeout` também é erro visível, não giro infinito.
 */

import {
  haversineM,
  vizinhoMaisProximo,
  type Coordenada,
  type PropostaDeRota,
  type RoutingProvider,
} from "./roteamento";

export type { Coordenada } from "./roteamento";

const TIMEOUT_MS = 5000;

/** Erros que NÃO podem virar heurística local: configuração/timeout são falha visível. */
export const ERROS_VISIVEIS = new Set(["osrm_nao_configurado", "osrm_timeout"]);

export function base(): string {
  return (process.env.OSRM_URL ?? "").trim().replace(/\/+$/, "");
}

function par(p: Coordenada): string {
  return `${p.lng},${p.lat}`;
}

async function getJson(url: string, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Nexus-Rotas/1.0", Accept: "application/json" },
      signal: controle.signal,
    });
    if (!res.ok) throw new Error(`osrm_${res.status}`);
    return (await res.json()) as unknown;
  } catch (err) {
    if (controle.signal.aborted) throw new Error("osrm_timeout");
    throw err;
  } finally {
    clearTimeout(limite);
  }
}

function exigirBase(): string {
  const url = base();
  if (!url) throw new Error("osrm_nao_configurado");
  return url;
}

export class OsmrmProvider implements RoutingProvider {
  readonly nome = "osrm";

  async rota(pontos: Coordenada[]): Promise<PropostaDeRota> {
    if (pontos.length < 2) {
      return { ordem: pontos.map((_, i) => i), distanciaM: 0, duracaoS: 0, geometria: [], provedor: this.nome, ruas: false };
    }
    const j = (await getJson(
      `${exigirBase()}/route/v1/driving/${pontos.map(par).join(";")}?overview=full&geometries=geojson`,
    )) as { code?: string; routes?: { distance?: number; duration?: number; geometry?: { coordinates?: number[][] } }[] };
    const r = j.routes?.[0];
    if (j.code !== "Ok" || !r) throw new Error("osrm_sem_rota");
    return {
      ordem: pontos.map((_, i) => i),
      distanciaM: Math.round(r.distance ?? 0),
      duracaoS: Math.round(r.duration ?? 0),
      geometria: r.geometry?.coordinates ?? [],
      provedor: this.nome,
      ruas: true,
    };
  }

  async otimizar(pontos: Coordenada[], retornar: boolean): Promise<PropostaDeRota> {
    if (pontos.length <= 2) return this.rota(pontos);
    const j = (await getJson(
      `${exigirBase()}/trip/v1/driving/${pontos.map(par).join(";")}?overview=full&geometries=geojson&source=first&destination=${retornar ? "any" : "last"}&roundtrip=${retornar ? "true" : "false"}`,
      TIMEOUT_MS,
    )) as {
      code?: string;
      trips?: { distance?: number; duration?: number; geometry?: { coordinates?: number[][] } }[];
      waypoints?: { waypoint_index?: number }[];
    };
    const t = j.trips?.[0];
    // O trip devolve waypoints na ordem visitada; waypoint_index aponta a
    // posição original. Sem isso, a "otimização" seria enfeite.
    const ordem = (j.waypoints ?? []).map((w) => Number(w.waypoint_index ?? 0));
    if (j.code !== "Ok" || !t || ordem.length !== pontos.length) throw new Error("osrm_sem_trip");
    const seq = retornar ? [...ordem, 0] : ordem;
    return {
      ordem: seq,
      distanciaM: Math.round(t.distance ?? 0),
      duracaoS: Math.round(t.duration ?? 0),
      geometria: t.geometry?.coordinates ?? [],
      provedor: this.nome,
      ruas: true,
    };
  }
}

/**
 * Otimiza com rua; sem rua, vizinho-mais-próximo honesto. Nunca joga erro
 * para a tela sem antes tentar o plano B — e diz qual valeu.
 */
export async function otimizarComFallback(
  provedor: RoutingProvider,
  pontos: Coordenada[],
  retornar: boolean,
): Promise<PropostaDeRota> {
  try {
    return await provedor.otimizar(pontos, retornar);
  } catch (erro) {
    const codigo = erro instanceof Error ? erro.message : "";
    // Configuração ausente e timeout são fatos que a tela precisa conhecer:
    // nenhum "plano B" pode fingir que ruas funcionaram.
    if (ERROS_VISIVEIS.has(codigo)) throw erro;
    const ordem = vizinhoMaisProximo(pontos, retornar);
    let distanciaM = 0;
    for (let i = 1; i < ordem.length; i++) {
      distanciaM += haversineM(pontos[ordem[i - 1]!]!, pontos[ordem[i]!]!);
    }
    // Linha reta × rua: distância em linha subestima (~×1.3 em malha urbana).
    // Dizer "12 km" quando serão 16 é a falsa informação que a spec proíbe —
    // por isso o fator declarado E o selo de estimativa na tela.
    distanciaM = Math.round(distanciaM * 1.3);
    return {
      ordem,
      distanciaM,
      duracaoS: Math.round((distanciaM / 1000 / 30) * 3600),
      geometria: [],
      provedor: "local",
      ruas: false,
    };
  }
}
