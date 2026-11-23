/** Lógica pura da reconciliação — testável sem Playwright nem banco. */

/** Um registro do JSONL vira o payload que fn_importar_pedido_mercos espera. */
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

/** Registro sem número, sem cliente ou sem itens NÃO é ausência: é falha de leitura. */
export function registroValido(registro) {
  return Boolean(
    registro &&
      Number.isInteger(registro.numero) &&
      registro.numero > 0 &&
      (registro.cliente?.razao || registro.cliente?.fantasia) &&
      Array.isArray(registro.itens) &&
      registro.itens.length > 0,
  );
}

/** Linha do artefato: presença no banco decide a situação, nunca o console. */
export function situacaoPresenca(encontrado) {
  return encontrado ? "importado" : "ausente";
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
