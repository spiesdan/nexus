import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { COLUNAS_DA_CARGA, type Carga } from "@/lib/schemas/expedicao";
import { createClient } from "@/lib/supabase/server";

import { ExpedicaoClient, type ProgressoDaCarga } from "./_client";

export const dynamic = "force-dynamic";

/**
 * A EXPEDIÇÃO — a fila de cargas do transporte próprio (ATT.txt Fase 3).
 *
 * Montar a próxima carga é uma TELA, não uma coluna ao lado da fila:
 * `/app/expedicao/nova`. Aqui só entra o que a operação precisa ver de
 * relance — o que está na rua, o que está na doca e o que já fechou.
 */
export default async function ExpedicaoPage() {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const podeCriar = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;

  const supabase = await createClient();
  const [{ data: cargas }, { data: fila }] = await Promise.all([
    supabase
      .from("shipments")
      .select(COLUNAS_DA_CARGA)
      .eq("organization_id", activeOrg.orgId)
      .order("created_at", { ascending: false })
      .limit(200),
    // Só o suficiente para o número e o valor da faixa de situação. A lista
    // de pedidos (com cliente, cidade e busca) vive em `/nova`.
    supabase
      .from("commercial_orders")
      .select("id, total_cents")
      .eq("organization_id", activeOrg.orgId)
      .in("status", ["aprovado", "faturado"])
      .limit(200),
  ]);

  /**
   * O ANDAMENTO DE CADA CARGA.
   *
   * A lista de cargas não carrega os itens, e sem isto toda linha dizia só
   * "Em rota" — o mesmo rótulo para a carga com uma parada entregue e para a
   * que não saiu da primeira. O servidor resolve numa consulta só; o cliente
   * usa para a barra de progresso e para o indicador "Paradas a entregar".
   */
  const idsDasCargas = (cargas ?? []).map((c) => (c as unknown as { id: string }).id);
  const { data: itensDasCargas } = idsDasCargas.length
    ? await supabase
        .from("shipment_orders")
        .select("shipment_id, status")
        .eq("organization_id", activeOrg.orgId)
        .in("shipment_id", idsDasCargas)
    : { data: [] as { shipment_id: string; status: string }[] };

  const progresso: Record<string, ProgressoDaCarga> = {};
  for (const item of (itensDasCargas ?? []) as { shipment_id: string; status: string }[]) {
    const p = (progresso[item.shipment_id] ??= { total: 0, entregues: 0, devolvidos: 0 });
    p.total += 1;
    if (item.status === "entregue") p.entregues += 1;
    else if (item.status === "devolvido") p.devolvidos += 1;
  }

  const pedidosNaFila = (fila ?? []) as { id: string; total_cents: number | null }[];

  return (
    <ExpedicaoClient
      inicial={(cargas ?? []) as unknown as Carga[]}
      fila={{
        total: pedidosNaFila.length,
        valor: pedidosNaFila.reduce((soma, p) => soma + (p.total_cents || 0), 0),
      }}
      progresso={progresso}
      podeCriar={podeCriar}
      textos={{
        titulo: t("Expedição"),
        subtitulo: t("Cargas do transporte próprio e pedidos aguardando embarque."),
        nova: t("Nova carga"),
        cargas: t("Cargas"),
        vazias: t("Nenhuma carga ainda"),
        embarcaveis: t("Aguardando embarque"),
        verRomaneio: t("Romaneio (PDF)"),
      }}
    />
  );
}
