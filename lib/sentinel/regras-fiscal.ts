/**
 * Detectores FISCAIS — determinísticos, somente leitura.
 *
 * Cada regra lê a fotografia e devolve achados. Nenhuma chama provider, SEFAZ
 * ou IA. "Causa provável" é uma hipótese escrita a partir do estado observado;
 * a evidência é o que a pessoa confere antes de agir.
 */
import type { Achado, NotaFiscal, Pedido, Snapshot } from "./tipos";
import {
  corta,
  DIA_MS,
  diaUtc,
  hashCurto,
  higienizar,
  HORA_MS,
  idadeMs,
  maisVelhoQue,
  MINUTO_MS,
  rotuloNota,
} from "./utilitarios";

const NOTA_ATIVA = new Set(["pendente", "em_emissao", "autorizada"]);
const NOTA_FALHA = new Set(["denegada", "erro"]);
const PEDIDO_FATURADO = new Set(["faturado", "expedido", "entregue"]);
const PEDIDO_COM_NF = new Set(["aprovado", "faturado", "expedido", "entregue"]);

function referencia(n: NotaFiscal): string {
  return rotuloNota(n.serie, n.numero);
}

export function notasRejeitadas(s: Snapshot): Achado[] {
  return s.notas
    .filter((n) => NOTA_FALHA.has(n.status))
    .map((n) => ({
      regra: "fiscal.nota_rejeitada",
      categoria: "fiscal" as const,
      entidadeTipo: "invoices",
      entidadeId: n.id,
      titulo: `NF-e ${referencia(n)} ${n.status === "denegada" ? "denegada" : "com erro"}`,
      resumo:
        "A SEFAZ recusou ou o envio falhou. A nota não existe para o cliente enquanto o estado não for resolvido.",
      causaProvavel:
        higienizar(n.erro) ??
        "Rejeição sem mensagem registrada — confira o retorno do provedor e os dados fiscais do pedido.",
      severidade: "alta" as const,
      href: "/app/notas?aba=emitir",
      evidencia: {
        status: n.status,
        serie: n.serie,
        numero: n.numero,
        total_cents: n.total_cents,
        erro: higienizar(n.erro),
        pedido_id: n.order_id,
      },
    }));
}

export function notasTravadasEmEmissao(s: Snapshot): Achado[] {
  return s.notas
    .filter((n) => n.status === "em_emissao" && maisVelhoQue(n.updated_at, s.agoraMs, 30 * MINUTO_MS))
    .map((n) => ({
      regra: "fiscal.nota_em_emissao_travada",
      categoria: "fiscal" as const,
      entidadeTipo: "invoices",
      entidadeId: n.id,
      titulo: `NF-e ${referencia(n)} presa em emissão`,
      resumo:
        "A nota está em `em_emissao` há mais de 30 minutos. O estado entre o pedido e a resposta da SEFAZ não fechou.",
      causaProvavel:
        "Dreno fiscal parado, timeout do provedor ou processo interrompido depois do envio — os três deixam a nota neste estado.",
      severidade: "alta" as const,
      href: "/app/notas?aba=emitir",
      evidencia: {
        status: n.status,
        serie: n.serie,
        numero: n.numero,
        total_cents: n.total_cents,
        atualizada_em: n.updated_at,
        pedido_id: n.order_id,
      },
    }));
}

export function notasPendentesAntigas(s: Snapshot): Achado[] {
  return s.notas
    .filter((n) => n.status === "pendente" && maisVelhoQue(n.created_at, s.agoraMs, DIA_MS))
    .map((n) => ({
      regra: "fiscal.nota_pendente_antiga",
      categoria: "fiscal" as const,
      entidadeTipo: "invoices",
      entidadeId: n.id,
      titulo: `NF-e ${referencia(n)} pendente há mais de 24h`,
      resumo: "A nota foi criada, mas nunca chegou a ser enviada ou autorizada.",
      causaProvavel:
        "Fila sem dreno, job nunca enfileirado ou emissão interrompida antes do envio.",
      severidade: "media" as const,
      href: "/app/notas?aba=emitir",
      evidencia: {
        status: n.status,
        serie: n.serie,
        numero: n.numero,
        total_cents: n.total_cents,
        criada_em: n.created_at,
        pedido_id: n.order_id,
      },
    }));
}

