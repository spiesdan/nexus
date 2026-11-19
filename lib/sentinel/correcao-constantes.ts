/**
 * O ÚNICO caso de correção aprovada da v1.3 — e por que ele é este.
 *
 * `operacao.job_fila_travado` sobre um job `watchdog` **pendente e atrasado**:
 * antecipar `run_after` para agora. É manutenção interna (não envia mensagem ao
 * cliente), não toca dinheiro nem fisco, e a reversão é honesta enquanto o job
 * continua `pending` com o `run_after` que gravamos — depois de reclamado, o
 * sistema recusa reverter em vez de fingir.
 *
 * NÃO são corrigíveis, de propósito:
 *  - nota, pagamento, recebível, pedido, estoque e campanha (dinheiro/fisco);
 *  - job `running`/`dead` (não há antes/depois reversível);
 *  - job `inbound_turn`/`followup_turn`/`flywheel` (o efeito inclui envio
 *    externo; reenfileirar não é uma decisão que a máquina deva tomar).
 *
 * Sem `node:crypto` aqui: este módulo é importado pela tela (client component).
 * O hash e o planejamento ficam em `correcao.ts`, server-only.
 */
export const CORRECAO_JOB = {
  regra: "operacao.job_fila_travado",
  entidadeTipo: "job_queue",
  kind: "watchdog",
  /** Mesmo piso do detector: só corrige o que a ocorrência realmente viu. */
  atrasoMinimoMs: 2 * 60 * 60 * 1000,
} as const;

export function correcaoDeJobSuportada(regra: string, entidadeTipo: string): boolean {
  return regra === CORRECAO_JOB.regra && entidadeTipo === CORRECAO_JOB.entidadeTipo;
}

/**
 * Segundo caso corrigível (0328): conversa com claim parado.
 *
 * Diferente do job, aqui a ação devolve a conversa para a FILA (`open`, sem
 * responsável). O CAS é `status='claimed'` + `assigned_to_user_id` +
 * `assigned_at`; a reversão só vale enquanto ninguém assumiu de novo.
 */
export const CORRECAO_CONVERSA = {
  regra: "operacao.conversa_claim_parado",
  entidadeTipo: "conversations",
  /** Mesmo piso do detector: claim sem mensagem há 7 dias. */
  atrasoMinimoMs: 7 * 24 * 60 * 60 * 1000,
} as const;

export function correcaoDeConversaSuportada(regra: string, entidadeTipo: string): boolean {
  return regra === CORRECAO_CONVERSA.regra && entidadeTipo === CORRECAO_CONVERSA.entidadeTipo;
}
