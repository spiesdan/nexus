/**
 * Máquina de estados da ocorrência — pura, testada e a ÚNICA regra de transição.
 *
 * A policy de RLS deixa `agent+` atualizar a linha (ela não enxerga qual coluna
 * mudou); é aqui que "ignorar" e "encerrar" viram decisão de gestor, e é aqui
 * que uma transição absurda (encerrada → aprovada) é recusada.
 */
import type { EstadoOcorrencia } from "./tipos";

export const TRANSICOES: Record<EstadoOcorrencia, readonly EstadoOcorrencia[]> = {
  // A ocorrência nasceu agora. Assumir, classificar ou fechar.
  nova: ["investigando", "acao_necessaria", "ignorada", "encerrada"],
  // Voltou depois de fechada: mesma saída, com memória de que já aconteceu.
  recorrente: ["investigando", "acao_necessaria", "ignorada", "encerrada"],
  investigando: ["acao_necessaria", "corrigida", "ignorada", "encerrada"],
  acao_necessaria: ["investigando", "aprovada", "corrigida", "ignorada", "encerrada"],
  aprovada: ["investigando", "corrigida", "encerrada"],
  corrigida: ["nova", "recorrente", "encerrada"],
  ignorada: ["nova", "recorrente", "encerrada"],
  encerrada: ["nova", "recorrente"],
};

/** Alvos que exigem gestor (decisão de negócio, não de operação). */
export const ALVOS_DE_GESTOR: readonly EstadoOcorrencia[] = [
  "aprovada",
  "ignorada",
  "encerrada",
  "nova",
  "recorrente",
];

export interface ValidacaoTransicao {
  ok: boolean;
  codigo?: "transicao_invalida" | "motivo_obrigatorio" | "papel_insuficiente";
  mensagem?: string;
}

export function validarTransicao(args: {
  de: EstadoOcorrencia;
  para: EstadoOcorrencia;
  motivo: string | null | undefined;
  podeGerir: boolean;
}): ValidacaoTransicao {
  const { de, para, motivo, podeGerir } = args;

  if (de === para) {
    return {
      ok: false,
      codigo: "transicao_invalida",
      mensagem: `A ocorrência já está em "${para}".`,
    };
  }

  if (!TRANSICOES[de].includes(para)) {
    return {
      ok: false,
      codigo: "transicao_invalida",
      mensagem: `Não é possível ir de "${de}" para "${para}".`,
    };
  }

  if (ALVOS_DE_GESTOR.includes(para) && !podeGerir) {
    return {
      ok: false,
      codigo: "papel_insuficiente",
      mensagem: "Só um gestor pode ignorar, encerrar, aprovar ou reabrir uma ocorrência.",
    };
  }

  if (para === "ignorada" && (motivo ?? "").trim().length < 3) {
    return {
      ok: false,
      codigo: "motivo_obrigatorio",
      mensagem: "Ignorar exige um motivo com pelo menos 3 caracteres.",
    };
  }

  return { ok: true };
}

export interface CamposDeMudanca {
  estado: EstadoOcorrencia;
  ignorada_motivo: string | null;
  motivo_encerramento: string | null;
  encerrada_em: string | null;
  responsavel_user_id?: string | null;
}

/**
 * Campos a gravar na transição. `agoraIso` entra como argumento para o teste
 * não depender do relógio.
 */
export function camposDaTransicao(args: {
  de: EstadoOcorrencia;
  para: EstadoOcorrencia;
  motivo: string | null | undefined;
  usuarioId: string;
  responsavelAtual: string | null;
  agoraIso: string;
}): CamposDeMudanca {
  const { para, motivo, usuarioId, responsavelAtual, agoraIso } = args;
  const motivoLimpo = (motivo ?? "").trim() || null;

  const encerrando = para === "ignorada" || para === "encerrada" || para === "corrigida";

  return {
    estado: para,
    ignorada_motivo: para === "ignorada" ? motivoLimpo : null,
    motivo_encerramento:
      para === "encerrada"
        ? (motivoLimpo ?? "encerrada_pelo_usuario")
        : para === "corrigida"
          ? (motivoLimpo ?? "marcada_como_corrigida")
          : null,
    encerrada_em: encerrando ? agoraIso : null,
    // A primeira pessoa que assume vira responsável; assumir de novo não rouba
    // a atribuição de quem já está com a ocorrência.
    ...(para === "investigando" && !responsavelAtual
      ? { responsavel_user_id: usuarioId }
      : {}),
  };
}
