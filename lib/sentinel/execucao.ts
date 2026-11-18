/**
 * Execução do Sentinel — orquestra coleta, detecção, persistência e retenção.
 *
 * O que esta função NÃO faz: escrever em nota, pedido, estoque, recebível,
 * campanha ou fila. A única escrita é nas tabelas `sentinel_*` (o que o
 * Sentinel viu) e no audit log. v1 é observação.
 *
 * Idempotência: `fn_sentinel_registrar_ocorrencia` faz upsert pelo índice
 * parcial das abertas. Rodar duas vezes não cria duas ocorrências; incrementa
 * `vezes_vista` e registra o evento `reafirmada`.
 *
 * Isolamento: `organizationId` é argumento obrigatório e TODA consulta/RPC o
 * recebe. Ele vem do guard da rota (cookie) ou da lista do cron — nunca de um
 * body de usuário.
 */
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import { coletarSnapshot } from "./coleta";
import {
  interpretarConfiguracao,
  sentinelLigadoNoAmbiente,
  type ConfiguracaoSentinel,
} from "./config";
import { executarDetectores } from "./motor";
import { fingerprint, type Achado } from "./tipos";

export type OrigemExecucao = "manual" | "cron" | "api";
export type StatusExecucao = "sucesso" | "parcial" | "erro" | "ignorada";

export interface ResultadoExecucao {
  status: StatusExecucao;
  execucaoId: string | null;
  achados: number;
  criadas: number;
  reafirmadas: number;
  encerradas: number;
  erros: number;
  truncado: boolean;
  duracaoMs: number;
  falhas: string[];
  motivo: string | null;
}

export interface OpcoesExecucao {
  organizationId: string;
  origem: OrigemExecucao;
  usuarioId?: string | null;
  agoraMs?: number;
}

const EXECUCAO_ORFA_MS = 30 * 60_000;

function resultadoVazio(status: StatusExecucao, motivo: string | null): ResultadoExecucao {
  return {
    status,
    execucaoId: null,
    achados: 0,
    criadas: 0,
    reafirmadas: 0,
    encerradas: 0,
    erros: 0,
    truncado: false,
    duracaoMs: 0,
    falhas: [],
    motivo,
  };
}

export async function lerConfiguracaoDaOrg(
  organizationId: string,
): Promise<ConfiguracaoSentinel> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sentinel_settings")
    .select(
      "ativo, intervalo_minutos, retencao_dias, limite_ocorrencias, detectores_desativados, ultima_execucao_em",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    logger.warn("sentinel.settings_read_failed", { organizationId, erro: error.message });
    return interpretarConfiguracao(null);
  }
  return interpretarConfiguracao(data as Parameters<typeof interpretarConfiguracao>[0]);
}

