import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import type { ExtrasFiscais } from "@/lib/schemas/fiscal";
import { subtotalDoItem } from "@/lib/schemas/pedidos";
import { aplicarAjusteNosItens, type ItemDaNota } from "./ajustes-da-nota";
import { carregarDestinatario, type LocalDeEntrega } from "./destinatario-da-nota";
import { anoDaNumeracao, inutilizarNumeroQueimado, podeInutilizar } from "./inutilizacao-automatica";
import { destinoAposFalha, eRetentavel } from "./fila";
import { FALTA_EMISSOR, provedorStub, resolverProvedor, type ResultadoDeEmissao } from "./provedor";
import { devolverNumeroDaNota, podeDevolverNumero, reservarNumeroDaNota } from "./numeracao";
import { resolverProdutosDosItens } from "./produto-do-item";
import { emitirViaSpedNfe } from "./provedor-spednfe";
import { carregarContextoSped, type ItemSped } from "./sped-payload";

/**
 * O DRENO FISCAL — processa UM job de emissão até um estado terminal ou o
 * próximo backoff. Chamado pela rota cron (molde do motor de prospecção).
 *
 * Claim condicional (só `pendente` vira `processando`): dois ticks
 * concorrentes não emitem duas vezes — o perdedor encontra o job já
 * processando e devolve sem tocar na nota. Junto com "1 nota viva por
 * pedido", duplo clique e retry cego não duplicam NF.
 */

export interface JobFiscal {
  id: string;
  organization_id: string;
  invoice_id: string;
  tentativas: number;
  max_tentativas: number;
}

export type ResultadoJob =
  | { saidas: "concluido"; destino: string }
  | { saidas: "reagendado"; destino: string }
  | { saidas: "ignorado"; motivo: string };

async function evento(
  admin: SupabaseClient,
  orgId: string,
  invoiceId: string,
  tipo: string,
  extra: {
    status?: string | null;
    protocolo?: string | null;
    mensagem?: string | null;
    xml?: string | null;
  },
): Promise<void> {
  await admin.from("fiscal_events").insert({
    organization_id: orgId,
    invoice_id: invoiceId,
    tipo,
    status: extra.status ?? null,
    protocolo: extra.protocolo ?? null,
    mensagem: extra.mensagem?.slice(0, 2000) ?? null,
    xml: extra.xml ?? null,
  });
}

