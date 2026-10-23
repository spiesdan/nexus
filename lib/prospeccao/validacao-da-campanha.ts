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
  escolherSessaoDaCampanha,
  type SessaoDaCampanha,
} from "./canal-da-campanha";
import type { TipoDaMensagem } from "./mensagem-da-campanha";

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
    .select("id, provider, daily_message_limit")
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
