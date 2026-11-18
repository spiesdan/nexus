/**
 * O CABEÇALHO DE TABELA SE DECLARA COLUNA.
 *
 * ─── O DEFEITO (medido em 18/11/2026) ─────────────────────────────────────
 *
 * `TableHead` renderizava `<th>` sem `scope`. Sem o atributo, o leitor de tela
 * adivinha a associação cabeçalho↔célula pela POSIÇÃO — e a adivinhação erra
 * em tabela com `colSpan` (as listagens do produto usam, na linha de grupo e
 * na de "carregar mais"). O resultado é célula anunciada com o cabeçalho
 * errado, ou com nenhum.
 *
 * `scope` é atributo de `columnheader`; o componente aplica `scope="col"` por
 * padrão e deixa o `{...props}` depois, então quem precisa de `scope="row"`
 * continua podendo passar.
 *
 * Fora do primitivo, três arquivos declaram `<th>` à mão (impressão de
 * pedidos, diff de versão de agente e a galeria de tokens) — os três passaram
 * a declarar também. O teste cobre o primitivo; os três são varridos no gate
 * estático abaixo para não voltarem atrás.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const RAIZ = process.cwd();

describe("TableHead declara a coluna", () => {
  it('renderiza `<th scope="col">`', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody />
      </Table>,
    );

    const cabecalho = screen.getByRole("columnheader", { name: "Cliente" });
    expect(cabecalho.tagName).toBe("TH");
    expect(cabecalho).toHaveAttribute("scope", "col");
    cleanup();
  });

  it('aceitar `scope="row"` continua possível (o spread vem depois)', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableHead scope="row">Total</TableHead>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole("rowheader", { name: "Total" })).toHaveAttribute("scope", "row");
    cleanup();
  });
});

describe("nenhum `<th>` cru fica sem scope", () => {
  function arquivos(dir: string): string[] {
    const saida: string[] = [];
    for (const nome of fs.readdirSync(path.join(RAIZ, dir))) {
      if (nome === "node_modules" || nome.startsWith(".")) continue;
      const rel = path.join(dir, nome);
      if (fs.statSync(path.join(RAIZ, rel)).isDirectory()) saida.push(...arquivos(rel));
      else if (/\.tsx$/.test(nome) && !nome.includes(".test.")) saida.push(rel);
    }
    return saida;
  }

  it.each(arquivos("app").concat(arquivos("components")))("%s", (arquivo) => {
    const codigo = fs.readFileSync(path.join(RAIZ, arquivo), "utf8");

    // `<th` sem `scope` na MESMA tag (o atributo pode estar em qualquer ordem).
    const crus = [...codigo.matchAll(/<th\b[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => !/\bscope=/.test(tag));
    expect(crus, `${arquivo}: <th> sem scope`).toEqual([]);

    /*
     * A LIÇÃO DESTE ARQUIVO, em forma de asserção.
     *
     * O primeiro `scope="col"` foi aplicado por regex e casou `<thead>` como se
     * fosse `<th>`: nasceu `<th scope="col"ead>`, e o TURBOPACK parou o build
     * com "Expected '</', got 'jsx text'". O caso de `scope` acima passou feliz
     * — a tag corrompida tinha o atributo —, então o teste media metade do que
     * prometia.
     *
     * A guarda que pega a classe inteira é o atributo MALFORMADO: em JSX, um
     * valor entre aspas nunca é seguido de letra sem espaço (`"col"ead`). É
     * exatamente a assinatura que a substituição deixou, e ela não depende de
     * casar tags com atributo quebrado em várias linhas (o `[&>tr]` do
     * `TableFooter` derrubou a primeira versão desta guarda).
     */
    const malformados = [...codigo.matchAll(/="[^"]*"[a-z]/g)].map((m) => m[0]);
    expect(malformados, `${arquivo}: atributo malformado (valor colado na próxima palavra)`).toEqual(
      [],
    );
  });
});
