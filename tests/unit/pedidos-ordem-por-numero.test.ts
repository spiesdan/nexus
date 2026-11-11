import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A LISTA DE PEDIDOS É ORDENADA COMO A DO MERCOS: NÚMERO DO PEDIDO, DO MAIOR
 * PARA O MENOR.
 *
 * A tela ordenava por `created_at` desc. Nos pedidos importados os dois
 * relógios quase sempre andam juntos, mas não sempre — um pedido relançado ou
 * corrigido no ERP ganha número novo sem ganhar data nova, e a lista passa a
 * mostrar 19.512 acima de 19.513. O dono lê isso como "a tela está fora de
 * ordem". O Mercos ordena pelo número.
 *
 * `numero` é único por organização (`commercial_orders_org_numero_key`), então
 * a ordem é total e dispensa desempate. O filtro de período continua em
 * `created_at` — é o dia que o dono conta —, mas ele não posiciona.
 */

const RAIZ = process.cwd();
const PAGINA = readFileSync(join(RAIZ, "app/app/pedidos/page.tsx"), "utf8");
const ROTA = readFileSync(join(RAIZ, "app/api/v1/commercial-orders/route.ts"), "utf8");

describe("ordem da tela de pedidos", () => {
  it("[DISCRIMINA] a página e a API listam por número desc", () => {
    expect(PAGINA).toMatch(/\.order\("numero",\s*\{\s*ascending:\s*false\s*\}\)/);
    expect(ROTA).toMatch(/\.order\("numero",\s*\{\s*ascending:\s*false\s*\}\)/);
  });

  it("a listagem não voltou a posicionar por data de criação", () => {
    // A paginação dos vendedores do Mercos usa `created_at` como ordem ESTÁVEL
    // de `range` — outro assunto, e por isso a asserção é no `limit(200)` da
    // listagem, não no arquivo inteiro.
    expect(PAGINA).not.toMatch(
      /\.order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)\.limit\(200\)/,
    );
    expect(ROTA).not.toContain('.order("created_at"');
  });
});
