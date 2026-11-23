/**
 * Lógica pura da reconciliação — testável sem Playwright, sem banco e sem rede.
 *
 * Medição do dono (23/11/2026): a lista do Mercos devolve 5.929 pedidos em
 * minutos; abrir o detalhe de cada um custa ~7,7 s (~12 h). Por isso a
 * reconciliação decide pela LISTA (número + identidade) e abre detalhe SÓ para
 * o que não está presente ou que colidiu.
 */

/** Só dígitos: documento é comparado pelo valor, não pela máscara. */
export function soDigitos(texto) {
  return (texto || "").replace(/\D/g, "");
}

/** Nome normalizado: caixa, acento e pontuação não decidem identidade. */
export function nomeNormalizado(texto) {
  return (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Documento quando os dois lados têm; nome quando a lista não traz documento.
 * Na ausência de documento a comparacao é EXATA (normalizada): preferimos
 * marcar colisão e investigar a dar "presente" para um pedido perdido.
 */
export function mesmoCliente(nomeLista, nomeBanco, documentoLista, documentoBanco) {
  const docA = soDigitos(documentoLista);
  const docB = soDigitos(documentoBanco);
  if (docA && docB) return docA === docB;
  const a = nomeNormalizado(nomeLista);
  const b = nomeNormalizado(nomeBanco);
  return Boolean(a && b && a === b);
}

/**
 * CLASSIFICAÇÃO PELA LISTA. `linhasBanco` são todas as linhas com
 * `numero = N` ou `numero_mercos = N` — as duas chaves, porque os 11.979
 * importados antigos não tinham `numero_mercos` preenchido.
 *
 * Número presente com OUTRO cliente é COLISÃO, não ausência: é exatamente o
 * caso dos 19669–19672, que apareceriam como "zero ausentes" se a comparação
 * olhasse só o número.
 */
export function classificarNumero({ nomeLista, documentoLista = null, linhasBanco = [] }) {
  const identicas = linhasBanco.filter((linha) =>
    mesmoCliente(nomeLista, linha.cliente_nome, documentoLista, linha.cliente_documento),
  );
  if (identicas.length > 0) {
    return { situacao: "importado", pedido_id: identicas[0].id ?? null, cliente_local_nome: null };
  }
  if (linhasBanco.length > 0) {
    return {
      situacao: "colisao",
      pedido_id: linhasBanco[0].id ?? null,
      cliente_local_nome: linhasBanco[0].cliente_nome ?? null,
    };
  }
  return { situacao: "ausente", pedido_id: null, cliente_local_nome: null };
}

/** Pedido sem item (19639, 16/11, total 0) não é perda. */
export function temItens(registro) {
  return Array.isArray(registro?.itens) && registro.itens.length > 0;
}

/**
 * Só ausente e colisão abrem detalhe. A colisão é achado mesmo sem detalhe
 * (o número existe com outro cliente); o detalhe só decide se dá para importar.
 * Ausente sem detalhe NÃO é prova — fica em `sem_detalhe`, fora da conta.
 */
export function classificarComDetalhe({ situacao, detalhe }) {
  if (situacao === "colisao") {
    return detalhe && !temItens(detalhe) ? "ignorado_sem_itens" : "colisao";
  }
  if (situacao !== "ausente") return situacao;
  if (!detalhe) return "sem_detalhe";
  return temItens(detalhe) ? "ausente" : "ignorado_sem_itens";
}

/** O payload que fn_importar_pedido_mercos espera, com numero_mercos preservado. */
export function payloadDeImportacao(registro) {
  const cliente = registro.cliente ?? {};
  return {
    numero: registro.numero,
    cliente_nome: cliente.razao || cliente.fantasia || null,
    cliente_documento: cliente.documento || null,
    status: registro.status_detalhe || "aprovado",
    total_cents: registro.total_cents ?? 0,
    subtotal_cents: registro.soma_itens_cents ?? registro.total_cents ?? 0,
    condicao_pagamento: registro.condicao_pagamento || null,
    itens: (registro.itens ?? []).map((i) => ({
      codigo: i.codigo || i.descricao,
      descricao: i.descricao || i.codigo,
      quantidade: i.quantidade ?? 1,
      subtotal_cents: i.subtotal ?? 0,
    })),
  };
}

/**
 * Janela da garantia: só o que a reconciliação REALMENTE cobre.
 * Padrão 30 dias (decisão do dono). Sem data de emissão confiável, o registro
 * fica FORA e é contado — nunca entra na conversa de "zero ausentes".
 */
export function dentroDaJanela(registro, agoraMs, dias = 30) {
  const t = Date.parse(registro?.data_emissao || "");
  if (!Number.isFinite(t)) return false;
  const limite = agoraMs - dias * 86_400_000;
  return t >= limite && t <= agoraMs;
}