export async function processarJob(admin: SupabaseClient, job: JobFiscal): Promise<ResultadoJob> {
  // Claim: só quem tira de `pendente` trabalha.
  const { data: claimed } = await admin
    .from("fiscal_jobs")
    .update({ status: "processando", updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "pendente")
    .select("id");
  if (!claimed || (claimed as unknown[]).length === 0) {
    return { saidas: "ignorado", motivo: "job já reclamado" };
  }

  const { data: notaDb } = await admin
    .from("invoices")
    .select("id, organization_id, order_id, serie, status, provedor, numero, created_at, extras_fiscais")
    .eq("id", job.invoice_id)
    .maybeSingle();
  const nota = notaDb as unknown as {
    id: string;
    organization_id: string;
    order_id: string;
    serie: string;
    status: string;
    provedor: string;
    numero: number | null;
    created_at: string;
    extras_fiscais: ExtrasFiscais | null;
  } | null;
  // Nota saiu de em_emissao no meio do caminho (cancelada pelo usuário):
  // encerra o job sem tocar em nada — história fiscal não se reescreve.
  if (!nota || nota.status !== "em_emissao") {
    await admin
      .from("fiscal_jobs")
      .update({ status: "concluido", updated_at: new Date().toISOString() })
      .eq("id", job.id);
    return { saidas: "ignorado", motivo: "nota fora de emissão" };
  }

  const { data: config } = await admin
    .from("fiscal_settings")
    .select("serie, natureza_operacao, cfop_padrao, emitente_documento, provedor")
    .eq("organization_id", nota.organization_id)
    .maybeSingle();
  const cfg = config as unknown as { serie: string; provedor: string } | null;
  const escolha = cfg ? resolverProvedor(cfg) : "stub";

  const avulsa = nota.order_id == null ? (nota.extras_fiscais?.avulsa ?? null) : null;

  /**
   * O CONTEXTO DO DOCUMENTO A EMITIR — um pedido (único ou agrupado) OU a venda
   * avulsa. A nota fiscal em si é a mesma (um destinatário, os itens, o frete);
   * a ORIGEM do fato muda, e é ela que decide o caminho.
   */
  const contexto: {
    order_id: string | null;
    numero: number;
    total_cents: number;
    nome: string;
    documento: string | null;
    ie: string | null;
    indicador_ie: string | null;
    frete_cents: number;
    itens: ItemSped[];
  } = {
    order_id: null,
    numero: 0,
    total_cents: 0,
    nome: "",
    documento: null,
    ie: null,
    indicador_ie: null,
    frete_cents: 0,
    itens: [],
  };
  let entrega: LocalDeEntrega | null = null;
  let extras: ExtrasFiscais | null = null;

  if (avulsa) {
    // NF-E AVULSA — a venda não nasceu de pedido: os itens informados na própria
    // venda são o fato, e o destinatário vem do cadastro (ou do que a venda trouxe).
    const destinatario = await carregarDestinatario(admin, nota.organization_id, {
      cliente_nome: avulsa.cliente_nome ?? undefined,
      cliente_documento: avulsa.cliente_documento ?? null,
      contact_id: avulsa.contato_id ?? null,
    });
    entrega = nota.extras_fiscais?.entrega ?? destinatario.entrega;
    extras = entrega ? { ...(nota.extras_fiscais ?? {}), entrega } : nota.extras_fiscais;

    const itensDaNota: ItemSped[] = (
      await resolverProdutosDosItens(admin, nota.organization_id, avulsa.itens.map((i) => ({
        product_id: i.product_id ?? null,
        produto_codigo: i.codigo ?? null,
        produto_nome: i.descricao ?? null,
      })))
    ).map((produto, pos) => {
      const item = avulsa.itens[pos]!;
      return {
        codigo: produto?.codigo ?? item.codigo ?? "",
        descricao: item.descricao ?? "",
        ncm: produto?.ncm ?? item.ncm ?? null,
        cfop: produto?.cfop ?? item.cfop ?? null,
        unidade: produto?.unidade ?? item.unidade ?? null,
        quantidade: item.quantidade,
        preco_cents: item.preco_cents,
        desconto_pct: item.desconto_pct,
      };
    });

    contexto.order_id = null;
    contexto.numero = 0;
    contexto.total_cents =
      avulsa.itens.reduce((soma, i) => soma + subtotalDoItem(i.quantidade, i.preco_cents, i.desconto_pct), 0) +
      (avulsa.frete_cents ?? 0);
    contexto.nome = destinatario.nome || avulsa.cliente_nome || "";
    contexto.documento = destinatario.documento ?? avulsa.cliente_documento ?? null;
    contexto.ie = destinatario.ie;
    contexto.indicador_ie = destinatario.indicador_ie;
    contexto.frete_cents = avulsa.frete_cents ?? 0;
    contexto.itens = itensDaNota;
  } else {
    const { data: pedido } = await admin
      .from("commercial_orders")
      .select("id, numero, cliente_nome, cliente_documento, contact_id, total_cents, frete_cents")
      .eq("id", nota.order_id)
      .maybeSingle();
    const ped = pedido as unknown as {
      id: string;
      numero: number;
      cliente_nome: string;
      cliente_documento: string | null;
      contact_id: string | null;
      total_cents: number;
      frete_cents: number;
    } | null;
    if (!ped) {
      await finalizar(admin, job, nota, "erro", "Pedido da nota sumiu.", null);
      return { saidas: "concluido", destino: "erro" };
    }

    const { data: vinculos } = await admin
      .from("invoice_orders")
      .select("order_id")
      .eq("invoice_id", nota.id)
      .eq("organization_id", nota.organization_id);
    const idsDosPedidos = (vinculos ?? []).length
      ? (vinculos as unknown as { order_id: string }[]).map((v) => v.order_id)
      : [ped.id];

    let freteDaNota = ped.frete_cents ?? 0;
    if (idsDosPedidos.length > 1) {
      const { data: fretes } = await admin
        .from("commercial_orders")
        .select("id, frete_cents")
        .in("id", idsDosPedidos)
        .eq("organization_id", nota.organization_id);
      freteDaNota = ((fretes ?? []) as unknown as { frete_cents: number | null }[]).reduce(
        (soma, f) => soma + (f.frete_cents ?? 0),
        0,
      );
    }
    const pedidoDaNota = { ...ped, frete_cents: freteDaNota };

    const destinatario = await carregarDestinatario(
      admin,
      nota.organization_id,
      ped,
      nota.extras_fiscais?.destinatario,
    );
    const entregaDoCadastro = nota.extras_fiscais?.entrega ?? destinatario.entrega;
    entrega = entregaDoCadastro;
    extras = entregaDoCadastro
      ? { ...(nota.extras_fiscais ?? {}), entrega: entregaDoCadastro }
      : nota.extras_fiscais;
    const nomeDestinatario = destinatario.nome || ped.cliente_nome;
    const documentoDestinatario = destinatario.documento ?? ped.cliente_documento;

    const { data: itensDb } = await admin
      .from("commercial_order_items")
      .select(
        "id, produto_codigo, produto_nome, quantidade, preco_unit_cents, desconto_pct, product_id",
      )
      .in("order_id", idsDosPedidos)
      .eq("organization_id", nota.organization_id)
      .order("posicao");
    const produtosDosItens = await resolverProdutosDosItens(
      admin,
      nota.organization_id,
      ((itensDb ?? []) as unknown as {
        product_id: string | null;
        produto_codigo: string | null;
        produto_nome: string | null;
      }[]).map((i) => ({
        product_id: i.product_id,
        produto_codigo: i.produto_codigo,
        produto_nome: i.produto_nome,
      })),
    );
    const itensDaNota: ItemDaNota[] = (
      (itensDb ?? []) as unknown as {
        id: string;
        produto_codigo: string | null;
        produto_nome: string | null;
        quantidade: number;
        preco_unit_cents: number;
        desconto_pct: number | string;
        product_id: string | null;
      }[]
    ).map((i, pos) => {
      const produto = produtosDosItens[pos];
      return {
        order_item_id: i.id,
        codigo: i.produto_codigo ?? "",
        descricao: i.produto_nome ?? "",
        ncm: produto?.ncm ?? null,
        cfop: produto?.cfop ?? null,
        unidade: produto?.unidade ?? null,
        quantidade: i.quantidade,
        preco_cents: i.preco_unit_cents,
        desconto_pct: Number(i.desconto_pct),
      };
    });
    const itensAjustados = aplicarAjusteNosItens(itensDaNota, nota.extras_fiscais?.itens);

    contexto.order_id = ped.id;
    contexto.numero = ped.numero;
    contexto.total_cents = ped.total_cents;
    contexto.nome = nomeDestinatario;
    contexto.documento = documentoDestinatario;
    contexto.ie = destinatario.ie;
    contexto.indicador_ie = destinatario.indicador_ie;
    contexto.frete_cents = pedidoDaNota.frete_cents;
    contexto.itens = itensAjustados.map((i) => ({
      codigo: i.codigo,
      descricao: i.descricao,
      ncm: i.ncm,
      cfop: i.cfop,
      unidade: i.unidade,
      quantidade: i.quantidade,
      preco_cents: i.preco_cents,
      desconto_pct: i.desconto_pct,
    }));
  }

  let resultado: ResultadoDeEmissao;
  let numeroDaNota: number | null = null;
  if (escolha === "spednfe") {
    await evento(admin, nota.organization_id, nota.id, "enviada", { status: "em_emissao" });
    const ctx = await carregarContextoSped(nota.organization_id);
    if (!ctx) {
      await finalizar(admin, job, nota, "erro", "Configuração fiscal sumiu no meio da emissão.", null);
      return { saidas: "concluido", destino: "erro" };
    }
    const reserva = await reservarNumeroDaNota(admin, nota.organization_id);
    if (!reserva.ok) {
      await finalizar(admin, job, nota, "erro", reserva.falta, null);
      return { saidas: "concluido", destino: "erro" };
    }
    const numeroReservado = reserva.numero;
    numeroDaNota = numeroReservado;
    contexto.numero = numeroReservado;
    await admin
      .from("invoices")
      .update({ numero: numeroReservado, updated_at: new Date().toISOString() })
      .eq("id", nota.id);

    const em = ctx.emitente as unknown as Record<string, string | null>;
    resultado = await emitirViaSpedNfe({
      organizationId: nota.organization_id,
      emitente: {
        serie: cfg?.serie ?? nota.serie,
        natureza_operacao: (em.natureza_operacao as string) ?? "",
        cfop_padrao: (em.cfop_padrao as string) ?? "",
        emitente_documento: em.emitente_documento ?? null,
        razao_social: (em.razao_social as string | null) ?? null,
        ie: em.ie ?? null,
        crt: (em.crt as string) ?? "1",
        logradouro: em.logradouro ?? null,
        numero_end: em.numero_end ?? null,
        bairro: em.bairro ?? null,
        municipio: em.municipio ?? null,
        codigo_municipio: em.codigo_municipio ?? null,
        uf: em.uf ?? null,
        cep: em.cep ?? null,
        ambiente: (em.ambiente as string) ?? "homologacao",
        certificado_path: em.certificado_path ?? null,
      },
      senhaCertificado: ctx.senhaCertificado ?? "",
      pedido: {
        numero: numeroReservado,
        nome: contexto.nome,
        documento: contexto.documento,
        ie: contexto.ie,
        indicador_ie: contexto.indicador_ie,
        frete_cents: contexto.frete_cents,
      },
      extras,
      itens: contexto.itens,
    });
  } else {
    resultado = await provedorStub.emitir({
      order_id: contexto.order_id,
      numero: contexto.numero,
      cliente_nome: contexto.nome,
      cliente_documento: contexto.documento,
      total_cents: contexto.total_cents,
    });
    // Stub é homologação declarada: volta para pendente com o motivo, em vez
    // de fingir processamento — o drain não anda stub adiante sozinho.
    await admin
      .from("invoices")
      .update({ status: "pendente", erro: FALTA_EMISSOR, updated_at: new Date().toISOString() })
      .eq("id", nota.id);
    await evento(admin, nota.organization_id, nota.id, "erro", {
      status: "pendente",
      mensagem: FALTA_EMISSOR,
    });
    await admin
      .from("fiscal_jobs")
      .update({ status: "concluido", updated_at: new Date().toISOString() })
      .eq("id", job.id);
    return { saidas: "concluido", destino: "pendente" };
  }

  // Número consumido sem ter saído daqui: devolve, para a sequência continuar
  // de onde parou (falha local ou RECUSA DEFINITIVA da SEFAZ — ver
  // `podeDevolverNumero`). A devolução desfaz as DUAS metades (contador e linha
  // da nota); ver `devolverNumeroDaNota`.
  //
  // ─── POR QUE A REJEIÇÃO TAMBÉM DEVOLVE ─────────────────────────────────
  //
  // Rejeição (232 IE não informada, 234 IE não vinculada, 210 IE inválida) é
  // documento NÃO autorizado: a SEFAZ descarta a nota e o número continua
  // livre. Sem devolver, cada recusa abria um buraco na série e a reemissão
  // pegava o número seguinte. Medido em 06/11/2026: 4595/4596 e 4602/4604
  // viraram buracos, e as notas saíram como 4597, 4603 e 4605.
  //
  // Se outra emissão já tomou o número seguinte, a devolução falha (função de
  // banco) e o número continua nesta nota — visível para inutilização.
  let numeroDevolvido = false;
  if (numeroDaNota !== null) {
    if (podeDevolverNumero(resultado)) {
      numeroDevolvido = await devolverNumeroDaNota(
        admin,
        nota.organization_id,
        numeroDaNota,
        nota.id,
      );
    }
    if (numeroDevolvido) {
      // O número voltou ao contador e saiu da linha: a nota não tem mais
      // número, e `finalizar` não pode regravá-lo nem inutilizá-lo.
      nota.numero = null;
      resultado = { ...resultado, numero: null };
    } else if (resultado.numero == null) {
      // A SEFAZ respondeu mas não repetiu o número: o da reserva é o que foi
      // transmitido, e é ele que fica gravado.
      resultado = { ...resultado, numero: numeroDaNota };
    }
  }

  if (resultado.status === "autorizada") {
    await finalizar(admin, job, nota, "autorizada", resultado.sefaz_xmotivo ?? null, resultado);
    return { saidas: "concluido", destino: "autorizada" };
  }

  // Erro ou denegada: denegada é terminal fiscal; erro decide retry/dead.
  if (resultado.status === "denegada") {
    await finalizar(
      admin,
      job,
      nota,
      "denegada",
      resultado.erro ?? resultado.sefaz_xmotivo ?? "Denegada.",
      resultado,
    );
    return { saidas: "concluido", destino: "denegada" };
  }
  const msg = resultado.erro ?? "Erro sem motivo.";
  const tentativa = job.tentativas + 1;
  if (!eRetentavel(msg)) {
    await finalizar(admin, job, nota, "erro", msg, resultado);
    return { saidas: "concluido", destino: "erro" };
  }
  const { status, esperaMin } = destinoAposFalha(tentativa);
  if (status === "erro") {
    await finalizar(admin, job, nota, "erro", `${msg} (após ${tentativa} tentativas)`, resultado);
    return { saidas: "concluido", destino: "erro" };
  }
  const proxima = new Date(Date.now() + esperaMin * 60000).toISOString();
  await admin
    .from("invoices")
    .update({ erro: msg, updated_at: new Date().toISOString() })
    .eq("id", nota.id);
  await evento(admin, nota.organization_id, nota.id, "retry", {
    status: "em_emissao",
    mensagem: `Tentativa ${tentativa}: ${msg}`,
  });
  await admin
    .from("fiscal_jobs")
    .update({
      status: "pendente",
      tentativas: tentativa,
      proxima_tentativa: proxima,
      ultimo_erro: msg.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  return { saidas: "reagendado", destino: "em_emissao" };
}

async function finalizar(
  admin: SupabaseClient,
  job: JobFiscal,
  nota: {
    id: string;
    organization_id: string;
    serie: string;
    numero: number | null;
    created_at: string;
  },
  status: "autorizada" | "denegada" | "erro" | "cancelada",
  mensagem: string | null,
  resultado: ResultadoDeEmissao | null,
): Promise<void> {
  const { error: erroDoRegistro } = await admin
    .from("invoices")
    .update({
      status,
      ...(resultado?.numero != null ? { numero: resultado.numero } : {}),
      ...(resultado?.chave_acesso != null ? { chave_acesso: resultado.chave_acesso } : {}),
      ...(resultado?.xml != null ? { xml: resultado.xml } : {}),
      ...(resultado?.protocolo != null ? { protocolo: resultado.protocolo } : {}),
      ...(resultado?.sefaz_cstat != null ? { sefaz_cstat: resultado.sefaz_cstat } : {}),
      ...(resultado?.sefaz_xmotivo != null ? { sefaz_xmotivo: resultado.sefaz_xmotivo } : {}),
      erro: status === "autorizada" ? null : mensagem,
      updated_at: new Date().toISOString(),
    })
    .eq("id", nota.id);
  await evento(
    admin,
    nota.organization_id,
    nota.id,
    status === "denegada" ? "rejeitada" : status === "autorizada" ? "autorizada" : "erro",
    {
      status,
      protocolo: resultado?.protocolo ?? null,
      mensagem,
      xml: resultado?.xml ?? null,
    },
  );

  // ─── A NOTA AUTORIZADA NÃO PODE SUMIR NUM ERRO DE GRAVAÇÃO ────────────────
  //
  // Medido em 04/11/2026: o UPDATE da nota 4577 (pedido 19415) bateu no índice
  // único `invoices_org_serie_numero_key` — o número havia sido entregue a
  // duas notas — e o erro foi DESCARTADO. A SEFAZ tinha autorizado a nota; a
  // tela seguiu dizendo "Emitindo", sem número, chave nem protocolo, e o
  // `fiscal_jobs` marcou o trabalho como concluído. A nota existia no fisco e
  // não existia aqui.
  //
  // O erro agora tem dois lugares visíveis: o log (com chave e protocolo, o
  // que basta para reconstruir a nota à mão) e um evento `erro` na própria
  // nota. Reemitir é a resposta ERRADA — o número já foi usado na SEFAZ.
  if (erroDoRegistro) {
    logger.error("fiscal: nota não gravada depois do retorno da SEFAZ", {
      invoice_id: nota.id,
      organization_id: nota.organization_id,
      status,
      chave_acesso: resultado?.chave_acesso ?? null,
      protocolo: resultado?.protocolo ?? null,
      erro: erroDoRegistro.message.slice(0, 300),
    });
    await evento(admin, nota.organization_id, nota.id, "erro", {
      status: "registro_falhou",
      protocolo: resultado?.protocolo ?? null,
      mensagem:
        `A SEFAZ respondeu "${status}"` +
        (resultado?.protocolo ? ` (protocolo ${resultado.protocolo})` : "") +
        (resultado?.chave_acesso ? `, chave ${resultado.chave_acesso}` : "") +
        `, mas o registro local falhou: ${erroDoRegistro.message}. ` +
        "NÃO REEMITA — o número já foi usado na SEFAZ.",
      xml: null,
    });
  }
  await admin
    .from("fiscal_jobs")
    .update({
      status: "concluido",
      tentativas: job.tentativas + 1,
      ultimo_erro: mensagem?.slice(0, 500) ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  if (status === "autorizada") {
    await audit({
      organizationId: nota.organization_id,
      action: "invoice.emitted",
      resourceType: "invoices",
      resourceId: nota.id,
    });
  }

  // ─── O NÚMERO QUEIMADO VIRA INUTILIZAÇÃO ────────────────────────────────
  //
  // A reserva acontece ANTES da transmissão (é o que impede duas notas com o
  // mesmo `nNF`). Quando a SEFAZ rejeita de forma DEFINITIVA e o número NÃO
  // pôde voltar ao contador (outra emissão já tomou o seguinte), ele não
  // pertence mais a nota nenhuma: a próxima tentativa pega outro. Medido em
  // 05/11/2026, quatro números (4580/4581/4583/4587) ficaram como buraco na
  // série — obrigação acessória que não se resolve sozinha. A rejeição que
  // devolveu o número (`numeroDevolvido`) não chega aqui: não há buraco.
  //
  // Só para recusa DEFINITIVA (`podeInutilizar`): timeout e lote em
  // processamento podem ter virado nota, e inutilizar seria declarar morto um
  // número vivo. Falhar aqui não desfaz nada — a inutilização fica
  // `registrada` e o botão de lacunas recolhe o que sobrar.
  const numeroQueimado = resultado?.numero ?? nota.numero;
  if (status === "erro" && numeroQueimado != null && podeInutilizar(resultado)) {
    await inutilizarNumeroQueimado(admin, nota.organization_id, {
      serie: nota.serie,
      numero: numeroQueimado,
      cstat: resultado?.sefaz_cstat ?? null,
      notaNumero: nota.numero ?? numeroQueimado,
      invoiceId: nota.id,
      anoDaNota: anoDaNumeracao(nota.created_at),
    });
  }
}
