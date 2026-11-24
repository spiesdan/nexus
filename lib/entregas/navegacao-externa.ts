/**
 * CONTINGÊNCIA DE NAVEGAÇÃO — links oficiais, sem chave de API.
 *
 * O Nexus continua dono da sequência: estes links só abrem um app de
 * navegação; a baixa da entrega continua na cabine quando o motorista volta.
 *
 * Sem coordenada da parada, NÃO há link: chutar a partir de texto incompleto
 * levaria o motorista ao lugar errado. O endereço textual só vira `destination`
 * do Google Maps quando é completo (rua + cidade/UF ou CEP); fora isso a
 * coordenada é a referência.
 */

export interface DestinoParaNavegacao {
  latitude?: number | null;
  longitude?: number | null;
  endereco?: string | null;
}

export interface LinksDeNavegacao {
  google: string;
  waze: string;
  destino: "endereco" | "coordenada";
}

function enderecoEhCompleto(endereco: string | null | undefined): endereco is string {
  const texto = (endereco ?? "").trim();
  if (texto.length < 12 || !texto.includes(",")) return false;
  return /(?:^|[^A-Z])\d{5}-?\d{3}(?!\d)|\/[A-Za-z]{2}\b/.test(texto);
}

export function linksDeNavegacao(destino: DestinoParaNavegacao): LinksDeNavegacao | null {
  const { latitude: lat, longitude: lng } = destino;
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const par = `${lat},${lng}`;
  const usarEndereco = enderecoEhCompleto(destino.endereco);
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      usarEndereco ? (destino.endereco as string).trim() : par,
    )}`,
    waze: `https://waze.com/ul?ll=${encodeURIComponent(par)}&navigate=yes`,
    destino: usarEndereco ? "endereco" : "coordenada",
  };
}