export async function executarSentinela(opcoes: OpcoesExecucao): Promise<ResultadoExecucao> {
  const inicio = Date.now();
  const agoraMs = opcoes.agoraMs ?? inicio;
  const { organizationId, origem } = opcoes;

  if (!sentinelLigadoNoAmbiente()) {
    await auditarSeManual(organizationId, opcoes, "desligado_no_ambiente");
    return resultadoVazio("ignorada", "desligado_no_ambiente");
  }

  const config = await lerConfiguracaoDaOrg(organizationId);
  if (!config.ativo) {
    await auditarSeManual(organizationId, opcoes, "desligado_na_organizacao");
    return resultadoVazio("ignorada", "desligado_na_organizacao");
  }

  const admin = createAdminClient();

  // Rede de segurança do worker que morreu: uma execução `executando` órfã
  // bloquearia o índice único parcial para sempre.
  await admin
    .from("sentinel_runs")
    .update({
      status: "erro",
      erro: "execucao_orfa",
      finalizado_em: new Date(agoraMs).toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("status", "executando")
    .lt("iniciado_em", new Date(agoraMs - EXECUCAO_ORFA_MS).toISOString());

  const { data: criada, error: erroDeClaim } = await admin
    .from("sentinel_runs")
    .insert({
      organization_id: organizationId,
      origem,
      status: "executando",
      iniciado_por: opcoes.usuarioId ?? null,
      iniciado_em: new Date(agoraMs).toISOString(),
    })
    .select("id")
    .single();

  if (erroDeClaim) {
    const codigo = (erroDeClaim as { code?: string }).code;
    if (codigo === "23505") {
      // Outra instância/aba está varrendo esta org agora. Não é erro.
      return resultadoVazio("ignorada", "execucao_em_andamento");
    }
    logger.error("sentinel.run_claim_failed", { organizationId, erro: erroDeClaim.message });
    return resultadoVazio("erro", "falha_ao_abrir_execucao");
  }

  const execucaoId = (criada as { id: string }).id;

  try {
    const coleta = await coletarSnapshot(organizationId, agoraMs);
    const deteccao = executarDetectores(coleta.snapshot, {
      desativados: config.detectoresDesativados,
    });

    const acimaDoTeto = deteccao.achados.length > config.limiteOcorrencias;
    const achados = deteccao.achados.slice(0, config.limiteOcorrencias);
    const truncado = coleta.truncado || acimaDoTeto || deteccao.falhas.length > 0;

    let criadas = 0;
    let reafirmadas = 0;
    let erros = 0;
    const regrasComErro = new Set<string>();
    const falhas = [
      ...coleta.falhas,
      ...deteccao.falhas.map((f) => `${f.regra}: ${f.motivo}`),
    ];

    for (const achado of achados) {
      const ok = await registrar(organizationId, execucaoId, achado);
      if (!ok.ok) {
        erros += 1;
        regrasComErro.add(achado.regra);
        falhas.push(`${achado.regra}: ${ok.motivo}`);
        continue;
      }
      if (ok.criada) criadas += 1;
      else reafirmadas += 1;
    }

    // Só encerra por ausência com prova completa: sem truncamento, sem regra
    // que falhou e sem falha de registro naquela regra.
    let encerradas = 0;
    if (!truncado && erros === 0) {
      const regrasSeguras = deteccao.regrasAvaliadas.filter(
        (r) => !regrasComErro.has(r),
      );
      if (regrasSeguras.length > 0) {
        const { data: n, error } = await admin.rpc("fn_sentinel_encerrar_ausentes", {
          p_organization_id: organizationId,
          p_execucao_id: execucaoId,
          p_regras: regrasSeguras,
        });
        if (error) {
          falhas.push(`encerramento: ${error.message}`);
          erros += 1;
        } else {
          encerradas = Number(n) || 0;
        }
      }
    }

    // Retenção é manutenção, não detecção: falhar aqui não transforma a
    // varredura em parcial. Fica registrado no log para quem operar.
    try {
      const { error } = await admin.rpc("fn_sentinel_expurgar", {
        p_organization_id: organizationId,
        p_dias: config.retencaoDias,
      });
      if (error) {
        logger.warn("sentinel.retention_failed", { organizationId, erro: error.message });
      }
    } catch (erro) {
      logger.warn("sentinel.retention_failed", {
        organizationId,
        erro: erro instanceof Error ? erro.message : String(erro),
      });
    }

    const status: StatusExecucao = erros > 0 || deteccao.falhas.length > 0 ? "parcial" : "sucesso";
    const duracaoMs = Math.max(0, Date.now() - inicio);

    await admin
      .from("sentinel_runs")
      .update({
        status,
        finalizado_em: new Date().toISOString(),
        duracao_ms: duracaoMs,
        achados: achados.length,
        criadas,
        reafirmadas,
        encerradas,
        erros,
        truncado,
        detalhe: {
          falhas: falhas.slice(0, 30),
          regras_desativadas: config.detectoresDesativados,
          limite: config.limiteOcorrencias,
        },
      })
      .eq("id", execucaoId)
      .eq("organization_id", organizationId);

    await marcarUltimaExecucao(organizationId, agoraMs);

    if (achados.length > 0 || encerradas > 0 || status !== "sucesso") {
      await audit({
        action: "sentinel.run",
        organizationId,
        actorUserId: opcoes.usuarioId ?? null,
        resourceType: "sentinel_runs",
        resourceId: execucaoId,
        metadata: {
          origem,
          status,
          achados: achados.length,
          criadas,
          reafirmadas,
          encerradas,
          truncado,
        },
      });
    }

    return {
      status,
      execucaoId,
      achados: achados.length,
      criadas,
      reafirmadas,
      encerradas,
      erros,
      truncado,
      duracaoMs,
      falhas: falhas.slice(0, 30),
      motivo: null,
    };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error("sentinel.run_failed", { organizationId, execucaoId, erro: mensagem });

    await admin
      .from("sentinel_runs")
      .update({
        status: "erro",
        finalizado_em: new Date().toISOString(),
        duracao_ms: Math.max(0, Date.now() - inicio),
        erro: "falha_na_execucao",
        detalhe: { falhas: [mensagem.slice(0, 300)] },
      })
      .eq("id", execucaoId)
      .eq("organization_id", organizationId);

    await audit({
      action: "sentinel.run",
      organizationId,
      actorUserId: opcoes.usuarioId ?? null,
      resourceType: "sentinel_runs",
      resourceId: execucaoId,
      metadata: { origem, status: "erro" },
    });

    return {
      ...resultadoVazio("erro", "falha_na_execucao"),
      execucaoId,
      falhas: [mensagem.slice(0, 300)],
      duracaoMs: Math.max(0, Date.now() - inicio),
    };
  }
}

async function registrar(
  organizationId: string,
  execucaoId: string,
  achado: Achado,
): Promise<{ ok: true; criada: boolean } | { ok: false; motivo: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("fn_sentinel_registrar_ocorrencia", {
    p_organization_id: organizationId,
    p_execucao_id: execucaoId,
    p_fingerprint: fingerprint(achado),
    p_regra: achado.regra,
    p_categoria: achado.categoria,
    p_entidade_tipo: achado.entidadeTipo,
    p_entidade_id: achado.entidadeId,
    p_titulo: achado.titulo,
    p_resumo: achado.resumo,
    p_causa_provavel: achado.causaProvavel,
    p_severidade: achado.severidade,
    p_href: achado.href,
    p_evidencia: achado.evidencia,
    p_recomendacao: achado.recomendacao ?? null,
  });

  if (error) return { ok: false, motivo: error.message.slice(0, 200) };
  const linha = Array.isArray(data) ? data[0] : data;
  return { ok: true, criada: Boolean((linha as { criada?: boolean } | null)?.criada) };
}

async function marcarUltimaExecucao(organizationId: string, agoraMs: number): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("sentinel_settings").upsert(
    {
      organization_id: organizationId,
      ultima_execucao_em: new Date(agoraMs).toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) {
    logger.warn("sentinel.settings_touch_failed", { organizationId, erro: error.message });
  }
}

async function auditarSeManual(
  organizationId: string,
  opcoes: OpcoesExecucao,
  motivo: string,
): Promise<void> {
  if (opcoes.origem !== "manual") return;
  await audit({
    action: "sentinel.run",
    organizationId,
    actorUserId: opcoes.usuarioId ?? null,
    resourceType: "sentinel_settings",
    metadata: { origem: "manual", status: "ignorada", motivo },
  });
}
