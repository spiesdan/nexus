/**
 * MODELOS APROVADOS → CAMPANHA — a leitura do espelho que a tela e o motor
 * compartilham.
 *
 * ─── Por que este módulo existe ─────────────────────────────────────────────
 *
 * O espelho `meta_templates` já tinha um renderizador e um contrato derivado. A
 * campanha precisava das MESMAS duas coisas, com uma diferença: a tela precisa
 * da chave COMPOSTA do slot (`slotKey`) para nomear o campo, e o motor precisa
 * do `components` cru para renderizar o texto que o cliente vai ler.
 *
 * Duplicar a derivação no módulo de prospecção criaria a segunda fonte da
 * verdade que a fase de canais inteira existe para eliminar. Então a leitura
 * mora aqui, dentro de `lib/channels/`, e a campanha importa funções — nunca o
 * nome de um provider.
 *
 * ─── O que a campanha NÃO aceita nesta versão ──────────────────────────────
 *
 * Slot de mídia (image/video/document) e estruturado (currency/date_time).
 * Campanha é texto: o operador ainda não anexa mídia por prospect, e mandar o
 * payload sem o parâmetro faria a Meta recusar com 132012 DEPOIS de aceitar a
 * chamada. O modelo aparece na lista com o motivo, não some — o operador
 * precisa saber que ele existe e por que não dá para usar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { missingSlots, slotKey } from "@/lib/channels/meta/build-components";
import { renderTemplateBody } from "@/lib/channels/meta/render-template";
import {
  bindingState,
  type BindingState,
} from "@/lib/channels/meta/template-binding";
import {
  deriveTemplateContract,
  describeAddress,
  type ParamSlot,
  type TemplateContract,
} from "@/lib/channels/meta/template-contract";
import { normalizeRejectedReason } from "@/lib/channels/meta/webhook";
import { normalizarQualidade, type QualidadeDoNumero } from "@/lib/channels/number-quality";

/** Só estes slots viram string no payload. Mídia/estruturado ficam de fora. */
const SLOTS_DE_TEXTO = new Set(["text", "url_suffix", "coupon_code"]);

export interface SlotParaCampanha {
  /** A chave COMPOSTA do formulário: "1", "header:1", "button0:1", "card0::1". */
  slotKey: string;
  key: string;
  expects: string;
  onde: string;
  /** Texto ao redor do placeholder, para o campo não se chamar "Parâmetro 1". */
  contexto: string;
}

export interface PreviewParaCampanha {
  onde: string;
  text: string;
}

export interface TemplateParaCampanha {
  name: string;
  language: string;
  status: string;
  category: string | null;
  rejectedReason: string | null;
  parameterFormat: string;
  contractHash: string;
  syncedAt: string;
  slots: SlotParaCampanha[];
  previews: PreviewParaCampanha[];
  components: unknown[];
  /**
   * Nota de qualidade na Meta — `GREEN`/`YELLOW`/`RED`/`UNKNOWN`, ou `null`
   * quando o espelho ainda não a recebeu. `RED` bloqueia o uso na campanha
   * (item 1 da 0286): a Meta pausa e depois desabilita modelo nesse estado.
   */
  qualityScore: QualidadeDoNumero | null;
  /** Pode ser escolhido numa campanha AGORA? */
  aceito: boolean;
  /** Por que não, em uma frase que o operador entende. */
  motivo: string | null;
}

type LinhaDoEspelho = {
  name: string;
  language: string;
  status: string;
  category: string | null;
  rejected_reason: string | null;
  quality_score: string | null;
  parameter_format: string;
  contract_hash: string;
  components: unknown;
  synced_at: string;
};

const COLUNAS =
  "name, language, status, category, rejected_reason, quality_score, parameter_format, contract_hash, components, synced_at";

function previewsDeTexto(components: unknown): PreviewParaCampanha[] {
  const out: PreviewParaCampanha[] = [];
  const visita = (lista: unknown, prefixo: string) => {
    if (!Array.isArray(lista)) return;
    for (const c of lista as Array<Record<string, unknown>>) {
      const tipo = String(c.type ?? "").toUpperCase();
      if (Array.isArray(c.cards)) {
        (c.cards as Array<Record<string, unknown>>).forEach((card, i) =>
          visita(card.components, `card ${i + 1} › `),
        );
        continue;
      }
      const texto = typeof c.text === "string" ? c.text : "";
      if (!texto.includes("{{")) continue;
      out.push({ onde: `${prefixo}${tipo === "HEADER" ? "cabeçalho" : "corpo"}`, text: texto });
    }
  };
  visita(components, "");
  return out;
}

