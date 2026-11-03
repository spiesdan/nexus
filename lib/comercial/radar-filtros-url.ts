import {
  FILTRO_RADAR_VAZIO,
  type FiltroRadar,
  type NivelRadar,
} from "./radar-score";

/**
 * O RECORTE DO RADAR MORA NA URL.
 *
 * O Radar deixou de ser uma página só: visão geral, categorias e oportunidades
 * são endereços diferentes, e o recorte (busca, vendedor, cidade, nível…) vale
 * nos três. Estado em `useState` morreria na primeira navegação — a pessoa
 * filtraria "Joinville", clicaria em Oportunidades e voltaria para a carteira
 * inteira sem entender por quê.
 *
 * A URL resolve as três coisas de uma vez: sobrevive à navegação, sobrevive ao
 * F5 e vira link que se manda para outra pessoa. As chaves são curtas porque
 * aparecem na barra de endereço (`?niveis=risco,critico&diasmin=30`).
 *
 * Nada aqui confia no que veio da URL: valor fora da faixa é descartado, não
 * corrigido em silêncio. Um `niveis=banana` não pode virar "todos os níveis" —
 * isso mostraria mais gente do que a pessoa pediu.
 */

const NIVEIS: readonly NivelRadar[] = ["saudavel", "atencao", "risco", "critico"];

/** Períodos oferecidos na tela. Um número qualquer na URL é lixo, não um recorte. */
const PERIODOS = new Set([30, 60, 90]);

const LIMITE_TEXTO = 80;

function texto(valor: string | null): string {
  if (!valor) return "";
  return valor.slice(0, LIMITE_TEXTO);
}

function inteiroNaoNegativo(valor: string | null): number {
  if (!valor) return 0;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), 1_000_000_000);
}

/** Aceita `URLSearchParams` e o objeto equivalente do Next (só o `get`). */
type Parametros = { get(nome: string): string | null };

export function lerFiltrosDaUrl(params: Parametros): FiltroRadar {
  const periodo = params.get("periodo");
  const periodoDias = periodo != null && PERIODOS.has(Number(periodo)) ? Number(periodo) : null;

  const niveis = (params.get("niveis") ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter((n): n is NivelRadar => (NIVEIS as readonly string[]).includes(n));

  return {
    ...FILTRO_RADAR_VAZIO,
    busca: texto(params.get("busca")),
    vendedor: texto(params.get("vendedor")),
    cidade: texto(params.get("cidade")),
    niveis: [...new Set(niveis)],
    periodoDias,
    diasMin: inteiroNaoNegativo(params.get("diasmin")),
    ticketMinCents: inteiroNaoNegativo(params.get("ticketmin")),
  };
}

/**
 * A querystring do recorte, sem `?`, na ordem fixa das chaves.
 *
 * Devolve `""` quando o recorte é o vazio: endereço limpo é a informação de
 * que não há recorte — `?busca=&niveis=` faria a pessoa achar que filtrou.
 */
export function filtrosParaUrl(f: FiltroRadar): string {
  const params = new URLSearchParams();
  const busca = f.busca.trim();
  if (busca) params.set("busca", busca);
  if (f.vendedor) params.set("vendedor", f.vendedor);
  const cidade = f.cidade.trim();
  if (cidade) params.set("cidade", cidade);
  if (f.periodoDias != null) params.set("periodo", String(f.periodoDias));
  if (f.niveis.length > 0) params.set("niveis", [...f.niveis].sort().join(","));
  if (f.diasMin > 0) params.set("diasmin", String(f.diasMin));
  if (f.ticketMinCents > 0) params.set("ticketmin", String(f.ticketMinCents));
  return params.toString();
}

/**
 * Leva o recorte para outro endereço do Radar.
 *
 * Preserva a querystring que já existir no destino (ex.: `?situacao=em_risco`
 * vindo de um KPI) e tem o recorte por último: duas origens de parâmetro na
 * mesma URL sem uma ordem fixa produzem links diferentes para a mesma tela.
 */
export function comRecorte(href: string, f: FiltroRadar): string {
  const recorte = filtrosParaUrl(f);
  if (!recorte) return href;
  const [caminho, query = ""] = href.split("?");
  const existentes = new URLSearchParams(query);
  for (const [chave, valor] of new URLSearchParams(recorte)) existentes.set(chave, valor);
  return `${caminho}?${existentes.toString()}`;
}
