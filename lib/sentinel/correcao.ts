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

import { CORRECAO_CONVERSA, CORRECAO_JOB } from "./correcao-constantes";

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

export interface ConversaCorrigivel {
  id: string;
  organization_id: string;
  status: string;
  assigned_to_user_id: string | null;
  assigned_at: string | null;
  last_message_at: string | null;
}

export interface PlanoLiberacaoConversa {
  conversaId: string;
  antes: { atendente_id: string; assigned_at: string };
  depois: { status: "open"; atendente_id: null; assigned_at: null };
  hash: string;
  resumo: string;
  risco: "baixo";
  reversibilidade: "reversivel";
}

export type ResultadoPlanoConversa =
  | { elegivel: true; plano: PlanoLiberacaoConversa }
  | { elegivel: false; motivo: string };

/**
 * Liberar claim de conversa parada. `agoraIso` é argumento para o teste; o
 * `antes` é o texto EXATO do banco (assigned_at com microssegundos), porque o
 * CAS da RPC compara o valor.
 */
export function planejarLiberacaoConversa(
  conversa: ConversaCorrigivel | null,
  agoraIso: string,
): ResultadoPlanoConversa {
  if (!conversa) return { elegivel: false, motivo: "Conversa não encontrada nesta organização." };
  if (conversa.status !== "claimed") {
    return { elegivel: false, motivo: `A conversa está \`${conversa.status}\`; só claim ativo é liberável.` };
  }
  if (!conversa.assigned_to_user_id || !conversa.assigned_at) {
    return { elegivel: false, motivo: "A conversa não tem responsável/claim para liberar." };
  }
  const assumidaEm = Date.parse(conversa.assigned_at);
  const agoraMs = Date.parse(agoraIso);
  if (!Number.isFinite(assumidaEm) || !Number.isFinite(agoraMs)) {
    return { elegivel: false, motivo: "Data do claim ilegível; não há como garantir o antes/depois." };
  }
  if (agoraMs - assumidaEm < CORRECAO_CONVERSA.atrasoMinimoMs) {
    return { elegivel: false, motivo: "O claim não está parado o bastante (piso de 7 dias)." };
  }
  if (conversa.last_message_at) {
    const ultima = Date.parse(conversa.last_message_at);
    if (Number.isFinite(ultima) && agoraMs - ultima < CORRECAO_CONVERSA.atrasoMinimoMs) {
      return { elegivel: false, motivo: "Há mensagem recente; a conversa não está esquecida." };
    }
  }

  return {
    elegivel: true,
    plano: {
      conversaId: conversa.id,
      antes: {
        atendente_id: conversa.assigned_to_user_id,
        assigned_at: conversa.assigned_at,
      },
      depois: { status: "open", atendente_id: null, assigned_at: null },
      hash: hashDaCorrecao(
        conversa.id,
        `${conversa.assigned_to_user_id}|${conversa.assigned_at}`,
        "open",
      ),
      resumo: "Devolver a conversa para a fila, sem responsável.",
      risco: "baixo",
      reversibilidade: "reversivel",
    },
  };
}