function contextoDoSlot(s: ParamSlot): string {
  const antes = s.contextBefore.trim();
  const depois = s.contextAfter.trim();
  return `${antes} {{${s.key}}} ${depois}`.replace(/\s+/g, " ").trim();
}

function paraView(linha: LinhaDoEspelho): TemplateParaCampanha {
  const contrato = deriveTemplateContract({
    name: linha.name,
    language: linha.language,
    parameter_format: linha.parameter_format,
    components: linha.components as never,
  });
  const naoTextuais = contrato.slots.filter((s) => !SLOTS_DE_TEXTO.has(s.expects));
  const aprovado = linha.status === "APPROVED";
  const qualidade = normalizarQualidade(linha.quality_score);

  let motivo: string | null = null;
  if (!aprovado) {
    motivo = `Este modelo está ${linha.status} na Meta — só um modelo APROVADO pode ser enviado.`;
  } else if (qualidade === "RED") {
    // A Meta ainda aceita enviar em RED, e é justamente por isso que a decisão
    // não pode ficar só do lado dela: o próximo passo documentado é pausar o
    // modelo (3h → 6h → desabilitar) e, se repetir, penalizar o número.
    motivo =
      "Este modelo está com qualidade baixa (RED) na Meta. Corrija o conteúdo e o público dos últimos envios antes de usar — a plataforma pausa e depois desabilita modelos nesse estado, e a reputação do número vai junto.";
  } else if (naoTextuais.length > 0) {
    const tipos = [...new Set(naoTextuais.map((s) => s.expects))].join(", ");
    motivo = `Este modelo tem slot de ${tipos}. Campanha por template, nesta versão, aceita só texto, sufixo de URL e cupom — use o inbox para enviar mídia.`;
  }

  return {
    name: linha.name,
    language: linha.language,
    status: linha.status,
    category: linha.category,
    rejectedReason: normalizeRejectedReason(linha.rejected_reason),
    parameterFormat: contrato.parameterFormat,
    contractHash: linha.contract_hash,
    syncedAt: linha.synced_at,
    qualityScore: qualidade,
    slots: contrato.slots.map((s) => ({
      slotKey: slotKey(s.address, s.key),
      key: s.key,
      expects: s.expects,
      onde: describeAddress(s.address),
      contexto: contextoDoSlot(s),
    })),
    previews: previewsDeTexto(linha.components),
    components: Array.isArray(linha.components) ? (linha.components as unknown[]) : [],
    aceito: aprovado && naoTextuais.length === 0 && qualidade !== "RED",
    motivo,
  };
}

/**
 * Todos os modelos da organização, inclusive os que não servem. A tela mostra
 * o que existe e o motivo da recusa — esconder o reprovado faria o operador
 * procurar no lugar errado.
 */
export async function listarTemplatesParaCampanha(
  db: SupabaseClient,
  orgId: string,
  opts: { channelSessionId?: string | null } = {},
): Promise<TemplateParaCampanha[]> {
  let q = db.from("meta_templates").select(COLUNAS).eq("organization_id", orgId);
  if (opts.channelSessionId) q = q.eq("channel_session_id", opts.channelSessionId);
  const { data, error } = await q.order("status").order("name");
  if (error) throw new Error(`template_lookup_failed: ${error.message}`);
  return ((data ?? []) as unknown as LinhaDoEspelho[]).map(paraView);
}

/** Um modelo pelo par (name, language). `null` = não está no espelho. */
export async function carregarTemplateParaCampanha(
  db: SupabaseClient,
  orgId: string,
  name: string,
  language: string,
  opts: { channelSessionId?: string | null } = {},
): Promise<TemplateParaCampanha | null> {
  let q = db
    .from("meta_templates")
    .select(COLUNAS)
    .eq("organization_id", orgId)
    .eq("name", name)
    .eq("language", language);
  if (opts.channelSessionId) q = q.eq("channel_session_id", opts.channelSessionId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`template_lookup_failed: ${error.message}`);
  if (!data) return null;
  return paraView(data as unknown as LinhaDoEspelho);
}

