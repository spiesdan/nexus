/**
 * A PÁGINA NOVA HERDA O BANCO QUE JÁ EXISTE — não morre tentando criar outro.
 *
 * Medido no emulador (Android 36, Pixel 7, APK de debug): sair da home para
 * "Novo pedido" troca o contexto JS. `isConnection`/`retrieveConnection` do
 * plugin vivem no dicionário do contexto, não no nativo — no Android o
 * `retrieveConnection` nativo nem existe (`not implemented on android`,
 * confirmado via CDP). O nativo segue com `crm-offline` aberto e o
 * `createConnection` lança `Connection crm-offline already exists`. O throw
 * rejeitava `abrir()`, e a tela ficava muda: digitar cliente não listava nada,
 * digitar produto não listava nada, nenhum aviso.
 *
 * O comportamento certo é fechar a órfã e reabrir o MESMO arquivo — nada se
 * perde — e continuar subindo erro de verdade (disco cheio).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const chamadas: string[] = [];

const connFake = {
  open: vi.fn(async () => {
    chamadas.push("open");
  }),
  execute: vi.fn(async () => ({ changes: { changes: 0 } })),
  query: vi.fn(async () => ({ values: [{ id: "cont-1", nome: "Mercadinho do Zé" }] })),
  run: vi.fn(async () => ({ changes: { changes: 1 } })),
};

const isConnection = vi.fn(async () => ({ result: false }));
const closeConnection = vi.fn(async () => {
  chamadas.push("close");
});
let criacoes = 0;
const createConnection = vi.fn(async () => {
  criacoes += 1;
  chamadas.push(`create#${criacoes}`);
  if (criacoes === 1) {
    // O nativo ainda tem a conexão da página anterior aberta.
    throw new Error("CreateConnection: Connection crm-offline already exists");
  }
  return connFake as never;
});

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => "android" },
}));

vi.mock("@capacitor-community/sqlite", () => ({
  SQLiteConnection: class {
    isConnection = isConnection;
    createConnection = createConnection;
    closeConnection = closeConnection;
  },
  CapacitorSQLite: {},
}));

describe("banco local: a segunda página reabre a conexão em vez de falhar", () => {
  beforeEach(() => {
    chamadas.length = 0;
    criacoes = 0;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("fecha a conexão órfã e reabre o mesmo banco", async () => {
    const { banco } = await import("@/lib/offline/db");
    const db = await banco();

    expect(closeConnection).toHaveBeenCalledTimes(1);
    expect(createConnection).toHaveBeenCalledTimes(2);
    expect(chamadas).toEqual(["create#1", "close", "create#2", "open"]);

    const { values } = await db.query("SELECT * FROM catalogo_contatos WHERE nome LIKE ?", ["Merc%"]);
    expect(values).toEqual([{ id: "cont-1", nome: "Mercadinho do Zé" }]);
  });

  it("erro de verdade na criação continua subindo — não vira 'sem catálogo'", async () => {
    createConnection.mockImplementationOnce(async () => {
      throw new Error("disco cheio");
    });
    const { banco } = await import("@/lib/offline/db");
    await expect(banco()).rejects.toThrow(/disco cheio/);
    expect(closeConnection).not.toHaveBeenCalled();
  });
});
