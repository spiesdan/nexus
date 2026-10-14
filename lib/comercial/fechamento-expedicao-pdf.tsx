/**
 * A MATEMÁTICA DO FECHAMENTO DA CARGA — prestação de contas da rota.
 *
 * Este arquivo já desenhou a segunda metade do PDF de romaneio (o fechamento
 * em papel, com as linhas de caixa em branco). Não desenha mais: o fechamento
 * saiu do papel e vive no sistema (`PUT /api/v1/shipments/[id]/fechamento`,
 * tela `app/app/expedicao/[id]/_fechamento.tsx`). O que ficou aqui é a parte
 * que não depende de tinta — o resumo por parada e o agrupado por condição —
 * porque a tela e a API precisam do MESMO número, e duas implementações
 * divergem por centavos.
 *
 * O nome do arquivo manteve o sufixo `-pdf` de propósito: é onde a conta
 * nasceu, é onde os testes a procuram (`fechamento-expedicao.test.ts`), e
 * renomear arquivo com histórico por estética quebra quem lê o git log.
 * Quando a conta do caixa (`lib/comercial/fechamento-carga.ts`) e esta se
 * fundirem, aí sim o nome muda — junto, num commit só.
 *
 * Honestidade dos números (o que o banco NÃO tem não é inventado):
 * - "Pago" por parada sai PREENCHIDO só quando o pedido já tem recebível pago
 *   (antecipado/PIX antes da rota); o resto é conferência física — ☐ na tela.
 * - "A cobrar por condição" agrupa pelo texto da condição do pedido
 *   (heurística declarada em `classificarCondicao`) — é preparo de troco,
 *   não fato financeiro.
 */

export interface ParadaFechamento {
  sequencia: number;
  numero: number;
  cliente_nome: string;
  endereco_entrega: string | null;
  total_cents: number;
  condicao: string | null;
  situacao: string;
  motivo: string | null;
  entregue_em: string | null;
  volumes: number;
  /** Soma dos recebíveis PAGOS do pedido (antecipado). */
  pago_cents: number;
}

export interface ResumoFechamento {
  totalFaturado: number;
  pagoAntecipado: number;
  aCobrar: number;
  devolvido: number;
  volumes: number;
  concluidas: number;
  pendentes: number;
}

/** A conta do fechamento, pura e testável sem PDF. */
export function resumoDoFechamento(paradas: ParadaFechamento[]): ResumoFechamento {
  let totalFaturado = 0;
  let pagoAntecipado = 0;
  let aCobrar = 0;
  let devolvido = 0;
  let volumes = 0;
  let concluidas = 0;
  for (const p of paradas) {
    totalFaturado += p.total_cents;
    pagoAntecipado += Math.min(p.pago_cents, p.total_cents);
    volumes += p.volumes;
    if (p.situacao === "devolvido") {
      devolvido += p.total_cents;
      concluidas++;
    } else {
      if (p.situacao === "entregue") concluidas++;
      aCobrar += Math.max(0, p.total_cents - p.pago_cents);
    }
  }
  return {
    totalFaturado,
    pagoAntecipado,
    aCobrar,
    devolvido,
    volumes,
    concluidas,
    pendentes: paradas.length - concluidas,
  };
}

/**
 * Agrupa o "a cobrar" pelo texto da condição do pedido — preparo de troco
 * e maquininha, não fato financeiro. A classificação é por palavra-chave
 * (sem acento, minúscula); o que não casa cai em "Outros".
 */
export function classificarCondicao(condicao: string | null): string {
  const t = (condicao ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/(^|\W)(dinheiro|especie)($|\W)/.test(t)) return "Dinheiro";
  if (t.includes("pix")) return "PIX";
  if (/(cartao|debito|credito|maquininha)/.test(t)) return "Cartão";
  if (t.includes("boleto")) return "Boleto";
  if (/(prazo|faturado|\d+\s*dias|30|60|90|28)/.test(t)) return "A prazo";
  if (/(antecipado|a vista|avista|pago)/.test(t)) return "Pago antecipado";
  return "Outros";
}

/** A cobrar (não-devolvidos, abatendo antecipado) por condição informada. */
export function aCobrarPorCondicao(paradas: ParadaFechamento[]): { condicao: string; valor_cents: number }[] {
  const mapa = new Map<string, number>();
  for (const p of paradas) {
    if (p.situacao === "devolvido") continue;
    const falta = Math.max(0, p.total_cents - p.pago_cents);
    if (falta <= 0) continue;
    const chave = classificarCondicao(p.condicao);
    mapa.set(chave, (mapa.get(chave) ?? 0) + falta);
  }
  return [...mapa.entries()]
    .map(([condicao, valor_cents]) => ({ condicao, valor_cents }))
    .sort((a, b) => b.valor_cents - a.valor_cents);
}

