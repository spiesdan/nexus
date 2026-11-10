/**
 * O filtro de Vendedor da tela de pedidos lista os vendedores da organização.
 *
 * ═══ O QUE ESTE ARQUIVO TRAVA ═════════════════════════════════════════════

 * A lista de vendedores mora no SERVER component (`app/app/pedidos/page.tsx`)
 * e vai pro client no primeiro paint — não dá para renderizar a página num teste
 * de unidade sem banco. Então o que se trava aqui é o wiring: a página consulta
 * a org (`user_organizations`, sem viewer) e repassa a lista pro client.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

function semComentario(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const PAGINA_BRUTA = readFileSync(join(RAIZ, "app/app/pedidos/page.tsx"), "utf8");
const PAGINA = semComentario(PAGINA_BRUTA);
const CLIENT_BRUTA = readFileSync(join(RAIZ, "app/app/pedidos/_client.tsx"), "utf8");
const CLIENT = semComentario(CLIENT_BRUTA);

describe("o filtro de Vendedor lista os vendedores da organização", () => {
  it("o arquivo lido é o que este teste acha que é", () => {
    expect(PAGINA_BRUTA.length).toBeGreaterThan(1000);
    expect(PAGINA).toContain("commercial_orders");
  });

  it("a lista de vendedores vem da organização, sem o viewer", () => {
    // O roster é a mesma fonte da tela de Comissões: membros com role != viewer.
    expect(PAGINA).toContain("user_organizations");
    expect(PAGINA).toContain('neq("role", "viewer")');
    expect(PAGINA).toContain("revoked_at");
  });

  it("a lista é repassada pro client do filtro", () => {
    // O select só existe com quem selecionar; sem a prop, a lista não chega.
    expect(PAGINA).toContain("vendedores");
    expect(PAGINA).toContain("vendedores={vendedores}");
  });

  it("traz os vendedores do Mercos que emitiram pedidos — sem usuário no CRM", () => {
    // O vendedor JB tem pedido no Mercos e NÃO tem usuário no CRM (UUID nulo,
    // nome no `vendedor_nome`). Sem ele no roster, o filtro não tinha como
    // recortar os pedidos dele.
    expect(PAGINA).toContain("commercial_orders");
    expect(PAGINA).toContain("vendedor_nome");
    expect(PAGINA).toContain("origem");
    expect(PAGINA).toContain("mercos");
  });

  it("varre os pedidos do Mercos em páginas — o PostgREST corta em 1000", () => {
    // Consulta única ordenada por data trazia 4 dos 9 vendedores da base real
    // (11.768 pedidos). A página delega a varredura paginada ao helper.
    expect(PAGINA).toContain("vendedoresDoMercos");
    expect(PAGINA).toContain("range(");
  });

  it("o filtro do vendedor do Mercos vai por nome, não por uuid", () => {
    // Membro filtra por `vendedor_user_id`; vendedor do Mercos (sem uuid) filtra
    // por `vendedor_nome`. Os dois são destinos do mesmo filtro.
    expect(CLIENT).toContain("vendedor_nome");
    expect(CLIENT).toContain("mercos");
  });
});
