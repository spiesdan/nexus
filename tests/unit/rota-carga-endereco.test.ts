/**
 * CARGA PARA ROTA — de onde sai o endereço da parada.
 *
 * O mapa da expedição não mostrava ninguém porque a parada nascia sem
 * endereço: `endereco_entrega` do pedido é um campo OPCIONAL (o operador só o
 * preenche quando o ponto de entrega é outro), e nesta instalação nenhum dos
 * 28 pedidos das cargas abertas o tinha — mesmo com 25 deles tendo a rua no
 * cadastro do cliente. Sem endereço, a geocodificação não tinha alvo e o
 * mapa ficava vazio.
 *
 * O que este teste trava:
 * 1. pedido sem `endereco_entrega` usa o endereço ESTRUTURADO do cadastro,
 *    montado pelo mesmo `enderecoEmLinha` do romaneio;
 * 2. o endereço digitado no pedido continua vencendo (é o que o operador
 *    escolheu para aquela entrega);
 * 3. sem endereço em nenhum dos dois, a parada fica sem endereço — nunca um
 *    chute, porque pino em lugar errado é pior que pino nenhum;
 * 4. as coordenadas já cacheadas do contato chegam na parada (senão o mapa
 *    teria endereço e continuaria vazio).
 *
 * Banco dublado com cadeia encadeável, no molde de
 * `tests/unit/shipment-orders-route.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { carregarCargaComParadas } from "@/app/api/v1/shipments/[id]/rota/_carga";
import type { createClient } from "@/lib/supabase/server";

type Linhas = Record<string, Record<string, unknown>[]>;

const ORG = "22222222-2222-4222-8222-222222222222";
const CARGA = "33333333-3333-4333-8333-333333333333";
const PEDIDO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONTATO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function banco(linhas: Linhas) {
  function consulta(tabela: string) {
    const filtros: { coluna: string; valores: unknown[] }[] = [];
    const cadeia = {
      select: () => cadeia,
      eq: (coluna: string, valor: unknown) => {
        filtros.push({ coluna, valores: [valor] });
        return cadeia;
      },
      in: (coluna: string, valores: unknown[]) => {
        filtros.push({ coluna, valores });
        return cadeia;
      },
      order: () => cadeia,
      single: async () => ({ data: (linhas[tabela] ?? [])[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: (linhas[tabela] ?? [])[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) =>
        Promise.resolve({
          // Filtra de verdade só as colunas que o fixture tem — é o
          // suficiente para separar "este pedido" de "outro pedido".
          data: (linhas[tabela] ?? []).filter((linha) =>
            filtros.every((f) => !(f.coluna in linha) || f.valores.includes(linha[f.coluna])),
          ),
          error: null,
        }).then(ok),
    };
    return cadeia;
  }
  return { from: consulta } as unknown as Awaited<ReturnType<typeof createClient>>;
}

const carga = {
  id: CARGA,
  numero: 22,
  status: "montando",
  placa: null,
  veiculo_tipo: null,
  motorista_nome: null,
  origem_endereco: null,
  origem_lat: null,
  origem_lng: null,
  retornar_origem: false,
  tempo_parada_min: 10,
  distancia_m: null,
  duracao_s: null,
  rota_geojson: null,
  rota_em: null,
  rota_versao: 0,
  started_at: null,
  finished_at: null,
};

function cenario(opts: {
  enderecoPedido?: string | null;
  contato?: Record<string, unknown> | null;
}) {
  return banco({
    shipments: [carga],
    shipment_orders: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        order_id: PEDIDO,
        sequencia: 1,
        status: "na_carga",
        separado_em: null,
      },
    ],
    commercial_orders: [
      {
        id: PEDIDO,
        numero: 19341,
        cliente_nome: "WANDERLEI MACHADO",
        contact_id: opts.contato ? CONTATO : null,
        endereco_entrega: opts.enderecoPedido ?? null,
        total_cents: 19500,
        status: "expedido",
      },
    ],
    contacts: opts.contato ? [opts.contato] : [],
    organizations: [
      {
        logradouro: "RUA ANTONIO LILLER",
        numero_end: "585",
        complemento: null,
        bairro: null,
        cidade: "Canoinhas",
        uf: "SC",
        cep: null,
      },
    ],
  });
}

describe("carregarCargaComParadas — endereço da parada", () => {
  it("pedido sem endereço de entrega usa o cadastro do cliente", async () => {
    const d = await carregarCargaComParadas(
      cenario({
        contato: {
          id: CONTATO,
          display_name: "WANDERLEI MACHADO",
          name: "WANDERLEI MACHADO",
          phone_number: null,
          logradouro: "RUA JOÃO FRANCISCO DE ASSIS",
          numero_end: "27",
          complemento: "EDIFICIO",
          bairro: "EDIFICIO",
          cidade: "MAFRA",
          uf: "SC",
          cep: "89303092",
          latitude: null,
          longitude: null,
          geo_status: "pendente",
          geo_fonte: null,
        },
      }),
      ORG,
      CARGA,
    );

    expect(d?.paradas).toHaveLength(1);
    expect(d?.paradas[0]?.endereco).toBe(
      "RUA JOÃO FRANCISCO DE ASSIS, 27 — EDIFICIO — EDIFICIO, MAFRA/SC, 89303092",
    );
  });

  it("o endereço digitado no pedido vence o do cadastro", async () => {
    const d = await carregarCargaComParadas(
      cenario({
        enderecoPedido: "RUA OUTRA, 10 — CENTRO, MAFRA/SC",
        contato: {
          id: CONTATO,
          display_name: "WANDERLEI MACHADO",
          name: "WANDERLEI MACHADO",
          phone_number: null,
          logradouro: "RUA JOÃO FRANCISCO DE ASSIS",
          numero_end: "27",
          complemento: null,
          bairro: "EDIFICIO",
          cidade: "MAFRA",
          uf: "SC",
          cep: "89303092",
          latitude: null,
          longitude: null,
          geo_status: "pendente",
          geo_fonte: null,
        },
      }),
      ORG,
      CARGA,
    );

    expect(d?.paradas[0]?.endereco).toBe("RUA OUTRA, 10 — CENTRO, MAFRA/SC");
  });

  it("sem endereço no pedido nem no cadastro, a parada fica sem endereço", async () => {
    const d = await carregarCargaComParadas(
      cenario({
        contato: {
          id: CONTATO,
          display_name: "WANDERLEI MACHADO",
          name: "WANDERLEI MACHADO",
          phone_number: null,
          logradouro: null,
          numero_end: null,
          complemento: null,
          bairro: null,
          cidade: null,
          uf: null,
          cep: null,
          latitude: null,
          longitude: null,
          geo_status: "pendente",
          geo_fonte: null,
        },
      }),
      ORG,
      CARGA,
    );

    expect(d?.paradas[0]?.endereco).toBeNull();
  });

  it("a coordenada já cacheada do contato chega na parada", async () => {
    const d = await carregarCargaComParadas(
      cenario({
        contato: {
          id: CONTATO,
          display_name: "WANDERLEI MACHADO",
          name: "WANDERLEI MACHADO",
          phone_number: null,
          logradouro: "RUA JOÃO FRANCISCO DE ASSIS",
          numero_end: "27",
          complemento: null,
          bairro: "EDIFICIO",
          cidade: "MAFRA",
          uf: "SC",
          cep: "89303092",
          latitude: -26.11,
          longitude: -50.41,
          geo_status: "ok",
          geo_fonte: "nominatim:rua",
        },
      }),
      ORG,
      CARGA,
    );

    expect(d?.paradas[0]?.latitude).toBe(-26.11);
    expect(d?.paradas[0]?.longitude).toBe(-50.41);
    expect(d?.paradas[0]?.geo_status).toBe("ok");
  });
});
