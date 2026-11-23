/**
 * RELATÓRIO MENSAL DE GASTOS POR CAMPANHA — funções puras + CSV.
 *
 * Três colunas, duas fontes já existentes (nenhuma tabela nova):
 * - **orçado** — `prospecting_campaigns.orcamento_*_cents` (0337);
 * - **prospecção real** — soma de `prospecting_searches.custo_estimado_cents`
 *   no mês, agrupada por `campaign_id` (a mesma régua de `lib/prospeccao/uso.ts`);
 * - **mídia lançada** — soma de `prospecting_campaign_spend.valor_cents` no mês
 *   (0337, LANÇAMENTO MANUAL até Marketing API).
 *
 * O guard é o de sempre (`guardOrcamento`, reaproveitado de
 * `simulacao-gastos.ts`): 80% avisa, 100% bloqueia, gerente libera com motivo.
 */
import { guardOrcamento, type GuardDeOrcamento } from "./simulacao-gastos";

export interface LinhaDeGasto {
  campanha_id: string;
  nome: string;
  orcamento_prospeccao_cents: number | null;
  orcamento_midia_cents: number | null;
  gasto_prospeccao_cents: number;
  midia_lancada_cents: number;
}

export interface LinhaDoRelatorio extends LinhaDeGasto {
  orcamento_total_cents: number | null;
  gasto_total_cents: number;
  pct: number;
  guard: GuardDeOrcamento;
}

export function montarRelatorio(
  linhas: readonly LinhaDeGasto[],
  limiteOrgCents: number | null,
): LinhaDoRelatorio[] {
  return linhas.map((linha) => {
    const orcamento =
      linha.orcamento_prospeccao_cents == null && linha.orcamento_midia_cents == null
        ? null
        : (linha.orcamento_prospeccao_cents ?? 0) + (linha.orcamento_midia_cents ?? 0);
    // O orçamento da campanha, quando existe, é a régua da linha; o da org é
    // o teto agregado — os dois entram no guard sem criar terceira regra.
    const limite = orcamento ?? limiteOrgCents;
    const gasto = linha.gasto_prospeccao_cents + linha.midia_lancada_cents;
    const guard = guardOrcamento({ gastoCents: gasto, limiteCents: limite });
    return {
      ...linha,
      orcamento_total_cents: orcamento,
      gasto_total_cents: gasto,
      pct: guard.pct,
      guard,
    };
  });
}

/** CSV com cabeçalho fixo e valores em centavos — sem characterize de planilha. */
export function relatorioParaCsv(linhas: readonly LinhaDoRelatorio[]): string {
  const cabecalho = [
    "campanha_id",
    "campanha",
    "orcamento_prospeccao_cents",
    "orcamento_midia_cents",
    "gasto_prospeccao_cents",
    "midia_lancada_cents",
    "orcamento_total_cents",
    "gasto_total_cents",
    "percentual",
    "estado",
    "proximo_passo",
  ];
  const escapar = (valor: unknown): string => {
    const texto = valor == null ? "" : String(valor);
    return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const linhasCsv = linhas.map((l) =>
    [
      l.campanha_id,
      l.nome,
      l.orcamento_prospeccao_cents,
      l.orcamento_midia_cents,
      l.gasto_prospeccao_cents,
      l.midia_lancada_cents,
      l.orcamento_total_cents,
      l.gasto_total_cents,
      l.pct,
      l.guard.estado,
      l.guard.proximoPasso,
    ]
      .map(escapar)
      .join(","),
  );
  return [cabecalho.join(","), ...linhasCsv].join("\n") + "\n";
}
