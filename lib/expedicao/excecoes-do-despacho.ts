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
  | "montagem_parada"
  | "sem_localizacao"
  | "sem_motorista_veiculo"
  | "prontas_para_sair";

/**
 * Limite da montagem parada (P0-3, auditoria 89).
 *
 * 24 h é a régua do dia operacional: uma carga que começou a ser montada ontem
 * e ainda não saiu já perdeu a janela do cliente. Não é env porque o rótulo da
 * exceção é a promessa que o operador lê — configurável, ele deixaria de bater
 * com o número na tela.
 */
export const HORAS_DE_MONTAGEM_PARADA = 24;

/**
 * Há quantos DIAS a carga está montando acima do limiar, ou `null` quando não é
 * montagem parada. `em_rota` nunca entra: a pergunta é sobre a doca, não sobre a
 * rua. Exatamente 24 h ainda não conta — a auditoria fala em "mais antiga que
 * 24 h".
 */
export function diasDeMontagemParada(
  carga: Pick<CargaParaExcecao, "status" | "created_at">,
  agora: Date = new Date(),
): number | null {
  if (carga.status !== "montando") return null;
  const horas = (agora.getTime() - new Date(carga.created_at).getTime()) / 3_600_000;
  if (!Number.isFinite(horas) || horas <= HORAS_DE_MONTAGEM_PARADA) return null;
  return Math.floor(horas / 24);
}

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
  semCoordenadaPorCarga,
  agora = new Date(),
}: {
  cargas: CargaParaExcecao[];
  itens: ItemParaExcecao[];
  /** Mapa order_id → endereço bruto do pedido (ou null). */
  enderecosPorPedido: Map<string, string | null>;
  /**
   * `shipment_id → quantas paradas da carga não têm pino`. O mapa pode estar
   * ausente (chamadas antigas), mas quando existe ele é o que torna a família
   * "sem localização" acionável: endereço presente e coordenada ausente é
   * exatamente o caso que o "Resolver" geocodifica (P0-2, auditoria 89).
   */
  semCoordenadaPorCarga?: Map<string, number>;
  agora?: Date;
}): ExcecaoDoDespacho[] {
  const grupos: Record<ChaveExcecao, Set<string>> = {
    precisa_atencao: new Set(),
    montagem_parada: new Set(),
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

    // 2. Sem localização: pedido da carga ativa sem endereço conhecido OU
    //    parada com endereço que ainda não ganhou pino. As duas impedem a rota
    //    de ser desenhada e as duas têm a mesma ação (geocodificar em lote).
    if (
      ativa &&
      ((semCoordenadaPorCarga?.get(carga.id) ?? 0) > 0 ||
        cargaItens.some((i) => !enderecosPorPedido.get(i.order_id)))
    ) {
      grupos.sem_localizacao.add(carga.id);
    }

    // 3. Montagem parada: na doca há mais de 24 h. `em_rota` nunca entra —
    //    para a rua a pergunta é outra ("precisa de atenção").
    if (carga.status === "montando" && diasDeMontagemParada(carga, agora) !== null) {
      grupos.montagem_parada.add(carga.id);
    }

    // 4. Montando sem escala: a rota não pode ser publicada assim.
    if (carga.status === "montando" && (!carga.placa?.trim() || !carga.motorista_nome?.trim())) {
      grupos.sem_motorista_veiculo.add(carga.id);
    }

    // 5. Pronta para sair: tudo conferido, escala completa e sem os problemas acima.
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
    ["montagem_parada", `Montagem parada há mais de ${HORAS_DE_MONTAGEM_PARADA}h`, true],
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
    value === "montagem_parada" ||
    value === "sem_localizacao" ||
    value === "sem_motorista_veiculo" ||
    value === "prontas_para_sair"
  );
}
