import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/api/types";
import { carregarDestinatario } from "@/lib/fiscal/destinatario-da-nota";
import { resolverProvedor } from "@/lib/fiscal/provedor";
import { logger } from "@/lib/logger";
import { subtotalDoItem } from "@/lib/schemas/pedidos";
import {
  COLUNAS_DA_NOTA,
  INF_CPL_MAX,
  statusFaturavel,
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
  /** O pedido principal (compatibilidade). `null` exige `orderIds`. */
  orderId: string | null;
  /**
   * AGRUPAMENTO: vários pedidos do MESMO cliente numa NF-e só.
   *
   * Cliente que tirou três pedidos no mês quer uma nota, não três. A NF-e
   * aceita vários itens por documento — o que ela não aceita é destinatário
   * diferente por item. Por isso a emissão recusa pedidos de clientes
   * distintos em vez de gerar uma nota fiscal errada.
   */
  orderIds?: string[] | null;
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
  const { supabase, admin, orgId, userId, requestId, orderId, orderIds, extras } = input;

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

  /**
   * NF-E AVULSA (venda sem pedido) — o fato entra em `extras.avulsa`. Enquanto o
   * campo está ausente a emissão nasce de pedido (abaixo); com ele, o emitente
   * conta a venda que o operador registrou no balcão.
   */
  const avulsa = extras?.avulsa ?? null;

  // A nota já nasceu nesta tentativa (pedido OU avulsa). Se qualquer passo
  // seguinte falhar, ela NÃO pode ficar viva: uma linha em `em_emissao` sem job
  // é uma nota que nunca emite e nunca morre — a tela mostra "Emitindo" para
  // sempre. Descartar devolve a emissão ao estado anterior (nada emitido) e
  // deixa a pessoa tentar de novo.
  const descartarNota = async (motivo: string): Promise<never> => {
    const { error: erroDescarte } = await admin.from("invoices").delete().eq("id", notaId);
    if (erroDescarte) {
      logger.error("fiscal: falha ao descartar a nota órfã", {
        invoice_id: notaId,
        organization_id: orgId,
        erro: erroDescarte.message.slice(0, 300),
      });
    }
    throw new ApiError(500, "internal_error", { requestId }, requestId, motivo);
  };

  if (avulsa) {
    const escolha = resolverProvedor(cfg);

    // A venda avulsa não admite ajuste de item por `order_item_id` (não há
    // pedido): os itens informados na venda já são o fato, e ajustar seria
    // recontar um documento que nunca nasceu de pedido.
    if ((extras?.itens?.length ?? 0) > 0) {
      throw new ApiError(
        422,
        "validation_failed",
        { requestId },
        requestId,
        "A venda avulsa não admite ajustes de item — os itens informados na venda já são o fato.",
      );
    }

    const totalCents =
      avulsa.itens.reduce((soma, i) => soma + subtotalDoItem(i.quantidade, i.preco_cents, i.desconto_pct), 0) +
      avulsa.frete_cents;

    const destinatario = await carregarDestinatario(supabase, orgId, {
      cliente_nome: avulsa.cliente_nome ?? undefined,
      cliente_documento: avulsa.cliente_documento ?? null,
      contact_id: avulsa.contato_id ?? null,
    });
    const entrega = extras?.entrega ?? destinatario.entrega;

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
    if (escolha === "spednfe" && entrega && !destinatario.documento) {
      throw new ApiError(
        422,
        "validation_failed",
        { requestId },
        requestId,
        "O cadastro do cliente não tem CPF/CNPJ. É obrigatório na NF-e — complete o cadastro antes de emitir.",
      );
    }

    const extrasDaNota: ExtrasFiscais | null = {
      ...(extras ?? {}),
      avulsa,
      ...(entrega ? { entrega } : {}),
    };

    const { data: nota, error } = await supabase
      .from("invoices")
      .insert({
        organization_id: orgId,
        order_id: null,
        serie: cfg.serie,
        numero: null,
        chave_acesso: null,
        xml: null,
        status: "em_emissao",
        provedor: escolha,
        erro: null,
        extras_fiscais: extrasDaNota,
        total_cents: totalCents,
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
      // A nota já nasceu na transação falha aqui: descarta e devolve a emissão
      // ao estado anterior (nada foi emitido) — mesma régua do branch de pedido.
      return descartarNota("A fila fiscal recusou a nota. Nada foi emitido — tente novamente.");
    }

    await admin.from("fiscal_events").insert({
      organization_id: orgId,
      invoice_id: notaId,
      tipo: "criada",
      status: "em_emissao",
    });

    return nota as unknown as NotaEmitida;
  }

  const ids = [...new Set((orderIds?.length ? orderIds : orderId ? [orderId] : []).filter(Boolean))];
  if (ids.length === 0) {
    throw new ApiError(422, "validation_failed", { requestId }, requestId, "Escolha o pedido concluído, faturado ou expedido.");
  }

  const { data: pedidos, error: erroPedidos } = await supabase
    .from("commercial_orders")
    .select(
      "id, numero, cliente_nome, cliente_documento, contact_id, total_cents, frete_cents, status, informacoes_fiscais, observacoes",
    )
    .in("id", ids)
    .eq("organization_id", orgId);
  type PedidoDaNota = {
    id: string;
    numero: number;
    cliente_nome: string;
    cliente_documento: string | null;
    contact_id: string | null;
    total_cents: number;
    frete_cents: number;
    status: string;
    informacoes_fiscais: string | null;
    observacoes: string | null;
  };
  const lista = (pedidos ?? []) as unknown as PedidoDaNota[];
  if (erroPedidos || lista.length !== ids.length) {
    throw new ApiError(404, "not_found", { requestId }, requestId, "Pedido não encontrado.");
  }
  // A ordem escolhida manda: o primeiro da lista é o pedido principal da nota.
  lista.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const ped = lista[0]!;

  for (const p of lista) {
    if (!statusFaturavel(p.status)) {
      throw new ApiError(
        422,
        "validation_failed",
        { requestId },
        requestId,
        `O pedido ${p.numero} está "${p.status}" — só pedido concluído, faturado, expedido ou entregue vira nota.`,
      );
    }
  }

  // ─── AGRUPAR SÓ O QUE PODE IR NA MESMA NOTA ──────────────────────────────
  //
  // Uma NF-e tem UM destinatário. Juntar pedidos de clientes diferentes
  // ("agrupar" por engano, ou por engano de tela) produziria um documento que
  // a SEFAZ aceita e o fisco contesta: a mercadoria de um cliente amparada
  // pela nota de outro. A comparação é pelo contato do cadastro; sem contato,
  // pelo documento — que é o que a nota vai levar de qualquer jeito.
  const chaveDoDestinatario = (p: PedidoDaNota): string =>
    p.contact_id ?? p.cliente_documento ?? `pedido:${p.id}`;
  const clienteDosPedidos = new Set(lista.map(chaveDoDestinatario));
  if (clienteDosPedidos.size > 1) {
    throw new ApiError(
      422,
      "validation_failed",
      { requestId },
      requestId,
      "Só é possível agrupar pedidos do mesmo cliente numa nota — os pedidos escolhidos são de clientes diferentes.",
    );
  }

  // Um pedido, uma nota viva: segunda via nasce de reimpressão, não de nova
  // emissão (que duplicaria o fato fiscal). A checagem cobre os dois jeitos de
  // o pedido estar numa nota — a coluna antiga e o vínculo do agrupamento.
  const { data: vinculados } = await supabase
    .from("invoice_orders")
    .select("order_id, invoices!inner(status)")
    .in("order_id", ids)
    .eq("organization_id", orgId)
    .neq("invoices.status", "cancelada");
  const { data: porColuna } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("organization_id", orgId)
    .in("order_id", ids)
    .neq("status", "cancelada");
  const jaTemNota = (vinculados?.length ?? 0) > 0 || (porColuna?.length ?? 0) > 0;
  if (jaTemNota) {
    throw new ApiError(409, "conflict", { requestId }, requestId, "Um destes pedidos já tem nota (não cancelada).");
  }

  const totalCents = lista.reduce((soma, p) => soma + p.total_cents, 0);

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
  //
  // ── As "Informações Fiscais" do pedido viram o infCpl da nota ────────────
  //
  // O campo do pedido é o que o cliente já lê no pedido impresso (não é a
  // observação interna). É onde a ordem de compra dele entra, e digitar de
  // novo em toda emissão era o que fazia a referência sumir justamente nas
  // notas que o cliente confere. Sem texto no campo novo, cai no `observacoes`
  // legado — pedidos antigos continuam com a mesma fonte.
  //
  // Na nota agrupada vale o pedido PRINCIPAL (o primeiro): é ele que dá o
  // destinatário e o número da nota, e o infCpl é um só.
  const complementaresDoPedido = ((ped.informacoes_fiscais ?? ped.observacoes) ?? "").trim().slice(0, INF_CPL_MAX);
  const adicionaisDaNota: NonNullable<ExtrasFiscais["adicionais"]> | undefined =
    complementaresDoPedido !== "" && !extras?.adicionais?.informacoes_complementares
      ? { ...(extras?.adicionais ?? {}), informacoes_complementares: complementaresDoPedido }
      : extras?.adicionais;
  const extrasComAdicionais: ExtrasFiscais | null = adicionaisDaNota
    ? { ...(extras ?? {}), adicionais: adicionaisDaNota }
    : (extras ?? null);
  const extrasDaNota: ExtrasFiscais | null =
    extrasComAdicionais || entrega
      ? { ...(extrasComAdicionais ?? {}), ...(entrega ? { entrega } : {}) }
      : null;

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
      total_cents: totalCents,
      created_by: userId,
    })
    .select(COLUNAS_DA_NOTA)
    .single();
  if (error || !nota) {
    throw new ApiError(500, "internal_error", { requestId }, requestId, "Erro ao registrar a nota.");
  }
  const notaId = (nota as unknown as { id: string }).id;

  // ─── OS VÍNCULOS DO AGRUPAMENTO ──────────────────────────────────────────
  //
  // `invoices.order_id` guarda o pedido principal (tudo que já existia continua
  // lendo uma nota por pedido). `invoice_orders` guarda TODOS — é o que permite
  // o drain somar os itens dos três pedidos e o que impede o mesmo pedido de
  // entrar em duas notas vivas.
  //
  // ESCRITA PELO SERVICE ROLE (*), não pelo client da sessão. A 0294 dá ao
  // `authenticated` apenas `select` — de propósito, porque o vínculo é
  // consequência de uma decisão que o app já tomou, não uma escolha da tela.
  // Medido em 05/11/2026: com o client da sessão o INSERT voltava 42501, a
  // nota já tinha nascido e ficava órfã em `em_emissao` — sem job, sem evento,
  // invisível para o drain. Duas notas reais (4580/4581) pararam assim.
  const { error: erroVinculos } = await admin.from("invoice_orders").insert(
    lista.map((p) => ({
      invoice_id: notaId,
      order_id: p.id,
      organization_id: orgId,
    })),
  );

  if (erroVinculos) {
    return descartarNota("Não foi possível vincular os pedidos da nota. Nada foi emitido — tente novamente.");
  }

  const { error: erroJob } = await supabase.from("fiscal_jobs").insert({
    organization_id: orgId,
    invoice_id: notaId,
    tipo: "emitir",
    status: "pendente",
    created_by: userId,
  });
  if (erroJob) {
    return descartarNota("A fila fiscal recusou a nota. Nada foi emitido — tente novamente.");
  }

  await admin.from("fiscal_events").insert({
    organization_id: orgId,
    invoice_id: notaId,
    tipo: "criada",
    status: "em_emissao",
  });

  return nota as unknown as NotaEmitida;
}
