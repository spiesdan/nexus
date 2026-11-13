/**
 * POST /api/v1/shipments/[id]/rota/recuperar — Address Recovery Engine.
 *
 * Executa a recuperação inteligente de endereços para os destinos da carga
 * que ainda não estão resolvidos (§3 do requisito). Fluxo das 5 tentativas
 * (original → normalizado → dígitos → componentes → Photon), orçamento por
 * destino e falha de provedor que não derruba a carga.
 *
 * Idempotente: destino já `encontrado`/`recuperado` não é reconsultado.
 *
 * As partes do endereço vêm do SNAPSHOT do destino (0308), não do cadastro do
 * cliente nem de `split(",")` da linha — o motor precisa de rua, número,
 * bairro, município, UF e CEP separados para aplicar os vetos duros.
 *
 * Body `{ ignorar_pendentes?: boolean }` é aceito por compatibilidade com o
 * gate de otimização; aqui ele não muda o comportamento (recuperar nunca
 * bloqueia).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { audit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { carregarCargaComParadas } from "../_carga";
import {
  recuperarLote,
  type EstadoRecuperacao,
} from "@/lib/rotas/recuperacao";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  ignorar_pendentes: z.boolean().optional(),
});

interface DestinoDoBanco {
  id: string;
  endereco: string | null;
  endereco_original: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_status: string | null;
  recuperacao_status: string | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "shipments" });
  if (!authz.ok) return authz.response;

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const { id } = await params;
  const supabase = await createClient();
  const d = await carregarCargaComParadas(supabase, authz.org.orgId, id);
  if (!d) return fail("not_found", "Carga não encontrada.", 404, { requestId });
  if (d.paradas.length === 0) return fail("validation_failed", "Carga sem pedidos.", 422, { requestId });

  const idsDestinos = [...new Set(d.paradas.map((p) => p.destination_id).filter((v): v is string => Boolean(v)))];
  if (idsDestinos.length === 0) {
    return fail(
      "validation_failed",
      "Esta carga não tem destinos persistidos (anterior à migration 0308). Geocodifique as paradas antes.",
      422,
      { requestId }
    );
  }

  const { data: destinosBanco, error: erroDestinos } = await supabase
    .from("shipment_destinations")
    .select(
      "id, endereco, endereco_original, numero, complemento, bairro, cidade, uf, cep, latitude, longitude, geo_status, recuperacao_status"
    )
    .eq("organization_id", authz.org.orgId)
    .in("id", idsDestinos);
  if (erroDestinos) {
    return fail("internal_error", "Erro ao carregar os destinos da carga.", 500, { requestId });
  }
  const destinos = (destinosBanco ?? []) as unknown as DestinoDoBanco[];

  const { resultados, resumo } = await recuperarLote(
    destinos.map((dest) => ({
      destinationId: dest.id,
      // O original é imutável: usa o campo próprio (0309) e só cai na linha
      // do snapshot em carga que nasceu antes do backfill.
      enderecoOriginal: dest.endereco_original ?? dest.endereco ?? null,
      partes: {
        rua: dest.endereco,
        numero: dest.numero,
        complemento: dest.complemento,
        bairro: dest.bairro,
        cidade: dest.cidade,
        uf: dest.uf,
        cep: dest.cep,
        linha: dest.endereco_original ?? dest.endereco ?? null,
      },
      estadoAtual: (dest.recuperacao_status ?? "nao_tentada") as EstadoRecuperacao,
      coordenada:
        dest.latitude != null && dest.longitude != null
          ? { latitude: dest.latitude, longitude: dest.longitude }
          : null,
    })),
    {
      gravarHistorico: async (linha) => {
        await supabase.from("shipment_destination_recoveries").insert({
          organization_id: authz.org.orgId,
          destination_id: linha.destinationId,
          tentativa: linha.tentativa,
          provedor: linha.provedor,
          consulta: linha.consulta,
          candidato: linha.candidatos as unknown,
          confianca: linha.confianca,
          motivo: linha.motivo,
          criado_por: linha.criadoPor,
        });
      },
      atualizarDestino: async (linha) => {
        // `endereco_original` NÃO aparece aqui de propósito: é imutável. O
        // update só grava o que o motor produziu (normalizado/recuperado).
        await supabase
          .from("shipment_destinations")
          .update({
            endereco_normalizado: linha.enderecoNormalizado ?? null,
            endereco_recuperado: linha.enderecoRecuperado ?? null,
            recuperacao_status: linha.recuperacaoStatus,
            confianca: linha.confianca != null ? Number(linha.confianca.toFixed(3)) : null,
            metodo: linha.metodo ?? null,
            provedor: linha.provedor ?? null,
            recuperado_em: linha.recuperadoEm ?? null,
            latitude: linha.latitude,
            longitude: linha.longitude,
            geo_status: linha.geoStatus,
            geo_fonte: linha.geoFonte ?? null,
            geo_precisao_m: linha.geoPrecisaoM ?? null,
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", linha.destinationId)
          .eq("organization_id", authz.org.orgId);
      },
      criadoPor: authz.user.id,
    }
  );

  await audit({
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    action: "shipment.rota.recuperada",
    resourceType: "shipments",
    resourceId: id,
    requestId,
    metadata: resumo,
  });

  return ok(
    {
      resumo,
      resultados: resultados.map((r) => ({
        destinationId: r.destinationId,
        estado: r.estado,
        jaEstavaResolvido: r.jaEstavaResolvido,
        candidato: r.candidato
          ? {
              endereco: r.candidato.endereco,
              latitude: r.candidato.latitude,
              longitude: r.candidato.longitude,
              precisao: r.candidato.precisao,
              metodo: r.candidato.metodo,
              provedor: r.candidato.provedor,
              confianca: r.candidato.confianca,
              motivo: r.candidato.motivo,
            }
          : null,
        sugestoes: r.sugestoes.map((s) => ({
          endereco: s.endereco,
          latitude: s.latitude,
          longitude: s.longitude,
          precisao: s.precisao,
          metodo: s.metodo,
          provedor: s.provedor,
          confianca: s.confianca,
          motivo: s.motivo,
        })),
        tentativas: r.tentativas,
      })),
    },
    { requestId }
  );
}
