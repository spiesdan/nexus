import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { isServiceRoleConfigured } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { agregadosDoMes } from "@/lib/comercial/contexto-indicadores";
import { diasNoMes } from "@/lib/comercial/inteligencia";
import { deslocarMes, fusoValido, mesAtualNoFuso, montarGradeDoMes } from "@/lib/comercial/visao-do-mes";

import { IndicadoresClient, type DadosIndicadores } from "./_indicadores";

export const dynamic = "force-dynamic";

const ANO_MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

/**
 * INDICADORES — o painel no molde do Mercos (medido em 2026-09-06).
 *
 * Agregados vêm de `agregadosDoMes` (fonte única com o Indicador IA); aqui
 * ficam só fuso, nomes de vendedores e a montagem da tela. O servidor agrega
 * tudo e o cliente só desenha — nenhuma linha de pedido viaja ao browser.
 */
export default async function IndicadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; vendedor?: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const params = await searchParams;

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

  const mes = ANO_MES.test(params.mes ?? "")
    ? (params.mes as string)
    : mesAtualNoFuso(fuso, agoraMs);
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(agoraMs));
  const filtroVendedor = params.vendedor?.trim() ?? "";
  const mesAnterior = deslocarMes(mes, -1);
  const mesAnoPassado = deslocarMes(mes, -12);

  const {
    agregados: ag,
    totalContatos,
    cortado,
  } = await agregadosDoMes({
    supabase,
    orgId: activeOrg.orgId,
    mes,
    fuso,
    hoje,
    filtroVendedor,
    inicioJanela: `${deslocarMes(mes, -13)}-01`,
    mesesExtras: [mesAnterior, mesAnoPassado],
  });

  const dias = diasNoMes(mes);
  const {
    vendaAc,
    metaAc,
    projecaoAc,
    vendidoHoje,
    diasDecorridos,
    necessarioDia,
    diasUteisRestantes,
    previsaoMes,
  } = montarGradeDoMes({ agregados: ag, mes, hoje });
  const compAntSerie = ag.seriesExtras[mesAnterior] ?? [] as { dia: string; cents: number }[];
  const compAnoSerie = ag.seriesExtras[mesAnoPassado] ?? [] as { dia: string; cents: number }[];
  const compAnt: number[] = [];
  const compAno: number[] = [];
  let sAnt = 0;
  let sAno = 0;
  for (let i = 0; i < dias; i++) {
    sAnt += compAntSerie[i]?.cents ?? 0;
    sAno += compAnoSerie[i]?.cents ?? 0;
    compAnt.push(sAnt);
    compAno.push(sAno);
  }

  const { data: membros } = await supabase
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", activeOrg.orgId)
    .is("revoked_at", null)
    .neq("role", "viewer")
    .limit(50);

  const nomes: Record<string, string> = {};
  const ids = ((membros ?? []) as unknown as { user_id: string }[]).map((m) => m.user_id);
  if (isServiceRoleConfigured() && ids.length > 0) {
    const admin = createAdminClient();
    await Promise.all(
      ids.map(async (id) => {
        try {
          const { data: userRes } = await admin.auth.admin.getUserById(id);
          const nome = userRes?.user?.user_metadata?.full_name as string | undefined;
          if (nome?.trim()) nomes[id] = nome.trim();
        } catch {
          // Nome é cortesia; o id curto abaixo cobre.
        }
      }),
    );
  }
  const nomeVendedor = (id: string): string =>
    id === "sem_vendedor" ? "Sem vendedor" : (nomes[id] ?? id.slice(0, 8));

  const ranking = ag.ranking
    .map((l) => {
      const meta = ag.metasVendedores[l.vendedorId] ?? null;
      return {
        id: l.vendedorId,
        nome: nomeVendedor(l.vendedorId),
        total: l.total,
        qtd: l.qtd,
        ticket: l.ticket,
        clientes: l.clientes,
        meta,
        pctMeta: meta ? (l.total / meta) * 100 : null,
      };
    })
    .sort((a, b) => b.total - a.total);

  const vendedoresFiltro = [
    ...new Map(ranking.map((r) => [r.id, r.nome]) as [string, string][]).entries(),
  ].map(([id, nome]) => ({ id, nome }));

  const [ano = "", mm = ""] = mes.split("-");
  const ROTULOS_MES = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  const dados: DadosIndicadores = {
    mes,
    rotuloMes: `${ROTULOS_MES[Number(mm || "0") - 1] ?? mm}/${ano.slice(2)}`,
    serie: ag.serieDiaria.map((s, i) => ({
      dia: Number(s.dia.slice(8, 10)),
      vendas: s.cents,
      vendaAc: vendaAc[i] ?? 0,
      metaAc: metaAc?.[i] ?? null,
      mesAnt: compAnt[i] ?? null,
      mesAno: compAno[i] ?? null,
      projecao: projecaoAc[i] ?? null,
    })),
    vendidoMes: ag.vendidoMes,
    qtdMes: ag.qtdMes,
    vendidoHoje,
    objetivo: ag.metaLoja,
    pctObjetivo: ag.metaLoja ? (ag.vendidoMes / ag.metaLoja) * 100 : null,
    necessarioDia,
    diasUteisRestantes,
    previsaoMes,
    faturado: ag.faturado,
    naoFaturado: ag.naoFaturado,
    carteira: { ...ag.carteira, total: totalContatos },
    positivacao: {
      compraram: ag.positivacao.compraram,
      base: ag.positivacao.base,
      pct: ag.positivacao.base > 0 ? (ag.positivacao.compraram / ag.positivacao.base) * 100 : 0,
    },
    abc: {
      faixas: (() => {
        const totalAbc = ag.abc.reduce((a, f) => a + f.cents, 0);
        return ag.abc.map((f) => ({ ...f, pct: totalAbc > 0 ? (f.cents / totalAbc) * 100 : 0 }));
      })(),
      total: ag.abc.reduce((a, f) => a + f.cents, 0),
    },
    ranking,
    filtroVendedor,
    vendedores: vendedoresFiltro,
    cortado,
  };

  const hora = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: fuso, hour: "2-digit", hour12: false }).format(
      new Date(agoraMs),
    ),
  );

  return <IndicadoresClient dados={dados} nome={user.full_name} hora={hora} />;
}
