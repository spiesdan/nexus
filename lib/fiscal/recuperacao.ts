/**
 * A RECUPERAÇÃO DE UMA NOTA CUJO JOB FICOU "PROCESSANDO" PARA SEMPRE.
 *
 * ─── O DEFEITO QUE ISTO CORRIGE ────────────────────────────────────────────
 *
 * O drain reivindica o job com `update ... where status = 'pendente'` e o
 * marca `processando` ANTES de falar com a SEFAZ. Se o processo morre no meio
 * (deploy, OOM, kill), o job fica `processando` e a nota fica `em_emissao`
 * para sempre: nenhum tick olha para jobs `processando`, e a tela mostra
 * "Emitindo" indefinidamente.
 *
 * `POST /invoices/[id]/reemitir` existia justamente para isso — o comentário
 * da rota diz "volta nota `erro` (ou `em_emissao` travada) para a fila" — mas
 * a máquina de estados proíbe `em_emissao → em_emissao`, então a recuperação
 * devolvia 422 sempre. A única saída era editar o banco.
 *
 * ─── A REGRA, SEM INVENTAR ────────────────────────────────────────────────
 *
 * Reemitir NÃO transmite nada: devolve a nota à fila (ou confirma que ela já
 * está nela). A decisão depende só do estado do job aberto:
 *
 *   nota `erro` + job pendente                → já na fila
 *   nota `erro` + sem job                     → enfileirar
 *   nota `em_emissao` + job pendente          → já na fila
 *   nota `em_emissao` + job processando fresco → aguardar (409)
 *   nota `em_emissao` + job processando velho  → reabrir o job
 *   nota `em_emissao` + sem job (órfã)        → enfileirar
 *
 * "Velho" é o job cujo `updated_at` passou do teto de processamento. O teto é
 * folgado de propósito: um tick do drain processa até 2 jobs e cada emissão
 * pode levar ~2 min na SEFAZ. Reabrir cedo demais transmitiria o mesmo
 * documento duas vezes; tarde demais a nota fica presa. 15 min é maior que
 * qualquer tick legítimo e continua sendo recuperação, não espera eterna.
 *
 * Notas terminais (autorizada/denegada/cancelada) nunca voltam: história
 * fiscal não se reescreve.
 */

export const LIMITE_PROCESSANDO_MIN = 15;

export type StatusDaNotaNaRecuperacao =
  | "pendente"
  | "em_emissao"
  | "erro"
  | "autorizada"
  | "denegada"
  | "cancelada";

export interface JobAberto {
  id: string;
  status: "pendente" | "processando";
  updated_at: string;
}

export type PlanoDeRecuperacao =
  | { acao: "enfileirar"; reabrirJob: JobAberto | null }
  | { acao: "ja_na_fila"; job: JobAberto }
  | { acao: "aguardar_processamento"; job: JobAberto }
  | { acao: "recusar"; motivo: string };

export function jobDeProcessamentoTravado(
  job: JobAberto | null | undefined,
  agora: Date,
  limiteMin: number = LIMITE_PROCESSANDO_MIN,
): job is JobAberto {
  if (!job || job.status !== "processando") return false;
  const atualizadoEm = Date.parse(job.updated_at);
  if (!Number.isFinite(atualizadoEm)) return false;
  return agora.getTime() - atualizadoEm >= limiteMin * 60_000;
}

export function planejarRecuperacao(
  statusDaNota: StatusDaNotaNaRecuperacao,
  job: JobAberto | null | undefined,
  agora: Date,
): PlanoDeRecuperacao {
  if (statusDaNota === "autorizada" || statusDaNota === "denegada" || statusDaNota === "cancelada") {
    return {
      acao: "recusar",
      motivo: `Nota ${statusDaNota} é terminal — não volta para emissão.`,
    };
  }

  if (job?.status === "pendente") {
    return { acao: "ja_na_fila", job };
  }

  if (job?.status === "processando") {
    if (jobDeProcessamentoTravado(job, agora)) {
      return { acao: "enfileirar", reabrirJob: job };
    }
    return { acao: "aguardar_processamento", job };
  }

  // Sem job aberto: `erro` é o caso normal de retry, e `em_emissao` é a nota
  // órfã que ficou sem job (insert interrompido). As duas são recuperáveis.
  return { acao: "enfileirar", reabrirJob: null };
}
