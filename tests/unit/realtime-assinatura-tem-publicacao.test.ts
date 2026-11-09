/**
 * TELA QUE ASSINA REALTIME NUMA TABELA FORA DA PUBLICAÇÃO NÃO RECEBE EVENTO.
 *
 * ## O modo de falha REAL, medido em produção (09/11/2026)
 *
 * `postgres_changes` só entrega evento de tabela que está na publicação
 * `supabase_realtime`. O cabeçalho deste arquivo afirmava que, sem a tabela, o
 * canal subia calado e o `subscribe()` devolvia SUBSCRIBED. **Isso estava
 * errado**, e a diferença custou uma tarde:
 *
 *   o Realtime responde com uma mensagem `system` de erro —
 *   "Unable to subscribe to changes with given parameters. Please check Realtime
 *   is enabled for the given connect parameters: [...]" — e o `subscribe()`
 *   recebe `CHANNEL_ERROR`.
 *
 * Com `conversation_notes` fora da publicação, os DOIS canais que a assinam
 * (aviso de menção, montado no AppShell, e as notas da conversa aberta) entraram
 * em retomada, e o laço de 1 Hz que se seguiu saturou a VPS: ~45 listas de
 * conversa por 10 s, ~900 validações de sessão por minuto, load 15 em 2 vCPU, e
 * o inbox caindo em "algo deu errado". Não era silêncio — era tempestade.
 *
 * ## O que ele mede
 *
 * As tabelas assinadas no código (o `table:` de cada bloco `postgresChanges`)
 * contra a publicação **do `baseline.sql`** — e não das migrations. O baseline é
 * o que a instalação self-host aplica; uma tabela adicionada só em migration não
 * chega a quem instalou do zero, que é a maioria.
 *
 * ## Por que a varredura ignora `*.test.ts(x)`
 *
 * As seis entradas da "dívida conhecida" original eram FALSOS POSITIVOS: testes
 * de rota mencionam `postgres_changes` e têm `table: "x"` no mesmo arquivo, sem
 * assinar nada. Com o filtro de testes, a lista real é só a que a tela usa — e
 * `conversation_notes` foi a única de verdade (corrigida na migration 0300).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

/**
 * Vazia de propósito. As seis entradas originais eram falsos positivos de
 * arquivos de teste (ver o cabeçalho). Se alguma assinatura de verdade ficar sem
 * publicação, o caso abaixo reprova nomeando a tabela e o arquivo — a lista
 * existe para registrar dívida CONHECIDA, não para esconder a nova.
 */
const DIVIDA_CONHECIDA: Record<string, string> = {};

function publicacaoDoBaseline(): Set<string> {
  const sql = readFileSync(path.join(RAIZ, "supabase/baseline.sql"), "utf8");
  const dentro = new Set<string>();

  // a lista em array (o bloco `foreach t in array array[...]`)
  const bloco = sql.match(/foreach t in array array\[(.*?)\]/s);
  if (bloco) for (const m of bloco[1]!.matchAll(/'([a-z_]+)'/g)) dentro.add(m[1]!);
  // e os add/drop avulsos
  for (const m of sql.matchAll(/alter publication supabase_realtime add table public\.(\w+)/g))
    dentro.add(m[1]!);
  for (const m of sql.matchAll(/alter publication supabase_realtime drop table public\.(\w+)/g))
    dentro.delete(m[1]!);
  return dentro;
}

function assinadasNoCodigo(): Map<string, string[]> {
  const achadas = new Map<string, string[]>();
  const varrer = (dir: string) => {
    for (const entrada of readdirSync(dir)) {
      if (entrada === "node_modules" || entrada.startsWith(".")) continue;
      const completo = path.join(dir, entrada);
      if (statSync(completo).isDirectory()) varrer(completo);
      else if (/\.tsx?$/.test(entrada)) {
        // Arquivo de TESTE fala de realtime sem assinar nada: foi daqui que
        // saíram as seis entradas falsas da dívida original.
        if (/\.test\.tsx?$/.test(entrada)) continue;
        const fonte = readFileSync(completo, "utf8");
        // Só conta o `table:` DENTRO de um bloco `postgresChanges` — `table:`
        // sozinho aparece em consulta comum e viraria falso positivo.
        for (const m of fonte.matchAll(/postgresChanges[\s\S]{0,400}?table:\s*"([a-z_]+)"/g)) {
          const rel = path.relative(RAIZ, completo);
          achadas.set(m[1]!, [...(achadas.get(m[1]!) ?? []), rel]);
        }
      }
    }
  };
  for (const raiz of ["hooks", "components", "app", "lib"]) varrer(path.join(RAIZ, raiz));
  return achadas;
}

describe("realtime: assinatura sem publicação nunca recebe evento", () => {
  const publicacao = publicacaoDoBaseline();
  const assinadas = assinadasNoCodigo();

  it("a varredura enxerga as duas pontas (senão o verde não vale)", () => {
    // Controle de instrumento: se o baseline mudar de forma ou o padrão de
    // assinatura mudar, um dos dois vira zero e o gate passaria a aprovar tudo.
    expect(publicacao.size, "publicação vazia: o extrator do baseline quebrou").toBeGreaterThan(5);
    expect(assinadas.size, "nenhuma assinatura achada: o extrator do código quebrou").toBeGreaterThan(3);
  });

  it("nenhuma assinatura NOVA aponta para tabela fora da publicação", () => {
    const fora: string[] = [];
    for (const [tabela, arquivos] of assinadas) {
      if (publicacao.has(tabela)) continue;
      if (DIVIDA_CONHECIDA[tabela]) continue;
      fora.push(`${tabela} — assinada em ${arquivos.join(", ")}`);
    }
    expect(
      fora,
      "Esta tela assina uma tabela que NÃO está na publicação `supabase_realtime` do " +
        "baseline.sql. O canal vai subir, o subscribe vai devolver SUBSCRIBED, e " +
        "nenhum evento chega nunca — a tela só muda no reload. Acrescente a tabela " +
        "à publicação numa migration E no apêndice do baseline.",
    ).toEqual([]);
  });

  it("a dívida conhecida não guarda tabela que já foi consertada", () => {
    // Se alguém acrescentar uma delas à publicação, a entrada aqui vira mentira
    // — e uma lista de dívida com item quitado ensina a não confiar nela.
    const quitadas = Object.keys(DIVIDA_CONHECIDA).filter((t) => publicacao.has(t));
    expect(quitadas, "já estão na publicação: tire da lista de dívida").toEqual([]);
  });

  it("toda dívida explica onde está", () => {
    for (const [t, motivo] of Object.entries(DIVIDA_CONHECIDA)) {
      expect(motivo.length, `${t} sem motivo escrito`).toBeGreaterThan(20);
    }
  });
});
