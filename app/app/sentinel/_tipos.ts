import type { Categoria, EstadoOcorrencia, Recomendacao, Severidade } from "@/lib/sentinel/tipos";

export type EvidenciaSentinel = Record<string, unknown>;

export interface OcorrenciaSentinel {
  id: string;
  regra: string;
  categoria: Categoria;
  entidade_tipo: string;
  entidade_id: string;
  titulo: string;
  resumo: string | null;
  causa_provavel: string | null;
  severidade: Severidade;
  estado: EstadoOcorrencia;
  evidencia: EvidenciaSentinel;
  recomendacao: Recomendacao | Record<string, never> | null;
  href: string | null;
  primeira_vista_em: string;
  ultima_vista_em: string;
  vezes_vista: number;
  recorrencias: number;
  responsavel_user_id: string | null;
  ignorada_motivo: string | null;
  motivo_encerramento: string | null;
  encerrada_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExecucaoSentinel {
  id: string;
  origem: "manual" | "cron" | "api";
  status: "executando" | "sucesso" | "parcial" | "erro" | "ignorada";
  iniciado_em: string;
  finalizado_em: string | null;
  duracao_ms: number | null;
  achados: number;
  criadas: number;
  reafirmadas: number;
  encerradas: number;
  erros: number;
  truncado: boolean;
  erro: string | null;
}

export interface EventoSentinel {
  id: string;
  tipo: string;
  estado_anterior: string | null;
  estado_novo: string | null;
  origem: "sentinel" | "usuario" | "sistema";
  ator_user_id: string | null;
  detalhe: EvidenciaSentinel;
  created_at: string;
}

export interface DetalheSentinel {
  ocorrencia: OcorrenciaSentinel;
  eventos: EventoSentinel[];
  regra_descricao: string | null;
}

export interface ConfiguracaoSentinelCliente {
  ativo: boolean;
  intervaloMinutos: number;
  retencaoDias: number;
  limiteOcorrencias: number;
  detectoresDesativados: string[];
  ultimaExecucaoEm: string | null;
}
