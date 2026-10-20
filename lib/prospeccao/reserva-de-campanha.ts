/**
 * RESERVA DE CAMPANHA — a checagem que a rota faz ANTES de gravar.
 *
 * ═══ POR QUE ISTO EXISTE ═══════════════════════════════════════════════════
 *
 * O usuário foi explícito: uma empresa que já está numa campanha não pode ser
 * mensageada por outra, e não pode continuar aparecendo como "em aberto" na
 * seleção da próxima. O banco tem a trava final (trigger da lista fechada +
 * unique global do ledger de envios, 0277), mas um erro de trigger chega à tela
 * como "23505" sem dizer QUAL empresa nem QUAL campanha. Esta função existe
 * para a resposta ser útil: nome, motivo e a campanha que já reservou.
 *
 * ═══ AS TRÊS RECUSAS ═══════════════════════════════════════════════════════
 *
 *   outra_campanha — a empresa está em `prospect_ids`/`contato_ids` de outra
 *                    campanha, ou já tem envio por outra campanha.
 *   revisar        — `categoria_revisar = true`; não dá para mandar sem alguém
 *                    confirmar a categoria.
 *   categoria      — a categoria efetiva não é nenhuma das que a campanha pediu.
 *   nao_encontrada — o id não é da organização (ou foi apagado).
 *
 * A categoria é checada com a MESMA função do público e do disparo
 * (`categoriaEfetiva`), não com o rótulo cru do Google.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  categoriaCombinaComCampanha,
  categoriaEfetiva,
} from "@/lib/prospeccao/categoria-efetiva";

export type MotivoDeConflito =
  | "outra_campanha"
  | "categoria"
  | "revisar"
  | "nao_encontrada";

export interface ConflitoDeReserva {
  id: string;
  nome: string;
  motivo: MotivoDeConflito;
  campanha_id?: string;
  campanha_nome?: string;
  detalhe?: string;
}

interface CampanhaDaOrg {
  id: string;
  nome: string;
  prospect_ids: string[] | null;
  contato_ids: string[] | null;
}

interface ProspectoDaReserva {
  id: string;
  nome: string;
  categoria: string | null;
  categorias: string[] | null;
  website: string | null;
  categoria_canonica: string | null;
  categoria_revisar: boolean | null;
}

interface ContatoDaReserva {
  id: string;
  name: string | null;
  display_name: string | null;
}

const LOTE = 400;

function lotes<T>(itens: T[], tamanho: number): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    saida.push(itens.slice(i, i + tamanho));
  }
  return saida;
}

/** Lê prospects em lotes — o PostgREST não aceita um `in` de 10.000 ids. */
async function prospectsPorId(
  admin: SupabaseClient,
  organizationId: string,
  ids: string[],
): Promise<Map<string, ProspectoDaReserva>> {
  const mapa = new Map<string, ProspectoDaReserva>();
  for (const lote of lotes(ids, LOTE)) {
    const { data, error } = await admin
      .from("business_prospects")
      .select(
        "id, nome, categoria, categorias, website, categoria_canonica, categoria_revisar",
      )
      .eq("organization_id", organizationId)
      .in("id", lote);
    if (error) throw new Error(`prospects_indisponiveis: ${error.message}`);
    for (const p of (data ?? []) as unknown as ProspectoDaReserva[]) {
      mapa.set(p.id, p);
    }
  }
  return mapa;
}

async function contatosPorId(
  admin: SupabaseClient,
  organizationId: string,
  ids: string[],
): Promise<Map<string, ContatoDaReserva>> {
  const mapa = new Map<string, ContatoDaReserva>();
  for (const lote of lotes(ids, LOTE)) {
    const { data, error } = await admin
      .from("contacts")
      .select("id, name, display_name")
      .eq("organization_id", organizationId)
      .in("id", lote);
    if (error) throw new Error(`contatos_indisponiveis: ${error.message}`);
    for (const c of (data ?? []) as unknown as ContatoDaReserva[]) {
      mapa.set(c.id, c);
    }
  }
  return mapa;
}

/**
 * Devolve os conflitos da lista com o resto da organização.
 *
 * `campaignId` é a campanha que está sendo criada/editada; a lista dela mesma
 * não conta como conflito (editar/salvar de novo é idempotente).
 */