export function notasSemVinculo(s: Snapshot): Achado[] {
  return s.notas
    .filter((n) => n.status === "autorizada" && !n.order_id)
    .map((n) => ({
      regra: "fiscal.nota_sem_vinculo",
      categoria: "fiscal" as const,
      entidadeTipo: "invoices",
      entidadeId: n.id,
      titulo: `NF-e ${referencia(n)} autorizada sem pedido vinculado`,
      resumo:
        "Existe uma nota autorizada que não aponta para nenhum pedido. O faturamento e o estoque não têm de onde partir.",
      causaProvavel:
        "Emissão avulsa, nota importada sem conciliação ou pedido apagado depois da autorização (o vínculo usa `on delete set null`).",
      severidade: "media" as const,
      href: "/app/notas?aba=emitir",
      evidencia: {
        status: n.status,
        serie: n.serie,
        numero: n.numero,
        chave: corta(n.chave_acesso, 44),
        total_cents: n.total_cents,
      },
    }));
}

export function notasAutorizadasSemChave(s: Snapshot): Achado[] {
  return s.notas
    .filter((n) => n.status === "autorizada" && !n.chave_acesso)
    .map((n) => ({
      regra: "fiscal.nota_sem_chave",
      categoria: "fiscal" as const,
      entidadeTipo: "invoices",
      entidadeId: n.id,
      titulo: `NF-e ${referencia(n)} autorizada sem chave de acesso`,
      resumo:
        "O estado diz `autorizada`, mas a chave de acesso não foi persistida — o documento não é conferível nem citável.",
      causaProvavel:
        "Resposta da SEFAZ gravada pela metade, sincronização interrompida ou importação sem o campo `chave`.",
      severidade: "alta" as const,
      href: "/app/notas?aba=emitir",
      evidencia: {
        status: n.status,
        serie: n.serie,
        numero: n.numero,
        total_cents: n.total_cents,
        pedido_id: n.order_id,
      },
    }));
}

export function notasDuplicadasPorPedido(s: Snapshot): Achado[] {
  // Um pedido pode estar ligado à nota como principal (`invoices.order_id`) ou
  // como secundário (`invoice_orders`, 0294). Contar só o principal deixaria a
  // duplicidade de um agrupamento passar — que é exatamente o caso em que duas
  // notas vivas transmitem o mesmo pedido à SEFAZ.
  const ativas = new Map(s.notas.filter((n) => NOTA_ATIVA.has(n.status)).map((n) => [n.id, n]));
  const pedidosPorNota = new Map<string, Set<string>>();

  for (const n of ativas.values()) {
    const pedidos = pedidosPorNota.get(n.id) ?? new Set<string>();
    if (n.order_id) pedidos.add(n.order_id);
    pedidosPorNota.set(n.id, pedidos);
  }
  for (const vinculo of s.notasPedidos) {
    if (!ativas.has(vinculo.invoice_id)) continue;
    const pedidos = pedidosPorNota.get(vinculo.invoice_id) ?? new Set<string>();
    pedidos.add(vinculo.order_id);
    pedidosPorNota.set(vinculo.invoice_id, pedidos);
  }

  const notasPorPedido = new Map<string, Set<string>>();
  for (const [notaId, pedidos] of pedidosPorNota) {
    for (const pedidoId of pedidos) {
      const notas = notasPorPedido.get(pedidoId) ?? new Set<string>();
      notas.add(notaId);
      notasPorPedido.set(pedidoId, notas);
    }
  }

  return [...notasPorPedido.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([pedidoId, ids]) => {
      const notas = [...ids].map((id) => ativas.get(id)).filter((n): n is NotaFiscal => Boolean(n));
      return {
        regra: "fiscal.nota_duplicada_por_pedido" as const,
        categoria: "fiscal" as const,
        entidadeTipo: "commercial_orders",
        entidadeId: pedidoId,
        titulo: `${notas.length} NF-e ativas para o mesmo pedido`,
        resumo:
          "Mais de uma nota viva aponta para o mesmo pedido. Emitir de novo pode duplicar o documento fiscal.",
        causaProvavel:
          "Retry tratado como emissão nova, duplo clique no faturamento ou nota anterior não cancelada antes da reemissão.",
        severidade: "critica" as const,
        href: `/app/pedidos/${pedidoId}`,
        evidencia: {
          total_notas: notas.length,
          notas: notas.map((n) => `${n.id}:${n.status}:${n.serie}/${n.numero ?? "s/n"}`),
          valores_cents: notas.map((n) => n.total_cents),
        },
      };
    });
}

