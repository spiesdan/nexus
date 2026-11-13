/**
 * OS PARADOS DA ROTA — tipos e montagem, sem entidade paralela.
 *
 * A parada NÃO é uma tabela: é `shipment_orders` agrupado por DESTINO.
 * Vários pedidos do mesmo destino (mesmo cliente, mesmo endereço) viram UMA
 * parada (o motorista visita uma vez só); pedidos para endereços diferentes são
 * destinos diferentes e entram como paradas separadas. O endereço da parada
 * segue a prioridade do negócio: endereço de entrega do pedido → endereço do
 * contato → nada (nunca chute).
 */

import { minutosDoDia } from "./janelas";

export interface ItemDaParada {
  codigo: string;
  nome: string;
  quantidade: number;
  /** Peso bruto unitário do cadastro do produto; null = sem dado. */
  peso_unit_kg?: number | null;
  /** Volume unitário (m³) derivado das dimensões; null = dimensões incompletas. */
  volume_unit_m3?: number | null;
}

export interface ParadaDaRota {
  /** Chave estável do destino: `contact_id`/`avulso:<nome>` + "::endereço" quando há destino. */
  chave: string;
  /**
   * Identidade persistida do destino (`shipment_destinations`, migration 0308).
   * `chave` continua sendo o que a tela usa; o id é o que autoriza geocodificar
   * e marcar pino sem tocar no cadastro do cliente. NULL em carga legada.
   */
  destination_id?: string | null;
  contact_id: string | null;
  cliente: string;
  fone: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_status: string;
  /** nominatim:numero|nominatim:rua|nominatim:cidade|manual — a tela diz quando é aproximado. */
  geo_fonte: string | null;
  pedidos: { shipment_order_id: string; order_id: string; numero: number; total_cents: number; status: string }[];
  /** O que entregar nesta parada — itens dos pedidos do cliente, somados. */
  itens: ItemDaParada[];
  total_cents: number;
  /**
   * Janela da parada: INTERSEÇÃO das janelas dos pedidos que caem nela
   * (maior início, menor fim). Se dois pedidos do mesmo destino têm janelas
   * que não se cruzam, `janela_conflito` fica true e a janela sai nula — o
   * solver não recebe restrição impossível, e a tela diz o motivo.
   */
  janela_inicio: string | null;
  janela_fim: string | null;
  janela_conflito: boolean;
  /** Atribuição operacional da distribuição confirmada (migration 0307). */
  veiculo_id: string | null;
  motorista_id: string | null;
  sequencia_veiculo: number | null;
}

export interface ItemDaCargaParaParada {
  shipment_order_id: string;
  order_id: string;
  sequencia: number;
  status: string;
  /** NULL/ausente = ainda não separado/conferido (0240). */
  separado_em?: string | null;
  numero: number;
  cliente_nome: string;
  contact_id: string | null;
  contato_nome: string | null;
  fone: string | null;
  endereco_entrega: string | null;
  destination_id?: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_status: string | null;
  geo_fonte: string | null;
  total_cents: number;
  itens?: ItemDaParada[];
  /** Janela combinada para O PEDIDO (migration 0307), hora do dia. */
  janela_inicio?: string | null;
  janela_fim?: string | null;
  /** Atribuição da parada (migration 0307) — mesma para os pedidos do destino. */
  veiculo_id?: string | null;
  motorista_id?: string | null;
  sequencia_veiculo?: number | null;
}

/**
 * Agrupa os itens da carga por cliente, preservando a menor sequência como
 * ordem inicial. Pedido sem contato agrupa pelo nome (avulso).
 */
