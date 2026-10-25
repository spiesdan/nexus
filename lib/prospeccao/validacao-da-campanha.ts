/**
 * A VALIDAÇÃO DO BIND DA CAMPANHA — a mesma nos dois lados (criar e agendar).
 *
 * Uma campanha de template salva com um modelo reprovado, obsoleto ou sem um
 * valor é uma campanha que já nasce quebrada — e o defeito só apareceria no
 * tick, com a fila sendo consumida. Aqui o erro sai na borda, com a frase que o
 * operador pode agir sobre.
 *
 * `exigirCanal` é falso para rascunho: salvar uma ideia antes de conectar o
 * número é legítimo. Ativar, não — ativar é prometer que o tick vai mandar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  avaliarTemplateParaCampanha,
  carregarTemplateParaCampanha,
  type TemplateParaCampanha,
} from "@/lib/channels/templates/para-campanha";

import {
  bloqueadaPorQualidade,
  escolherSessaoDaCampanha,
  type SessaoDaCampanha,
} from "./canal-da-campanha";
import type { TipoDaMensagem } from "./mensagem-da-campanha";
import type { TemplateDaCategoria } from "./templates-por-categoria";

export interface BindDaCampanha {
  tipo: TipoDaMensagem;
  name: string | null;
  language: string | null;
  contractHash: string | null;
  values: Record<string, string>;
}

export type VereditoDaCampanha =
  | { ok: true; template: TemplateParaCampanha | null; sessao: SessaoDaCampanha | null }
  | { ok: false; erro: string; codigo: string };

/** As sessões WORKING da org — a mesma leitura do tick. */
export async function sessoesWorkingDaOrg(
  admin: SupabaseClient,
  orgId: string,
): Promise<SessaoDaCampanha[]> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select("id, provider, daily_message_limit, quality_rating")
    .eq("organization_id", orgId)
    .eq("status", "WORKING")
    .is("archived_at", null);
  if (error) throw new Error(`channel_sessions_lookup_failed: ${error.message}`);
  return (data ?? []) as unknown as SessaoDaCampanha[];
}

export async function validarBindDaCampanha(
  admin: SupabaseClient,
  orgId: string,
  bind: BindDaCampanha,
  opts: { exigirCanal: boolean },
): Promise<VereditoDaCampanha> {
  let template: TemplateParaCampanha | null = null;

  if (bind.tipo === "template") {
    if (!bind.name || !bind.language || !bind.contractHash) {
      return {
        ok: false,
        codigo: "template_incompleto",
        erro: "Escolha um modelo aprovado e preencha o hash do contrato (recarregue a lista se ele não aparecer).",
      };
    }

    try {
      template = await carregarTemplateParaCampanha(
        admin,
        orgId,
        bind.name,
        bind.language,
      );
    } catch (e) {
      return {
        ok: false,
        codigo: "template_lookup_failed",
        erro: e instanceof Error ? e.message : "Falha ao ler o espelho de modelos.",
      };
    }

    const veredito = avaliarTemplateParaCampanha(template, bind.values, bind.contractHash);
    if (!veredito.ok) {
      return { ok: false, codigo: veredito.codigo, erro: veredito.erro };
    }
    template = veredito.template ?? template;
  }

  if (!opts.exigirCanal) return { ok: true, template, sessao: null };

  let sessoes: SessaoDaCampanha[];
  try {
    sessoes = await sessoesWorkingDaOrg(admin, orgId);
  } catch (e) {
    return {
      ok: false,
      codigo: "channel_sessions_lookup_failed",
      erro: e instanceof Error ? e.message : "Falha ao ler os canais.",
    };
  }

  const sessao = escolherSessaoDaCampanha(sessoes, bind.tipo);
  if (!sessao) {
    // 0286 — mesmo par de desfechos do tick: canal ausente x número em RED.
    // Ativar uma campanha num número sinalizado é prometer um envio que o tick
    // vai pausar no minuto seguinte; o erro sai aqui, com o próximo passo certo.
    if (bloqueadaPorQualidade(sessoes, bind.tipo)) {
      return {
        ok: false,
        codigo: "numero_qualidade_red",
        erro:
          "O número oficial está com qualidade RED na Meta. Revise o conteúdo e o público dos últimos envios; " +
          "quando a qualidade voltar para GREEN, ative a campanha.",
      };
    }
    return {
      ok: false,
      codigo: bind.tipo === "template" ? "sem_canal_template" : "sem_canal_texto",
      erro:
        bind.tipo === "template"
          ? "Nenhum canal oficial WORKING para enviar template. Conecte o número oficial em Conexões antes de ativar."
          : "Nenhum canal WORKING que aceite texto livre. Conecte um número por QR ou escolha um modelo oficial.",
    };
  }

  return { ok: true, template, sessao };
}

