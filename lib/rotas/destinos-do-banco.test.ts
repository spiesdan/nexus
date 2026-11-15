import { describe, expect, it } from "vitest";

import { snapshotDoDestino, type ContatoParaDestino } from "./destinos";
import { garantirDestinosDosPedidos } from "./destinos-do-banco";
import { chaveDoEndereco } from "./entradas";

/**
 * A MEMÓRIA DA ENTRADA NÃO PODE CUSTAR UM PINO ERRADO (0311).
 *
 * `aplicarEntradasConhecidas` roda na criação do destino: pega a entrada já
 * marcada para aquele endereço e usa o ponto dela. O ganho é óbvio — marcar uma
 * vez resolve as cargas seguintes —, mas o risco é assimétrico: um pino na porta
 * errada é pior que um pino ausente, porque o motorista dirige até lá antes de
 * descobrir.
 *
 * Daí as duas guardas que este arquivo prova:
 *
 *   1. pino que JÁ é a porta (nó de casa do OSM ou entrada) nunca é sobrescrito
 *      por lembrança;
 *   2. endereço vazio não consulta memória nenhuma.
 *
 * E o caso que a guarda existe para permitir: `ok` + `nominatim:cidade` é pino
 * aproximado, não pino bom — é exatamente o que a entrada veio substituir.
 *
 * O cliente do Supabase é falso de propósito: o que se mede aqui é a REGRA
 * (quem sobrescreve quem), não o PostgREST. A prova de banco de verdade mora em
 * `tests/invariants/entrada-do-endereco.test.ts`.
 */

interface Chamada {
  tabela: string;
  op: string;
  valores?: unknown;
}

interface Dados {
  pedidos: unknown[];
  contatos: unknown[];
  gravados: unknown[];
  entradas: unknown[];
}

function fakeSupabase(dados: Dados) {
  const chamadas: Chamada[] = [];

  function tabela(nome: string) {
    let op = "";
    let valores: unknown;
    const obj: Record<string, unknown> = {};
    obj.select = (cols: string) => {
      if (!op) {
        op = "select";
        valores = cols;
      }
      return obj;
    };
    obj.eq = () => obj;
    obj.in = () => obj;
    obj.upsert = (v: unknown) => {
      op = "upsert";
      valores = v;
      return obj;
    };
    obj.update = (v: unknown) => {
      op = "update";
      valores = v;
      return obj;
    };
    obj.then = (resolver: (v: unknown) => unknown) => {
      chamadas.push({ tabela: nome, op, valores });
      const linhas =
        nome === "commercial_orders"
          ? dados.pedidos
          : nome === "contacts"
            ? dados.contatos
            : nome === "shipment_destinations"
              ? dados.gravados
              : nome === "endereco_entradas"
                ? dados.entradas
                : [];
      const saida = op === "select" ? { data: linhas, error: null } : { error: null };
      return Promise.resolve(saida).then(resolver);
    };
    return obj;
  }

  return { from: (nome: string) => tabela(nome), chamadas };
}

const CONTATO: ContatoParaDestino = {
  id: "contact-1",
  logradouro: "Rua Marechal Deodoro",
  numero_end: "S/N",
  complemento: null,
  bairro: "Centro",
  cidade: "Mafra",
  uf: "SC",
  cep: null,
  latitude: null,
  longitude: null,
  geo_fonte: null,
};

const SNAPSHOT = snapshotDoDestino(CONTATO, "Padaria", null);
const CHAVE_DA_MEMORIA = chaveDoEndereco(SNAPSHOT.endereco) as string;

const PEDIDO = {
  id: "order-1",
  numero: 1001,
  cliente_nome: "Padaria",
  contact_id: CONTATO.id,
  endereco_entrega: null,
};

const ENTRADA = {
  id: "entrada-1",
  endereco_normalizado: CHAVE_DA_MEMORIA,
  latitude: -26.1112,
  longitude: -49.8053,
};

