/**
 * QUANTO TEMPO O COLETOR PRECISA — regra pura, sem rede.
 *
 * O timeout do coletor era um número fixo (`MERCOS_SCRAPE_TIMEOUT_MS`, 30 min)
 * e não sabia o tamanho do alvo. Medido em 25/11/2026, no backfill de jan–fev:
 * 311 pedidos para reler, censo de ~13 min (296 páginas de lista) e ~4 s por
 * detalhe → **~34 min**, e o processo morreu com `coletor excedeu 1800s` depois
 * de importar zero. O erro não dizia que o alvo era grande, nem o que fazer.
 *
 * O piso daqui cobre os dois pedaços que existem de verdade:
 *
 *   censo .... 15 min (medido: 296 páginas em ~13 min no mesmo dia)
 *   detalhe .. espera por pedido × 2 (a folga absorve o recuo de 429, que é
 *              justamente o que acontece em lote grande)
 *   margem ... 5 min para login, navegador e gravação
 *
 * O limite efetivo é o MAIOR entre o configurado e o piso: quem configurou 90
 * min continua com 90; quem deixou o padrão não morre por ter alvo grande.
 */

const CENSO_MS = 15 * 60_000;
const MARGEM_MS = 5 * 60_000;

export function limiteDoColetor({ alvo = 0, esperaMs = 3000, baseMs = 1_800_000 } = {}) {
  const pedacos = Math.max(0, Number(alvo) || 0);
  const espera = Math.max(250, Number(esperaMs) || 3000);
  const base = Math.max(60_000, Number(baseMs) || 1_800_000);

  if (pedacos === 0) return base;
  const piso = CENSO_MS + pedacos * espera * 2 + MARGEM_MS;
  return Math.max(base, piso);
}

/** Mensagem de erro que diz o tamanho do alvo e o que fazer — não só o número. */
export function explicarEstouro({ alvo, esperaMs, limiteMs }) {
  const seg = Math.round(limiteMs / 1000);
  const pedacos = Math.max(0, Number(alvo) || 0);
  if (pedacos === 0) return `coletor excedeu ${seg}s`;
  const detalhe = Math.round((pedacos * (Number(esperaMs) || 3000)) / 1000);
  return (
    `coletor excedeu ${seg}s com alvo de ${pedacos} pedido(s) — só de detalhe são ~${detalhe}s ` +
    `a ${Math.round((Number(esperaMs) || 3000) / 1000)}s por pedido, além do censo. ` +
    `Aumente MERCOS_SCRAPE_TIMEOUT_MS ou divida o alvo em lotes menores.`
  );
}
