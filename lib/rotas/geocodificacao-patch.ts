/**
 * O PATCH DA REGEOCODIFICAÇÃO — e a regra que o P1-22 conserta.
 *
 * Quando o provedor falha (`estado: 'erro'`, e o mesmo vale para
 * `nao_encontrado`/`ambiguo`), NÃO devolvemos `latitude: null` /
 * `longitude: null`: isso apagava um pino válido que já estava no mapa e
 * transformava falha de rede em perda de dado. O aviso é gravado
 * (`geo_status`, `geo_em`, `geo_fonte`), a coordenada anterior fica intacta.
 *
 * A rota usa o mesmo objeto para `shipment_destinations` e `contacts` (carga
 * legada); a coluna existe nos dois.
 */
import type { geocodificarComFallback } from "./geocodificacao";

type ResultadoGeocodificacao = Awaited<ReturnType<typeof geocodificarComFallback>>;

export interface PatchGeocodificacao {
  geo_status: string;
  geo_em: string;
  geo_fonte: string;
  latitude?: number | null;
  longitude?: number | null;
}

export function patchDeGeocodificacao(
  resultado: ResultadoGeocodificacao,
  agoraIso: string,
): PatchGeocodificacao {
  if (resultado.estado === "ok") {
    return {
      latitude: resultado.latitude,
      longitude: resultado.longitude,
      geo_status: "ok",
      geo_em: agoraIso,
      geo_fonte: `nominatim:${resultado.precisao ?? "rua"}`,
    };
  }
  // Falha do provedor NÃO é coordenada nova — é só aviso. Sem `latitude`/
  // `longitude` no patch, o UPDATE não toca o pino anterior.
  return {
    geo_status: resultado.estado,
    geo_em: agoraIso,
    geo_fonte: "nominatim",
  };
}
