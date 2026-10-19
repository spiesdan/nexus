import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  carregarEnvLocal,
  credenciaisSupabaseDeTeste,
  permiteBancoRemoto,
} from "../../scripts/lib/env-de-teste";

/**
 * O FALLBACK PARA O `.env.local` NÃO ESCREVE EM BANCO REMOTO.
 *
 * ═══ O defeito que este arquivo fecha (issue #197, medido em 07/10/2026) ═══
 *
 * A suíte E2E escreveu **1.483 linhas de teste em 63 tabelas** da base de
 * produção: 13 organizações, 11 usuários, 5 `channel_sessions` e 761 linhas de
 * `api_audit_log`. Não foi um acidente de sessão — foi o comportamento normal do
 * harness na máquina de trabalho, onde `.env.local` aponta para a VPS.
 *
 * O conserto de 06/08 tirou o `.env.local` do disco dos 108 arquivos que o liam
 * direto e criou um gate para isso. Mas `carregarEnvLocal()` **continuava**
 * caindo no arquivo quando o ambiente não definia a variável — e o alarme que
 * existia para avisar (`anunciarDestino`) era `console.warn`, por decisão
 * registrada no próprio arquivo:
 *
 *   "Não recuso a execução aqui porque não consigo provar que nenhum fluxo
 *    legítimo usa o par misto."
 *
 * **O aviso que ninguém transformou em recusa não impediu a escrita.** Este
 * arquivo existe para que a próxima vez seja uma exceção, não uma linha amarela
 * que rola para fora da tela.
 *
 * ═══ POR QUE A RÉGUA É "O QUE VEIO DO ARQUIVO", E NÃO "REMOTO = NÃO" ═══
 *
 * Recusar todo destino remoto mataria o `e2e-pos-deploy.yml`, que roda a suíte
 * contra a instalação publicada de propósito. O que separa os dois casos não é o
 * destino — é **quem escolheu**:
 *
 *   valor no AMBIENTE → alguém exportou isto deliberadamente. Confio.
 *   valor do ARQUIVO  → ninguém decidiu nada; a máquina do dev decidiu. Não confio.
 *
 * Os casos abaixo testam as DUAS metades dessa régua. Um gate que só testasse a
 * recusa passaria mesmo que tivesse matado o caminho legítimo.
 */

const VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "SUPABASE_DB_URL",
  "TESTE_PERMITE_BANCO_REMOTO",
] as const;

const LOCAL_API = "http://127.0.0.1:54321";
const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const REMOTE_API = "https://porysaiysiztn.supabase.co";
const REMOTE_DB = "postgresql://postgres:senha-secreta@db.abcdefgh.supabase.co:5432/postgres";

let anterior: Record<string, string | undefined> = {};
let cwdAnterior = "";
let tmp = "";

beforeEach(() => {
  anterior = Object.fromEntries(VARS.map((v) => [v, process.env[v]]));
  for (const v of VARS) delete process.env[v];
  // cwd próprio: a função lê `.env.local` de `process.cwd()`. O do repo aponta
  // para a nuvem, e ler o de verdade aqui seria medir outra coisa — além de
  // transformar este teste no defeito que ele vigia.
  cwdAnterior = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "recusa-remoto-"));
  process.chdir(tmp);
});