/**
 * VALIDA UM MODELO POR CATEGORIA (0285).
 *
 * Cada bind passa pela MESMA régua do bind único — espelho vigente, status
 * aprovado, contrato e valores. O erro sai NOMEANDO a categoria: "Categoria
 * Posto: o modelo mudou na Meta" é acionável; "modelo inválido" não é.
 *
 * O canal é conferido UMA vez (o canal oficial é o mesmo para todos os binds),
 * não uma vez por categoria.
 */
export interface TemplateDaCategoriaValidado {
  categoria: string;
  name: string;
  language: string;
  contractHash: string;
  values: Record<string, string>;
  components: unknown[];
  parameterFormat: string;
}

export type VereditoDosTemplates =
  | { ok: true; templates: TemplateDaCategoriaValidado[] }
  | { ok: false; erro: string; codigo: string };

export async function validarTemplatesDaCampanha(
  admin: SupabaseClient,
  orgId: string,
  binds: readonly TemplateDaCategoria[],
  opts: { exigirCanal: boolean },
): Promise<VereditoDosTemplates> {
  const templates: TemplateDaCategoriaValidado[] = [];
  /**
   * O espelho é lido UMA vez por (nome, idioma), não uma vez por categoria.
   * Um recorte de 200 categorias costuma apontar para 1–5 modelos; validar
   * cada categoria contra o banco faria a borda parecer travada.
   */
  type EntradaDoEspelho =
    | { ok: true; template: TemplateParaCampanha }
    | { ok: false; codigo: string; erro: string };
  const espelho = new Map<string, EntradaDoEspelho>();

  for (const bind of binds) {
    if (!bind.name || !bind.language || !bind.contract_hash) {
      return {
        ok: false,
        codigo: "template_incompleto",
        erro: `Categoria "${bind.categoria}": escolha um modelo aprovado e preencha o hash do contrato.`,
      };
    }

    const chaveDoEspelho = `${bind.name}\u0000${bind.language}`;
    let achado = espelho.get(chaveDoEspelho);
    if (!achado) {
      let novo: EntradaDoEspelho;
      try {
        const template = await carregarTemplateParaCampanha(
          admin,
          orgId,
          bind.name,
          bind.language,
        );
        // O espelho pode não ter a linha — e "ausente" não é "válido". Vira
        // veredito negativo aqui, nomeando a categoria, em vez de estourar no
        // `avaliarTemplateParaCampanha` com um `null`.
        novo = template
          ? { ok: true, template }
          : {
              ok: false,
              codigo: "template_invalido",
              erro: "o modelo não foi encontrado no espelho.",
            };
      } catch (e) {
        novo = {
          ok: false,
          codigo: "template_lookup_failed",
          erro: e instanceof Error ? e.message : "Falha ao ler o espelho de modelos.",
        };
      }
      espelho.set(chaveDoEspelho, novo);
      achado = novo;
    }
    if (!achado.ok) {
      return {
        ok: false,
        codigo: achado.codigo,
        erro: `Categoria "${bind.categoria}": ${achado.erro}`,
      };
    }

    const veredito = avaliarTemplateParaCampanha(
      achado.template,
      bind.values,
      bind.contract_hash,
    );
    if (!veredito.ok) {
      return {
        ok: false,
        codigo: veredito.codigo,
        erro: `Categoria "${bind.categoria}": ${veredito.erro}`,
      };
    }
    const template = veredito.template ?? achado.template;
    templates.push({
      categoria: bind.categoria,
      name: template.name,
      language: template.language,
      contractHash: template.contractHash,
      values: bind.values,
      components: template.components,
      parameterFormat: template.parameterFormat,
    });
  }

  if (opts.exigirCanal && templates.length > 0) {
    // Basta um: a escolha da sessão é por CAPABILITY e o canal oficial é o
    // mesmo para todos os modelos da campanha.
    const primeiro = templates[0]!;
    const canal = await validarBindDaCampanha(
      admin,
      orgId,
      {
        tipo: "template",
        name: primeiro.name,
        language: primeiro.language,
        contractHash: primeiro.contractHash,
        values: primeiro.values,
      },
      { exigirCanal: true },
    );
    if (!canal.ok) return { ok: false, codigo: canal.codigo, erro: canal.erro };
  }

  return { ok: true, templates };
}
