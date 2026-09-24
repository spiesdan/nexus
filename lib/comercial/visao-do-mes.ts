import { diasNoMes, FUSO_PADRAO, metaAcumulada } from "./inteligencia";
import type { AgregadosIndicadores } from "./contexto-indicadores";

/**
 * A GRADE DE VENDA DO MÊS — o que o Dashboard home e os Indicadores chamam de
 * "o mês": acumulado, meta acumulada, projeção e o que falta para fechar.
 *
 * Esta era a parte do `app/app/indicadores/page.tsx` que nenhum outro leitor
 * compartilhava: o painel computava a grade interno e o Indicador IA lia os
 * agregados crus. O Dashboard home (`/app`) começou a precisar da MESMA grade,
 * e calculá-la de novo — um milímetro diferente — seria o painel dizer a meta
 * com 57% e a home com 58%. Este módulo é o leitor que puxa o cálculo para cá.
 *
 * Só a grade de VENDA vive aqui. Carteira, positivação, ABC e ranking são
 * leitores distintos do `AgregadosIndicadores` e não entram na home.
 */

/** Fuso da org sem explodir — inválido/ausente cai em SP. */
export function fusoValido(fuso: string | null): string {
  if (!fuso) return FUSO_PADRAO;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: fuso });
    return fuso;
  } catch {
    return FUSO_PADRAO;
  }
}

/** "2026-09" no fuso dado — o mês que a tela está vendo, não o do servidor. */
export function mesAtualNoFuso(fuso: string, agoraMs: number): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
  }).format(new Date(agoraMs));
  return /^\d{4}-\d{2}$/.test(partes) ? partes : new Date(agoraMs).toISOString().slice(0, 7);
}

/** "2026-09" + delta meses, preserva o formato AAAA-MM. */
export function deslocarMes(anoMes: string, delta: number): string {
  const [ano = 0, mes = 1] = anoMes.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** "2026-09" → "set/26". Rotulagem do header da home. */
export function rotuloDoMes(mes: string): string {
  const [ano = "", mm = ""] = mes.split("-");
  const ROTULOS = [
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
  return `${ROTULOS[Number(mm || "0") - 1] ?? mm}/${ano.slice(2)}`;
}

/** Dias úteis (seg–sex) restantes no mês a partir de hoje. */
export function diasUteisRest(anoMes: string, hoje: string): number {
  const [ano = 0, mes = 1] = anoMes.split("-").map(Number);
  const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const diaHoje = Number(hoje.slice(8, 10));
  let uteis = 0;
  for (let d = Math.max(1, diaHoje); d <= dias; d++) {
    const dow = new Date(Date.UTC(ano, mes - 1, d)).getUTCDay();
    if (dow >= 1 && dow <= 5) uteis++;
  }
  return uteis;
}

export function montarGradeDoMes(args: {
  agregados: AgregadosIndicadores;
  mes: string;
  hoje: string;
}): {
  vendaAc: number[];
  metaAc: number[] | null;
  projecaoAc: (number | null)[];
  vendidoHoje: number;
  diasDecorridos: number;
  ehMesAtual: boolean;
  necessarioDia: number | null;
  diasUteisRestantes: number;
  previsaoMes: number;
  pctObjetivo: number | null;
} {
  const { agregados: ag, mes, hoje } = args;
  const dias = diasNoMes(mes);
  const vendaAc: number[] = [];
  let soma = 0;
  for (const s of ag.serieDiaria) {
    soma += s.cents;
    vendaAc.push(soma);
  }
  const metaAc = ag.metaLoja != null ? metaAcumulada(ag.metaLoja, dias) : null;

  const vendidoHoje = ag.serieDiaria.find((s) => s.dia === hoje)?.cents ?? 0;
  const diasDecorridos = ag.serieDiaria.filter((s) => s.dia <= hoje).length || 1;
  const previsaoMes = Math.round((ag.vendidoMes / diasDecorridos) * dias);

  /**
   * PROJEÇÃO — a "simulação" que a linha do realizado não faz. `vendaAc` é
   * acumulado REALIZADO (retas nos dias futuros); esta série continua de hoje
   * até o fim do mês no ritmo médio, terminando em `previsaoMes`. Só no mês
   * corrente e só do dia seguinte em diante.
   */
  const ehMesAtual = hoje.slice(0, 7) === mes;
  const vendaAcHoje = vendaAc[diasDecorridos - 1] ?? ag.vendidoMes;
  const taxaDiaria = diasDecorridos > 0 ? ag.vendidoMes / diasDecorridos : 0;
  const projecaoAc: (number | null)[] = vendaAc.map((_, i) =>
    ehMesAtual && diasDecorridos < dias && i + 1 > diasDecorridos
      ? Math.round(vendaAcHoje + taxaDiaria * (i + 1 - diasDecorridos))
      : null,
  );

  const uteisRestantes = diasUteisRest(mes, hoje);
  const necessarioDia =
    ag.metaLoja != null && uteisRestantes > 0
      ? Math.max(0, ag.metaLoja - ag.vendidoMes) / uteisRestantes
      : null;
  const pctObjetivo = ag.metaLoja ? (ag.vendidoMes / ag.metaLoja) * 100 : null;

  return {
    vendaAc,
    metaAc,
    projecaoAc,
    vendidoHoje,
    diasDecorridos,
    ehMesAtual,
    necessarioDia,
    diasUteisRestantes: uteisRestantes,
    previsaoMes,
    pctObjetivo,
  };
}