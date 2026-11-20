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
import { regraBloqueadaPorFontes } from "./fontes";
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

  // Organização suspensa não produz trabalho: o corte é ANTES da coleta, para
  // que dado de org suspensa nem entre no processo (nada de snapshot, detecção
  // ou reafirmação). A rodada ainda é registrada abaixo, com motivo declarado.
  // Falha de leitura não bloqueia a instalação inteira: segue como ativa e o
  // próximo tick corrige.
  const { data: organizacao, error: erroOrganizacao } = await admin
    .from("organizations")
    .select("suspended_at")
    .eq("id", organizationId)
    .maybeSingle();
  if (erroOrganizacao) {
    logger.warn("sentinel.org_read_failed", {
      organizationId,
      erro: erroOrganizacao.message,
    });
  }
  const suspensa = Boolean(
    (organizacao as { suspended_at: string | null } | null)?.suspended_at,
  );

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
    if (suspensa) {
      return await encerrarPorSuspensao({
        organizationId,
        execucaoId,
        opcoes,
        inicio,
        agoraMs,
      });
    }

    const coleta = await coletarSnapshot(organizationId, agoraMs);
    const deteccao = executarDetectores(coleta.snapshot, {
      desativados: config.detectoresDesativados,
    });

    const acimaDoTeto = deteccao.achados.length > config.limiteOcorrencias;
    const achados = deteccao.achados.slice(0, config.limiteOcorrencias);
    const truncado =
      coleta.truncado || acimaDoTeto || deteccao.falhas.length > 0 || deteccao.truncadoPorTempo;

    // Medição observável sem coluna nova: o `detalhe` de `sentinel_runs` já é
    // jsonb, e o log estruturado atende quem opera o cron.
    logger.info("sentinel.detection", {
      organizationId,
      regrasAvaliadas: deteccao.regrasAvaliadas.length,
      regrasNaoAvaliadas: deteccao.regrasNaoAvaliadas.length,
      coletasTruncadas: coleta.truncados,
      tempoMs: deteccao.tempoMs,
      truncadoPorTempo: deteccao.truncadoPorTempo,
      regraMaisLenta: Object.entries(deteccao.temposPorRegra).sort((a, b) => b[1] - a[1])[0] ?? null,
    });

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

    // Encerra por REGRA AVALIADA e pela FONTE que ela lê, não por rodada
    // completa. A garantia é "não fechar sem ter lido a fonte da regra": quem
    // não rodou (tempo/falha) ou depende de uma coleta truncada fica de fora.
    // Uma fonte de alto volume (importações Mercos, webhooks) não pode silenciar
    // fiscal/estoque que não a leem. Achado que não coube no teto da org também
    // protege a sua regra: fechar por ausência quando o achado existe mas foi
    // descartado seria mentira.
    let encerradas = 0;
    const regrasComAchadoForaDoTeto = new Set(
      deteccao.achados.slice(config.limiteOcorrencias).map((a) => a.regra),
    );
    {
      const regrasSeguras = deteccao.regrasAvaliadas.filter(
        (r) =>
          !regrasComErro.has(r) &&
          !regrasComAchadoForaDoTeto.has(r) &&
          !regraBloqueadaPorFontes(r, coleta.truncados),
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

    const status: StatusExecucao =
      erros > 0 || deteccao.falhas.length > 0 || deteccao.truncadoPorTempo
        ? "parcial"
        : "sucesso";
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
          deteccao_ms: deteccao.tempoMs,
          regras_avaliadas: deteccao.regrasAvaliadas.length,
          regras_avaliadas_ids: deteccao.regrasAvaliadas,
          regras_nao_avaliadas: deteccao.regrasNaoAvaliadas,
          coletas_truncadas: coleta.truncados,
          tempos_por_regra_ms: deteccao.temposPorRegra,
          deteccao_truncada_por_tempo: deteccao.truncadoPorTempo,
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

/**
 * Organização suspensa: registra a rodada e encerra as ocorrências abertas com
 * motivo `organizacao_suspensa`. NÃO coleta snapshot e NÃO roda detector, então
 * nenhuma ocorrência nasce ou é reafirmada. Encerrar (não apagar) preserva a
 * linha e o histórico append-only.
 */
async function encerrarPorSuspensao(args: {
  organizationId: string;
  execucaoId: string;
  opcoes: OpcoesExecucao;
  inicio: number;
  agoraMs: number;
}): Promise<ResultadoExecucao> {
  const { organizationId, execucaoId, opcoes, inicio, agoraMs } = args;
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("fn_sentinel_encerrar_org_suspensa", {
    p_organization_id: organizationId,
    p_execucao_id: execucaoId,
  });

  if (error) {
    logger.error("sentinel.suspended_close_failed", {
      organizationId,
      execucaoId,
      erro: error.message,
    });
    const duracaoMs = Math.max(0, Date.now() - inicio);
    await admin
      .from("sentinel_runs")
      .update({
        status: "erro",
        finalizado_em: new Date().toISOString(),
        duracao_ms: duracaoMs,
        erro: "falha_ao_encerrar_org_suspensa",
        detalhe: { motivo: "organizacao_suspensa", falhas: [error.message.slice(0, 300)] },
      })
      .eq("id", execucaoId)
      .eq("organization_id", organizationId);
    return {
      ...resultadoVazio("erro", "falha_ao_encerrar_org_suspensa"),
      execucaoId,
      falhas: [error.message.slice(0, 300)],
      duracaoMs,
    };
  }

  const encerradas = Number(data) || 0;
  const duracaoMs = Math.max(0, Date.now() - inicio);

  await admin
    .from("sentinel_runs")
    .update({
      status: "ignorada",
      finalizado_em: new Date().toISOString(),
      duracao_ms: duracaoMs,
      encerradas,
      detalhe: { motivo: "organizacao_suspensa", encerradas },
    })
    .eq("id", execucaoId)
    .eq("organization_id", organizationId);

  await marcarUltimaExecucao(organizationId, agoraMs);

  if (encerradas > 0 || opcoes.origem === "manual") {
    await audit({
      action: "sentinel.run",
      organizationId,
      actorUserId: opcoes.usuarioId ?? null,
      resourceType: "sentinel_runs",
      resourceId: execucaoId,
      metadata: {
        origem: opcoes.origem,
        status: "ignorada",
        motivo: "organizacao_suspensa",
        encerradas,
      },
    });
  }

  return {
    ...resultadoVazio("ignorada", "organizacao_suspensa"),
    execucaoId,
    encerradas,
    duracaoMs,
  };
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
