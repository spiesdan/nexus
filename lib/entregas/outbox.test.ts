import { describe, expect, it } from "vitest";

import {
 carregarOutbox,
  enfileirarDesfecho,
  lerUltimaSincronizacao,
  MOTIVO_FOTO_SEM_CONEXAO,
  pendentesDaCarga,
  registrarUltimaSincronizacao,
  type ArmazenLocal,
} from "./outbox";

function memoria(): ArmazenLocal {
  const dados = new Map<string, string>();
  return {
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => void dados.set(k, v),
  };
}

describe("outbox + último sync da cabine", () => {
  it("offline: o desfecho fica pendente e visível antes do envio", () => {
    const store = memoria();
    enfileirarDesfecho(
      { cargaId: "carga", orderId: "pedido", status: "entregue", ocorrido_em: "2026-11-23T01:00:00Z" },
      store,
    );
    expect(pendentesDaCarga("carga", store)).toHaveLength(1);
    expect(carregarOutbox(store)[0]).toMatchObject({ orderId: "pedido", tentativas: 0 });
    expect(lerUltimaSincronizacao(store)).toBeNull();
  });

  it("sem conexão: desfecho entra sem foto e com o motivo escrito", () => {
    const store = memoria();
    enfileirarDesfecho(
      { cargaId: "carga", orderId: "pedido-2", status: "entregue", ocorrido_em: "2026-11-23T01:00:00Z" },
      store,
    );
    expect(carregarOutbox(store)[0]?.foto).toEqual({
      estado: "sem_conexao", motivo: MOTIVO_FOTO_SEM_CONEXAO,
    });
  });

  it("a volta da rede registra o horário da sincronização", () => {
    const store = memoria();
    registrarUltimaSincronizacao("2026-11-23T02:30:00.000Z", store);
    expect(lerUltimaSincronizacao(store)).toBe("2026-11-23T02:30:00.000Z");
  });
});
