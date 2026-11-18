/**
 * O SENTINEL RECOMENDA — NÃO ESCREVE NO NEGÓCIO.
 *
 * ─── Por que este teste existe ─────────────────────────────────────────────
 *
 * O Nível 1 é uma promessa de produto: o plano de correção é texto revisável,
 * nada nele executa. A forma fácil de quebrar a promessa sem tocar no tipo é
 * alguém "só" plugar um `admin.from("invoices").update(...)` no runner ou um
 * callback no plano. O tipo não impede; a revisão humana pode não ver.
 *
 * Este arquivo é a catraca. Ele varre o código que compõe o Sentinel e reprova:
 *
 *  1. escrita (`.insert/.update/.delete/.upsert`) em tabela que não começa com
 *     `sentinel_` — nota, saldo, pagamento, mensagem, contato são proibidos;
 *  2. `.rpc()` fora do contrato `fn_sentinel_*`;
 *  3. plano de recomendação que carrega função, RPC ou chave de execução.
 *
 * O que ele NÃO prova: que a função `fn_sentinel_*` não escreve em tabela de
 * negócio por dentro. Isso é provado pela migration (corpo auditável) e pelo
 * `test:db`; aqui a fronteira é o código TypeScript.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RECOMENDACOES } from "./recomendacoes";
import { REGRAS } from "./regras";
import type { Achado } from "./tipos";

const RAIZ = path.resolve(__dirname, "../..");
const DIRETORIOS = [
  path.join(RAIZ, "lib/sentinel"),
  path.join(RAIZ, "app/api/v1/sentinel"),
];

const TABELA_DE_ESCRITA_PERMITIDA = /^sentinel_/;
const RPC_PERMITIDO = /^fn_sentinel_/;

interface Fonte {
  nome: string;
  texto: string;
}

function fontes(dir: string): Fonte[] {
  const encontradas: Fonte[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      encontradas.push(...fontes(full));
      continue;
    }
    if (!entrada.name.endsWith(".ts") || entrada.name.endsWith(".test.ts")) continue;
    encontradas.push({
      nome: path.relative(RAIZ, full),
      texto: readFileSync(full, "utf8"),
    });
  }
  return encontradas;
}

const FONTES = DIRETORIOS.flatMap(fontes);

/** `.from("x")` seguido imediatamente de um verbo de escrita. */
function escritas(fonte: Fonte): Array<{ tabela: string; metodo: string }> {
  const achadas: Array<{ tabela: string; metodo: string }> = [];
  const re = /\.from\(\s*["'`]([a-zA-Z0-9_]+)["'`]\s*\)/g;
  let casou: RegExpExecArray | null;
  while ((casou = re.exec(fonte.texto))) {
    const cauda = fonte.texto.slice(re.lastIndex, re.lastIndex + 400);
    const escrita = cauda.match(/^\s*\.\s*(insert|update|delete|upsert)\b/);
    if (escrita) achadas.push({ tabela: casou[1]!, metodo: escrita[1]! });
  }
  return achadas;
}

function rpcs(fonte: Fonte): string[] {
  const achadas: string[] = [];
  const re = /\.rpc\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g;
  let casou: RegExpExecArray | null;
  while ((casou = re.exec(fonte.texto))) achadas.push(casou[1]!);
  return achadas;
}

const ACHADO: Achado = {
  regra: "x",
  categoria: "operacao",
  entidadeTipo: "x",
  entidadeId: "1",
  titulo: "t",
  resumo: "r",
  causaProvavel: "c",
  severidade: "media",
  href: null,
  evidencia: {},
};

describe("Sentinel é somente leitura no negócio", () => {
  it("encontrou os dois diretórios (controle positivo do scanner)", () => {
    expect(FONTES.length).toBeGreaterThan(10);
    expect(FONTES.some((f) => f.nome.endsWith("execucao.ts"))).toBe(true);
    expect(FONTES.some((f) => f.nome.endsWith("route.ts"))).toBe(true);
  });

  it("o scanner enxerga uma escrita de negócio (controle positivo)", () => {
    const falso: Fonte = {
      nome: "falso.ts",
      texto: `await admin.from("invoices").update({ status: "autorizada" });`,
    };
    expect(escritas(falso)).toEqual([{ tabela: "invoices", metodo: "update" }]);

    const rpcFalso: Fonte = { nome: "falso.ts", texto: `await admin.rpc("fn_corrige_tudo");` };
    expect(rpcs(rpcFalso)).toEqual(["fn_corrige_tudo"]);
  });

  it("nenhuma escrita em tabela fora de sentinel_*", () => {
    const violacoes = FONTES.flatMap((fonte) =>
      escritas(fonte)
        .filter((e) => !TABELA_DE_ESCRITA_PERMITIDA.test(e.tabela))
        .map((e) => `${fonte.nome}: ${e.metodo} em ${e.tabela}`),
    );
    expect(
      violacoes,
      "O Sentinel só pode escrever nas próprias tabelas (sentinel_*). " +
        "Corrigir nota/saldo/pagamento/mensagem é decisão humana — v1 é Nível 1.",
    ).toEqual([]);
  });

  it("nenhum RPC escapa do contrato fn_sentinel_*", () => {
    const violacoes = FONTES.flatMap((fonte) =>
      rpcs(fonte)
        .filter((fn) => !RPC_PERMITIDO.test(fn))
        .map((fn) => `${fonte.nome}: ${fn}`),
    );
    expect(violacoes, "RPC de negócio no Sentinel seria correção automática disfarçada.").toEqual(
      [],
    );
  });

  it("todo plano é dado puro: sem função, sem chave de execução", () => {
    const chavesProibidas = [
      "executar",
      "execute",
      "run",
      "handler",
      "callback",
      "acao",
      "rpc",
      "sql",
    ];

    for (const regra of REGRAS) {
      const plano = RECOMENDACOES[regra.id]!({ ...ACHADO, regra: regra.id });

      // JSON puro: função some no stringify e a igualdade reprova.
      expect(JSON.parse(JSON.stringify(plano)), regra.id).toEqual(plano);
      for (const chave of chavesProibidas) {
        expect(Object.keys(plano), `${regra.id} não pode carregar "${chave}"`).not.toContain(
          chave,
        );
      }
    }
  });

  it("o motor de detecção não conhece o client de banco", () => {
    const puros = ["motor.ts", "regras.ts", "recomendacoes.ts", "estado.ts", "config.ts"];
    for (const nome of puros) {
      const fonte = FONTES.find((f) => f.nome.endsWith(`lib/sentinel/${nome}`));
      expect(fonte, nome).toBeTruthy();
      expect(fonte!.texto, `${nome} deve ser puro`).not.toMatch(/lib\/supabase/);
    }
  });
});
