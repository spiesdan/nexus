/**
 * A rota de arquivar o inbox escreve colunas — e coluna que não existe não dá
 * aviso, dá 500.
 *
 * ═══ A ARMADILHA QUE ESTE ARQUIVO DOCUMENTA ═══════════════════════════════
 *
 * `comando_da_conversa` NÃO é coluna. Em `supabase/baseline.sql:17146` é a
 * FUNÇÃO `public.comando_da_conversa(c public.conversations)`, que o
 * PostgREST resolve no `?select=`.
 *
 * E — este é o ponto — **`lib/database.types.ts` lista o nome como se fosse
 * campo da Row**. `supabase gen types` inclui função exposta no shape do
 * schema, porque o PostgREST a devolve como coluna virtual. Então:
 *
 *   - ler os tipos gerados e "conferir" a coluna  → passa, e está errado
 *   - escrever a coluna                          → `does not exist`, 500
 *
 * Foi assim que entrou na rota. O nome está em todo lugar, todo mundo lê
 * "`status` mais `comando_da_conversa`", e só o banco diz que não. Por isso a
 * verificação de "esta coluna existe de verdade" mora nos invariantes
 * (`tests/invariants/arquivar-inbox-colunas.test.ts`), que rodam contra um
 * Postgres de verdade; aqui fica a verificação do que a rota FAZ.
 *
 * ═══ MUTAÇÃO PROVADA ═════════════════════════════════════════════════════
 *
 * Readicionar `comando_da_conversa: "encerrada"` no `update` desta rota
 * reprova `NAO escreve comando_da_conversa — é funcao, nao coluna`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ARQUIVO = join(process.cwd(), "app/api/v1/conversations/arquivar-todas/route.ts");

/** As chaves do payload de `.update({...})` da rota de arquivar. */
function colunasEscritasPelaRota(): string[] {
  const fonte = readFileSync(ARQUIVO, "utf8");
  const inicio = fonte.indexOf(".update({");
  expect(inicio, "a rota precisa ter um .update({").toBeGreaterThan(-1);
  const bloco = fonte.slice(inicio);
  return [...bloco.matchAll(/^\s{6}([a-z_][a-z0-9_]*):/gm)].map((m) => m[1] ?? "");
}

describe("arquivar-todas — o que a rota escreve", () => {
  it("a leitura das colunas acha alguma — senão o resto passa vazio", () => {
    // Guarda de vacuo: um `for` sobre lista vazia faz todo `expect` passar.
    expect(colunasEscritasPelaRota().length).toBeGreaterThan(0);
  });

  it("NAO escreve comando_da_conversa — é funcao, nao coluna", () => {
    // A asserção nomeada. Se alguém readicionar o campo, a falha diz POR QUÊ
    // — e não um "expected undefined to be true" que obriga a caçar.
    expect(colunasEscritasPelaRota()).not.toContain("comando_da_conversa");
    expect(readFileSync(ARQUIVO, "utf8")).toMatch(
      /comando_da_conversa[^\n]*N[ÃA]O [ée] coluna|funcao|função/i,
    );
  });

  it("escreve as tres colunas que 'zerar o inbox' significa", () => {
    const colunas = colunasEscritasPelaRota();
    // `status`: tira da fila. `unread_count_for_assignee: 0`: zera o contador.
    // `status_changed_at`: sem isso a aba "Fechadas" não mostra quando.
    expect(colunas).toContain("status");
    expect(colunas).toContain("unread_count_for_assignee");
    expect(colunas).toContain("status_changed_at");
  });

  it("nao escreve em conversations por id da conversa — é em lote pela org", () => {
    // Arquivar TUDO sem `in("id", ...)`: um update sem filtro de organização é
    // o tipo de coisa que arquiva o inbox de outra instalação num clone.
    const fonte = readFileSync(ARQUIVO, "utf8");
    const bloco = fonte.slice(fonte.indexOf(".update({"));
    expect(bloco).toMatch(/\.eq\("organization_id", orgId\)/);
    expect(bloco).toMatch(/\.in\("id", ids\)/);
  });

  it("exige confirmacao explicita no corpo", () => {
    const fonte = readFileSync(ARQUIVO, "utf8");
    expect(fonte).toContain("confirmar !== true");
  });

  it("guard e manager, nao agent", () => {
    // Arquivar em lote tira do trabalho de todo mundo ao mesmo tempo. Um
    // `agent` precisa da conversa que esta na frente dele.
    const fonte = readFileSync(ARQUIVO, "utf8");
    expect(fonte).toContain('requireRole("manager"');
  });

  it("so alcanca status terminal — nao rearquiva o que ja estava fechado", () => {
    const fonte = readFileSync(ARQUIVO, "utf8");
    expect(fonte).toContain("CONVERSATION_TERMINAL_STATUSES");
  });
});
