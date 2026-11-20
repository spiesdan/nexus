/**
 * Mapa REGRA → COLETAS de que ela depende.
 *
 * O encerramento por ausência só é honesto quando a fonte da regra foi lida por
 * inteiro. Antes, qualquer coleta truncada bloqueava TODAS as regras — uma
 * fonte de alto volume (importações Mercos, webhooks) silenciava fiscal,
 * estoque e o resto para sempre. Aqui cada regra declara o que lê; uma coleta
 * truncada bloqueia só quem depende dela.
 *
 * Regra nova sem entrada reprova em `fontes.test.ts` — o fallback do runner
 * bloqueia (nunca fecha no escuro), mas a lista tem de ser explícita.
 */
export const COLETAS = [
  "notas",
  "notas_pedidos",
  "pedidos",
  "jobs_fiscais",
  "sincronizacoes_fiscais",
  "produtos",
  "estoque_razao",
  "recebiveis",
  "leads_abertos",
  "fila",
  "webhooks",
  "importacoes_mercos",
  "campanhas_prospeccao",
  "campanhas_venda",
  "clientes_duplicados",
  "contatos_endereco",
  "conversas_paradas",
  "ocorrencias_correcao",
  "eventos_correcao",
  "jobs_correcao",
  "slo_api",
] as const;

export type ColetaNome = (typeof COLETAS)[number];

export const FONTES_DA_REGRA: Readonly<Record<string, readonly ColetaNome[]>> = {
  "fiscal.nota_rejeitada": ["notas"],
  "fiscal.nota_em_emissao_travada": ["notas"],
  "fiscal.nota_pendente_antiga": ["notas"],
  "fiscal.nota_sem_vinculo": ["notas"],
  "fiscal.nota_sem_chave": ["notas"],
  "fiscal.nota_duplicada_por_pedido": ["notas", "notas_pedidos"],
  "fiscal.divergencia_valor_nota": ["notas", "pedidos"],
  "fiscal.nota_autorizada_pedido_nao_faturado": ["notas", "pedidos"],
  "fiscal.pedido_com_nf_sem_nota": ["notas", "pedidos"],
  "fiscal.job_fiscal_travado": ["jobs_fiscais"],
  "fiscal.job_retry_excessivo": ["jobs_fiscais"],
  "fiscal.sincronizacao_falhou": ["sincronizacoes_fiscais"],
  "fiscal.rejeicao_repetida": ["notas"],

  "operacao.estoque_negativo": ["produtos"],
  "operacao.estoque_divergente": ["estoque_razao"],
  "operacao.pedido_total_incoerente": ["pedidos"],
  "operacao.pedido_preso": ["pedidos"],
  "operacao.pedido_sem_cliente": ["pedidos"],
  "operacao.pedido_com_nf_sem_documento": ["pedidos"],
  "operacao.recebivel_sem_origem": ["recebiveis"],
  "operacao.recebivel_duplicado": ["recebiveis"],
  "operacao.recebivel_parcela_invalida": ["recebiveis"],
  "operacao.mercos_importacao_travada": ["importacoes_mercos"],
  "operacao.mercos_importacao_falhou": ["importacoes_mercos"],
  "operacao.job_fila_travado": ["fila"],
  "operacao.webhook_falhas": ["webhooks"],
  "campanha.cidade_invalida": ["campanhas_prospeccao", "campanhas_venda"],
  "campanha.cidade_repetida": ["campanhas_prospeccao"],
  "operacao.cliente_duplicado_email": ["clientes_duplicados"],
  "operacao.lead_duplicado": ["leads_abertos"],
  "plataforma.slo_estourado": ["slo_api"],
  "operacao.correcao_sem_reversao": [
    "ocorrencias_correcao",
    "eventos_correcao",
    "jobs_correcao",
  ],
  "operacao.conversa_claim_parado": ["conversas_paradas"],
  "cadastro.endereco_com_lixo": ["contatos_endereco"],
  "operacao.aprovacao_expirada": [
    "ocorrencias_correcao",
    "eventos_correcao",
    "jobs_correcao",
  ],
};

/** A regra depende de alguma fonte truncada? Desconhecida = bloqueia. */
export function regraBloqueadaPorFontes(regra: string, truncados: readonly string[]): boolean {
  const deps = FONTES_DA_REGRA[regra];
  if (!deps) return truncados.length > 0;
  return deps.some((fonte) => truncados.includes(fonte));
}

/** Regras cuja fonte foi truncada (ou desconhecida — nunca fecha no escuro). */
export function regrasBloqueadas(truncados: readonly string[]): Set<string> {
  const fontes = new Set(truncados);
  const bloqueadas = new Set<string>();
  for (const [regra, deps] of Object.entries(FONTES_DA_REGRA)) {
    if (deps.some((fonte) => fontes.has(fonte))) bloqueadas.add(regra);
  }
  return bloqueadas;
}
