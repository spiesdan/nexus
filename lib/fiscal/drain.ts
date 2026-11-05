import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import type { ExtrasFiscais } from "@/lib/schemas/fiscal";
import { aplicarAjusteNosItens, type ItemDaNota } from "./ajustes-da-nota";
import { carregarDestinatario } from "./destinatario-da-nota";
import { destinoAposFalha, eRetentavel } from "./fila";
import { FALTA_EMISSOR, provedorStub, resolverProvedor, type ResultadoDeEmissao } from "./provedor";
import { devolverNumeroDaNota, falhouAntesDaSefaz, reservarNumeroDaNota } from "./numeracao";
import { emitirViaSpedNfe } from "./provedor-spednfe";
import { carregarContextoSped } from "./sped-payload";

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
    .select("id, organization_id, order_id, serie, status, provedor, numero, extras_fiscais")
    .eq("id", job.invoice_id)
    .maybeSingle();
  const nota = notaDb as unknown as {
    id: string;
    organization_id: string;
    order_id: string;
    serie: string;
    status: string;
    provedor: string;
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

  // ─── OS PEDIDOS DA NOTA (pode ser mais de um) ─────────────────────────────
  //
  // Cliente que agrupou três pedidos tem UMA nota com os itens dos três. Os
  // vínculos vivem em `invoice_orders`; notas emitidas antes do agrupamento
  // existir não têm linha lá e caem no `order_id` da própria nota.
  const { data: vinculos } = await admin
    .from("invoice_orders")
    .select("order_id")
    .eq("invoice_id", nota.id)
    .eq("organization_id", nota.organization_id);
  const idsDosPedidos = (vinculos ?? []).length
    ? (vinculos as unknown as { order_id: string }[]).map((v) => v.order_id)
    : [ped.id];

  // O frete da nota é a SOMA dos pedidos agrupados — cobrar o frete de um só
  // quando a carga tem três seria diferença de dinheiro no documento fiscal.
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

  // O destinatário é lido AGORA, do cadastro — não da foto que o pedido
  // congelou na importação. Nome e documento do contato vencem os do pedido, e
  // o endereço vem do cadastro quando a nota não trouxe um (notas antigas, ou
  // emissão sem endereço digitado). Emissão que já gravou `entrega` na nota é
  // respeitada: o que foi decidido na hora da emissão não se reescreve.
  //
  // O AJUSTE DA NOTA entra aqui: se a nota foi corrigida depois de uma
  // rejeição (IE do destinatário, endereço), a correção vale para ela — é o
  // documento que está sendo reenviado, não um cadastro novo.
  const destinatario = await carregarDestinatario(
    admin,
    nota.organization_id,
    ped,
    nota.extras_fiscais?.destinatario,
  );
  const entrega = nota.extras_fiscais?.entrega ?? destinatario.entrega;
  const extras: ExtrasFiscais | null = entrega
    ? { ...(nota.extras_fiscais ?? {}), entrega }
    : nota.extras_fiscais;
  const nomeDestinatario = destinatario.nome || ped.cliente_nome;
  const documentoDestinatario = destinatario.documento ?? ped.cliente_documento;

  let resultado: ResultadoDeEmissao;
  // Número reservado nesta tentativa (0391). Fica fora do bloco para que a
  // devolução, depois do retorno da SEFAZ, saiba qual número desfazer.
  let numeroDaNota: number | null = null;
  if (escolha === "spednfe") {
    await evento(admin, nota.organization_id, nota.id, "enviada", { status: "em_emissao" });
    const ctx = await carregarContextoSped(nota.organization_id);
    if (!ctx) {
      await finalizar(
        admin,
        job,
        nota,
        "erro",
        "Configuração fiscal sumiu no meio da emissão.",
        null,
      );
      return { saidas: "concluido", destino: "erro" };
    }
    const { data: itensDb } = await admin
      .from("commercial_order_items")
      .select(
        "id, produto_codigo, produto_nome, quantidade, preco_unit_cents, desconto_pct, product_id",
      )
      .in("order_id", idsDosPedidos)
      .eq("organization_id", nota.organization_id)
      .order("posicao");
    const idsProd = ((itensDb ?? []) as unknown as { product_id: string | null }[])
      .map((i) => i.product_id)
      .filter(Boolean) as string[];
    const fiscais: Record<
      string,
      { ncm: string | null; cfop: string | null; unidade: string | null }
    > = {};
    if (idsProd.length > 0) {
      const { data: prods } = await admin
        .from("catalog_products")
        .select("id, ncm, cfop, unidade")
        .eq("organization_id", nota.organization_id)
        .in("id", idsProd);
      for (const p of (prods ?? []) as unknown as {
        id: string;
        ncm: string | null;
        cfop: string | null;
        unidade: string | null;
      }[]) {
        fiscais[p.id] = p;
      }
    }
    // O NÚMERO DA NOTA VEM DO CONTADOR, NÃO DO PEDIDO.
    //
    // Antes daqui saía `ped.numero`. Pedido que não vira nota abre buraco na
    // sequência da série, e a SEFAZ cobra inutilização por cada buraco. A
    // reserva é atômica (função de banco): duas emissões simultâneas nunca
    // recebem o mesmo número.
    const reserva = await reservarNumeroDaNota(admin, nota.organization_id);
    if (!reserva.ok) {
      await finalizar(admin, job, nota, "erro", reserva.falta, null);
      return { saidas: "concluido", destino: "erro" };
    }
    const numeroReservado = reserva.numero;
    numeroDaNota = numeroReservado;
    // A nota passa a mostrar o número em uso ANTES da transmissão: se a SEFAZ
    // demorar ou cair, a tela diz qual número está em jogo, em vez de "sem
    // número" enquanto uma faixa já foi consumida.
    await admin
      .from("invoices")
      .update({ numero: numeroReservado, updated_at: new Date().toISOString() })
      .eq("id", nota.id);

    // O item entra no XML com a correção da nota por cima (NCM/CFOP/unidade/
    // descrição): a rejeição é do documento, e o ajuste é por item do pedido.
    const itensDaNota: ItemDaNota[] = (
      (itensDb ?? []) as unknown as {
        id: string;
        produto_codigo: string;
        produto_nome: string;
        quantidade: number;
        preco_unit_cents: number;
        desconto_pct: number;
        product_id: string | null;
      }[]
    ).map((i) => ({
      order_item_id: i.id,
      codigo: i.produto_codigo,
      descricao: i.produto_nome,
      ncm: i.product_id ? (fiscais[i.product_id]?.ncm ?? null) : null,
      cfop: i.product_id ? (fiscais[i.product_id]?.cfop ?? null) : null,
      unidade: i.product_id ? (fiscais[i.product_id]?.unidade ?? null) : null,
      quantidade: i.quantidade,
      preco_cents: i.preco_unit_cents,
      desconto_pct: Number(i.desconto_pct),
    }));
    const itensAjustados = aplicarAjusteNosItens(itensDaNota, nota.extras_fiscais?.itens);

    const em = ctx.emitente as unknown as Record<string, string | null>;
    resultado = await emitirViaSpedNfe({
      // Só para montar o caminho do certificado no formato que o sidecar exige
      // (`/certs/{orgId}/certificado.pfx`). O `certificado_path` do banco é o
      // nome do arquivo, e o sidecar recusa caminho fora de `/certs/`.
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
        nome: nomeDestinatario,
        documento: documentoDestinatario,
        ie: destinatario.ie,
        indicador_ie: destinatario.indicador_ie,
        frete_cents: pedidoDaNota.frete_cents,
      },
      extras,
      itens: itensAjustados.map((i) => ({
        codigo: i.codigo,
        descricao: i.descricao,
        ncm: i.ncm,
        cfop: i.cfop,
        unidade: i.unidade,
        quantidade: i.quantidade,
        preco_cents: i.preco_cents,
        desconto_pct: i.desconto_pct,
      })),
    });
  } else {
    resultado = await provedorStub.emitir({
      order_id: ped.id,
      numero: ped.numero,
      cliente_nome: nomeDestinatario,
      cliente_documento: documentoDestinatario,
      total_cents: ped.total_cents,
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
  // de onde parou (certificado, validação, configuração — nada transmitido).
  // A devolução desfaz as DUAS metades (contador e linha da nota); ver
  // `devolverNumeroDaNota`.
  if (numeroDaNota !== null && falhouAntesDaSefaz(resultado)) {
    await devolverNumeroDaNota(admin, nota.organization_id, numeroDaNota, nota.id);
  } else if (numeroDaNota !== null && resultado.numero == null) {
    // A SEFAZ respondeu mas não repetiu o número: o da reserva é o que foi
    // transmitido, e é ele que fica gravado.
    resultado = { ...resultado, numero: numeroDaNota };
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
  nota: { id: string; organization_id: string },
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
}
