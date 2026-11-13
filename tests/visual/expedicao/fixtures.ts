/**
 * AS FIXTURES DA BANCADA VISUAL DA EXPEDIÇÃO.
 *
 * Dado sintético, de propósito: nenhum cliente real aparece aqui, e o print
 * pode ser versionado (a doutrina de QA proíbe commitar tela com dado de
 * cliente). Os endereços são de Canoinhas/SC — a operação que originou o
 * módulo —, mas os nomes são inventados.
 *
 * A ordem de `paradas` é a MESMA da distribuição achatada (veículo a veículo).
 * Isso não é preguiça: `_roteirizador.tsx` só desenha uma linha por veículo
 * quando a ordem exibida é igual à salva (`ordemMudou === false`). Fixture fora
 * de ordem esconderia justamente o que a foto precisa provar.
 */

const ORIGEM = { lat: -26.177, lng: -50.39, endereco: "Rua Antônio Liller, 585 — Canoinhas/SC" };

/** Uma parada do roteiro, já no formato `ParadaRotaApi`. */
function parada(
  chave: string,
  cliente: string,
  endereco: string,
  lat: number,
  lng: number,
  pedidos: { numero: number; total: number }[],
) {
  return {
    chave,
    destination_id: `dest-${chave}`,
    contact_id: `contato-${chave}`,
    cliente,
    fone: "(47) 90000-0000",
    endereco,
    latitude: lat,
    longitude: lng,
    geo_status: "ok",
    geo_fonte: "nominatim:numero",
    pedidos: pedidos.map((p) => ({
      shipment_order_id: `so-${chave}-${p.numero}`,
      order_id: `pedido-${chave}-${p.numero}`,
      numero: p.numero,
      total_cents: p.total,
      status: "em_rota" as const,
    })),
    itens: [{ codigo: "CX-01", nome: "Caixa padrão", quantidade: 2 }],
    total_cents: pedidos.reduce((s, p) => s + p.total, 0),
  };
}

const PARADAS = [
  parada("p1", "Mercado Bom Dia", "Rua Coronel Albuquerque, 120", -26.17, -50.385, [{ numero: 1041, total: 32_900 }]),
  parada("p2", "Padaria Trigo Dourado", "Avenida dos Imigrantes, 45", -26.1755, -50.399, [{ numero: 1042, total: 14_500 }]),
  parada("p3", "Farmácia Vida Plena", "Rua Vidal Ramos, 890", -26.183, -50.381, [
    { numero: 1043, total: 8_700 },
    { numero: 1051, total: 21_300 },
  ]),
  parada("p4", "Lojas Horizonte", "Rua Barão do Rio Branco, 233", -26.188, -50.4, [{ numero: 1044, total: 76_200 }]),
  parada("p5", "Restaurante Sabor da Serra", "Rua Duque de Caxias, 61", -26.166, -50.402, [{ numero: 1045, total: 39_800 }]),
  parada("p6", "Auto Peças Roda Livre", "Rua Marechal Deodoro, 1400", -26.181, -50.376, [{ numero: 1046, total: 118_000 }]),
  parada("p7", "Bazar Casa & Cia", "Rua Felipe Schmidt, 77", -26.19, -50.39, [{ numero: 1047, total: 26_400 }]),
  parada("p8", "Pet Shop Amigo Fiel", "Rua das Acácias, 12", -26.172, -50.394, [{ numero: 1048, total: 17_900 }]),
  parada("p9", "Ótica Foco Certo", "Rua Sete de Setembro, 505", -26.185, -50.405, [{ numero: 1049, total: 45_600 }]),
];

const VEICULOS = [
  { id: "vei-1", placa: "ABC1D23", veiculo_tipo: "Van", capacidade_kg: 1200, capacidade_m3: 8, ativo: true },
  { id: "vei-2", placa: "XYZ9K88", veiculo_tipo: "Furgão", capacidade_kg: 800, capacidade_m3: 5, ativo: true },
  { id: "vei-3", placa: "QRS2E45", veiculo_tipo: "Utilitário", capacidade_kg: 600, capacidade_m3: 3.5, ativo: true },
];

