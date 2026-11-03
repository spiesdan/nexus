/**
 * Os números dos relatórios — calculados em UM lugar.
 *
 * A regra que este arquivo existe para cumprir: a soma do relatório tem que ser
 * a soma do banco. Se cada tela somasse por conta própria, a diferença
 * apareceria como "relatório errado" sem ninguém saber qual dos dois está
 * certo. Aqui as funções são puras: recebem as linhas que a rota leu e devolvem
 * os totais — e `relatorios.test.ts` prova com massa fixa que a soma fecha.
 *
 * O que NÃO é feito aqui: inventar período, arredondar centavo ou tratar
 * documento cancelado como compra. Cancelada entra na contagem e no valor
 * "cancelado", nunca no total de compras — quem comprou não comprou o que foi
 * cancelado.
 */
import type { TotaisDaNota } from "@/lib/schemas/fiscal-entrada";

export interface LinhaDeEntrada {
  id: string;
  chave: string;
  emitente_nome: string;
  emitente_cnpj: string;
  dh_emi: string | null;
  valor_total_cents: number;
  situacao_fiscal: string;
  conferencia_status: string;
  supplier_id: string | null;
  totais_json: TotaisDaNota | null;
  /** Só para exibir a identificação na lista; não entra em nenhuma soma. */
  numero?: number | null;
  serie?: string | null;
}

export interface LinhaDeItem {
  entrada_id: string;
  codigo: string;
  descricao: string;
  ncm: string | null;
  unidade: string | null;
  quantidade: number;
  valor_total_cents: number;
  icms_cents: number;
  ipi_cents: number;
  pis_cents: number;
  cofins_cents: number;
}

const CANCELADAS = new Set(["cancelada", "denegada"]);

export function estaCancelada(linha: Pick<LinhaDeEntrada, "situacao_fiscal">): boolean {
  return CANCELADAS.has(linha.situacao_fiscal);
}

