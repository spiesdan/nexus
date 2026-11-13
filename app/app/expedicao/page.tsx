import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { cidadesDaCarga } from "@/lib/expedicao/cidades-da-carga";
import { carregarContatosDaEntrega } from "@/lib/expedicao/endereco-da-entrega";
import { COLUNAS_DA_CARGA, STATUS_EMBARCAVEIS, type Carga } from "@/lib/schemas/expedicao";
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

  // Entregador não monta carga nem vê histórico: só o que está na rua.
  const motorista = activeOrg.motorista === true;
  const podeCriar =
    !motorista && (user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent);

  const supabase = await createClient();
  const [{ data: cargas }, { data: fila }, { count: avisosNaFila }] = await Promise.all([
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
      .in("status", [...STATUS_EMBARCAVEIS])
      .limit(200),
    // migration 0299 — o aviso "saiu para entrega" só sai pelo número de
    // expedição. Com ele fora do ar, o aviso fica na fila; a tela precisa dizer
    // isso, senão o despachante acha que o cliente foi avisado quando não foi.
    supabase
      .from("shipment_notices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", activeOrg.orgId)
      .in("status", ["pendente", "enviando"]),
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
        .select("shipment_id, order_id, status, sequencia, veiculo_id, motorista_id")
        .eq("organization_id", activeOrg.orgId)
        .in("shipment_id", idsDasCargas)
        .order("sequencia")
    : { data: [] as { shipment_id: string; order_id: string; status: string; sequencia: number }[] };
  const itens = (itensDasCargas ?? []) as {
    shipment_id: string;
    order_id: string;
    status: string;
    sequencia: number;
    veiculo_id: string | null;
    motorista_id: string | null;
  }[];

  /**
   * PARA ONDE CADA CARGA VAI — os nomes das cidades, na ordem da rota.
   *
   * A linha da carga dizia placa, status e "3/7 paradas", mas não dizia se
   * aquela carga é a de Canoinhas ou a de Mafra — a primeira coisa que o
   * despachante pergunta. A cidade sai do MESMO resolvedor do romaneio
   * (`cidadeDaEntrega`): endereço do pedido primeiro, cadastro depois. Duas
   * consultas para todas as cargas, não duas por carga.
   */
  const pedidosDasCargas = itens.length
    ? (
        await supabase
          .from("commercial_orders")
          .select("id, contact_id, cliente_documento, endereco_entrega")
          .eq("organization_id", activeOrg.orgId)
          .in("id", [...new Set(itens.map((i) => i.order_id))])
      ).data
    : [];
  const contatosDasCargas = await carregarContatosDaEntrega(
    supabase,
    activeOrg.orgId,
    (pedidosDasCargas ?? []) as unknown as Parameters<typeof carregarContatosDaEntrega>[2],
  );
  const pedidoPorId = new Map(
    ((pedidosDasCargas ?? []) as unknown as {
      id: string;
      contact_id: string | null;
      cliente_documento: string | null;
      endereco_entrega: string | null;
    }[]).map((p) => [p.id, p]),
  );

  /**
   * QUEM LEVA CADA CARGA — veículo e motorista DA DISTRIBUIÇÃO (migration 0307).
   *
   * `shipments.placa`/`motorista_nome` são o veículo legado da carga: depois da
   * distribuição por veículo, a pergunta "quais cargas saem com o ABC1D23?" não
   * se responde mais por eles. A atribuição mora nos pedidos, então a lista de
   * filtros sai daí — e continua funcionando para a carga antiga, sem ids.
   */
  const idsDeVeiculo = [...new Set(itens.map((i) => i.veiculo_id).filter((v): v is string => v != null))];
  const idsDeMotorista = [...new Set(itens.map((i) => i.motorista_id).filter((v): v is string => v != null))];
  const [{ data: veiculosDaFrota }, { data: motoristasDaFrota }] = await Promise.all([
    idsDeVeiculo.length
      ? supabase
          .from("fleet_vehicles")
          .select("id, placa")
          .eq("organization_id", activeOrg.orgId)
          .in("id", idsDeVeiculo)
      : Promise.resolve({ data: [] as { id: string; placa: string }[] }),
    idsDeMotorista.length
      ? supabase
          .from("fleet_drivers")
          .select("id, nome")
          .eq("organization_id", activeOrg.orgId)
          .in("id", idsDeMotorista)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);
  const placaPorId = new Map(
    ((veiculosDaFrota ?? []) as unknown as { id: string; placa: string }[]).map((v) => [v.id, v.placa]),
  );
  const nomePorId = new Map(
    ((motoristasDaFrota ?? []) as unknown as { id: string; nome: string }[]).map((m) => [m.id, m.nome]),
  );

  const progresso: Record<string, ProgressoDaCarga> = {};
  for (const item of itens) {
    const p = (progresso[item.shipment_id] ??= {
      total: 0,
      entregues: 0,
      devolvidos: 0,
      cidades: [],
      semCidade: 0,
      veiculos: [],
      motoristas: [],
    });
    p.total += 1;
    if (item.status === "entregue") p.entregues += 1;
    else if (item.status === "devolvido") p.devolvidos += 1;
    const placa = item.veiculo_id ? placaPorId.get(item.veiculo_id) : undefined;
    if (placa && !p.veiculos.includes(placa)) p.veiculos.push(placa);
    const nome = item.motorista_id ? nomePorId.get(item.motorista_id) : undefined;
    if (nome && !p.motoristas.includes(nome)) p.motoristas.push(nome);
  }
  for (const [shipmentId, p] of Object.entries(progresso)) {
    const daCarga = cidadesDaCarga(
      itens.filter((i) => i.shipment_id === shipmentId),
      pedidoPorId,
      contatosDasCargas,
    );
    p.cidades = daCarga.cidades;
    p.semCidade = daCarga.semCidade;
  }

  const pedidosNaFila = (fila ?? []) as { id: string; total_cents: number | null }[];

  return (
    <ExpedicaoClient
      inicial={((cargas ?? []) as unknown as Carga[]).filter(
        // O entregador escolhe entre as cargas LIBERADAS: a que está montada
        // (pronta para sair) e a que já está na rua. Antes só `em_rota`
        // aparecia — carga recém-liberada ficava invisível para quem ia
        // dirigi-la, e o botão "Iniciar rota" da cabine nunca era alcançado.
        (c) => !motorista || c.status === "em_rota" || c.status === "montando",
      )}
      fila={{
        total: pedidosNaFila.length,
        valor: pedidosNaFila.reduce((soma, p) => soma + (p.total_cents || 0), 0),
      }}
      progresso={progresso}
      podeCriar={podeCriar}
      motorista={motorista}
      avisosNaFila={avisosNaFila ?? 0}
      textos={{
        titulo: motorista ? t("Minhas entregas") : t("Expedição"),
        subtitulo: motorista
          ? t("Escolha a carga liberada e toque para abrir a rota.")
          : t("Cargas do transporte próprio e pedidos aguardando embarque."),
        nova: t("Nova carga"),
        cargas: t("Cargas"),
        vazias: t("Nenhuma carga ainda"),
        embarcaveis: t("Aguardando embarque"),
        verRomaneio: t("Romaneio (PDF)"),
        frota: t("Frota"),
      }}
    />
  );
}