const MOTORISTAS = [
  { id: "mot-1", nome: "Ana Ferreira", capacidade_jornada_min: 528, ativo: true },
  { id: "mot-2", nome: "Bruno Alves", capacidade_jornada_min: 528, ativo: true },
  { id: "mot-3", nome: "Carla Nunes", capacidade_jornada_min: 480, ativo: true },
];

/**
 * Geometria de rua sintética: origem → paradas → origem, com um vértice no
 * meio de cada trecho para não desenhar um "estilingue" reto. Formato GeoJSON
 * `[lng, lat]`, que é o que o mapa consome.
 */
function geometriaDe(paradas: { lat: number; lng: number }[][]): number[][] {
  const pontos: number[][] = [[ORIGEM.lng, ORIGEM.lat]];
  for (const trecho of paradas) {
    const [a, b] = trecho;
    if (!a || !b) continue;
    pontos.push([(a.lng + b.lng) / 2 + 0.0012, (a.lat + b.lat) / 2 + 0.0009]);
    pontos.push([b.lng, b.lat]);
  }
  pontos.push([ORIGEM.lng, ORIGEM.lat]);
  return pontos;
}

const porChave = new Map(PARADAS.map((p) => [p.chave, p]));
const coord = (chave: string) => {
  const p = porChave.get(chave)!;
  return { lat: p.latitude, lng: p.longitude };
};

const DISTRIBUICAO = [
  { veiculo: "vei-1", motorista: "mot-1", chaves: ["p1", "p2", "p3"], chegadas: [420, 900, 1500], km: 8_400 },
  { veiculo: "vei-2", motorista: "mot-2", chaves: ["p4", "p5", "p6"], chegadas: [600, 1260, 1980], km: 11_200 },
  { veiculo: "vei-3", motorista: "mot-3", chaves: ["p7", "p8", "p9"], chegadas: [540, 1080, 1620], km: 9_750 },
];

export const ROTA = {
  carga: {
    id: "carga-bancada",
    numero: 77,
    status: "montando",
    placa: null,
    veiculo_tipo: null,
    motorista_nome: null,
    origem_endereco: ORIGEM.endereco,
    origem_lat: ORIGEM.lat,
    origem_lng: ORIGEM.lng,
    retornar_origem: true,
    tempo_parada_min: 8,
    distancia_m: 29_350,
    duracao_s: 2_700,
    rota_geojson: {
      geometria: geometriaDe([
        [ORIGEM, coord("p1")],
        [coord("p1"), coord("p2")],
        [coord("p2"), coord("p3")],
      ]),
      provedor: "osrm",
      ruas: true,
      modo: "distancia",
    },
    rota_em: "2026-11-13T11:02:00.000Z",
    rota_versao: 3,
    saida_prevista: "08:00",
    started_at: null,
    finished_at: null,
  },
  // Ordem = distribuição achatada (veículo 1 → 2 → 3). Ver o comentário do topo.
  paradas: PARADAS,
  ultima_posicao: { latitude: -26.1715, longitude: -50.3905, em: "2026-11-13T11:20:00.000Z" },
  distribuicao: {
    id: "dist-1",
    versao: 3,
    algoritmo: "ortools:vrptw:guided_local_search",
    veiculos: DISTRIBUICAO.map((v) => ({
      veiculo_id: v.veiculo,
      motorista_id: v.motorista,
      paradas: v.chaves,
      chegadas_s: v.chegadas,
      distancia_m: v.km,
      duracao_s: Math.round(v.km / 8),
      carga_kg: 180,
      carga_m3: 1.2,
      geometria: geometriaDe(
        v.chaves.map((chave, i, todas) => [i === 0 ? ORIGEM : coord(todas[i - 1]!), coord(chave)]),
      ),
    })),
    distancia_m: 29_350,
    duracao_s: 2_700,
    tempo_execucao_ms: 1_842,
    criado_em: "2026-11-13T11:02:00.000Z",
  },
  historico_rotas: [
    {
      id: "hist-3",
      versao: 3,
      algoritmo: "ortools:vrptw:guided_local_search",
      distancia_m: 29_350,
      duracao_s: 2_700,
      criado_em: "2026-11-13T11:02:00.000Z",
      ativa: true,
    },
    {
      id: "hist-2",
      versao: 2,
      algoritmo: "osrm:tsp",
      distancia_m: 31_100,
      duracao_s: 2_980,
      criado_em: "2026-11-12T17:40:00.000Z",
      ativa: false,
    },
  ],
};