export async function conflitosDeReserva(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    campaignId: string | null;
    prospectIds?: string[];
    contatoIds?: string[];
    categorias?: string[];
  },
): Promise<ConflitoDeReserva[]> {
  const prospectIds = [...new Set(input.prospectIds ?? [])];
  const contatoIds = [...new Set(input.contatoIds ?? [])];
  const campaignId = input.campaignId;
  if (prospectIds.length === 0 && contatoIds.length === 0) return [];

  const [prospects, contatos, campanhasRes, enviosRes] = await Promise.all([
    prospectIds.length > 0
      ? prospectsPorId(admin, input.organizationId, prospectIds)
      : Promise.resolve(new Map<string, ProspectoDaReserva>()),
    contatoIds.length > 0
      ? contatosPorId(admin, input.organizationId, contatoIds)
      : Promise.resolve(new Map<string, ContatoDaReserva>()),
    admin
      .from("prospecting_campaigns")
      .select("id, nome, prospect_ids, contato_ids")
      .eq("organization_id", input.organizationId),
    admin
      .from("prospecting_sends")
      .select("prospect_id, campaign_id")
      .eq("organization_id", input.organizationId),
  ]);

  if (campanhasRes.error) throw new Error(`campanhas_indisponiveis: ${campanhasRes.error.message}`);
  if (enviosRes.error) throw new Error(`envios_indisponiveis: ${enviosRes.error.message}`);

  const campanhas = (campanhasRes.data ?? []) as unknown as CampanhaDaOrg[];
  const porId = new Map(campanhas.map((c) => [c.id, c]));

  // Um índice prospect_id -> campanha que o reservou. A lista fechada vem
  // primeiro; o ledger de envios reforça (a lista pode ter sido limpa depois).
  const reservadoPor = new Map<string, { id: string; nome: string; via: string }>();
  for (const c of campanhas) {
    if (campaignId !== null && c.id === campaignId) continue;
    for (const id of c.prospect_ids ?? []) {
      if (!reservadoPor.has(id)) {
        reservadoPor.set(id, { id: c.id, nome: c.nome, via: "lista da campanha" });
      }
    }
    for (const id of c.contato_ids ?? []) {
      if (!reservadoPor.has(id)) {
        reservadoPor.set(id, { id: c.id, nome: c.nome, via: "lista de recuperação" });
      }
    }
  }
  for (const e of (enviosRes.data ?? []) as unknown as Array<{
    prospect_id: string;
    campaign_id: string;
  }>) {
    if (campaignId !== null && e.campaign_id === campaignId) continue;
    if (reservadoPor.has(e.prospect_id)) continue;
    const c = porId.get(e.campaign_id);
    reservadoPor.set(e.prospect_id, {
      id: e.campaign_id,
      nome: c?.nome ?? "outra campanha",
      via: "envio já realizado",
    });
  }

  const conflitos = new Map<string, ConflitoDeReserva>();
  const registrar = (c: ConflitoDeReserva) => {
    if (!conflitos.has(c.id)) conflitos.set(c.id, c);
  };

  for (const id of prospectIds) {
    const p = prospects.get(id);
    if (!p) {
      registrar({ id, nome: id, motivo: "nao_encontrada", detalhe: "não é desta organização" });
      continue;
    }
    const reserva = reservadoPor.get(id);
    if (reserva) {
      registrar({
        id,
        nome: p.nome,
        motivo: "outra_campanha",
        campanha_id: reserva.id,
        campanha_nome: reserva.nome,
        detalhe: reserva.via,
      });
      continue;
    }
    const efetiva = categoriaEfetiva(p);
    if (efetiva.revisar) {
      registrar({
        id,
        nome: p.nome,
        motivo: "revisar",
        detalhe: efetiva.motivo,
      });
      continue;
    }
    if (!categoriaCombinaComCampanha(efetiva, input.categorias ?? [])) {
      registrar({
        id,
        nome: p.nome,
        motivo: "categoria",
        detalhe: `categoria efetiva: ${efetiva.rotulo}`,
      });
    }
  }

  for (const id of contatoIds) {
    const c = contatos.get(id);
    if (!c) {
      registrar({ id, nome: id, motivo: "nao_encontrada", detalhe: "não é desta organização" });
      continue;
    }
    const reserva = reservadoPor.get(id);
    if (reserva) {
      registrar({
        id,
        nome: c.name ?? c.display_name ?? id,
        motivo: "outra_campanha",
        campanha_id: reserva.id,
        campanha_nome: reserva.nome,
        detalhe: reserva.via,
      });
    }
  }

  return [...conflitos.values()];
}

/**
 * O conjunto de ids que OUTRA campanha já reservou (lista fechada ou envio).
 *
 * É o que o público da base usa para não oferecer de novo uma empresa que o
 * operador já colocou em outra campanha. A varredura é da organização inteira
 * (poucas campanhas) e evita um `overlaps` com 10.000 ids na URL.
 */
export async function idsReservadosPorOutras(
  admin: SupabaseClient,
  organizationId: string,
  campaignId: string | null,
): Promise<Set<string>> {
  const [campanhasRes, enviosRes] = await Promise.all([
    admin
      .from("prospecting_campaigns")
      .select("id, prospect_ids, contato_ids")
      .eq("organization_id", organizationId),
    admin
      .from("prospecting_sends")
      .select("prospect_id, campaign_id")
      .eq("organization_id", organizationId),
  ]);
  if (campanhasRes.error) throw new Error(`campanhas_indisponiveis: ${campanhasRes.error.message}`);
  if (enviosRes.error) throw new Error(`envios_indisponiveis: ${enviosRes.error.message}`);

  const reservados = new Set<string>();
  for (const c of (campanhasRes.data ?? []) as unknown as CampanhaDaOrg[]) {
    if (campaignId !== null && c.id === campaignId) continue;
    for (const id of c.prospect_ids ?? []) reservados.add(id);
    for (const id of c.contato_ids ?? []) reservados.add(id);
  }
  for (const e of (enviosRes.data ?? []) as unknown as Array<{
    prospect_id: string;
    campaign_id: string;
  }>) {
    if (campaignId !== null && e.campaign_id === campaignId) continue;
    reservados.add(e.prospect_id);
  }
  return reservados;
}

/** Mensagem única para a borda — sem vazar nome de empresa em log. */
export function resumoDosConflitos(conflitos: readonly ConflitoDeReserva[]): string {
  const porMotivo = new Map<MotivoDeConflito, number>();
  for (const c of conflitos) porMotivo.set(c.motivo, (porMotivo.get(c.motivo) ?? 0) + 1);
  const partes: string[] = [];
  const outra = porMotivo.get("outra_campanha") ?? 0;
  if (outra > 0) partes.push(`${outra} já estão em outra campanha`);
  const revisar = porMotivo.get("revisar") ?? 0;
  if (revisar > 0) partes.push(`${revisar} com categoria a revisar`);
  const categoria = porMotivo.get("categoria") ?? 0;
  if (categoria > 0) partes.push(`${categoria} fora da categoria da campanha`);
  const ausente = porMotivo.get("nao_encontrada") ?? 0;
  if (ausente > 0) partes.push(`${ausente} não encontradas`);
  return partes.join(" · ");
}
