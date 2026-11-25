import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * "NÃO DÁ PARA COLOCAR PEDIDO NA CARGA" — a regra de ocupação.
 *
 * O índice `shipment_orders_order_ativo_unico` é PARCIAL: só `na_carga` e
 * `em_rota` ocupam o pedido. A tela e a rota, porém, olhavam QUALQUER linha —
 * então pedido que já viajou e foi entregue ficava proibido para sempre, com
 * 409 "já está em outra carga" e sem aparecer na lista de disponíveis.
 *
 * Este teste lê o código-fonte: as duas consultas de ocupação precisam filtrar
 * os mesmos estados do índice. Um filtro só na tela (ou só na rota) recria o
 * defeito pela metade.
 */
const ROTA = path.resolve(
  __dirname,
  "../../../../../../app/api/v1/shipments/[id]/orders/route.ts",
);
const CRIACAO = path.resolve(
  __dirname,
  "../../../../../../app/api/v1/shipments/route.ts",
);

describe("ocupação de pedido em carga", () => {
  const fonte = fs.readFileSync(ROTA, "utf8");

  it("declara os mesmos estados do índice parcial", () => {
    expect(fonte).toContain('const STATUS_ATIVOS_NA_CARGA = ["na_carga", "em_rota"] as const;');
  });

  it("a lista de disponíveis filtra por esses estados", () => {
    const lista = fonte.slice(fonte.indexOf('from("shipment_orders")'), fonte.indexOf("const emAlgumaCarga"));
    expect(lista).toContain('.in("status", [...STATUS_ATIVOS_NA_CARGA])');
  });

  it("a checagem do POST filtra pelos mesmos estados", () => {
    const post = fonte.slice(fonte.indexOf("const { data: jaEmCarga }"));
    expect(post.slice(0, 600)).toContain('.in("status", [...STATUS_ATIVOS_NA_CARGA])');
  });

  it("a CRIAÇÃO da carga usa a mesma regra (a tela oferece o que ela aceita)", () => {
    const criacao = fs.readFileSync(CRIACAO, "utf8");
    expect(criacao).toContain('const STATUS_ATIVOS_NA_CARGA = ["na_carga", "em_rota"] as const;');
    const trecho = criacao.slice(criacao.indexOf("const { data: ocupados }"));
    expect(trecho.slice(0, 500)).toContain('.in("status", [...STATUS_ATIVOS_NA_CARGA])');
  });
});
