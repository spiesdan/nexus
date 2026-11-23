/**
 * SIMULAÇÃO DE GASTO DAS CAMPANHAS — funções puras, sem banco e sem UI.
 *
 * Duas fontes de gasto entram na mesma conta: PROSPECÇÃO (real, medida pelo
 * motor em `custo_estimado_cents`) e MÍDIA META (lançamento MANUAL até existir
 * Marketing API). A simulação na criação mostra uma FAIXA, nunca um número
 * único — taxa de detalhe variável é o que faz a estimativa baratear ou
 * encarecer, e fingir precisão aqui é o velho erro do "vai custar R$ X".
 *
 * Regras reaproveitadas, não reescritas:
 * - `custoEfetivo` (`custos.ts`) — preço por busca/detalhe do tenant;
 * - `gerarGrade` (`grade.ts`) — quantas células a região exige;
 * - `estadoDoOrcamento` (`uso.ts`) — 80/90/100% e a mensagem literal.
 *
 * Premissas de mídia (CPM/CTR) são PREMISSAS declaradas ao lado do número,
 * não verdade de mercado. Nenhuma é gravada como gasto real.
 */
import { custoEfetivo, type CustoDeProvider, type PrecoConfigurado } from "./custos";
import { gerarGrade } from "./grade";
import { estadoDoOrcamento, PCT_AVISO, type EstadoOrcamento } from "./uso";

/** CPM/CTR de referência — premissas explícitas na tela, nunca fatos. */
export const CPM_PADRAO = 25;
export const CTR_PADRAO = 0.01;

export interface Faixa {
  minimo: number;
  esperado: number;
  maximo: number;
}

export type TaxaDeDetalhe = Faixa;

const TAXA_PADRAO: TaxaDeDetalhe = { minimo: 0.2, esperado: 0.5, maximo: 1 };

/** Quantas células a região produz — a grade é a mesma da execução. */
export function celulasDaGrade(params: {
  latitude: number;
  longitude: number;
  raioKm: number;
  tamanhoKm: number;
  overlapPct: number;
}): number {
  return gerarGrade(
    params.latitude,
    params.longitude,
    params.raioKm,
    params.tamanhoKm,
    params.overlapPct,
  ).length;
}

/**
 * Custo de prospecção: células × (busca + detalhe × taxa). Sempre em centavos
 * inteiros — arredondar para cima evita prometer um número que a execução
 * ultrapassa por centavos.
 */
export function faixaProspeccao(args: {
  celulas: number;
  custo: CustoDeProvider;
  taxaDetalhe?: TaxaDeDetalhe;
}): Faixa {
  const taxa = args.taxaDetalhe ?? TAXA_PADRAO;
  const calcular = (fraction: number): number =>
    Math.ceil(Math.max(0, args.celulas) * (args.custo.busca + args.custo.detalhe * fraction));
  return {
    minimo: calcular(taxa.minimo),
    esperado: calcular(taxa.esperado),
    maximo: calcular(taxa.maximo),
  };
}

/** O preço efetivo do tenant, para a tela não reimplementar o override. */
export function custoDaCampanha(provider: string, cfg?: PrecoConfigurado | null): CustoDeProvider {
  return custoEfetivo(provider, cfg);
}

export interface SimulacaoMidia {
  impressoes: number;
  cliques: number;
  cpm: number | null;
  ctr: number | null;
  /** Texto curto, mostrado AO LADO do número. */
  premissas: string[];
}

/**
 * `impressões ≈ verba ÷ CPM × 1000`, `cliques ≈ impressões × CTR`.
 *
 * CPM em reais por mil impressões; CTR como fração (1% = 0.01). Ausentes, o
 * resultado é ZERO com premissa nomeada — chutar um número e pintá-lo de
 * estimativa é exatamente o que esta tela promete não fazer.
 */
export function simulacaoMidia(args: {
  verbaCents: number;
  cpm?: number | null;
  ctr?: number | null;
}): SimulacaoMidia {
  const cpm = args.cpm == null || args.cpm <= 0 ? null : args.cpm;
  const ctr = args.ctr == null || args.ctr < 0 ? null : args.ctr;
  const premissas: string[] = [];
  if (cpm == null) {
    premissas.push("CPM não informado — impressões indisponíveis.");
  } else {
    premissas.push(`CPM premissa: R$ ${cpm.toFixed(2)} por mil impressões.`);
  }
  if (ctr == null) {
    premissas.push("CTR não informado — cliques indisponíveis.");
  } else {
    premissas.push(`CTR premissa: ${(ctr * 100).toFixed(2)}%.`);
  }
  const impressoes =
    cpm == null ? 0 : Math.floor((Math.max(0, args.verbaCents) / 100 / cpm) * 1000);
  const cliques = ctr == null ? 0 : Math.floor(impressoes * ctr);
  return { impressoes, cliques, cpm, ctr, premissas };
}

/** O guard usa exatamente o vocabulário do consumo — sem segundo enum. */
export type EstadoGuard = EstadoOrcamento;

export interface LiberacaoDeOrcamento {
  /** Só gerente (ou admin) libera; a rota confere de novo o papel real. */
  papel: "manager" | "admin";
  motivo: string;
}

export interface GuardDeOrcamento {
  estado: EstadoGuard;
  pct: number;
  permite: boolean;
  liberado: boolean;
  proximoPasso: string;
}

/**
 * 80% avisa, 100% bloqueia — a mesma régua de `estadoDoOrcamento`. A liberação
 * de gerente SÓ existe com motivo escrito; a rota audita o motivo com o mesmo
 * padrão do override de crédito/estoque.
 */
export function guardOrcamento(args: {
  gastoCents: number;
  limiteCents: number | null | undefined;
  liberacao?: LiberacaoDeOrcamento | null;
}): GuardDeOrcamento {
  const decisao = estadoDoOrcamento(args.gastoCents, args.limiteCents);
  const base: GuardDeOrcamento = {
    estado: decisao.estado,
    pct: decisao.pct,
    permite: decisao.estado !== "bloqueio",
    liberado: false,
    proximoPasso:
      decisao.estado === "bloqueio"
        ? "Aumente o orçamento ou peça liberação de gerente com motivo."
        : decisao.estado === "aviso"
          ? `Acima de ${PCT_AVISO}%: acompanhe o consumo antes de continuar.`
          : "Sem bloqueio — pode continuar.",
  };
  if (decisao.estado !== "bloqueio") return base;
  const liberacao = args.liberacao;
  if (!liberacao || liberacao.motivo.trim() === "") return base;
  return {
    ...base,
    permite: true,
    liberado: true,
    proximoPasso: `Liberado por ${liberacao.papel} com motivo registrado (auditoria).`,
  };
}
