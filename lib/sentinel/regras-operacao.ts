/**
 * Detectores de OPERAÇÃO/ERP — determinísticos, somente leitura.
 *
 * Cobrem o que o produto realmente tem hoje: pedido comercial, recebível,
 * estoque, fila de jobs, webhook, importação Mercos e campanha. Nada aqui
 * pressupõe entidade que não existe (não há "expedição parada" sem carga
 * aberta, nem "sync VTEX" sem integração VTEX configurada).
 */
import type { Achado, CampanhaProspeccao, Snapshot } from "./tipos";
import {
  corta,
  DIA_MS,
  diaUtc,
  hashCurto,
  HORA_MS,
  idadeMs,
  maisVelhoQue,
  mascararEmail,
  mascararTelefone,
  MINUTO_MS,
  textoOuNulo,
  ufValida,
} from "./utilitarios";

const PEDIDO_AVANCADO = new Set(["aprovado", "faturado", "expedido", "entregue"]);
const RECEBIVEL_ABERTO = new Set(["aberto", "parcial"]);

export function estoqueNegativo(s: Snapshot): Achado[] {
  return s.produtos
    .filter((p) => p.controla_estoque && p.quantidade < 0)
    .map((p) => ({
      regra: "operacao.estoque_negativo",
      categoria: "operacao" as const,
      entidadeTipo: "catalog_products",
      entidadeId: p.id,
      titulo: `${p.nome} com estoque negativo (${p.quantidade})`,
      resumo:
        "O saldo ficou abaixo de zero. Ou saiu mercadoria que não estava no sistema, ou a entrada não foi lançada.",
      causaProvavel:
        "Baixa de pedido em duplicidade, entrada de compra não lançada ou ajuste manual que ignorou o saldo.",
      severidade: "alta" as const,
      href: "/app/estoque",
      evidencia: {
        codigo: p.codigo,
        quantidade: p.quantidade,
        estoque_minimo: p.estoque_minimo,
        atualizado_em: p.updated_at,
      },
    }));
}

/**
 * Divergência entre o saldo cacheado e o razão — com a limitação declarada.
 *
 * `inventory_movements` nasceu em 0242 e NÃO registra saldo de abertura. Por
 * isso esta regra só olha produtos criados depois do razão existir, exige um
 * piso de diferença e nasce com confiança BAIXA: a diferença pode ser estoque
 * inicial. O plano manda contar fisicamente antes de qualquer ajuste; é
 * exatamente o oposto de "corrigir o cache para bater".
 */
export function estoqueDivergente(s: Snapshot): Achado[] {
  return s.estoqueRazao.flatMap((r) => {
    const diferenca = r.diferenca;
    const piso = Math.max(10, Math.round(0.1 * Math.max(Math.abs(r.quantidade), Math.abs(r.saldo_razao))));
    if (Math.abs(diferenca) < piso) return [];

    return [
      {
        regra: "operacao.estoque_divergente",
        categoria: "operacao" as const,
        entidadeTipo: "catalog_products",
        entidadeId: r.product_id,
        titulo: `${r.nome}: saldo (${r.quantidade}) difere do razão (${r.saldo_razao})`,
        resumo:
          "O saldo cacheado não é o que a soma das movimentações desde 0242 explica. Pode ser saldo inicial ou movimentação que não passou pelo razão.",
        causaProvavel:
          "Estoque inicial cadastrado antes do razão, UPDATE direto no saldo, movimentação perdida ou baixa em duplicidade.",
        severidade: "baixa" as const,
        href: "/app/estoque",
        evidencia: {
          codigo: r.codigo,
          quantidade: r.quantidade,
          saldo_razao: r.saldo_razao,
          diferenca,
          movimentos: r.movimentos,
          criado_em: r.criado_em,
          ultimo_movimento: r.ultimo_movimento,
          confianca: "baixa",
          limitacao: "Sem saldo de abertura no razão; confirmar com contagem física.",
        },
      },
    ];
  });
}