export interface VereditoDoTemplate {
  ok: boolean;
  /** Código estável para log/teste; não é texto de tela. */
  codigo:
    | BindingState
    | "media_nao_suportada"
    | "missing_values"
    | "quality_red";
  /** Frase acionável para `ultimo_erro`/toast. */
  erro: string;
  /** `true` = a campanha não pode continuar sozinha; o tick pausa. */
  pausar: boolean;
  template?: TemplateParaCampanha;
  /** Valores que faltaram (quando `codigo = missing_values`). */
  faltando?: string[];
}

/**
 * O veredito do bind contra o espelho VIGENTE. É a mesma precedência de
 * `bindingState` (missing > not_approved > stale), com as duas checagens que
 * `bindingState` não faz porque não conhece o tipo do slot nem os valores.
 */
export function avaliarTemplateParaCampanha(
  template: TemplateParaCampanha | null,
  values: Record<string, string>,
  contractHash: string,
): VereditoDoTemplate {
  const alvo = template ? `${template.name} (${template.language})` : "o modelo escolhido";

  if (!template) {
    return {
      ok: false,
      codigo: "missing",
      erro: `O modelo ${alvo} não está no espelho local. Sincronize os modelos em Conexões antes de disparar.`,
      pausar: true,
    };
  }

  const estado = bindingState(
    {
      name: template.name,
      language: template.language,
      contractHash,
      values,
    },
    {
      name: template.name,
      language: template.language,
      contractHash: template.contractHash,
      status: template.status,
    },
  );

  if (estado === "not_approved") {
    return {
      ok: false,
      codigo: estado,
      erro: `O modelo ${alvo} está ${template.status} na Meta — só um modelo APROVADO pode ser enviado.`,
      pausar: true,
    };
  }
  if (estado === "stale") {
    return {
      ok: false,
      codigo: estado,
      erro: `O modelo ${alvo} mudou na Meta desde que esta campanha foi configurada. Revise os valores dos parâmetros antes de retomar.`,
      pausar: true,
    };
  }
  if (template.qualityScore === "RED") {
    // RED não bloqueia o envio na Meta — bloqueia AQUI. Continuar mandando é o
    // que transforma um modelo rebaixado num número rebaixado, e o custo dessa
    // decisão não é do modelo: é da linha da empresa.
    return {
      ok: false,
      codigo: "quality_red",
      erro: `O modelo ${alvo} está com qualidade baixa (RED) na Meta. Corrija o conteúdo e o público dos últimos envios; a campanha fica pausada até o modelo voltar a uma qualidade aceitável e você retomá-la.`,
      pausar: true,
      template,
    };
  }

  const naoTextuais = template.slots.filter((s) => !SLOTS_DE_TEXTO.has(s.expects));
  if (naoTextuais.length > 0) {
    return {
      ok: false,
      codigo: "media_nao_suportada",
      erro: `O modelo ${alvo} tem slot de ${[...new Set(naoTextuais.map((s) => s.expects))].join(", ")}, que campanha não monta. Use o inbox.`,
      pausar: true,
    };
  }

  const contrato: TemplateContract = deriveTemplateContract({
    name: template.name,
    language: template.language,
    parameter_format: template.parameterFormat,
    components: template.components as never,
  });
  const faltando = missingSlots(contrato, values);
  if (faltando.length > 0) {
    return {
      ok: false,
      codigo: "missing_values",
      erro: `Faltam valores para: ${faltando.map((s) => `{{${s.key}}}`).join(", ")}.`,
      pausar: true,
      faltando: faltando.map((s) => s.key),
    };
  }

  return { ok: true, codigo: "ok", erro: "", pausar: false, template };
}

/** O texto que o cliente vai ler — header + body com os valores aplicados. */
export function renderizarCorpoDoTemplate(
  template: Pick<
    TemplateParaCampanha,
    "components" | "name" | "language" | "parameterFormat"
  >,
  values: Record<string, string>,
): string {
  return renderTemplateBody(template.components, values, {
    name: template.name,
    language: template.language,
    parameterFormat: template.parameterFormat,
  });
}
