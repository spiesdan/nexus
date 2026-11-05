/**
 * GET /api/v1/rotas?de=lat,lng&para=lat,lng — a rota do motorista ATÉ a parada.
 *
 * Existe para a cabine navegar DENTRO do app: até aqui o botão "Navegar"
 * abria o Google Maps, o que tirava o motorista da tela e do rastreio. O
 * traçado vem do mesmo OSRM que planeja a carga (`OsmrmProvider`), então a
 * linha que ele segue é a mesma que o escritório desenhou.
 *
 * Sem rua (OSRM fora do ar ou coordenada inválida), a resposta é 503 com
 * motivo — e a tela oferece abrir no app de mapa do aparelho como plano B.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { OsmrmProvider } from "@/lib/rotas/osrm";

export const dynamic = "force-dynamic";

function ponto(bruto: string | null): { lat: number; lng: number } | null {
  if (!bruto) return null;
  const partes = bruto.split(",");
  const lat = Number(partes[0]);
  const lng = Number(partes[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "shipments" });
  if (!authz.ok) return authz.response;

  const de = ponto(req.nextUrl.searchParams.get("de"));
  const para = ponto(req.nextUrl.searchParams.get("para"));
  if (!de || !para) {
    return fail("validation_failed", "Informe de=lat,lng e para=lat,lng.", 422, { requestId });
  }

  try {
    const rota = await new OsmrmProvider().rota([de, para]);
    if (!rota.ruas || rota.geometria.length < 2) {
      return fail("unavailable", "Serviço de ruas indisponível agora.", 503, { requestId });
    }
    return ok(
      {
        geometria: rota.geometria,
        distancia_m: rota.distanciaM,
        duracao_s: rota.duracaoS,
      },
      { requestId },
    );
  } catch {
    return fail("unavailable", "Serviço de ruas indisponível agora.", 503, { requestId });
  }
}
