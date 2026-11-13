/**
 * O ROMANEIO DE CARGA NÃO MUDA COM A DISTRIBUIÇÃO POR VEÍCULO.
 *
 * A roteirização multi-veículo (F5) ganhou tela, versão e mapa. O papel que o
 * motorista leva continua o mesmo que a operação já usa — decisão do dono do
 * produto: veículo e motorista impressos são os da carga (`shipments.placa` /
 * `motorista_nome`), não a atribuição por parada.
 *
 * Este é um gate de FONTE, no mesmo espírito do gate de marca: o modo de falha
 * aqui é silencioso e caro. Uma "melhoria" bem-intencionada — buscar
 * `veiculo_id`/`motorista_id` em `shipment_orders` para imprimir a placa de cada
 * parada — muda a folha que está na mão dos motoristas sem ninguém decidir isso,
 * e um romaneio que muda de formato no meio da operação é papel conferido
 * errado. Se um dia for pedido, este teste cai junto com a decisão, no mesmo
 * commit.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const ROTA = path.join(
  process.cwd(),
  "app",
  "api",
  "v1",
  "shipments",
  "[id]",
  "romaneio",
  "route.ts",
);

describe("romaneio de carga — a folha do motorista fica como está", () => {
  const fonte = fs.readFileSync(ROTA, "utf8");

  it("continua renderizando pelo mesmo componente", () => {
    expect(fonte).toContain('from "@/lib/comercial/romaneio-pdf"');
    expect(fonte).toContain("renderRomaneioPdf(");
  });

  it("imprime o veículo/motorista DA CARGA, não a atribuição por parada", () => {
    // O cabeçalho da folha: `shipments.placa` e `shipments.motorista_nome`.
    expect(fonte).toMatch(/from\("shipments"\)[\s\S]{0,120}placa[\s\S]{0,80}motorista_nome/);
    expect(fonte).toContain("placa: c.placa");
    expect(fonte).toContain("motorista_nome: c.motorista_nome");
  });

  it("não lê as colunas da distribuição (veículo/motorista/sequência por pedido)", () => {
    // Se alguma dessas aparecer na rota do romaneio, a folha mudou de conteúdo.
    for (const coluna of ["veiculo_id", "motorista_id", "sequencia_veiculo", "saida_prevista"]) {
      expect(fonte, `${coluna} não pertence ao romaneio`).not.toContain(coluna);
    }
  });
});
