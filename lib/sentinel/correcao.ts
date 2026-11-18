/**
 * Nível 2 — o plano de correção APROVADA e o antes/depois que a autoriza.
 *
 * Toda a decisão de "pode ou não" mora aqui, pura e testável. A rota não
 * inventa elegibilidade: ela carrega o job, chama `planejarAntecipacao` e, se
 * elegível, manda o MESMO `antes`/`depois`/`hash` para a RPC atômica. O hash
 * amarra o que o gestor viu ao que será executado; job que mudou no meio do
 * caminho casa fora e a execução é recusada (409), não "corrigida" por engano.
 *
 * Server-only (usa `node:crypto`). A tela importa `correcao-constantes.ts`.
 */
import { createHash } from "node:crypto";

import { CORRECAO_JOB } from "./correcao-constantes";

export interface JobCorrigivel {
  id: string;
  organization_id: string;
  kind: string;
  status: string;
  run_after: string;
  attempts: number;
  max_attempts: number;
}

export interface PlanoAntecipacao {
  jobId: string;
  /** Valores exatos como vieram do banco (timestamptz) — o CAS compara valor. */
  antes: { run_after: string };
  depois: { run_after: string };
  hash: string;
  resumo: string;
  risco: "baixo";
  reversibilidade: "reversivel";
}

export type ResultadoPlano =
  | { elegivel: true; plano: PlanoAntecipacao }
  | { elegivel: false; motivo: string };

export function hashDaCorrecao(jobId: string, antesIso: string, depoisIso: string): string {
  return createHash("sha256").update(`${jobId}|${antesIso}|${depoisIso}`, "utf8").digest("hex");
}

/**
 * Antecipar job de manutenção pendente e atrasado.
 *
 * `agoraIso` entra como argumento para o teste não depender do relógio. O
 * `antes` é o texto EXATO devolvido pelo banco: converter para Date e voltar
 * perderia microssegundos e o `where run_after = $antes` da RPC nunca casaria.
 */
export function planejarAntecipacao(
  job: JobCorrigivel | null,
  agoraIso: string,
): ResultadoPlano {
  if (!job) return { elegivel: false, motivo: "Job não encontrado nesta organização." };
  if (job.kind !== CORRECAO_JOB.kind) {
    return {
      elegivel: false,
      motivo:
        "Só job de manutenção (`watchdog`) é corrigível. Job de atendimento pode enviar mensagem ao cliente; reenfileirar não é decisão automática.",
    };
  }
  if (job.status !== "pending") {
    return {
      elegivel: false,
      motivo: `Job está \`${job.status}\`; a antecipação só é honesta em \`pending\` (em \`running\`/\`dead\` não há antes/depois reversível).`,
    };
  }

  const antesMs = Date.parse(job.run_after);
  const agoraMs = Date.parse(agoraIso);
  if (!Number.isFinite(antesMs) || !Number.isFinite(agoraMs)) {
    return { elegivel: false, motivo: "Data do job ilegível; não há como garantir o antes/depois." };
  }
  if (agoraMs - antesMs < CORRECAO_JOB.atrasoMinimoMs) {
    return {
      elegivel: false,
      motivo: "O job não está atrasado o bastante para ser o mesmo caso da ocorrência (piso de 2 h).",
    };
  }
  if (job.attempts >= job.max_attempts) {
    return {
      elegivel: false,
      motivo: "O job já esgotou as tentativas; antecipar não resolve e a reversão deixaria de ser honesta.",
    };
  }

  const depois = new Date(agoraMs).toISOString();
  return {
    elegivel: true,
    plano: {
      jobId: job.id,
      antes: { run_after: job.run_after },
      depois: { run_after: depois },
      hash: hashDaCorrecao(job.id, job.run_after, depois),
      resumo: "Antecipar o job de manutenção pendente para agora.",
      risco: "baixo",
      reversibilidade: "reversivel",
    },
  };
}
