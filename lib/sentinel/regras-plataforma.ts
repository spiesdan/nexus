/**
 * SLO da própria plataforma — o Sentinel vigia a série de API (0330/0331).
 *
 * Sem amostra suficiente não há achado: a rodada declara "sem histórico" no
 * detalhe, não abre ocorrência. O fingerprint é estável por SLO
 * (`plataforma.slo_estourado|slo|disponibilidade|latencia`), então reexecutar
 * atualiza a mesma ocorrência em vez de duplicar.
 */
import type { Achado, Severidade, SloPorRota, Snapshot } from "./tipos";

/** Piso de amostras da janela de 7 dias, o mesmo da tela. */
export const MIN_AMOSTRAS_SLO = 100;
export const ALVO_DISPONIBILIDADE = 99.5;
export const ALVO_P95_MS = 800;
export const JANELA_DIAS = 7;

function severidadePorDisponibilidade(pct: number): Severidade {
  if (pct < 90) return "critica";
  if (pct < 95) return "alta";
  return "media";
}

function severidadePorLatencia(p95: number): Severidade {
  if (p95 > 1_600) return "critica";
  if (p95 > 1_200) return "alta";
  return "media";
}

function rotasCom5xx(rotas: SloPorRota[]): string[] {
  return rotas
    .filter((r) => r.erros > 0)
    .sort((a, b) => b.erros - a.erros)
    .slice(0, 8)
    .map((r) => `${r.route}: ${r.erros}/${r.total}`);
}

function rotasLentas(rotas: SloPorRota[]): string[] {
  return rotas
    .filter((r) => r.p95 !== null)
    .sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0))
    .slice(0, 8)
    .map((r) => `${r.route}: p95 ${Math.round(r.p95 ?? 0)} ms (${r.total} amostras)`);
}

export function slosEstourados(s: Snapshot): Achado[] | null {
  const resumo = s.sloApi;
  if (!resumo || resumo.total < MIN_AMOSTRAS_SLO) return null;

  const achados: Achado[] = [];
  const disponibilidade = Math.round((1 - resumo.erros / resumo.total) * 1000) / 10;

  if (disponibilidade < ALVO_DISPONIBILIDADE) {
    achados.push({
      regra: "plataforma.slo_estourado",
      categoria: "plataforma",
      entidadeTipo: "slo",
      entidadeId: "disponibilidade",
      titulo: `Disponibilidade da API em ${String(disponibilidade).replace(".", ",")}% (alvo ${String(ALVO_DISPONIBILIDADE).replace(".", ",")}%)`,
      resumo: `${resumo.erros} de ${resumo.total} requisições das rotas quentes responderam 5xx nos últimos ${JANELA_DIAS} dias.`,
      causaProvavel:
        "A série mostra o efeito; a causa provável está na rota que concentra os 5xx. Confira o request id e o log api.5xx antes de agir.",
      severidade: severidadePorDisponibilidade(disponibilidade),
      href: "/admin/observabilidade",
      evidencia: {
        janela_dias: JANELA_DIAS,
        total: resumo.total,
        erros_5xx: resumo.erros,
        disponibilidade_pct: disponibilidade,
        alvo_pct: ALVO_DISPONIBILIDADE,
        rotas_com_5xx: rotasCom5xx(resumo.rotas),
      },
    });
  }

  if (resumo.p95 !== null && resumo.p95 > ALVO_P95_MS) {
    achados.push({
      regra: "plataforma.slo_estourado",
      categoria: "plataforma",
      entidadeTipo: "slo",
      entidadeId: "latencia",
      titulo: `Latência das listas em p95 ${Math.round(resumo.p95)} ms (alvo ${ALVO_P95_MS} ms)`,
      resumo: `O p95 das rotas quentes passou de ${ALVO_P95_MS} ms nos últimos ${JANELA_DIAS} dias, com ${resumo.total} amostras.`,
      causaProvavel:
        "A série mostra o efeito; veja a rota mais lenta antes de mexer em índice ou teto. O doc 42 separa consulta cara de volume.",
      severidade: severidadePorLatencia(resumo.p95),
      href: "/admin/observabilidade",
      evidencia: {
        janela_dias: JANELA_DIAS,
        total: resumo.total,
        p95_ms: Math.round(resumo.p95),
        alvo_ms: ALVO_P95_MS,
        rotas_lentas: rotasLentas(resumo.rotas),
      },
    });
  }

  return achados;
}
