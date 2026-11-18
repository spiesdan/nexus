/**
 * A LISTA DE PEDIDOS DIZ QUE TEM TETO.
 *
 * `.limit(200)` sem aviso: passando de 200 no período, o 201º pedido não existe
 * para quem olha a tela — e a lista termina sem dizer por quê. É a mesma classe
 * do F6 das telas fiscais, onde `RecorteDaLista` resolveu.
 *
 * O comportamento do aviso é do componente e está testado em
 * `fiscal-recorte-da-lista.test.tsx`. O que este teste vigia é a LIGAÇÃO, que
 * é onde o defeito nasce: a consulta precisa pedir a contagem, e o cliente
 * precisa receber e renderizar. Sem esse fio, a tela volta a truncar em
 * silêncio mesmo com o componente certo disponível.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { semComentarios } from "../../scripts/auditoria/segmento-de-rota";

const RAIZ = process.cwd();
const ler = (...partes: string[]) =>
  semComentarios(fs.readFileSync(path.join(RAIZ, ...partes), "utf8"));

describe("pedidos: o teto da lista é dito", () => {
  const pagina = ler("app", "app", "pedidos", "page.tsx");
  const cliente = ler("app", "app", "pedidos", "_client.tsx");

  it("a consulta pede a contagem na MESMA consulta (count: exact)", () => {
    expect(pagina).toMatch(/count:\s*"exact"/);
    expect(pagina).toMatch(/totalNoPeriodo=/);
  });

  it("o cliente renderiza o recorte com o total recebido", () => {
    expect(cliente).toMatch(/<RecorteDaLista/);
    expect(cliente).toMatch(/totalNoPeriodo/);
  });
});