export function divergenciaDeValorDaNota(s: Snapshot): Achado[] {
  const pedidos = new Map<string, Pedido>(s.pedidos.map((p) => [p.id, p]));
  return s.notas
    .filter((n) => n.order_id && NOTA_ATIVA.has(n.status))
    .flatMap((n) => {
      const pedido = pedidos.get(n.order_id as string);
      if (!pedido || pedido.total_cents === n.total_cents) return [];
      return [
        {
          regra: "fiscal.divergencia_valor_nota",
          categoria: "fiscal" as const,
          entidadeTipo: "invoices",
          entidadeId: n.id,
          titulo: `NF-e ${referencia(n)} com valor diferente do pedido`,
          resumo:
            "O total da nota não é o total do pedido vinculado. Um dos dois mudou depois do faturamento.",
          causaProvavel:
            "Desconto/frete aplicado depois da emissão, item alterado no pedido ou nota emitida a partir de outro snapshot.",
          severidade: "alta" as const,
          href: `/app/pedidos/${pedido.id}`,
          evidencia: {
            nota_total_cents: n.total_cents,
            pedido_total_cents: pedido.total_cents,
            diferenca_cents: pedido.total_cents - n.total_cents,
            nota_status: n.status,
            pedido_numero: pedido.numero,
          },
        },
      ];
    });
}

export function notasAutorizadasComPedidoNaoFaturado(s: Snapshot): Achado[] {
  const pedidos = new Map<string, Pedido>(s.pedidos.map((p) => [p.id, p]));
  return s.notas
    .filter((n) => n.status === "autorizada" && n.order_id)
    .flatMap((n) => {
      const pedido = pedidos.get(n.order_id as string);
      if (!pedido || !["rascunho", "em_analise", "aprovado"].includes(pedido.status)) return [];
      return [
        {
          regra: "fiscal.nota_autorizada_pedido_nao_faturado",
          categoria: "fiscal" as const,
          entidadeTipo: "invoices",
          entidadeId: n.id,
          titulo: `NF-e ${referencia(n)} autorizada, pedido ainda em ${pedido.status}`,
          resumo:
            "A nota já existe, mas o pedido não avançou para `faturado`. A operação e o fiscal contam histórias diferentes.",
          causaProvavel:
            "Transição de status não executada depois da autorização, ou nota emitida antes de o pedido ser aprovado de verdade.",
          severidade: "media" as const,
          href: `/app/pedidos/${pedido.id}`,
          evidencia: {
            pedido_status: pedido.status,
            pedido_numero: pedido.numero,
            nota_total_cents: n.total_cents,
            pedido_total_cents: pedido.total_cents,
          },
        },
      ];
    });
}

export function pedidosComNfSemNota(s: Snapshot): Achado[] {
  const notasPorPedido = new Map<string, NotaFiscal[]>();
  for (const n of s.notas) {
    if (!n.order_id) continue;
    const lista = notasPorPedido.get(n.order_id) ?? [];
    lista.push(n);
    notasPorPedido.set(n.order_id, lista);
  }

  return s.pedidos.flatMap((p) => {
    if (!p.exige_nf || !PEDIDO_COM_NF.has(p.status)) return [];
    const notas = notasPorPedido.get(p.id) ?? [];
    if (notas.some((n) => NOTA_ATIVA.has(n.status))) return [];

    // O prazo existe para não abrir ocorrência no minuto seguinte a uma
    // mudança legítima de status. Pedido aprovado tem 24h; faturado, 1h.
    const janela = PEDIDO_FATURADO.has(p.status) ? HORA_MS : DIA_MS;
    if (!maisVelhoQue(p.updated_at, s.agoraMs, janela)) return [];

    return [
      {
        regra: "fiscal.pedido_com_nf_sem_nota",
        categoria: "fiscal" as const,
        entidadeTipo: "commercial_orders",
        entidadeId: p.id,
        titulo: `Pedido ${p.numero} pede NF e não tem nota ativa`,
        resumo:
          "O pedido está marcado como COM NOTA e já passou do ponto em que a emissão deveria ter acontecido.",
        causaProvavel:
          notas.length > 0
            ? "A única nota do pedido foi rejeitada/denegada e não houve reemissão."
            : "Nenhuma nota foi enfileirada para este pedido.",
        severidade: PEDIDO_FATURADO.has(p.status) ? ("critica" as const) : ("alta" as const),
        href: `/app/pedidos/${p.id}`,
        evidencia: {
          pedido_status: p.status,
          pedido_numero: p.numero,
          total_cents: p.total_cents,
          notas_existentes: notas.length,
          estados_das_notas: notas.map((n) => n.status),
        },
      },
    ];
  });
}

