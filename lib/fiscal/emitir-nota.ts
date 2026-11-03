import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/api/types";
import { carregarDestinatario } from "@/lib/fiscal/destinatario-da-nota";
import { resolverProvedor } from "@/lib/fiscal/provedor";
import {
  COLUNAS_DA_NOTA,
  STATUS_FATURAVEL,
  type ConfigFiscalSalva,
  type ExtrasFiscais,
} from "@/lib/schemas/fiscal";

/**
 * A EMISSÃO de nota fiscal — fora da rota, de propósito.
 *
 * Mesmo padrão do `_handler` da agenda: a regra mora aqui e a ROTA e o
 * ASSISTENTE chamam a mesma função. Sem isto, a `/executar` reimplementaria
 * as travas (pedido faturado, config, nota viva) e as duas divergiriam com o
 * tempo — a primeira divergência seria uma nota duplicada.
 *
 * Assíncrona por desenho: a nota nasce `em_emissao` e o drain processa (stub
 * volta para `pendente`; spednfe transmite). Quem chama nunca espera a SEFAZ.
 */
export interface EmitirNotaInput {
  supabase: SupabaseClient;
  admin: SupabaseClient;
  orgId: string;
  userId: string;
  requestId: string;
  orderId: string;
  /**
   * Extras da emissão (0257), já validados pelo `notaCreateSchema`. Gravam
   * NA NOTA: o drain os lê de lá, então reemitir reusa o que a pessoa
   * digitou em vez de recomputar do pedido.
   */
  extras?: ExtrasFiscais | null;
}

export interface NotaEmitida {
  id: string;
  order_id: string | null;
  serie: string;
  status: string;
  provedor: string;
  total_cents: number;
}

export async function emitirNota(input: EmitirNotaInput): Promise<NotaEmitida> {
  const { supabase, admin, orgId, userId, requestId, orderId, extras } = input;

  const { data: config } = await supabase
    .from("fiscal_settings")
    .select("serie, natureza_operacao, cfop_padrao, emitente_documento, provedor")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!config) {
    throw new ApiError(
      422,
      "validation_failed",
      { requestId },
      requestId,
      "Configure os dados fiscais primeiro (Notas → Configuração fiscal).",
    );
  }
  const cfg = config as unknown as ConfigFiscalSalva & { provedor: string };

  const { data: pedido } = await supabase
    .from("commercial_orders")
    .select("id, numero, cliente_nome, cliente_documento, contact_id, total_cents, frete_cents, status")
    .eq("id", orderId)
    .eq("organization_id", orgId)
    .maybeSingle();
  const ped = pedido as unknown as {
    id: string;
    numero: number;
    cliente_nome: string;
    cliente_documento: string | null;
    contact_id: string | null;
    total_cents: number;
    status: string;
  } | null;
  if (!ped) throw new ApiError(404, "not_found", { requestId }, requestId, "Pedido não encontrado.");
  if (!(STATUS_FATURAVEL as readonly string[]).includes(ped.status)) {
    throw new ApiError(
      422,
      "validation_failed",
      { requestId },
      requestId,
      `Pedido está "${ped.status}" — só faturado vira nota.`,
    );
  }

  // Um pedido, uma nota viva: segunda via nasce de reimpressão, não de nova
  // emissão (que duplicaria o fato fiscal).
  const { data: existente } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("organization_id", orgId)
    .eq("order_id", ped.id)
    .neq("status", "cancelada")
    .maybeSingle();
  if (existente) {
    throw new ApiError(409, "conflict", { requestId }, requestId, "Este pedido já tem nota (não cancelada).");
  }

  const escolha = resolverProvedor(cfg);

  // O DESTINATÁRIO vem do cadastro do cliente — não de uma segunda digitação.
  //
  // Antes isto exigia o endereço inteiro digitado em "Dados adicionais" mesmo
  // com o cliente cadastrado, e a nota levava do pedido só `cliente_nome` e
  // `cliente_documento` (fotos do dia da importação). Agora nome e documento
  // saem do contato e o TLocal é montado das colunas do cadastro, com o cMun
  // resolvido de cidade/UF (`municipioIbge`) — o código IBGE que o contato não
  // guarda e que era o motivo real do formulário manual.
  //
  // O que a pessoa digitou em `extras.entrega` vence o cadastro: quem digitou
  // tinha um motivo (endereço de entrega diferente do cobrança, por exemplo).
  const destinatario = await carregarDestinatario(supabase, orgId, ped);
  const entrega = extras?.entrega ?? destinatario.entrega;

  // A SEFAZ recusa a NF-e sem o endereço do destinatário (rejeição 726), e o
  // bloco `entrega` é o único do contrato que carrega o TLocal inteiro. Falhar
  // aqui evita uma nota que nasce condenada; e a mensagem NOMEIA o que falta,
  // em vez de pedir "o endereço" de novo a quem já cadastrou o cliente.
  if (escolha === "spednfe" && !entrega) {
    const falta = destinatario.faltando.length > 0
      ? `O cadastro do cliente precisa de ajuste: ${destinatario.faltando.join(", ")}.`
      : "O endereço do destinatário está incompleto.";
    throw new ApiError(
      422,
      "validation_failed",
      { requestId },
      requestId,
      `${falta} Complete o cadastro do cliente ou informe o endereço em "Dados adicionais da emissão".`,
    );
  }
  // O TLocal exige o documento do destinatário; sem ele o payload recusaria
  // depois de a nota e o job já existirem.
  if (escolha === "spednfe" && entrega && !destinatario.documento) {
    throw new ApiError(
      422,
      "validation_failed",
      { requestId },
      requestId,
      "O cadastro do cliente não tem CPF/CNPJ. É obrigatório na NF-e — complete o cadastro antes de emitir.",
    );
  }

  // O que vai gravado NA NOTA: o que a pessoa digitou + a entrega resolvida
  // (do cadastro quando ela não digitou). O drain lê daqui, então reemitir
  // reusa a mesma decisão em vez de recalcular.
  const extrasDaNota: ExtrasFiscais | null =
    extras || entrega ? { ...(extras ?? {}), ...(entrega ? { entrega } : {}) } : null;

  const { data: nota, error } = await supabase
    .from("invoices")
    .insert({
      organization_id: orgId,
      order_id: ped.id,
      serie: cfg.serie,
      numero: null,
      chave_acesso: null,
      xml: null,
      status: "em_emissao",
      provedor: escolha,
      erro: null,
      extras_fiscais: extrasDaNota,
      total_cents: ped.total_cents,
      created_by: userId,
    })
    .select(COLUNAS_DA_NOTA)
    .single();
  if (error || !nota) {
    throw new ApiError(500, "internal_error", { requestId }, requestId, "Erro ao registrar a nota.");
  }
  const notaId = (nota as unknown as { id: string }).id;

  const { error: erroJob } = await supabase.from("fiscal_jobs").insert({
    organization_id: orgId,
    invoice_id: notaId,
    tipo: "emitir",
    status: "pendente",
    created_by: userId,
  });
  if (erroJob) {
    throw new ApiError(500, "internal_error", { requestId }, requestId, "Nota criada, mas a fila recusou o job.");
  }

  await admin.from("fiscal_events").insert({
    organization_id: orgId,
    invoice_id: notaId,
    tipo: "criada",
    status: "em_emissao",
  });

  return nota as unknown as NotaEmitida;
}