export function pedidosComTotalIncoerente(s: Snapshot): Achado[] {
  return s.pedidos.flatMap((p) => {
    const calculado = p.subtotal_cents - p.desconto_cents + p.frete_cents;
    if (calculado === p.total_cents) return [];
    return [
      {
        regra: "operacao.pedido_total_incoerente",
        categoria: "operacao" as const,
        entidadeTipo: "commercial_orders",
        entidadeId: p.id,
        titulo: `Pedido ${p.numero}: total não fecha`,
        resumo:
          "O total gravado não é subtotal − desconto + frete. Um relatório vai discordar do outro.",
        causaProvavel:
          "Item alterado sem recálculo, desconto aplicado direto no total ou edição manual fora da regra.",
        severidade: "alta" as const,
        href: `/app/pedidos/${p.id}`,
        evidencia: {
          pedido_numero: p.numero,
          subtotal_cents: p.subtotal_cents,
          desconto_cents: p.desconto_cents,
          frete_cents: p.frete_cents,
          total_cents: p.total_cents,
          total_calculado_cents: calculado,
          diferenca_cents: p.total_cents - calculado,
        },
      },
    ];
  });
}

export function pedidosPresos(s: Snapshot): Achado[] {
  return s.pedidos
    .filter(
      (p) =>
        ["rascunho", "em_analise"].includes(p.status) &&
        maisVelhoQue(p.updated_at, s.agoraMs, 7 * DIA_MS),
    )
    .map((p) => ({
      regra: "operacao.pedido_preso",
      categoria: "operacao" as const,
      entidadeTipo: "commercial_orders",
      entidadeId: p.id,
      titulo: `Pedido ${p.numero} parado em ${p.status} há mais de 7 dias`,
      resumo:
        "O pedido não avançou. Rascunho/em análise sem toque é venda que esfria sem ninguém decidir.",
      causaProvavel:
        "Falta de follow-up comercial, aprovação pendente ou pedido abandonado depois de criado.",
      severidade: "media" as const,
      href: `/app/pedidos/${p.id}`,
      evidencia: {
        pedido_status: p.status,
        pedido_numero: p.numero,
        total_cents: p.total_cents,
        atualizado_em: p.updated_at,
      },
    }));
}

export function pedidosAvancadosSemCliente(s: Snapshot): Achado[] {
  return s.pedidos
    .filter((p) => PEDIDO_AVANCADO.has(p.status) && !p.contact_id)
    .map((p) => ({
      regra: "operacao.pedido_sem_cliente",
      categoria: "operacao" as const,
      entidadeTipo: "commercial_orders",
      entidadeId: p.id,
      titulo: `Pedido ${p.numero} avançado sem cliente vinculado`,
      resumo:
        "O pedido já saiu do rascunho, mas não aponta para nenhum contato — não há ficha 360°, histórico nem cobrança.",
      causaProvavel:
        "Contato apagado depois do pedido (o vínculo usa `on delete set null`) ou pedido criado por importação sem casar o cliente.",
      severidade: "media" as const,
      href: `/app/pedidos/${p.id}`,
      evidencia: {
        pedido_status: p.status,
        pedido_numero: p.numero,
        total_cents: p.total_cents,
      },
    }));
}

export function pedidosComNfSemDocumento(s: Snapshot): Achado[] {
  return s.pedidos
    .filter(
      (p) =>
        p.exige_nf &&
        PEDIDO_AVANCADO.has(p.status) &&
        textoOuNulo(p.cliente_documento) === null,
    )
    .map((p) => ({
      regra: "operacao.pedido_com_nf_sem_documento",
      categoria: "operacao" as const,
      entidadeTipo: "commercial_orders",
      entidadeId: p.id,
      titulo: `Pedido ${p.numero} pede NF sem documento do destinatário`,
      resumo: "A nota precisa do documento do destinatário e o pedido não o tem.",
      causaProvavel:
        "Cadastro do cliente incompleto, venda avulsa sem documento ou importação que não trouxe o campo.",
      severidade: "media" as const,
      href: `/app/pedidos/${p.id}`,
      evidencia: {
        pedido_status: p.status,
        pedido_numero: p.numero,
        exige_nf: true,
      },
    }));
}