/** Um destino recém-criado, com o estado de pino que o teste quer medir. */
function destino(geo_status: string, geo_fonte: string | null) {
  return { id: "destino-1", chave: SNAPSHOT.chave, geo_status, geo_fonte };
}

function updates(sb: ReturnType<typeof fakeSupabase>) {
  return sb.chamadas.filter((c) => c.tabela === "shipment_destinations" && c.op === "update");
}

describe("aplicarEntradasConhecidas — a memória do endereço (0311)", () => {
  it("pino pendente recebe a entrada marcada, com a fonte 'entrada'", async () => {
    const sb = fakeSupabase({
      pedidos: [PEDIDO],
      contatos: [CONTATO],
      gravados: [destino("pendente", null)],
      entradas: [ENTRADA],
    });

    const r = await garantirDestinosDosPedidos(sb, "org-1", [PEDIDO.id]);

    expect(r.erro).toBeNull();
    expect(r.destinos.get(PEDIDO.id)).toBe("destino-1");
    const feitos = updates(sb);
    expect(feitos).toHaveLength(1);
    expect(feitos[0]?.valores).toMatchObject({
      latitude: ENTRADA.latitude,
      longitude: ENTRADA.longitude,
      geo_status: "ok",
      geo_fonte: "entrada",
      entrada_id: ENTRADA.id,
    });
  });

  it("pino de CIDADE é substituído — aproximado não é a porta", async () => {
    const sb = fakeSupabase({
      pedidos: [PEDIDO],
      contatos: [CONTATO],
      gravados: [destino("ok", "nominatim:cidade")],
      entradas: [ENTRADA],
    });

    await garantirDestinosDosPedidos(sb, "org-1", [PEDIDO.id]);

    expect(updates(sb)).toHaveLength(1);
    expect(updates(sb)[0]?.valores).toMatchObject({ geo_fonte: "entrada", entrada_id: ENTRADA.id });
  });

  it("pino de NÓ DE CASA nunca é sobrescrito por lembrança", async () => {
    const sb = fakeSupabase({
      pedidos: [PEDIDO],
      contatos: [CONTATO],
      gravados: [destino("ok", "nominatim:numero")],
      entradas: [ENTRADA],
    });

    await garantirDestinosDosPedidos(sb, "org-1", [PEDIDO.id]);

    expect(updates(sb)).toHaveLength(0);
  });

  it("entrada já marcada não é reescrita a cada carga", async () => {
    const sb = fakeSupabase({
      pedidos: [PEDIDO],
      contatos: [CONTATO],
      gravados: [destino("ok", "entrada")],
      entradas: [ENTRADA],
    });

    await garantirDestinosDosPedidos(sb, "org-1", [PEDIDO.id]);

    expect(updates(sb)).toHaveLength(0);
  });

  it("endereço sem entrada conhecida não altera nada", async () => {
    const sb = fakeSupabase({
      pedidos: [PEDIDO],
      contatos: [CONTATO],
      gravados: [destino("pendente", null)],
      entradas: [],
    });

    await garantirDestinosDosPedidos(sb, "org-1", [PEDIDO.id]);

    expect(updates(sb)).toHaveLength(0);
  });

  it("endereço vazio não consulta a memória — não há chave do nada", async () => {
    const semEndereco = { ...CONTATO, logradouro: null, bairro: null, cidade: null, uf: null };
    const snapshot = snapshotDoDestino(semEndereco, "Padaria", null);
    const sb = fakeSupabase({
      pedidos: [PEDIDO],
      contatos: [semEndereco],
      gravados: [{ id: "destino-2", chave: snapshot.chave, geo_status: "nao_encontrado", geo_fonte: null }],
      entradas: [ENTRADA],
    });

    await garantirDestinosDosPedidos(sb, "org-1", [PEDIDO.id]);

    expect(sb.chamadas.some((c) => c.tabela === "endereco_entradas")).toBe(false);
    expect(updates(sb)).toHaveLength(0);
  });
});
