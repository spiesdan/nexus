/**
 * Observabilidade da correção aprovada (Nível 2) — SÓ LEITURA.
 *
 * A 0325 promete duas coisas que a tela não consegue mostrar sozinha:
 *
 *  1. a reversão é honesta enquanto o job continua `pending` com o `run_after`
 *     que a correção gravou. Se o worker reclamou ou alguém mudou o horário,
 *     reverter seria mentira — e agora existe uma ocorrência dizendo isso;
 *  2. a execução tem de acontecer dentro de 5 min do plano revisado. Aprovação
 *     que passou da janela precisa de nova simulação/confirmação, não de um
 *     "executar" que a RPC vai recusar.
 *
 * Nenhum detector executa, reverte ou aprova. Eles leem o snapshot (que inclui
 * ocorrências/eventos do próprio Sentinel e o job atual) e abrem ocorrência.
 */
import type { Achado, Snapshot } from "./tipos";
import { MINUTO_MS } from "./utilitarios";

/** A MESMA janela que `fn_sentinel_corrigir_job` impõe ao dry-run. */
export const JANELA_APROVACAO_MS = 5 * MINUTO_MS;

function mesmaData(a: string, b: string): boolean {
  const ma = Date.parse(a);
  const mb = Date.parse(b);
  return Number.isFinite(ma) && Number.isFinite(mb) && ma === mb;
}

export function correcaoSemReversao(s: Snapshot): Achado[] {
  return s.correcoes.flatMap((c) => {
    if (c.estado !== "corrigida" || !c.correcao) return [];

    let motivo: string;
    let causa: string;
    if (!c.job) {
      motivo = "job_ausente";
      causa = "O job da correção não existe mais; não há linha para restaurar.";
    } else if (c.job.status !== "pending") {
      motivo = `job_${c.job.status}`;
      causa = `O worker reclamou o job (status \`${c.job.status}\`); a reversão não tem mais o que restaurar.`;
    } else if (!mesmaData(c.job.run_after, c.correcao.run_after_depois)) {
      motivo = "run_after_alterado";
      causa =
        "O `run_after` do job mudou depois da correção; restaurar o valor antigo não desfaria o que aconteceu.";
    } else {
      return [];
    }

    return [
      {
        regra: "operacao.correcao_sem_reversao" as const,
        categoria: "operacao" as const,
        entidadeTipo: "sentinel_occurrences",
        entidadeId: c.ocorrencia_id,
        titulo: "Correção aprovada sem caminho de reversão",
        resumo:
          "A correção de antecipação foi aplicada, mas o job saiu do estado que a reversão exigia. O efeito não pode ser desfeito pela máquina.",
        causaProvavel: causa,
        severidade: "media" as const,
        href: "/app/sentinel",
        evidencia: {
          ocorrencia_id: c.ocorrencia_id,
          job_id: c.correcao.job_id,
          status_atual: c.job?.status ?? null,
          run_after_atual: c.job?.run_after ?? null,
          run_after_gravado: c.correcao.run_after_depois,
          corrigida_em: c.correcao.executada_em,
          motivo,
        },
      },
    ];
  });
}

export function aprovacaoExpirada(s: Snapshot): Achado[] {
  return s.correcoes.flatMap((c) => {
    if (c.estado !== "aprovada" || !c.aprovada_em) return [];
    const aprovadaMs = Date.parse(c.aprovada_em);
    if (!Number.isFinite(aprovadaMs)) return [];
    const idade = s.agoraMs - aprovadaMs;
    if (idade <= JANELA_APROVACAO_MS) return [];

    const minutos = Math.floor(idade / MINUTO_MS);
    return [
      {
        regra: "operacao.aprovacao_expirada" as const,
        categoria: "operacao" as const,
        entidadeTipo: "sentinel_occurrences",
        entidadeId: c.ocorrencia_id,
        titulo: `Aprovação de correção vencida há ${minutos} min`,
        resumo:
          "A ocorrência está aprovada, mas a janela de 5 min do plano revisado passou. Executar exige nova simulação e confirmação.",
        causaProvavel:
          "A aprovação foi registrada e a execução não aconteceu dentro da janela; o plano simulado já não vale.",
        severidade: "baixa" as const,
        href: "/app/sentinel",
        evidencia: {
          ocorrencia_id: c.ocorrencia_id,
          job_id: c.job_id,
          aprovada_em: c.aprovada_em,
          idade_min: minutos,
          janela_min: Math.round(JANELA_APROVACAO_MS / MINUTO_MS),
        },
      },
    ];
  });
}
