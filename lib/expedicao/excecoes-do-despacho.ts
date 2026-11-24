/**
 * FAIXA DE EXCEÇÕES DO DESPACHO — o que exige ação AGORA.
 *
 * Só dado que o banco já tem: status da carga, `endereco_entrega` nulo,
 * placa/motorista vazios, `rota_em` nulo e idade (`created_at`). Nenhuma
 * métrica inventada, nenhuma contagem dupla: uma carga entra em cada família
 * no máximo uma vez, e a ordem é por urgência (em rota primeiro).
 */

export type ChaveExcecao =
  | "precisa_atencao"
  | "sem_localizacao"
  | "sem_motorista_veiculo"
  | "prontas_para_sair";

export interface ExcecaoDoDespacho {
  chave: ChaveExcecao;
  rotulo: string;
  quantidade: number;
  cargaIds: string[];
  urgente: boolean;
}

export interface CargaParaExcecao {
  id: string;
  status: string;
  placa: string | null;
  motorista_nome: string | null;
  rota_em?: string | null;
  created_at: string;
}

export interface ItemParaExcecao {
  shipment_id: string;
  order_id: string;
  status: string;
  separado_em?: string | null;
}

export function calcularExcecoesDoDespacho({
  cargas,
  itens,
  enderecosPorPedido,
  agora = new Date(),
}: {
  cargas: CargaParaExcecao[];
  itens: ItemParaExcecao[];
  /** Mapa order_id → endereço bruto do pedido (ou null). */
  enderecosPorPedido: Map<string, string | null>;
  agora?: Date;
}): ExcecaoDoDespacho[] {
  const grupos: Record<ChaveExcecao, Set<string>> = {
    precisa_atencao: new Set(),
    sem_localizacao: new Set(),
    sem_motorista_veiculo: new Set(),
    prontas_para_sair: new Set(),
  };

  const itensPorCarga = new Map<string, ItemParaExcecao[]>();
  for (const item of itens) {
    const lista = itensPorCarga.get(item.shipment_id) ?? [];
    lista.push(item);
    itensPorCarga.set(item.shipment_id, lista);
  }

  const dias = (iso: string) =>
    Math.floor((agora.getTime() - new Date(iso).getTime()) / 86_400_000);

  for (const carga of cargas) {
    const cargaItens = itensPorCarga.get(carga.id) ?? [];
    const ativa = carga.status === "em_rota" || carga.status === "montando";

    // 1. Em rota com problema: rota não calculada, devolução ou parada parada.
    if (carga.status === "em_rota") {
      const comProblema =
        !carga.rota_em ||
        cargaItens.some((i) => ["devolvido", "nao_entregue", "recusado"].includes(i.status)) ||
        cargaItens.some((i) => Number.isFinite(dias(carga.created_at)) && dias(carga.created_at) > 3);
      if (comProblema) grupos.precisa_atencao.add(carga.id);
    }

    // 2. Sem localização: pedido da carga ativa sem endereço conhecido.
    if (ativa && cargaItens.some((i) => !enderecosPorPedido.get(i.order_id))) {
      grupos.sem_localizacao.add(carga.id);
    }

    // 3. Montando sem escala: a rota não pode ser publicada assim.
    if (carga.status === "montando" && (!carga.placa?.trim() || !carga.motorista_nome?.trim())) {
      grupos.sem_motorista_veiculo.add(carga.id);
    }

    // 4. Pronta para sair: tudo conferido, escala completa e sem os problemas acima.
    if (
      carga.status === "montando" &&
      cargaItens.length > 0 &&
      cargaItens.every((i) => Boolean(i.separado_em)) &&
      carga.placa?.trim() &&
      carga.motorista_nome?.trim() &&
      !grupos.sem_localizacao.has(carga.id)
    ) {
      grupos.prontas_para_sair.add(carga.id);
    }
  }

  const ordem: Array<[ChaveExcecao, string, boolean]> = [
    ["precisa_atencao", "Precisa de atenção", true],
    ["sem_localizacao", "Sem localização", true],
    ["sem_motorista_veiculo", "Sem motorista / veículo", false],
    ["prontas_para_sair", "Prontas para sair", false],
  ];
  return ordem.map(([chave, rotulo, urgente]) => ({
    chave,
    rotulo,
    quantidade: grupos[chave].size,
    cargaIds: [...grupos[chave]],
    urgente,
  }));
}

export function chaveValida(value: string | undefined): value is ChaveExcecao {
  return (
    value === "precisa_atencao" ||
    value === "sem_localizacao" ||
    value === "sem_motorista_veiculo" ||
    value === "prontas_para_sair"
  );
}
