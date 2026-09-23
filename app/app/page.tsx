import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { agregadosDoMes } from "@/lib/comercial/contexto-indicadores";
import { fusoValido, mesAtualNoFuso, montarGradeDoMes, rotuloDoMes } from "@/lib/comercial/visao-do-mes";

import { DashboardHome } from "./_home";

export const dynamic = "force-dynamic";

/**
 * DASHBOARD HOME — a porta de entrada (substituiu o redirect fixo para o
 * Inbox; `/app/inbox` continua existindo como rota própria).
 *
 * Mesma fonte que os Indicadores (`agregadosDoMes` + a grade de `visao-do-mes`):
 * o número que esta tela mostra é o mesmo que o painel e o Indicador IA
 * mostram — nenhuma linha de pedido viaja ao browser e zero duplicação de
 * cálculo. O servidor entrega os agregados do mês corrente e o cliente desenha.
 */
export default async function DashboardHomePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app/inbox");

  const supabase = await createClient();
  const agoraMs = new Date().getTime();

  const { data: org } = await supabase
    .from("organizations")
    .select("timezone")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  const fuso = fusoValido(
    (org as unknown as { timezone?: string | null } | null)?.timezone ?? null,
  );

  const mes = mesAtualNoFuso(fuso, agoraMs);
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(agoraMs));

  const { agregados: ag, cortado } = await agregadosDoMes({
    supabase,
    orgId: activeOrg.orgId,
    mes,
    fuso,
    hoje,
    inicioJanela: `${mes}-01`,
  });

  const {
    vendaAc,
    metaAc,
    projecaoAc,
    vendidoHoje,
    necessarioDia,
    diasUteisRestantes,
    previsaoMes,
    pctObjetivo,
  } = montarGradeDoMes({ agregados: ag, mes, hoje });

  const hora = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: fuso, hour: "2-digit", hour12: false }).format(
      new Date(agoraMs),
    ),
  );

  return (
    <DashboardHome
      nome={user.full_name}
      hora={hora}
      mes={mes}
      rotuloMes={rotuloDoMes(mes)}
      serie={ag.serieDiaria.map((s, i) => ({
        dia: Number(s.dia.slice(8, 10)),
        vendaAc: vendaAc[i] ?? 0,
        metaAc: metaAc?.[i] ?? null,
        projecao: projecaoAc[i] ?? null,
      }))}
      vendidoMes={ag.vendidoMes}
      qtdMes={ag.qtdMes}
      vendidoHoje={vendidoHoje}
      objetivo={ag.metaLoja}
      pctObjetivo={pctObjetivo}
      necessarioDia={necessarioDia}
      diasUteisRestantes={diasUteisRestantes}
      previsaoMes={previsaoMes}
      cortado={cortado}
    />
  );
}