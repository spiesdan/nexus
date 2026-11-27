/**
 * O REGISTRO — um mapa nome → fábrica. O job, as rotas e a tela falam com
 * nomes ("google_places"), nunca com classes. Provider novo = 1 entrada aqui
 * + metadados; nada mais precisa saber que ele existe.
 */

import { GooglePlacesProvider } from "./google-places";
import { MapsBrowserProvider } from "./browser";
import { OSMOverpassProvider } from "./osm";
import type { BusinessDiscoveryProvider } from "../tipos";

export const PROVIDERS_CONHECIDOS = ["google_places", "osm_overpass", "maps_browser"] as const;
export type NomeDeProvider = (typeof PROVIDERS_CONHECIDOS)[number];

export interface OpcoesDeProvider {
  chaveGoogle?: string;
  browserHabilitado?: boolean;
  mapsBrowserUrl?: string;
  mapsBrowserToken?: string;
  timeoutMs?: number;
  tentativas?: number;
}

export function criarProvider(nome: string, opts: OpcoesDeProvider = {}): BusinessDiscoveryProvider {
  switch (nome) {
    case "google_places":
      return new GooglePlacesProvider(opts.chaveGoogle ?? "", {
        timeoutMs: opts.timeoutMs,
        tentativas: opts.tentativas,
      });
    case "osm_overpass":
      return new OSMOverpassProvider({ timeoutMs: opts.timeoutMs, tentativas: opts.tentativas });
    case "maps_browser":
      return new MapsBrowserProvider({
        habilitado: opts.browserHabilitado ?? process.env.MAPS_BROWSER_ENABLED === "true",
        baseUrl: opts.mapsBrowserUrl ?? process.env.MAPS_BROWSER_URL,
        token: opts.mapsBrowserToken ?? process.env.MAPS_BROWSER_TOKEN,
        timeoutMs: opts.timeoutMs,
        tentativas: opts.tentativas,
      });
    default:
      throw new Error(`provider_desconhecido: "${nome}". Conhecidos: ${PROVIDERS_CONHECIDOS.join(", ")}.`);
  }
}

/**
 * Metadados para a tela de Configuração (seletor de provider) — sem segredo
 * aqui. `maps_browser` entra como experimental: a rota só aceita com
 * `MAPS_BROWSER_ENABLED=true` e `MAPS_BROWSER_URL` configurada.
 */
export const METADADOS_PROVIDERS: { nome: NomeDeProvider; rotulo: string; descricao: string }[] = [
  {
    nome: "google_places",
    rotulo: "Google Places (API oficial)",
    descricao: "Busca oficial por texto + detalhes. Requer chave com faturamento. Custo por consulta.",
  },
  {
    nome: "osm_overpass",
    rotulo: "OpenStreetMap (grátis)",
    descricao: "Diretório aberto, sem chave e sem custo. Nome, endereço e mapa; telefone/site quando cadastrados, sem avaliações. Cobertura varia por cidade.",
  },
  {
    nome: "maps_browser",
    rotulo: "Google Maps (sidecar experimental)",
    descricao: "Descoberta pelo sidecar próprio, sem chave. Traz telefone, site, nota e total de avaliações; cobertura varia por cidade e a instalação precisa do sidecar ligado.",
  },
];
