/**
 * PHOTON — provedor complementar opcional de busca aproximada.
 *
 * Só é consultado quando `PHOTON_URL` está configurado (vazio = desligado,
 * mesmo padrão de `OCR_SERVICE_URL`). Nunca é obrigatório: o Nominatim
 * continua sendo o provedor primário. O Photon serve para recuperar endereços
 * que o Nominatim não encontra (erro de digitação, nome diferente).
 *
 * Photon (komoot): GET {PHOTON_URL}/api?q=...&limit=5&lang=pt-BR
 * Resposta: { features: [{ properties: { name, street, housenumber, postcode,
 *   city, state, country, lat, lon, type, osm_key, osm_value } }] }
 *
 * Nenhum dado pessoal vai na query além do próprio endereço da entrega
 * (que já é dado do cliente).
 */

export interface CandidatoPhoton {
  nome: string;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  lat: number | null;
  lng: number | null;
  tipo: string | null;
  fonte: "photon";
  bruto: unknown;
}

const PADRAO_TIMEOUT_MS = 15_000;

function baseUrl(): string | null {
  const bruto = (process.env.PHOTON_URL ?? "").trim().replace(/\/+$/, "");
  return bruto || null;
}

export function photonDisponivel(): boolean {
  return baseUrl() != null;
}

export async function buscarPhoton(
  consulta: string,
  timeoutMs = PADRAO_TIMEOUT_MS
): Promise<CandidatoPhoton[]> {
  const base = baseUrl();
  if (!base) return [];

  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), timeoutMs);
  try {
    const url = `${base}/api?q=${encodeURIComponent(consulta)}&limit=5&lang=pt-BR`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Nexus-Rotas/1.0" },
      signal: controle.signal,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as unknown;
    const features = (json as { features?: unknown[] })?.features ?? [];
    return features.map((f) => {
      const p = (f as { properties?: unknown })?.properties as
        | { name?: string; street?: string; housenumber?: string; postcode?: string; city?: string; state?: string; country?: string; lat?: number | string; lon?: number | string; type?: string }
        | undefined;
      return {
        nome: p?.name ?? "",
        rua: p?.street ?? null,
        numero: p?.housenumber ?? null,
        bairro: null, // Photon não expõe bairro de forma confiável
        cidade: p?.city ?? null,
        uf: p?.state ?? null,
        cep: p?.postcode ?? null,
        lat: p?.lat != null ? Number(p.lat) : null,
        lng: p?.lon != null ? Number(p.lon) : null,
        tipo: p?.type ?? null,
        fonte: "photon" as const,
        bruto: p,
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(limite);
  }
}

/**
 * Consulta Photon por componentes: útil na tentativa 4 (pesquisa por
 * componentes). Monta a query com o que tem disponível.
 */
export async function buscarPhotonPorComponentes(componentes: {
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}): Promise<CandidatoPhoton[]> {
  const partes = [
    componentes.rua,
    componentes.numero,
    componentes.bairro,
    componentes.cidade,
    componentes.uf,
    componentes.cep,
  ].filter(
    (p): p is string => typeof p === "string" && p.trim() !== ""
  );
  if (partes.length === 0) return [];
  return buscarPhoton(partes.join(", "));
}