export function agruparParadas(itens: ItemDaCargaParaParada[]): ParadaDaRota[] {
  const mapa = new Map<string, ParadaDaRota & { menorSeq: number }>();
  for (const i of itens) {
    // Avulso normaliza (caixa, espaço duplo, acento): "João  Silva" e
    // "joao silva" são a mesma visita — sem isso, o motorista para duas
    // vezes na mesma porta.
    const nomeChave = i.cliente_nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const base = i.contact_id ?? `avulso:${nomeChave}`;
    const destino = (i.endereco_entrega ?? "").trim();
    // Destino é a identidade da parada (prompt §2): o agrupamento não pode usar
    // o contato/cliente como se o destino fosse esse. Cliente com dois pedidos
    // para endereços diferentes é DOIS destinos e dois roteiros — agrupar por
    // contato só fazia a rota colapsar duas ruas diferentes na mesma parada.
    const chave = destino ? `${base}::${destino}` : base;
    let p = mapa.get(chave);
    if (!p) {
      p = {
        chave,
        destination_id: i.destination_id ?? null,
        contact_id: i.contact_id,
        cliente: i.contato_nome?.trim() || i.cliente_nome,
        fone: i.fone,
        endereco: destino || null,
        latitude: i.latitude,
        longitude: i.longitude,
        geo_status: i.geo_status ?? "pendente",
        geo_fonte: i.geo_fonte ?? null,
        pedidos: [],
        itens: [],
        total_cents: 0,
        janela_inicio: null,
        janela_fim: null,
        janela_conflito: false,
        veiculo_id: null,
        motorista_id: null,
        sequencia_veiculo: null,
        menorSeq: i.sequencia,
      };
      mapa.set(chave, p);
    }
    // Primeiro endereço não-vazio vence (prioridade: pedido > contato já
    // resolvida na montagem de `endereco_entrega` pela rota).
    if (!p.endereco && i.endereco_entrega?.trim()) p.endereco = i.endereco_entrega.trim();
    if (i.latitude != null && i.longitude != null && (p.latitude == null || p.longitude == null)) {
      p.latitude = i.latitude;
      p.longitude = i.longitude;
    }
    p.pedidos.push({
      shipment_order_id: i.shipment_order_id,
      order_id: i.order_id,
      numero: i.numero,
      total_cents: i.total_cents,
      status: i.status,
    });
    p.total_cents += i.total_cents;
    // Janela: interseção. Pedido sem janela não restringe o destino.
    if (i.janela_inicio && i.janela_fim) {
      const inicio = minutosDoDia(i.janela_inicio);
      const fim = minutosDoDia(i.janela_fim);
      if (inicio != null && fim != null && fim > inicio) {
        const inicioAtual = minutosDoDia(p.janela_inicio);
        const fimAtual = minutosDoDia(p.janela_fim);
        const novoInicio = inicioAtual == null ? i.janela_inicio : p.janela_inicio;
        const novoFim = fimAtual == null ? i.janela_fim : p.janela_fim;
        const inicioMin = Math.max(inicioAtual ?? inicio, inicio);
        const fimMin = Math.min(fimAtual ?? fim, fim);
        if (fimMin <= inicioMin) {
          p.janela_conflito = true;
          p.janela_inicio = null;
          p.janela_fim = null;
        } else {
          // Guarda a string original do lado que venceu (já é HH:MM:SS).
          p.janela_inicio = inicioMin === inicio ? i.janela_inicio : novoInicio;
          p.janela_fim = fimMin === fim ? i.janela_fim : novoFim;
        }
      }
    }
    // Atribuição: os pedidos de um mesmo destino saem no mesmo veículo.
    if (p.veiculo_id == null && i.veiculo_id) p.veiculo_id = i.veiculo_id;
    if (p.motorista_id == null && i.motorista_id) p.motorista_id = i.motorista_id;
    if (p.sequencia_veiculo == null && i.sequencia_veiculo != null) {
      p.sequencia_veiculo = i.sequencia_veiculo;
    }
    // Itens da parada: o cliente recebe tudo de uma vez, então o mesmo produto
    // em dois pedidos vira UMA linha com a soma — igual ao romaneio.
    for (const item of i.itens ?? []) {
      const norm = (v: string) => v.trim().toUpperCase().replace(/\s+/g, " ");
      const chaveItem = item.codigo ? `cod:${norm(item.codigo)}` : `nome:${norm(item.nome)}`;
      const existente = p.itens.find(
        (x) => (x.codigo ? `cod:${norm(x.codigo)}` : `nome:${norm(x.nome)}`) === chaveItem,
      );
      if (existente) existente.quantidade += item.quantidade;
      else p.itens.push({ ...item });
    }
    if (i.sequencia < p.menorSeq) p.menorSeq = i.sequencia;
  }
  return [...mapa.values()]
    .sort((a, b) => a.menorSeq - b.menorSeq)
    .map(({ menorSeq: _menor, ...resto }) => resto);
}