afterEach(() => {
  process.chdir(cwdAnterior);
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const [k, v] of Object.entries(anterior)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function escreverEnvLocal(linhas: Record<string, string>): void {
  fs.writeFileSync(
    path.join(tmp, ".env.local"),
    Object.entries(linhas)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
  );
}

describe("credenciaisSupabaseDeTeste recusa destino remoto vindo do arquivo", () => {
  it("CONTROLE: com tudo LOCAL no arquivo, nada é recusado", () => {
    // Sem este caso, um gate que sempre lançasse passaria em todos os outros.
    escreverEnvLocal({
      NEXT_PUBLIC_SUPABASE_URL: LOCAL_API,
      SUPABASE_SERVICE_ROLE_KEY: "srk",
      SUPABASE_DB_URL: LOCAL_DB,
    });
    expect(() => credenciaisSupabaseDeTeste()).not.toThrow();
  });

  it("API remota vinda do arquivo: recusa — e não com o erro de 'sem credenciais'", () => {
    // A distinção importa: se a mensagem fosse a de credencial ausente, quem
    // lesse procuraria um arquivo faltando em vez de perceber que está apontado
    // para a produção.
    escreverEnvLocal({
      NEXT_PUBLIC_SUPABASE_URL: REMOTE_API,
      SUPABASE_SERVICE_ROLE_KEY: "srk",
      SUPABASE_DB_URL: LOCAL_DB,
    });
    expect(() => credenciaisSupabaseDeTeste()).toThrow(/REMOTO/);
    expect(() => credenciaisSupabaseDeTeste()).not.toThrow(/credenciais do Supabase/i);
  });

  it("o ESTADO MISTO: API no ambiente (local) e Postgres só no arquivo (remoto)", () => {
    // ═══ É ESTE O CASO DA #197 ═══
    //
    // `.env.e2e` exportado sem `SUPABASE_DB_URL` (a chave nasceu depois), com um
    // `.env.local` de trabalho no disco: a API vai para o Supabase local e o
    // Postgres para a produção. Eram 15 arquivos abrindo `pg.Pool` com esse
    // `dbUrl`, e o alarme imprimia `escrevendo em LOCAL` enquanto isso.
    process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_API;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk-do-ambiente";
    escreverEnvLocal({ SUPABASE_DB_URL: REMOTE_DB });

    // A guarda nomeia o canal — quem lê precisa saber que é o pg.Pool, não a API.
    expect(() => credenciaisSupabaseDeTeste()).toThrow(/SUPABASE_DB_URL/);
    expect(() => credenciaisSupabaseDeTeste()).toThrow(/REMOTO/);
  });

  it("a mensagem diz o host e NUNCA a senha do Postgres", () => {
    // O canal novo carrega credencial. Trocar um defeito de destino por um
    // vazamento de segredo no log seria uma troca ruim.
    process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_API;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk-do-ambiente";
    escreverEnvLocal({ SUPABASE_DB_URL: REMOTE_DB });

    let mensagem = "";
    try {
      credenciaisSupabaseDeTeste();
    } catch (e) {
      mensagem = e instanceof Error ? e.message : String(e);
    }
    expect(mensagem).toContain("db.abcdefgh.supabase.co:5432");
    expect(mensagem).not.toContain("senha-secreta");
  });

  it("REMOTO definido no AMBIENTE passa — é o caminho do pós-deploy", () => {
    // A outra metade da régua. `e2e-pos-deploy.yml` roda a suíte contra a
    // instalação publicada de propósito; recusar aqui mataria o caminho inteiro.
    process.env.NEXT_PUBLIC_SUPABASE_URL = REMOTE_API;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk-remoto";
    process.env.SUPABASE_DB_URL = REMOTE_DB;

    const c = credenciaisSupabaseDeTeste();
    expect(c.origem).toBe("ambiente");
    expect(c.url).toBe(REMOTE_API);
    expect(c.dbUrl).toBe(REMOTE_DB);
  });

  it("ambiente com o Postgres no arquivo e TUDO remoto: recusa (o arquivo calado)", () => {
    // Mesmo com a API decidida no ambiente, a conexão direta que ninguém
    // exportou não pode apontar para fora em silêncio.
    process.env.NEXT_PUBLIC_SUPABASE_URL = REMOTE_API;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk-remoto";
    escreverEnvLocal({ SUPABASE_DB_URL: REMOTE_DB });
    expect(() => credenciaisSupabaseDeTeste()).toThrow(/REMOTO/);
  });
});

describe("carregarEnvLocal recusa ANTES de poluir process.env", () => {
  it("Postgres remoto vindo do arquivo: lança e NÃO publica a variável", () => {
    // ═══ O MECANISMO EXATO DO DANO ═══
    //
    // Uma spec que só quer `INTERNAL_SECRET` chama esta função; o `.env.local`
    // completa o resto do ambiente; e a partir daí TODO filho (`execFileSync`,
    // `pg.Pool`) enxerga o banco da produção — sem que nenhum tenha pedido por
    // credencial de banco.
    //
    // Por isso a ordem é testada, não só a exceção: se a guarda viesse DEPOIS do
    // loop que popula `process.env`, a escrita já teria sido preparada.
    //
    // A chave de controle é inventada de propósito: `INTERNAL_SECRET` já existe
    // no ambiente do vitest, e medir a publicação dela mediria o ambiente, não o
    // arquivo.
    escreverEnvLocal({
      SUPABASE_DB_URL: REMOTE_DB,
      CHAVE_QUE_SO_O_ARQUIVO_TEM: "veio-do-disco",
    });

    expect(() => carregarEnvLocal()).toThrow(/REMOTO/);
    expect(process.env.SUPABASE_DB_URL, "a DSN remota não pode ter sido publicada").toBeUndefined();
    expect(
      process.env.CHAVE_QUE_SO_O_ARQUIVO_TEM,
      "o loop que publica o arquivo em process.env não pode ter rodado",
    ).toBeUndefined();
    delete process.env.CHAVE_QUE_SO_O_ARQUIVO_TEM;
  });

  it("o ambiente já definiu a chave de destino: o arquivo não é consultado, e não há recusa", () => {
    process.env.SUPABASE_DB_URL = LOCAL_DB;
    escreverEnvLocal({ SUPABASE_DB_URL: REMOTE_DB, WAHA_API_KEY: "chave" });

    // `process.env` vence — a regra da função continua valendo. O que mudou é
    // que agora o valor do ARQUIVO é checado em vez de simplesmente descartado.
    expect(() => carregarEnvLocal()).not.toThrow();
    expect(process.env.SUPABASE_DB_URL).toBe(LOCAL_DB);
  });

  it("tudo local no arquivo: carrega normalmente", () => {
    escreverEnvLocal({ NEXT_PUBLIC_SUPABASE_URL: LOCAL_API, SUPABASE_DB_URL: LOCAL_DB });
    const env = carregarEnvLocal();
    expect(env.SUPABASE_DB_URL).toBe(LOCAL_DB);
  });

  it("arquivo ausente (o worktree dedicado de e2e): não é erro", () => {
    // É a ausência do `.env.local` que protege o worktree de CI. Se isto
    // passasse a lançar, a proteção viraria a falha.
    expect(() => carregarEnvLocal()).not.toThrow();
  });
});

describe("a saída existe, mas exige um ato", () => {
  it("sem a variável, recusa", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_API;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk";
    escreverEnvLocal({ SUPABASE_DB_URL: REMOTE_DB });
    expect(permiteBancoRemoto()).toBe(false);
    expect(() => credenciaisSupabaseDeTeste()).toThrow(/REMOTO/);
  });

  it("TESTE_PERMITE_BANCO_REMOTO=1 libera, e AVISA em warn (não em info)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_API;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk";
    process.env.TESTE_PERMITE_BANCO_REMOTO = "1";
    escreverEnvLocal({ SUPABASE_DB_URL: REMOTE_DB });

    const warn: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((...a) => void warn.push(a.join(" ")));
    try {
      const c = credenciaisSupabaseDeTeste();
      expect(c.dbUrl).toBe(REMOTE_DB);
    } finally {
      spy.mockRestore();
    }
    expect(warn.join("\n")).toContain("REMOTO liberado");
  });

  it("valores de 'não' não liberam — a porta não abre por acidente de digitação", () => {
    for (const v of ["0", "false", "nao", "não", "", "  "]) {
      process.env.TESTE_PERMITE_BANCO_REMOTO = v;
      expect(permiteBancoRemoto(), `"${v}" não pode autorizar escrita em produção`).toBe(false);
    }
    process.env.TESTE_PERMITE_BANCO_REMOTO = "1";
    expect(permiteBancoRemoto()).toBe(true);
  });
});
