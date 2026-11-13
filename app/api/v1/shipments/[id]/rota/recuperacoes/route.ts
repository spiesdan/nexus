/**
 * GET /api/v1/shipments/[id]/rota/recuperacoes — leitura do estado de
 * recuperação de endereços dos destinos desta carga.
 *
 * Por que existe: a sugestão de recuperação é um PONTO CANDIDATO, e ponto
 * candidato não vira coordenada do destino antes de alguém confirmar. Ele vive
 * em `shipment_destination_recoveries.candidato` (jsonb). Sem esta leitura, a
 * tela perderia a sugestão ao recarregar a página — e o operador voltaria a ver
 * "ambíguo" sem saber qual endereço confirmar.
 *
 * Devolve, por destino:
 *   - o estado atual e o que o vendedor digitou (original, imutável);
 *   - a ÚLTIMA sugestão com coordenada (a mais recente que o motor registrou);
 *   - o histórico resumido das tentativas (provedor, consulta, motivo, score).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { carregarCargaComParadas } from "../_carga";

export const dynamic = "force-dynamic";

interface DestinoDoBanco {
  id: string;
  chave: string;
  cliente: string | null;
  endereco: string | null;
  endereco_original: string | null;
  endereco_normalizado: string | null;
  endereco_recuperado: string | null;
  recuperacao_status: string | null;
  confianca: number | null;
  metodo: string | null;
  provedor: string | null;
  recuperado_em: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_status: string | null;
}

interface SugestaoGravada {
  endereco?: string;
  latitude?: number;
  longitude?: number;
  precisao?: string;
  metodo?: string;
  provedor?: string;
  confianca?: number;
}

interface TentativaDoBanco {
  destination_id: string;
  tentativa: number;
  provedor: string;
  consulta: string | null;
  candidato: unknown;
  confianca: number | null;
  motivo: string | null;
  criado_em: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "shipments" });
  if (!authz.ok) return authz.response;

  const { id } = await params;
  const supabase = await createClient();
  const d = await carregarCargaComParadas(supabase, authz.org.orgId, id);
  if (!d) return fail("not_found", "Carga não encontrada.", 404, { requestId });

  const idsDestinos = [
    ...new Set(d.paradas.map((p) => p.destination_id).filter((v): v is string => Boolean(v))),
  ];
  if (idsDestinos.length === 0) {
    return ok({ destinos: [], resumo: resumoVazio() }, { requestId });
  }

  const { data: destinosBanco, error: erroDestinos } = await supabase
    .from("shipment_destinations")
    .select(
      "id, chave, endereco, endereco_original, endereco_normalizado, endereco_recuperado, recuperacao_status, confianca, metodo, provedor, recuperado_em, latitude, longitude, geo_status"
    )
    .eq("organization_id", authz.org.orgId)
    .in("id", idsDestinos);
  if (erroDestinos) {
    return fail("internal_error", "Erro ao carregar os destinos da carga.", 500, { requestId });
  }
  const destinos = (destinosBanco ?? []) as unknown as DestinoDoBanco[];

  const { data: tentativasBanco } = await supabase
    .from("shipment_destination_recoveries")
    .select("destination_id, tentativa, provedor, consulta, candidato, confianca, motivo, criado_em")
    .eq("organization_id", authz.org.orgId)
    .in("destination_id", idsDestinos)
    .order("criado_em", { ascending: false });
  const tentativas = (tentativasBanco ?? []) as unknown as TentativaDoBanco[];

  const nomePorDestino = new Map(d.paradas.map((p) => [p.destination_id ?? "", p.cliente]));
  const tentativasPorDestino = new Map<string, TentativaDoBanco[]>();
  for (const t of tentativas) {
    const lista = tentativasPorDestino.get(t.destination_id) ?? [];
    // O histórico já vem desc; guardamos no máximo 10 por destino.
    if (lista.length < 10) lista.push(t);
    tentativasPorDestino.set(t.destination_id, lista);
  }

  const destinosSaida = destinos.map((dest) => {
    const historico = tentativasPorDestino.get(dest.id) ?? [];
    // A última tentativa COM coordenada é o que o operador pode confirmar.
    const sugestao = historico.find((t) => {
      const c = t.candidato as SugestaoGravada | null;
      return c != null && typeof c.latitude === "number" && typeof c.longitude === "number";
    });
    const cand = (sugestao?.candidato ?? null) as SugestaoGravada | null;
    return {
      destinationId: dest.id,
      chave: dest.chave,
      cliente: nomePorDestino.get(dest.id) ?? null,
      enderecoOriginal: dest.endereco_original ?? dest.endereco,
      enderecoNormalizado: dest.endereco_normalizado,
      enderecoRecuperado: dest.endereco_recuperado,
      status: dest.recuperacao_status ?? "nao_tentada",
      confianca: dest.confianca,
      metodo: dest.metodo,
      provedor: dest.provedor,
      recuperadoEm: dest.recuperado_em,
      latitude: dest.latitude,
      longitude: dest.longitude,
      geoStatus: dest.geo_status,
      sugestao: cand
        ? {
            endereco: cand.endereco ?? null,
            latitude: cand.latitude,
            longitude: cand.longitude,
            precisao: cand.precisao ?? null,
            metodo: cand.metodo ?? sugestao!.provedor,
            provedor: cand.provedor ?? sugestao!.provedor,
            confianca: cand.confianca ?? sugestao!.confianca,
            motivo: sugestao!.motivo,
          }
        : null,
      tentativas: historico.map((t) => ({
        tentativa: t.tentativa,
        provedor: t.provedor,
        consulta: t.consulta,
        confianca: t.confianca,
        motivo: t.motivo,
        criadoEm: t.criado_em,
      })),
    };
  });

  const resumo = resumoVazio();
  for (const dest of destinosSaida) {
    resumo.analisados++;
    switch (dest.status) {
      case "encontrado":
        resumo.encontrados++;
        break;
      case "recuperado":
        resumo.recuperados++;
        break;
      case "ambiguo":
        resumo.aguardandoConfirmacao++;
        break;
      case "nao_encontrado":
        resumo.naoEncontrados++;
        break;
      case "erro":
        resumo.erros++;
        break;
      default:
        resumo.naoTentados++;
    }
    if (dest.status !== "encontrado" && dest.status !== "recuperado") resumo.pendentes++;
  }

  return ok({ destinos: destinosSaida, resumo }, { requestId });
}

function resumoVazio() {
  return {
    analisados: 0,
    encontrados: 0,
    recuperados: 0,
    aguardandoConfirmacao: 0,
    naoEncontrados: 0,
    erros: 0,
    naoTentados: 0,
    pendentes: 0,
  };
}
