/**
 * CARGA PARA ROTA — o carregador único dos endpoints `rota/*`.
 *
 * Uma carga, seus pedidos, os contatos desses pedidos: três selects, nenhum
 * N+1. O frontend NUNCA decide quem pertence à carga nem as coordenadas —
 * tudo sai daqui, validado no backend (a rota confia no banco, não no body).
 */
import { enderecoEmLinha } from "@/lib/contacts/endereco-em-linha";
import { linhaComRua } from "@/lib/expedicao/endereco-da-entrega";
import { agruparParadas, type ItemDaCargaParaParada, type ParadaDaRota } from "@/lib/rotas/paradas";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface CargaRota {
  id: string;
  numero: number;
  status: string;
  placa: string | null;
  veiculo_tipo: string | null;
  motorista_nome: string | null;
  origem_endereco: string | null;
  origem_lat: number | null;
  origem_lng: number | null;
  retornar_origem: boolean;
  tempo_parada_min: number;
  distancia_m: number | null;
  duracao_s: number | null;
  rota_geojson: { geometria?: number[][]; provedor?: string; ruas?: boolean; modo?: string } | null;
  rota_em: string | null;
  rota_versao: number;
  /** Hora do dia da saída da base (migration 0307). NULL = janela não aplicável. */
  saida_prevista: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface CargaComParadas {
  carga: CargaRota;
  itens: ItemDaCargaParaParada[];
  paradas: ParadaDaRota[];
}

const COLUNAS_CARGA_ROTA =
  "id, numero, status, placa, veiculo_tipo, motorista_nome, origem_endereco, origem_lat, origem_lng, " +
  "retornar_origem, tempo_parada_min, distancia_m, duracao_s, rota_geojson, rota_em, rota_versao, " +
  "saida_prevista, started_at, finished_at";

export async function carregarCargaComParadas(
  supabase: Supabase,
  orgId: string,
  shipmentId: string,
): Promise<CargaComParadas | null> {
  const { data: carga, error: erroCarga } = await supabase
    .from("shipments")
    .select(COLUNAS_CARGA_ROTA)
    .eq("id", shipmentId)
    .eq("organization_id", orgId)
    .single();
  if (erroCarga || !carga) return null;

  const { data: itens } = await supabase
    .from("shipment_orders")
    .select(
      "id, order_id, sequencia, status, separado_em, veiculo_id, motorista_id, sequencia_veiculo, janela_inicio, janela_fim, destination_id",
    )
    .eq("shipment_id", shipmentId)
    .eq("organization_id", orgId)
    .order("sequencia");
  const lista = ((itens ?? []) as unknown as {
    id: string;
    order_id: string;
    sequencia: number;
    status: string;
    separado_em: string | null;
    veiculo_id: string | null;
    motorista_id: string | null;
    sequencia_veiculo: number | null;
    janela_inicio: string | null;
    janela_fim: string | null;
    destination_id: string | null;
  }[]);
  if (lista.length === 0) {
    return { carga: carga as unknown as CargaRota, itens: [], paradas: [] };
  }

  const idsPedidos = lista.map((i) => i.order_id);
  const { data: pedidos } = await supabase
    .from("commercial_orders")
    .select("id, numero, cliente_nome, contact_id, endereco_entrega, total_cents, status")
    .eq("organization_id", orgId)
    .in("id", idsPedidos);
  // Itens de cada pedido: o motorista precisa saber O QUE entregar, não só
  // para quem. Uma consulta para todos os pedidos da carga.
  const { data: itensProdutos } = await supabase
    .from("commercial_order_items")
    .select("order_id, produto_codigo, produto_nome, quantidade")
    .eq("organization_id", orgId)
    .in("order_id", idsPedidos)
    .order("posicao");
  const listaItensProdutos = (itensProdutos ?? []) as unknown as {
    order_id: string;
    produto_codigo: string;
    produto_nome: string;
    quantidade: number;
  }[];

  // PESO E VOLUME DO QUE VAI NA CARGA — sem inventar número.
  //
  // O solver usa a matriz rodoviária e a capacidade dos veículos; para a
  // capacidade significar algo, a demanda de cada parada precisa vir do
  // cadastro do produto (`catalog_products`), não de um zero fixo. Produto
  // sem `peso_bruto_kg` fica SEM peso (a resposta dirá que a restrição não
  // foi aplicada) — ausência não vira zero silencioso.
  //
  // Volume só é derivado quando as três dimensões existem: cm³ → m³.
  const codigosProdutos = [...new Set(listaItensProdutos.map((i) => (i.produto_codigo ?? "").trim()).filter(Boolean))];
  const fisicoPorCodigo = new Map<string, { pesoKg: number | null; volumeM3: number | null }>();
  if (codigosProdutos.length > 0) {
    const { data: produtos } = await supabase
      .from("catalog_products")
      .select("codigo, peso_bruto_kg, altura_cm, largura_cm, comprimento_cm")
      .eq("organization_id", orgId)
      .in("codigo", codigosProdutos);
    for (const p of (produtos ?? []) as unknown as {
      codigo: string;
      peso_bruto_kg: number | null;
      altura_cm: number | null;
      largura_cm: number | null;
      comprimento_cm: number | null;
    }[]) {
      const dimensoes = [p.altura_cm, p.largura_cm, p.comprimento_cm];
      const volumeM3 =
        dimensoes.every((d) => d != null && d > 0)
          ? (Number(p.altura_cm) * Number(p.largura_cm) * Number(p.comprimento_cm)) / 1_000_000
          : null;
      fisicoPorCodigo.set(p.codigo.trim(), { pesoKg: p.peso_bruto_kg ?? null, volumeM3 });
    }
  }

  const porPedidoItens = new Map<
    string,
    { codigo: string; nome: string; quantidade: number; peso_unit_kg: number | null; volume_unit_m3: number | null }[]
  >();
  for (const it of listaItensProdutos) {
    const listaItens = porPedidoItens.get(it.order_id) ?? [];
    const fisico = fisicoPorCodigo.get((it.produto_codigo ?? "").trim());
    listaItens.push({
      codigo: it.produto_codigo ?? "",
      nome: it.produto_nome ?? "",
      quantidade: Number(it.quantidade ?? 0),
      peso_unit_kg: fisico?.pesoKg ?? null,
      volume_unit_m3: fisico?.volumeM3 ?? null,
    });
    porPedidoItens.set(it.order_id, listaItens);
  }

  const porPedido = new Map(
    ((pedidos ?? []) as unknown as {
      id: string;
      numero: number;
      cliente_nome: string;
      contact_id: string | null;
      endereco_entrega: string | null;
      total_cents: number;
      status: string;
    }[]).map((p) => [p.id, p]),
  );

  // O DESTINO PERSISTIDO (migration 0308) — endereço e coordenada do ENDEREÇO,
  // não do cliente. É a fonte primária; o cadastro só entra quando a carga é
  // anterior a esta migration (`destination_id` nulo).
  const idsDestinos = [...new Set(lista.map((i) => i.destination_id).filter(Boolean))] as string[];
  const porDestino = new Map<string, {
    id: string;
    endereco: string | null;
    latitude: number | null;
    longitude: number | null;
    geo_status: string | null;
    geo_fonte: string | null;
  }>();
  if (idsDestinos.length > 0) {
    const { data: destinos } = await supabase
      .from("shipment_destinations")
      .select("id, endereco, latitude, longitude, geo_status, geo_fonte")
      .eq("organization_id", orgId)
      .in("id", idsDestinos);
    for (const d of (destinos ?? []) as unknown as {
      id: string;
      endereco: string | null;
      latitude: number | null;
      longitude: number | null;
      geo_status: string | null;
      geo_fonte: string | null;
    }[]) {
      porDestino.set(d.id, d);
    }
  }

  const idsContatos = [...new Set([...porPedido.values()].map((p) => p.contact_id).filter(Boolean))] as string[];
  let porContato = new Map<string, {
    id: string;
    display_name: string | null;
    name: string | null;
    phone_number: string | null;
    logradouro: string | null;
    numero_end: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
    cep: string | null;
    latitude: number | null;
    longitude: number | null;
    geo_status: string | null;
    geo_fonte: string | null;
  }>();
  if (idsContatos.length > 0) {
    const { data: contatos } = await supabase
      .from("contacts")
      .select(
        "id, display_name, name, phone_number, logradouro, numero_end, complemento, bairro, cidade, uf, cep, latitude, longitude, geo_status, geo_fonte",
      )
      .eq("organization_id", orgId)
      .in("id", idsContatos);
    porContato = new Map(
      ((contatos ?? []) as unknown as {
        id: string;
        display_name: string | null;
        name: string | null;
        phone_number: string | null;
        logradouro: string | null;
        numero_end: string | null;
        complemento: string | null;
        bairro: string | null;
        cidade: string | null;
        uf: string | null;
        cep: string | null;
        latitude: number | null;
        longitude: number | null;
        geo_status: string | null;
        geo_fonte: string | null;
      }[]).map((c) => [c.id, c]),
    );
  }

  const paraParada: ItemDaCargaParaParada[] = lista.map((i) => {
    const p = porPedido.get(i.order_id);
    const c = p?.contact_id ? porContato.get(p.contact_id) : undefined;
    const destino = i.destination_id ? porDestino.get(i.destination_id) : undefined;
    return {
      shipment_order_id: i.id,
      order_id: i.order_id,
      sequencia: i.sequencia,
      status: i.status,
      separado_em: i.separado_em,
      numero: p?.numero ?? 0,
      cliente_nome: p?.cliente_nome ?? "?",
      contact_id: p?.contact_id ?? null,
      destination_id: i.destination_id,
      contato_nome: c ? (c.display_name ?? c.name) : null,
      fone: c?.phone_number ?? null,
      // O ENDEREÇO DA PARADA — o do PEDIDO quando o operador escolheu outro
      // ponto de entrega, senão o do CADASTRO.
      //
      // Antes daqui saía só `endereco_entrega` do pedido. Nesta instalação
      // nenhum dos pedidos das cargas abertas tinha esse campo preenchido
      // (0 de 28), embora 25 dos 28 tivessem a rua no cadastro — então a
      // parada ia para o mapa sem endereço, a geocodificação não tinha alvo
      // ("Geocodificação concluída" sem mover um pino) e o mapa ficava vazio.
      // O cadastro é o dado que o cliente deu; a ausência do snapshot do
      // pedido não significa "cliente sem endereço".
      //
      // `linhaComRua` cobre o caso seguinte, medido em 2026-11-05: o snapshot
      // EXISTE mas nasceu sem a rua (o cadastro estava incompleto na hora do
      // faturamento) e vencia o cadastro já completo. Endereço sem rua não é
      // ponto de entrega escolhido — é dado velho.
      //
      // Com destino persistido, o snapshot VENCE: é o endereço que o pedido
      // tinha quando entrou na carga, e mexer no cadastro do cliente depois
      // disso não move a entrega planejada (prompt §2).
      endereco_entrega:
        destino?.endereco ?? linhaComRua(p?.endereco_entrega) ?? (enderecoEmLinha(c) || null),
      latitude: destino ? destino.latitude : (c?.latitude ?? null),
      longitude: destino ? destino.longitude : (c?.longitude ?? null),
      geo_status: destino ? (destino.geo_status ?? "pendente") : (c?.geo_status ?? "pendente"),
      geo_fonte: destino ? destino.geo_fonte : (c?.geo_fonte ?? null),
      total_cents: p?.total_cents ?? 0,
      itens: porPedidoItens.get(i.order_id) ?? [],
      veiculo_id: i.veiculo_id,
      motorista_id: i.motorista_id,
      sequencia_veiculo: i.sequencia_veiculo,
      janela_inicio: i.janela_inicio,
      janela_fim: i.janela_fim,
    };
  });

  // PONTO DE PARTIDA — a sede da empresa, sempre que ninguém escolheu outro.
  //
  // A carga nasce sem origem, e sem origem a otimização por distância nem
  // roda ("Ordem por distância precisa da origem") e o campo abre vazio para
  // quem só quer mandar o motorista embora. A operação é sempre a mesma: sai
  // da empresa. Então o padrão é a sede, lida de `organizations` — dado do
  // dono, não um endereço escrito no código.
  //
  // Continua editável, e o que o operador confirmar (PATCH /rota/ordem) vence
  // este padrão, porque aí `origem_endereco` deixa de ser vazio.
  const c = carga as unknown as CargaRota;
  if (!(c.origem_endereco ?? "").trim()) {
    const { data: org } = await supabase
      .from("organizations")
      .select("logradouro, numero_end, complemento, bairro, cidade, uf, cep")
      .eq("id", orgId)
      .maybeSingle();
    const sede = enderecoEmLinha(org ?? null);
    if (sede) c.origem_endereco = sede;
  }

  return {
    carga: c,
    itens: paraParada,
    paradas: agruparParadas(paraParada),
  };
}
