/**
 * GET /api/v1/home/mes?mes=AAAA-MM — o agregado do mês da HOME para o
 * seletor de "Evolução de Vendas" trocar sem navegar.
 *
 * ─── Por que esta rota existe ────────────────────────────────────────────────
 * A página (`app/app/page.tsx`) lê `?mes=` e monta o `DadosDashboard` inteiro
 * no servidor. Cada clique do seletor era `router.push(?mes=)` — uma navegação
 * RSC do /app completo (~2s em produção, Supabase cloud, auditoria de
 * 2026-09-30) para trocar um agregado que esta rota devolve sozinha. O clique
 * passou a ser: `fetch` aqui + `history.replaceState`
 * (`lib/navigation/shallow.ts`), com o estado do mês em `useState` na home.
 *
 * A página continua sendo o PRIMEIRO render — deep-link `?mes=` segue
 * honrado, e esta rota só atende as trocas seguintes.
 *
 * ─── Fonte única ─────────────────────────────────────────────────────────────
 * `agregadosDoMes` + `montarGradeDoMes` — os MESMOS módulos da página, então o
 * número do clique é o número do F5 na URL resultante. Mesma validação e
 * mesmo fallback: mês malformado cai no mês corrente do fuso da organização,
 * nunca num 404 (regra da página, linha ~63).
 *
 * A janela de 13 meses e `mesesExtras` acompanham a página de propósito: as
 * séries acumuladas de "Mês passado"/"Ano passado" da legenda precisam existir
 * também no clique do seletor — entregar um `DadosDoMes` sem elas apagaria a
 * comparação da tela no primeiro troca de mês.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import type { DadosDoMes } from "@/app/app/_home";
import { ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { acumuladoDiario, agregadosDoMes } from "@/lib/comercial/contexto-indicadores";
import { diasNoMes } from "@/lib/comercial/inteligencia";
import {
  deslocarMes,
  fusoValido,
  mesAtualNoFuso,
  montarGradeDoMes,
  rotuloDoMes,
} from "@/lib/comercial/visao-do-mes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ANO_MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

const consultaSchema = z.object({
  mes: z.string().regex(ANO_MES, "mes usa AAAA-MM").optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "commercial_orders" });
  if (!authz.ok) return authz.response;

  // Parse tolerante de propósito: formatos fora do regex caem no corrente em
  // vez de 422 — é a SEMÂNTICA da página (comentário do topo), e o parâmetro
  // nasce do nosso próprio seletor, não de entrada do usuário.
  const parsed = consultaSchema.safeParse({
    mes: req.nextUrl.searchParams.get("mes") ?? undefined,
  });

  const supabase = await createClient();
  const agoraMs = Date.now();
  const { data: org } = await supabase
    .from("organizations")
    .select("timezone")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  const fuso = fusoValido((org as unknown as { timezone?: string | null } | null)?.timezone ?? null);
  const mesAtual = mesAtualNoFuso(fuso, agoraMs);
  const mes = parsed.success && parsed.data.mes ? parsed.data.mes : mesAtual;
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
    orgId: authz.org.orgId,
    mes,
    fuso,
    hoje,
    inicioJanela: `${deslocarMes(mes, -13)}-01`,
    mesesExtras: [mesAnterior, mesAnoPassado],
  });

  const grade = montarGradeDoMes({ agregados: ag, mes, hoje });
  const dias = diasNoMes(mes);
  const compAnt = acumuladoDiario(ag.seriesExtras[mesAnterior], dias);
  const compAno = acumuladoDiario(ag.seriesExtras[mesAnoPassado], dias);

  const dados: DadosDoMes = {
    mes,
    mesAtual,
    ehMesAtual: grade.ehMesAtual,
    rotuloMes: rotuloDoMes(mes),
    diaHoje: grade.diasDecorridos,
    serie: ag.serieDiaria.map((s, i) => ({
      dia: Number(s.dia.slice(8, 10)),
      vendaAc: grade.vendaAc[i] ?? 0,
      metaAc: grade.metaAc?.[i] ?? null,
      projecao: grade.projecaoAc[i] ?? null,
      mesAnt: compAnt[i] ?? null,
      mesAno: compAno[i] ?? null,
    })),
    vendidoMes: ag.vendidoMes,
    qtdMes: ag.qtdMes,
    vendidoHoje: grade.vendidoHoje,
    objetivo: ag.metaLoja,
    pctObjetivo: grade.pctObjetivo,
    necessarioDia: grade.necessarioDia,
    diasUteisRestantes: grade.diasUteisRestantes,
    previsaoMes: grade.previsaoMes,
    cortado,
  };

  return ok(dados, { requestId });
}
