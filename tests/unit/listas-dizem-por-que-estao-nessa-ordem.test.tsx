/**
 * A LISTA DIZ POR QUE A PRIMEIRA LINHA É A PRIMEIRA.
 *
 * Pedidos, produtos e notas chegam do servidor com ordem fixa (número desc,
 * ativo+ nome, data desc). Nenhuma das três ordena ao clique — então `aria-sort`
 * não é o instrumento certo: ele anuncia ordenação de coluna INTERATIVA. O que
 * faltava era a ordem existente estar dita, e um `<caption>` faz exatamente
 * isso: dá NOME acessível à tabela sem ocupar pixel.
 *
 * O teste faz duas coisas: prova que `TableCaption` vira nome acessível da
 * tabela (comportamento, no primitivo) e vigia a ligação nos três módulos —
 * que é onde o defeito nasce.
 */
import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Table, TableBody, TableCaption, TableHeader, TableRow } from "@/components/ui/table";
import { semComentarios } from "../../scripts/auditoria/segmento-de-rota";

const RAIZ = process.cwd();
const ler = (...p: string[]) => semComentarios(fs.readFileSync(path.join(RAIZ, ...p), "utf8"));

afterEach(cleanup);

describe("TableCaption nomeia a tabela", () => {
  it("a legenda vira o nome acessível do `<table>`", () => {
    render(
      <Table>
        <TableCaption>Pedidos, do mais recente para o mais antigo.</TableCaption>
        <TableHeader>
          <TableRow />
        </TableHeader>
        <TableBody />
      </Table>,
    );

    expect(
      screen.getByRole("table", { name: "Pedidos, do mais recente para o mais antigo." }),
    ).toBeInTheDocument();
  });
});

describe("as três listas dizem a ordem que têm", () => {
  it.each([
    ["app/app/pedidos/_client.tsx", /Pedidos, do mais recente para o mais antigo/],
    ["app/app/products/_client.tsx", /Produtos, ativos primeiro e depois por nome/],
    ["app/app/notas/_components/GradeNotas.tsx", /Notas, da mais recente para a mais antiga/],
  ])("%s", (arquivo, texto) => {
    const codigo = ler(...arquivo.split("/"));
    expect(codigo).toMatch(/<TableCaption/);
    expect(codigo).toMatch(texto);
  });
});