export function recebiveisSemOrigem(s: Snapshot): Achado[] {
  return s.recebiveis
    .filter(
      (r) =>
        RECEBIVEL_ABERTO.has(r.status) && !r.order_id && !r.invoice_id && !r.contact_id,
    )
    .map((r) => ({
      regra: "operacao.recebivel_sem_origem",
      categoria: "financeiro" as const,
      entidadeTipo: "financial_receivables",
      entidadeId: r.id,
      titulo: "Recebível aberto sem pedido, nota ou cliente",
      resumo:
        "Há valor a receber sem nenhuma origem. Não é possível cobrar nem conciliar com a venda.",
      causaProvavel:
        "Lançamento manual incompleto, pedido apagado (o vínculo é `set null`) ou importação financeira sem de-para.",
      severidade: "media" as const,
      href: "/app/financeiro",
      evidencia: {
        valor_original_cents: r.valor_original_cents,
        vencimento: r.vencimento,
        parcela: `${r.parcela_n}/${r.total_parcelas}`,
        status: r.status,
      },
    }));
}

export function recebiveisDuplicados(s: Snapshot): Achado[] {
  const grupos = new Map<string, typeof s.recebiveis>();

  for (const r of s.recebiveis) {
    if (!RECEBIVEL_ABERTO.has(r.status) || r.order_id) continue;
    const chave = `${r.contact_id ?? "sem-contato"}|${r.valor_original_cents}|${r.vencimento}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), r]);
  }

  return [...grupos.entries()]
    .filter(([, linhas]) => linhas.length > 1)
    .map(([chave, linhas]) => ({
      regra: "operacao.recebivel_duplicado",
      categoria: "financeiro" as const,
      entidadeTipo: "financial_receivables",
      entidadeId: hashCurto(`recebivel:${chave}`),
      titulo: `${linhas.length} recebíveis iguais para o mesmo cliente`,
      resumo:
        "Mesmo cliente, mesmo valor e mesmo vencimento em mais de uma linha. Cobrar as duas duplica a dívida.",
      causaProvavel:
        "Geração manual repetida (o lançamento sem pedido não tem o índice único de parcela) ou duplo clique no lançamento.",
      severidade: "alta" as const,
      href: "/app/financeiro",
      evidencia: {
        total: linhas.length,
        valor_original_cents: linhas[0]?.valor_original_cents ?? 0,
        vencimento: linhas[0]?.vencimento ?? null,
        recebiveis: linhas.slice(0, 20).map((r) => r.id),
      },
    }));
}

export function recebiveisComParcelaInvalida(s: Snapshot): Achado[] {
  return s.recebiveis
    .filter((r) => r.parcela_n > r.total_parcelas)
    .map((r) => ({
      regra: "operacao.recebivel_parcela_invalida",
      categoria: "financeiro" as const,
      entidadeTipo: "financial_receivables",
      entidadeId: r.id,
      titulo: `Recebível com parcela ${r.parcela_n} de ${r.total_parcelas}`,
      resumo: "A parcela aponta para um número maior que o total do plano.",
      causaProvavel:
        "Plano de parcelas alterado depois da geração, ou lançamento manual com os dois campos invertidos.",
      severidade: "alta" as const,
      href: "/app/financeiro",
      evidencia: {
        parcela_n: r.parcela_n,
        total_parcelas: r.total_parcelas,
        valor_original_cents: r.valor_original_cents,
        vencimento: r.vencimento,
        status: r.status,
      },
    }));
}

export function importacaoMercosTravada(s: Snapshot): Achado[] {
  return s.importacoesMercos
    .filter(
      (i) =>
        ["queued", "running"].includes(i.status) &&
        maisVelhoQue(i.created_at, s.agoraMs, 45 * MINUTO_MS),
    )
    .map((i) => ({
      regra: "operacao.mercos_importacao_travada",
      categoria: "operacao" as const,
      entidadeTipo: "mercos_import_runs",
      entidadeId: i.id,
      titulo: `Importação Mercos presa em ${i.status} há mais de 45 min`,
      resumo:
        "A importação não terminou. O índice único de execução ativa bloqueia a próxima tentativa enquanto esta não for encerrada.",
      causaProvavel:
        "Worker interrompido sem marcar erro, timeout da API do Mercos ou processo morto no meio da gravação.",
      severidade: "alta" as const,
      href: "/app/pedidos",
      evidencia: {
        status: i.status,
        origem: i.origem,
        iniciada_em: i.started_at ?? i.created_at,
        pedidos_novos: i.orders_new,
      },
    }));
}

export function importacaoMercosFalhou(s: Snapshot): Achado[] {
  const recentes = s.importacoesMercos.filter(
    (i) =>
      ["partial", "error"].includes(i.status) && idadeMs(i.created_at, s.agoraMs) <= DIA_MS,
  );
  if (recentes.length === 0) return [];

  const porDia = new Map<string, typeof recentes>();
  for (const i of recentes) {
    const dia = diaUtc(i.created_at);
    porDia.set(dia, [...(porDia.get(dia) ?? []), i]);
  }

  return [...porDia.entries()].map(([dia, linhas]) => ({
    regra: "operacao.mercos_importacao_falhou",
    categoria: "operacao" as const,
    entidadeTipo: "mercos_import_runs",
    entidadeId: hashCurto(`mercos:${dia}`),
    titulo:
      linhas.length > 1
        ? `${linhas.length} importações Mercos falharam em ${dia}`
        : `Importação Mercos falhou em ${dia}`,
    resumo:
      "A carga do Mercos terminou com erro ou parcial. Pedidos podem ter ficado de fora sem ninguém ver.",
    causaProvavel:
      "Credencial/instância do Mercos, mudança de payload ou limite de requisições — o resumo da execução nomeia o motivo.",
    severidade: linhas.length >= 2 ? ("alta" as const) : ("media" as const),
    href: "/app/pedidos",
    evidencia: {
      dia,
      total: linhas.length,
      execucoes: linhas.slice(0, 10).map((i) => i.id),
      pedidos_novos: linhas.reduce((n, i) => n + i.orders_new, 0),
      erros: linhas.reduce((n, i) => n + contarErros(i.errors), 0),
    },
  }));
}

export function jobsDaFilaTravados(s: Snapshot): Achado[] {
  return s.fila.flatMap((j) => {
    const rodandoTravado =
      j.status === "running" &&
      (maisVelhoQue(j.locked_at, s.agoraMs, 30 * MINUTO_MS) ||
        (!j.locked_at && maisVelhoQue(j.created_at, s.agoraMs, 30 * MINUTO_MS)));
    const pendenteAtrasado =
      j.status === "pending" && maisVelhoQue(j.run_after, s.agoraMs, 2 * HORA_MS);
    const esgotouTentativas = j.status === "failed" && j.attempts >= j.max_attempts;
    const morto = j.status === "dead";

    if (!rodandoTravado && !pendenteAtrasado && !esgotouTentativas && !morto) return [];

    const titulo = morto
      ? "Job na dead-letter"
      : rodandoTravado
        ? "Job preso em `running`"
        : pendenteAtrasado
          ? "Job pendente fora da janela"
          : "Job esgotou as tentativas";

    return [
      {
        regra: "operacao.job_fila_travado",
        categoria: "operacao" as const,
        entidadeTipo: "job_queue",
        entidadeId: j.id,
        titulo,
        resumo:
          "A fila é o que faz o turno do agente/follow-up acontecer. Job parado é conversa parada.",
        causaProvavel:
          corta(j.last_error) ??
          "Worker parado, lease não liberado ou payload que sempre falha.",
        severidade: morto || rodandoTravado ? ("critica" as const) : ("alta" as const),
        href: "/app/connections",
        evidencia: {
          kind: j.kind,
          status: j.status,
          attempts: j.attempts,
          max_attempts: j.max_attempts,
          run_after: j.run_after,
          locked_at: j.locked_at,
          last_error: corta(j.last_error),
        },
      },
    ];
  });
}

export function webhooksComFalha(s: Snapshot): Achado[] {
  const recentes = s.webhooks.filter(
    (w) => ["error", "dead"].includes(w.status) && idadeMs(w.received_at, s.agoraMs) <= DIA_MS,
  );
  if (recentes.length === 0) return [];

  const porDia = new Map<string, typeof recentes>();
  for (const w of recentes) {
    const dia = diaUtc(w.received_at);
    porDia.set(dia, [...(porDia.get(dia) ?? []), w]);
  }

  return [...porDia.entries()].map(([dia, linhas]) => {
    const mortos = linhas.filter((l) => l.status === "dead").length;
    return {
      regra: "operacao.webhook_falhas",
      categoria: "operacao" as const,
      entidadeTipo: "webhook_events_log",
      entidadeId: hashCurto(`webhook:${dia}`),
      titulo:
        mortos > 0
          ? `${mortos} webhook(s) na dead-letter em ${dia}`
          : `${linhas.length} webhook(s) com erro em ${dia}`,
      resumo:
        "Evento externo não foi processado. A conversa/pedido que dependia dele não avançou.",
      causaProvavel:
        corta(linhas[0]?.error_message) ??
        "Assinatura inválida, payload fora do contrato ou falha do consumidor.",
      severidade: mortos > 0 ? ("critica" as const) : linhas.length >= 3 ? ("alta" as const) : ("media" as const),
      href: "/app/webhooks",
      evidencia: {
        dia,
        total: linhas.length,
        mortos,
        provedores: [...new Set(linhas.map((l) => l.provider))],
        tipos: [...new Set(linhas.map((l) => l.event_type ?? "desconhecido"))].slice(0, 10),
        erro: corta(linhas[0]?.error_message),
      },
    };
  });
}

export function campanhasComCidadeInvalida(s: Snapshot): Achado[] {
  const achados: Achado[] = [];

  for (const c of s.campanhasProspeccao) {
    if (c.status !== "ativa") continue;
    const cidades = lerCidades(c);
    const invalidas = cidades.filter(
      (cidade) => textoOuNulo(cidade.cidade) === null || !ufValida(cidade.estado),
    );
    if (invalidas.length === 0) continue;

    achados.push({
      regra: "campanha.cidade_invalida",
      categoria: "campanha",
      entidadeTipo: "prospecting_campaigns",
      entidadeId: c.id,
      titulo: `Campanha "${c.nome}" com cidade/UF incompleta`,
      resumo:
        "A campanha está ativa com recorte geográfico que não fecha. A busca pode rodar no lugar errado.",
      causaProvavel:
        "Edição parcial do recorte, importação de cidade sem UF ou dado legado anterior à validação da tela.",
      severidade: "media",
      href: "/app/campanhas",
      evidencia: {
        campanha: c.nome,
        cidades_invalidas: invalidas.length,
        total_cidades: cidades.length,
        chaves: invalidas
          .slice(0, 10)
          .map((x) => `${String(x.cidade ?? "?")}/${String(x.estado ?? "?")}`),
      },
    });
  }

  for (const c of s.campanhasVenda) {
    if (c.status !== "active") continue;
    const semCidade = textoOuNulo(c.cidade) === null;
    const ufRuim = textoOuNulo(c.uf) !== null && !ufValida(c.uf);
    if (!semCidade && !ufRuim) continue;

    achados.push({
      regra: "campanha.cidade_invalida",
      categoria: "campanha",
      entidadeTipo: "automatic_sales_campaigns",
      entidadeId: c.id,
      titulo: `Campanha "${c.nome}" ativa com cidade/UF inválida`,
      resumo:
        "A venda automática usa a cidade como recorte. Sem cidade válida, a fila não tem de onde partir.",
      causaProvavel:
        "Campanha editada pela metade ou importada sem o campo `cidade`/`uf`.",
      severidade: "alta",
      href: "/app/venda-automatica",
      evidencia: {
        campanha: c.nome,
        cidade: textoOuNulo(c.cidade),
        uf: textoOuNulo(c.uf),
      },
    });
  }

  return achados;
}

export function campanhasComCidadeRepetida(s: Snapshot): Achado[] {
  return s.campanhasProspeccao.flatMap((c) => {
    if (c.status !== "ativa") return [];
    const cidades = lerCidades(c);
    const chaves = cidades
      .map((x) => `${String(x.cidade ?? "").trim().toLowerCase()}|${String(x.estado ?? "").trim().toUpperCase()}`)
      .filter((k) => k !== "|");
    const repetidas = chaves.filter((k, i) => chaves.indexOf(k) !== i);
    if (repetidas.length === 0) return [];

    return [
      {
        regra: "campanha.cidade_repetida",
        categoria: "campanha" as const,
        entidadeTipo: "prospecting_campaigns",
        entidadeId: c.id,
        titulo: `Campanha "${c.nome}" repete cidade no recorte`,
        resumo:
          "A mesma cidade aparece mais de uma vez. A busca pode gastar cota duas vezes no mesmo lugar.",
        causaProvavel:
          "Seleção repetida na tela ou merge de recortes sem deduplicar.",
        severidade: "baixa" as const,
        href: "/app/campanhas",
        evidencia: {
          campanha: c.nome,
          total_cidades: chaves.length,
          repetidas: [...new Set(repetidas)].slice(0, 10),
        },
      },
    ];
  });
}

export function clientesDuplicadosPorEmail(s: Snapshot): Achado[] {
  return s.clientesDuplicados.map((d) => ({
    regra: "operacao.cliente_duplicado_email",
    categoria: "operacao" as const,
    entidadeTipo: "contacts",
    entidadeId: hashCurto(`email:${d.chave}`),
    titulo: `${d.total} clientes com o mesmo e-mail`,
    resumo:
      "O mesmo e-mail aparece em cadastros diferentes. Histórico, pedidos e consentimento ficam divididos.",
    causaProvavel:
      "Cadastro manual duplicado, captação por formulário antes do casamento ou importação sem de-para.",
    severidade: "media" as const,
    href: "/app/contacts",
    evidencia: {
      email_mascarado: mascararEmail(d.chave),
      total: d.total,
      contatos: d.ids.slice(0, 20),
    },
  }));
}

/**
 * Lead duplicado — a identidade vem do que o produto JÁ normaliza.
 *
 * Não existe coluna de e-mail/telefone no lead: a identidade mora no contato
 * (`contacts.phone_number` E.164 + `email_normalized`). A regra usa, nesta
 * ordem de confiança:
 *   1. o mesmo `contact_id` no mesmo funil (alta);
 *   2. o mesmo telefone normalizado em contatos diferentes (média);
 *   3. o mesmo e-mail normalizado em contatos diferentes (média).
 * O mesmo par de leads pode aparecer nas três chaves; a regra deduplica pelo
 * conjunto de IDs e guarda a maior confiança. Lead sem contato fica de fora —
 * não há identidade para comparar e inventar uma seria pior.
 */
export function leadsDuplicados(s: Snapshot): Achado[] {
  type Grupo = {
    pipeline: string;
    identidade: "contato" | "telefone" | "email";
    valor: string | null;
    ids: Set<string>;
    confianca: "alta" | "media";
  };

  const grupos = new Map<string, Grupo>();
  const adicionar = (
    chave: string,
    grupo: Omit<Grupo, "ids">,
    leadId: string,
  ): void => {
    const atual = grupos.get(chave) ?? { ...grupo, ids: new Set<string>() };
    atual.ids.add(leadId);
    grupos.set(chave, atual);
  };

  for (const lead of s.leadsAbertos) {
    if (!lead.pipeline_id) continue;
    // Lead sem contato não tem identidade que o produto normalize. A coleta já
    // filtra `contact_id is not null`; a guarda aqui impede que uma mudança na
    // consulta reintroduza a comparação por engano.
    if (!lead.contact_id) continue;

    adicionar(
      `${lead.pipeline_id}|contato|${lead.contact_id}`,
      { pipeline: lead.pipeline_id, identidade: "contato", valor: null, confianca: "alta" },
      lead.id,
    );
    const telefone = lead.contatos?.phone_number?.replace(/\D/g, "") ?? "";
    if (telefone.length >= 8) {
      adicionar(
        `${lead.pipeline_id}|telefone|${telefone}`,
        { pipeline: lead.pipeline_id, identidade: "telefone", valor: telefone, confianca: "media" },
        lead.id,
      );
    }
    const email = lead.contatos?.email_normalized?.trim().toLowerCase() ?? "";
    if (email) {
      adicionar(
        `${lead.pipeline_id}|email|${email}`,
        { pipeline: lead.pipeline_id, identidade: "email", valor: email, confianca: "media" },
        lead.id,
      );
    }
  }

  const porAssinatura = new Map<string, Grupo>();
  for (const grupo of grupos.values()) {
    if (grupo.ids.size < 2) continue;
    const assinatura = [...grupo.ids].sort().join(",");
    const existente = porAssinatura.get(assinatura);
    if (!existente || (existente.confianca === "media" && grupo.confianca === "alta")) {
      porAssinatura.set(assinatura, grupo);
    }
  }

  return [...porAssinatura.entries()].map(([assinatura, grupo]) => {
    const ids = [...grupo.ids].sort();
    const identidade =
      grupo.identidade === "contato"
        ? "mesmo contato"
        : grupo.identidade === "telefone"
          ? "mesmo telefone normalizado"
          : "mesmo e-mail normalizado";
    return {
      regra: "operacao.lead_duplicado",
      categoria: "operacao" as const,
      entidadeTipo: "crm_leads",
      entidadeId: hashCurto(`leads:${grupo.pipeline}:${assinatura}`),
      titulo: `${ids.length} leads abertos para o ${identidade}`,
      resumo:
        "Há mais de um card aberto para a mesma identidade no mesmo funil. O trabalho e o histórico ficam divididos.",
      causaProvavel:
        "Cadastro concorrente, captação repetida ou contato duplicado anterior à mescla.",
      severidade: "media" as const,
      href: "/app/kanban",
      evidencia: {
        pipeline_id: grupo.pipeline,
        identidade: grupo.identidade,
        confianca: grupo.confianca,
        total: ids.length,
        leads: ids.slice(0, 20),
        ...(grupo.identidade === "telefone" && grupo.valor
          ? { telefone_mascarado: mascararTelefone(grupo.valor) }
          : {}),
        ...(grupo.identidade === "email" && grupo.valor
          ? { email_mascarado: mascararEmail(grupo.valor) }
          : {}),
      },
    };
  });
}


/**
 * Cadastro com endereço em branco ou literal (`NULL`, `undefined`, `NaN`).
 *
 * Medido em produção: 84 cadastros históricos gravaram o texto do valor
 * ausente no campo. O escritor que fazia isso não está mais no código; a regra
 * observa o passado e impede que o futuro volte a passar despercebido. É UMA
 * ocorrência por organização (a lista de ids é a evidência), sem despejar
 * endereço — dado pessoal — na tela.
 */
const LITERAL_DE_AUSENCIA = /^(null|undefined|nan)$/i;
const CAMPOS_DE_ENDERECO = ["logradouro", "complemento", "bairro", "cidade"] as const;

function campoDeEnderecoLixo(valor: string | null): boolean {
  if (typeof valor !== "string") return false;
  const limpo = valor.trim();
  return limpo === "" || LITERAL_DE_AUSENCIA.test(limpo);
}

export function enderecoComLixo(s: Snapshot): Achado[] {
  const sujos = s.contatosEndereco.filter((c) =>
    CAMPOS_DE_ENDERECO.some((campo) => campoDeEnderecoLixo(c[campo])),
  );
  if (sujos.length === 0) return [];

  const campos: Record<string, number> = {};
  for (const campo of CAMPOS_DE_ENDERECO) {
    campos[campo] = sujos.filter((c) => campoDeEnderecoLixo(c[campo])).length;
  }

  return [
    {
      regra: "cadastro.endereco_com_lixo",
      categoria: "operacao" as const,
      entidadeTipo: "contacts",
      entidadeId: hashCurto(`endereco-lixo:${s.organizationId}`),
      titulo: `${sujos.length} cadastro(s) com endereço em branco ou literal`,
      resumo:
        "Há cadastros com `NULL`, `undefined`, `NaN` ou só espaços no endereço. Onde o dado deveria existir, a entrega/nota pode sair sem endereço.",
      causaProvavel:
        "Escrita histórica que gravou o texto do valor ausente; o escritor não está mais no código. É observação para o futuro.",
      severidade: "media" as const,
      href: "/app/contacts",
      evidencia: {
        total: sujos.length,
        logradouro: campos.logradouro ?? 0,
        complemento: campos.complemento ?? 0,
        bairro: campos.bairro ?? 0,
        cidade: campos.cidade ?? 0,
        contatos: sujos.slice(0, 20).map((c) => c.id),
        organizacao: s.organizationId,
        limitacao: "Endereço é dado pessoal e não vai na evidência; abra o cadastro para corrigir.",
      },
    },
  ];
}

function lerCidades(c: CampanhaProspeccao): Array<{ cidade?: unknown; estado?: unknown }> {
  if (!Array.isArray(c.cidades)) return [];
  return c.cidades.filter(
    (x): x is { cidade?: unknown; estado?: unknown } => typeof x === "object" && x !== null,
  );
}

function contarErros(errors: unknown): number {
  if (Array.isArray(errors)) return errors.length;
  return 0;
}
