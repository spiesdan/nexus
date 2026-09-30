import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { acumuladoDiario, agregadosDoMes } from "@/lib/comercial/contexto-indicadores";
import { diasNoMes } from "@/lib/comercial/inteligencia";
import {
  deslocarMes,
  fusoValido,
  mesAtualNoFuso,
  montarGradeDoMes,
  rotuloDoMes,
} from "@/lib/comercial/visao-do-mes";

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
 *
 * `?mes=AAAA-MM` (o seletor do "Evolução de Vendas") troca o mês agregado no
 * servidor — mesma validação e mesmo fallback dos Indicadores: mês malformado
 * cai no corrente do fuso da organização, nunca num 404.
 *
 * `mesesExtras` entrega as séries acumuladas de "Mês passado"/"Ano passado"
 * da legenda — mesma janela de 14 meses dos Indicadores e o MESMO laço
 * (`acumuladoDiario`); as extras saem das linhas da própria janela, sem query
 * nova. Sem elas a legenda ficava permanentemente desabilitada aqui.
 */

const ANO_MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
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

  const params = await searchParams;
  const mesAtual = mesAtualNoFuso(fuso, agoraMs);
  const mes = ANO_MES.test(params.mes ?? "") ? (params.mes as string) : mesAtual;
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(agoraMs));

  const mesAnterior = deslocarMes(mes, -1);
  const mesAnoPassado = deslocarMes(mes, -12);
  const { agregados: ag, cortado } = await agregadosDoMes({
    supabase,
    orgId: activeOrg.orgId,
    mes,
    fuso,
    hoje,
    inicioJanela: `${deslocarMes(mes, -13)}-01`,
    mesesExtras: [mesAnterior, mesAnoPassado],
  });

  const dias = diasNoMes(mes);
  const compAnt = acumuladoDiario(ag.seriesExtras[mesAnterior], dias);
  const compAno = acumuladoDiario(ag.seriesExtras[mesAnoPassado], dias);

  const {
    vendaAc,
    metaAc,
    projecaoAc,
    vendidoHoje,
    diasDecorridos,
    necessarioDia,
    diasUteisRestantes,
    previsaoMes,
    pctObjetivo,
    ehMesAtual,
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
      mesAtual={mesAtual}
      ehMesAtual={ehMesAtual}
      rotuloMes={rotuloDoMes(mes)}
      diaHoje={diasDecorridos}
      serie={ag.serieDiaria.map((s, i) => ({
        dia: Number(s.dia.slice(8, 10)),
        vendaAc: vendaAc[i] ?? 0,
        metaAc: metaAc?.[i] ?? null,
        projecao: projecaoAc[i] ?? null,
        mesAnt: compAnt[i] ?? null,
        mesAno: compAno[i] ?? null,
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