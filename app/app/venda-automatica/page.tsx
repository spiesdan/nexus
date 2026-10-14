import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

import { VendaAutomaticaClient, type CampanhaVa } from "./_client";

export const dynamic = "force-dynamic";

/**
 * VENDA AUTOMÁTICA (spec 18) — o Radar vira fila, a fila vira conversa.
 *
 * Tela única (lista + detalhe) em vez de abas: a operação do dia é ver a cota,
 * empurrar o que ficou parado e reagir ao que respondeu. O servidor entrega as
 * campanhas já filtradas pela organização ativa; o resto (painel, fila,
 * timeline, ações) vem das rotas `/api/v1/automatic-sales/*` pelo cliente.
 */
export default async function VendaAutomaticaPage({
  searchParams,
}: {
  searchParams: Promise<{ origem?: string; cidade?: string; uf?: string; categoria?: string; ids?: string }>;
}) {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const podeOperar = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;
  const podeGerenciar = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  const supabase = await createClient();
  const { data: campanhas } = await supabase
    .from("automatic_sales_campaigns")
    .select(
      "id, nome, status, cidade, uf, categorias, limite_diario, janela_inicio, janela_fim, " +
        "followup_horas, perfil_abordagem, created_at",
    )
    .eq("organization_id", activeOrg.orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  const params = await searchParams;

  // Aba da seleção (0269): o botão "Criar venda automática" da prospecção
  // chega aqui com o recorte — cidade obrigatória, o resto opcional. Sem
  // `origem=prospeccao`, a tela abre como sempre: a aba é um modo de entrada,
  // não um estado permanente.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const cidadeSel = (params.cidade ?? "").trim();
  const selecaoInicial =
    params.origem === "prospeccao" && cidadeSel !== ""
      ? {
          cidade: cidadeSel,
          uf: (params.uf ?? "").trim().toUpperCase().slice(0, 2),
          categoria: (params.categoria ?? "").trim(),
          ids: (params.ids ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter((s) => UUID.test(s))
            .slice(0, 500),
        }
      : null;

  return (
    <VendaAutomaticaClient
      campanhasIniciais={(Array.isArray(campanhas) ? campanhas : []) as unknown as CampanhaVa[]}
      podeOperar={podeOperar}
      podeGerenciar={podeGerenciar}
      selecaoInicial={selecaoInicial}
      textos={{
        titulo: t("Venda Automática"),
        subtitulo: t("Campanhas de abordagem automática com cota, janela e follow-up."),
        novaCampanha: t("Nova campanha"),
        nenhuma: t("Nenhuma campanha ainda."),
        cotaHoje: t("Cota de hoje"),
        fila: t("Fila"),
        resumo: t("Resumo"),
        timeline: t("Linha do tempo"),
        pausar: t("Pausar"),
        retomar: t("Retomar"),
        excluir: t("Excluir"),
        ignorar: t("Ignorar"),
        bloquear: t("Bloquear"),
        reenfileirar: t("Reenfileirar"),
        assumir: t("Assumir"),
        recarregar: t("Atualizar"),
        vazio: t("Nada na fila com este filtro."),
        semEventos: t("Nenhum evento ainda."),
      }}
    />
  );
}