export function jobsFiscaisTravados(s: Snapshot): Achado[] {
  return s.jobsFiscais.flatMap((j) => {
    const processandoTravado =
      j.status === "processando" && maisVelhoQue(j.updated_at, s.agoraMs, 30 * MINUTO_MS);
    const pendenteAtrasado =
      j.status === "pendente" && maisVelhoQue(j.proxima_tentativa, s.agoraMs, 30 * MINUTO_MS);

    if (!processandoTravado && !pendenteAtrasado) return [];

    return [
      {
        regra: "fiscal.job_fiscal_travado",
        categoria: "fiscal" as const,
        entidadeTipo: "fiscal_jobs",
        entidadeId: j.id,
        titulo: processandoTravado
          ? "Job fiscal preso em `processando`"
          : "Job fiscal pendente fora da janela de retry",
        resumo: processandoTravado
          ? "O dreno pegou o job e não devolveu resultado há mais de 30 minutos."
          : "O job deveria ter rodado há mais de 30 minutos e continua pendente.",
        causaProvavel:
          higienizar(j.ultimo_erro) ??
          "Dreno parado, lease não liberado ou erro silencioso no worker fiscal.",
        severidade: "alta" as const,
        href: "/app/notas?aba=emitir",
        evidencia: {
          job_status: j.status,
          tentativas: j.tentativas,
          max_tentativas: j.max_tentativas,
          proxima_tentativa: j.proxima_tentativa,
          atualizado_em: j.updated_at,
          nota_id: j.invoice_id,
          ultimo_erro: higienizar(j.ultimo_erro),
        },
      },
    ];
  });
}

export function jobsFiscaisComRetryExcessivo(s: Snapshot): Achado[] {
  return s.jobsFiscais
    .filter((j) => j.tentativas >= 3 && (j.status === "pendente" || j.status === "erro"))
    .map((j) => ({
      regra: "fiscal.job_retry_excessivo",
      categoria: "fiscal" as const,
      entidadeTipo: "fiscal_jobs",
      entidadeId: j.id,
      titulo: `Job fiscal com ${j.tentativas} tentativas`,
      resumo:
        "Retries repetidos na mesma nota aumentam o risco de emissão duplicada quando o primeiro envio chegou à SEFAZ.",
      causaProvavel:
        higienizar(j.ultimo_erro) ??
        "Falha persistente que o retry não resolve — normalmente dado fiscal ou credencial, não indisponibilidade.",
      severidade: "media" as const,
      href: "/app/notas?aba=emitir",
      evidencia: {
        job_status: j.status,
        tentativas: j.tentativas,
        max_tentativas: j.max_tentativas,
        nota_id: j.invoice_id,
        ultimo_erro: higienizar(j.ultimo_erro),
      },
    }));
}

export function sincronizacaoFiscalComFalha(s: Snapshot): Achado[] {
  const recentes = s.sincronizacoesFiscais.filter(
    (l) =>
      ["erro", "bloqueado"].includes(l.resultado) &&
      idadeMs(l.iniciado_em, s.agoraMs) <= DIA_MS,
  );
  if (recentes.length === 0) return [];

  const porDia = new Map<string, typeof recentes>();
  for (const l of recentes) {
    const dia = diaUtc(l.iniciado_em);
    porDia.set(dia, [...(porDia.get(dia) ?? []), l]);
  }

  return [...porDia.entries()].map(([dia, linhas]) => ({
    regra: "fiscal.sincronizacao_falhou",
    categoria: "fiscal" as const,
    entidadeTipo: "fiscal_sync_logs",
    entidadeId: hashCurto(`sync-fiscal:${dia}`),
    titulo:
      linhas.length > 1
        ? `${linhas.length} sincronizações fiscais falharam em ${dia}`
        : `Sincronização fiscal falhou em ${dia}`,
    resumo:
      "A entrada de NF-e não avançou. Enquanto isso, notas emitidas contra o CNPJ não chegam ao módulo fiscal.",
    causaProvavel:
      higienizar(linhas[0]?.mensagem) ??
      "Certificado, consumo indevido (656) ou indisponibilidade da SEFAZ — o log da execução nomeia o motivo.",
    severidade: linhas.length >= 3 ? ("alta" as const) : ("media" as const),
    href: "/app/fiscal/sincronizacoes",
    evidencia: {
      dia,
      total: linhas.length,
      resultados: linhas.map((l) => l.resultado),
      documentos_com_erro: linhas.reduce((n, l) => n + l.docs_erro, 0),
      mensagem: higienizar(linhas[0]?.mensagem),
      execucoes: linhas.slice(0, 10).map((l) => l.id),
    },
  }));
}