export const FROTA = { veiculos: VEICULOS, motoristas: MOTORISTAS };

export const RECUPERACOES = {
  destinos: [
    {
      destinationId: "dest-p5",
      chave: "p5",
      cliente: "Restaurante Sabor da Serra",
      enderecoOriginal: "Rua Duque de Caxias, 61, Centro, Canoinhas",
      enderecoNormalizado: "Rua Duque de Caxias, 61, Canoinhas - SC",
      enderecoRecuperado: null,
      status: "ambiguo",
      confianca: null,
      metodo: "componentes",
      provedor: "nominatim",
      recuperadoEm: null,
      latitude: null,
      longitude: null,
      geoStatus: "pendente",
      sugestao: {
        endereco: "Rua Duque de Caxias, 610, Canoinhas - SC",
        latitude: -26.166,
        longitude: -50.402,
        precisao: "rua",
        metodo: "componentes",
        provedor: "nominatim",
        confianca: 0.72,
        motivo: "O número 61 não existe nesta rua; o mais próximo encontrado foi 610.",
      },
      tentativas: [
        { tentativa: 1, provedor: "nominatim", confianca: 0.4, motivo: "número não encontrado" },
        { tentativa: 2, provedor: "photon", confianca: 0.72, motivo: "candidato por componentes" },
      ],
    },
    {
      destinationId: "dest-p9",
      chave: "p9",
      cliente: "Ótica Foco Certo",
      enderecoOriginal: "Rua Sete de Setembro, 505, Canoinhas",
      enderecoNormalizado: null,
      enderecoRecuperado: null,
      status: "nao_encontrado",
      confianca: null,
      metodo: null,
      provedor: null,
      recuperadoEm: null,
      latitude: null,
      longitude: null,
      geoStatus: "pendente",
      sugestao: null,
      tentativas: [
        { tentativa: 1, provedor: "nominatim", confianca: null, motivo: "logradouro ausente no OSM" },
      ],
    },
    {
      destinationId: "dest-p3",
      chave: "p3",
      cliente: "Farmácia Vida Plena",
      enderecoOriginal: "Rua Vidal ramos 890 Centro",
      enderecoNormalizado: "Rua Vidal Ramos, 890, Canoinhas - SC",
      enderecoRecuperado: "Rua Vidal Ramos, 890, Canoinhas - SC",
      status: "recuperado",
      confianca: 0.96,
      metodo: "digitos",
      provedor: "nominatim",
      recuperadoEm: "2026-11-13T11:00:00.000Z",
      latitude: -26.183,
      longitude: -50.381,
      geoStatus: "ok",
      sugestao: null,
      tentativas: [{ tentativa: 1, provedor: "nominatim", confianca: 0.96, motivo: "correção de digitação" }],
    },
    {
      destinationId: "dest-p1",
      chave: "p1",
      cliente: "Mercado Bom Dia",
      enderecoOriginal: "Rua Coronel Albuquerque, 120",
      enderecoNormalizado: "Rua Coronel Albuquerque, 120, Canoinhas - SC",
      enderecoRecuperado: null,
      status: "encontrado",
      confianca: 0.99,
      metodo: "original",
      provedor: "nominatim",
      recuperadoEm: "2026-11-13T10:58:00.000Z",
      latitude: -26.17,
      longitude: -50.385,
      geoStatus: "ok",
      sugestao: null,
      tentativas: [],
    },
  ],
  resumo: {
    analisados: 9,
    encontrados: 1,
    recuperados: 1,
    aguardandoConfirmacao: 1,
    naoEncontrados: 1,
    erros: 0,
    naoTentados: 0,
    pendentes: 2,
  },
};
