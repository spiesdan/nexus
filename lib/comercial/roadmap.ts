import type { MetodoProjecao } from "./projecao";

/**
 * NEXUS Sales Roadmap — o ano em 12 meses (§55).
 *
 * Realizado + meta + projeção + tendência, tudo derivado de pedidos e
 * metas reais. Funções puras: quem chama carrega `commercial_orders` do
 * ano e `commercial_goals` com `organization_id` explícito. Sem mock.
 */

export type StatusMes = "fechado" | "andamento" | "futuro";

export interface MesRoadmap {
  ano_mes: string;
  rotulo: string;
  status: StatusMes;
  realizado_cents: number;
  meta_cents: number | null;
  /** % da meta (realizado ou projeção, conforme o mês). Null sem meta. */
  atingido_pct: number | null;
  projecao_cents: number | null;
  metodo_projecao: MetodoProjecao | null;
}

const ROTULOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function rotuloAnoMes(anoMes: string): string {
  const [ano = "", mm = ""] = anoMes.split("-");
  return `${ROTULOS[Number(mm) - 1] ?? mm}/${ano.slice(2)}`;
}

function pct(realizado: number, meta: number | null): number | null {
  if (meta == null || meta <= 0) return null;
  return Math.round((realizado / meta) * 1000) / 10;
}

export interface EntradaRoadmap {
  ano: string;
  /** "YYYY-MM" do mês em andamento (no fuso da org). */
  mesAtual: string;
  realizadoPorMes: Map<string, number>;
  metaPorMes: Map<string, number | null>;
  projecaoMesAtual?: { projetado_cents: number; metodo: MetodoProjecao } | null;
}

/** 12 meses sempre (futuros com zeros — roadmap, não relatório). */
export function montarRoadmap(e: EntradaRoadmap): MesRoadmap[] {
  const meses: MesRoadmap[] = [];
  for (let m = 1; m <= 12; m++) {
    const anoMes = `${e.ano}-${String(m).padStart(2, "0")}`;
    const status: StatusMes = anoMes < e.mesAtual ? "fechado" : anoMes === e.mesAtual ? "andamento" : "futuro";
    const realizado = e.realizadoPorMes.get(anoMes) ?? 0;
    const meta = e.metaPorMes.get(anoMes) ?? null;
    const proj = status === "andamento" ? (e.projecaoMesAtual ?? null) : null;
    const base = proj?.projetado_cents ?? realizado;
    meses.push({
      ano_mes: anoMes,
      rotulo: rotuloAnoMes(anoMes),
      status,
      realizado_cents: realizado,
      meta_cents: meta,
      atingido_pct: pct(base, meta),
      projecao_cents: proj?.projetado_cents ?? null,
      metodo_projecao: proj?.metodo ?? null,
    });
  }
  return meses;
}
