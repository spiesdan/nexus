import { notFound, redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

/**
 * O contexto comum das subtelas da carga.
 *
 * A ficha da carga virou quatro endereços — paradas (a raiz), rota, fechamento
 * e motorista — e cada um precisa da mesma guarda: a carga existe NESTA
 * organização, o papel pode operar, excluir e fechar. Duplicar isso em quatro
 * `page.tsx` é como as permissões divergem sem ninguém notar.
 */
export async function contextoDaCarga(id: string) {
  const user = await requireAuth();
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const podeOperar = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;
  const podeExcluir = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  // Fechar caixa é mexer em dinheiro: o mesmo nível do PUT do fechamento e do
  // POST /conciliar. Nível próprio em vez de reaproveitar `podeExcluir` —
  // excluir carga e fechar caixa são permissões diferentes que hoje coincidem.
  const podeFechar = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  const supabase = await createClient();
  const { data: carga } = await supabase
    .from("shipments")
    .select("id, organization_id")
    .eq("organization_id", activeOrg.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!carga) notFound();

  return {
    podeOperar,
    podeExcluir,
    podeFechar,
    textos: {
      voltar: t("Voltar para expedição"),
      rota: t("Rota"),
      // O fechamento saiu do papel: o PDF é só romaneio agora. O nome do
      // botão diz isso para ninguém procurar o fechamento no impresso.
      romaneio: t("Romaneio (PDF)"),
      totalMercadorias: t("Total em mercadorias"),
      aCobrar: t("A cobrar na entrega"),
      paradasConcluidas: t("Paradas concluídas"),
      sairRota: t("Sair para rota"),
      concluir: t("Concluir carga"),
      entregue: t("Entregue"),
      devolvido: t("Devolvido"),
      semEndereco: t("Endereço não informado"),
      verComprovante: t("Ver comprovante"),
      escolherFoto: t("Escolher foto da entrega"),
      excluirCarga: t("Excluir romaneio"),
      confirmarExcluir: t("Excluir este romaneio? Os pedidos voltam para a fila de embarque."),
      tirarDaCarga: t("Tirar da carga"),
      modoMotorista: t("Motorista"),
      cheguei: t("Cheguei"),
      motivo: t("Motivo da devolução"),
      confirmar: t("Confirmar"),
      cancelar: t("Cancelar"),
    },
  };
}