/** Mês de competência (`YYYY-MM`) da data de emissão; sem data, `sem-data`. */
export function mesDaEntrada(dhEmi: string | null): string {
  if (!dhEmi) return "sem-data";
  const d = new Date(dhEmi);
  if (Number.isNaN(d.getTime())) return "sem-data";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface ResumoDoPeriodo {
  notas: number;
  /** Só as não canceladas. */
  notas_validas: number;
  canceladas: number;
  valor_cents: number;
  produtos_cents: number;
  impostos_cents: number;
  icms_cents: number;
  ipi_cents: number;
  pis_cents: number;
  cofins_cents: number;
  frete_cents: number;
  desconto_cents: number;
  por_situacao: Record<string, number>;
  por_conferencia: Record<string, number>;
}

export function resumoDoPeriodo(linhas: LinhaDeEntrada[]): ResumoDoPeriodo {
  const resumo: ResumoDoPeriodo = {
    notas: linhas.length,
    notas_validas: 0,
    canceladas: 0,
    valor_cents: 0,
    produtos_cents: 0,
    impostos_cents: 0,
    icms_cents: 0,
    ipi_cents: 0,
    pis_cents: 0,
    cofins_cents: 0,
    frete_cents: 0,
    desconto_cents: 0,
    por_situacao: {},
    por_conferencia: {},
  };

  for (const linha of linhas) {
    resumo.por_situacao[linha.situacao_fiscal] =
      (resumo.por_situacao[linha.situacao_fiscal] ?? 0) + 1;
    resumo.por_conferencia[linha.conferencia_status] =
      (resumo.por_conferencia[linha.conferencia_status] ?? 0) + 1;
    if (estaCancelada(linha)) {
      resumo.canceladas++;
      continue;
    }
    const t = linha.totais_json ?? {};
    resumo.notas_validas++;
    resumo.valor_cents += linha.valor_total_cents;
    resumo.produtos_cents += t.produtos_cents ?? 0;
    resumo.impostos_cents += t.impostos_cents ?? 0;
    resumo.icms_cents += t.icms_cents ?? 0;
    resumo.ipi_cents += t.ipi_cents ?? 0;
    resumo.pis_cents += t.pis_cents ?? 0;
    resumo.cofins_cents += t.cofins_cents ?? 0;
    resumo.frete_cents += t.frete_cents ?? 0;
    resumo.desconto_cents += t.desconto_cents ?? 0;
  }

  return resumo;
}

export interface LinhaPorChave {
  chave: string;
  rotulo: string;
  notas: number;
  valor_cents: number;
  impostos_cents: number;
}

/** Agrupa por uma chave qualquer (fornecedor, mês…), ignorando canceladas. */
export function agruparPor(
  linhas: LinhaDeEntrada[],
  chaveDe: (linha: LinhaDeEntrada) => { chave: string; rotulo: string },
): LinhaPorChave[] {
  const mapa = new Map<string, LinhaPorChave>();
  for (const linha of linhas) {
    if (estaCancelada(linha)) continue;
    const { chave, rotulo } = chaveDe(linha);
    const atual = mapa.get(chave) ?? {
      chave,
      rotulo,
      notas: 0,
      valor_cents: 0,
      impostos_cents: 0,
    };
    atual.notas++;
    atual.valor_cents += linha.valor_total_cents;
    atual.impostos_cents += linha.totais_json?.impostos_cents ?? 0;
    mapa.set(chave, atual);
  }
  return [...mapa.values()].sort((a, b) => b.valor_cents - a.valor_cents);
}

export function porFornecedor(linhas: LinhaDeEntrada[]): LinhaPorChave[] {
  return agruparPor(linhas, (l) => ({
    chave: l.supplier_id ?? l.emitente_cnpj ?? "sem-cnpj",
    rotulo: l.emitente_nome || l.emitente_cnpj || "Fornecedor sem nome",
  }));
}

export function porMes(linhas: LinhaDeEntrada[]): LinhaPorChave[] {
  return agruparPor(linhas, (l) => ({ chave: mesDaEntrada(l.dh_emi), rotulo: mesDaEntrada(l.dh_emi) }))
    .sort((a, b) => a.chave.localeCompare(b.chave));
}

export interface LinhaDeProduto {
  codigo: string;
  descricao: string;
  ncm: string | null;
  unidade: string | null;
  notas: number;
  quantidade: number;
  valor_total_cents: number;
  icms_cents: number;
  ipi_cents: number;
  pis_cents: number;
  cofins_cents: number;
}

/**
 * Produtos mais comprados — agrupa por código do fornecedor + NCM.
 *
 * O código sozinho não basta: dois fornecedores podem usar "001" para coisas
 * diferentes. NCM junto evita juntar o que não é o mesmo produto; quando falta
 * NCM, o código ainda agrupa (é o que dá para saber).
 */
export function produtosMaisComprados(itens: LinhaDeItem[]): LinhaDeProduto[] {
  const mapa = new Map<string, LinhaDeProduto>();
  for (const item of itens) {
    const chave = `${item.codigo.trim()}\u0000${(item.ncm ?? "").trim()}`;
    const atual = mapa.get(chave) ?? {
      codigo: item.codigo.trim(),
      descricao: item.descricao,
      ncm: item.ncm,
      unidade: item.unidade,
      notas: 0,
      quantidade: 0,
      valor_total_cents: 0,
      icms_cents: 0,
      ipi_cents: 0,
      pis_cents: 0,
      cofins_cents: 0,
    };
    atual.notas++;
    atual.quantidade += Number(item.quantidade) || 0;
    atual.valor_total_cents += item.valor_total_cents;
    atual.icms_cents += item.icms_cents;
    atual.ipi_cents += item.ipi_cents;
    atual.pis_cents += item.pis_cents;
    atual.cofins_cents += item.cofins_cents;
    mapa.set(chave, atual);
  }
  return [...mapa.values()].sort((a, b) => b.valor_total_cents - a.valor_total_cents);
}
