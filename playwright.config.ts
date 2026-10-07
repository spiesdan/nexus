import { readFileSync } from "node:fs";

import { defineConfig, type ReporterDescription } from "@playwright/test";

/**
 * Lê o `.env.e2e` — o ambiente LOCAL da suíte.
 *
 * Falha ALTO se o arquivo não existir, em vez de deixar o app cair no
 * `.env.local`: o modo de falha silencioso aqui é a suíte rodar contra o banco
 * de PRODUÇÃO, que foi exatamente o que acontecia antes deste arquivo existir
 * (medido em 2026-08-06).
 */
function envDoE2E(): Record<string, string> {
  let bruto: string;
  try {
    bruto = readFileSync(".env.e2e", "utf8");
  } catch {
    throw new Error(
      "Falta o .env.e2e — rode `pnpm e2e:env` (precisa do Supabase local de pé).\n" +
        "Sem ele o app sob teste carregaria o .env.local, que aponta para PRODUÇÃO.",
    );
  }
  const env: Record<string, string> = {};
  for (const linha of bruto.split("\n")) {
    const limpa = linha.trim();
    if (limpa === "" || limpa.startsWith("#")) continue;
    const i = limpa.indexOf("=");
    if (i <= 0) continue;
    env[limpa.slice(0, i)] = limpa.slice(i + 1);
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // Um `.env.e2e` apontando para fora do localhost é pior que nenhum, porque
  // parece seguro — NO MODO LOCAL. Com `E2E_BASE_URL` o alvo é remoto de
  // propósito (pós-deploy: o `.env.e2e` precisa apontar para o MESMO ambiente
  // da URL, ou o login falha porque o usuário não existe lá); aí quem valida é
  // o health gate do workflow e o próprio teste, e recusar aqui mataria o
  // caminho inteiro descrito abaixo.
  const externa = (process.env.E2E_BASE_URL ?? "") !== "";
  if (!externa && !url.startsWith("http://127.0.0.1") && !url.startsWith("http://localhost")) {
    throw new Error(`.env.e2e aponta para um Supabase que não é local (${url}) — recusado.`);
  }
  return env;
}

/**
 * Publica o `.env.e2e` no ambiente do PROCESSO DE TESTE, não só do servidor.
 *
 * ## O defeito, medido em 2026-08-08 num worktree limpo
 *
 * `pnpm e2e:build && pnpm test:e2e` — o caminho documentado — morria antes do
 * primeiro teste:
 *
 *   Error: Sem credenciais do Supabase: defina NEXT_PUBLIC_SUPABASE_URL e
 *   SUPABASE_SERVICE_ROLE_KEY no ambiente (…) ou no .env.local
 *     at credenciaisSupabaseDeTeste (scripts/lib/env-de-teste.ts)
 *     at scripts/seed-e2e-credentials.ts
 *
 * A cadeia: as specs semeiam a própria precondição com `execFileSync`, o filho
 * herda o ambiente do RUNNER, e o runner não recebia nada — `envDoE2E()`
 * alimentava apenas `webServer.env`. `env-de-teste.ts` cai no `.env.local` como
 * plano B, e num worktree limpo esse arquivo **não existe de propósito**: a
 * ausência dele é o que impede a suíte de escrever em produção.
 *
 * Ou seja as duas proteções se anulavam: a que tira o `.env.local` do disco e a
 * que injeta o ambiente só no servidor deixavam o seed sem nenhuma das duas
 * fontes. O CI não notava porque contorna por dois caminhos — publica o arquivo
 * no `$GITHUB_ENV` e ainda faz `cp .env.e2e .env.local`, recriando justamente o
 * arquivo cuja ausência é a proteção.
 *
 * ## Por que aqui
 *
 * Este é o único ponto que já lê e valida o arquivo (inclusive recusando um
 * `.env.e2e` que aponte para fora do localhost). Resolver no `package.json` com
 * `set -a; . ./.env.e2e` funcionaria para quem usa o script e não para quem
 * chama `playwright test` direto — e é o caminho que a mensagem de erro sugere,
 * o que já prova que alguém teve de descobrir isto na mão.
 *
 * `process.env` VENCE quando a chave já existe: é a mesma precedência de
 * `scripts/lib/env-de-teste.ts`, e é o que mantém de pé o
 * `AUTH_RATE_LIMIT_LOGIN_IP` que o workflow define por fora. Sobrescrever aqui
 * criaria a colisão descrita no comentário do `webServer` abaixo — servidor e
 * processo de teste resolvendo a mesma chave para valores diferentes, que foi
 * como `INTERNAL_SECRET` derrubou 8 specs com 401.
 */
function publicarNoProcesso(env: Record<string, string>): Record<string, string> {
  for (const [chave, valor] of Object.entries(env)) {
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
  return env;
}

// Porta do dev server sob teste. Default 3001; sobrescreva com E2E_PORT quando
// a 3001 já estiver ocupada por outro checkout/worktree.
const PORT = process.env.E2E_PORT ?? "3001";

/**
 * Execução CONTRA UMA INSTALAÇÃO JÁ PUBLICADA (pós-deploy).
 *
 * `E2E_BASE_URL` define a alvo: a suíte NÃO sobe `next local` (o app sob teste
 * é o remoto) e o `baseURL` aponta para lá. Sem a variável, o comportamento é
 * exatamente o de antes — localhost:${PORT} com webServer.
 *
 * Os dados de teste continuam vindo do `.env.e2e` (obrigatório nos dois casos,
 * inclusive aqui): as specs semeiam suas precondições no Supabase que o
 * arquivo aponta. Aponte o `.env.e2e` de um run pós-deploy para o MESMO
 * ambiente da URL — dois ambientes diferentes resulta em login falhando
 * (usuário não existe no alvo), não em dano.
 */
const BASE_URL_EXTERNA = process.env.E2E_BASE_URL ?? "";
const BASE_URL = BASE_URL_EXTERNA !== "" ? BASE_URL_EXTERNA : `http://localhost:${PORT}`;

// Uma vez por processo de teste (antes: uma vez por construção do `webServer`
// — que ficava avaliado no mesmo momento do carregamento do módulo). Publica o
// `.env.e2e` no ambiente do RUNNER também, para os scripts de seed que as
// specs chamam por `execFileSync`; e é a mesma chamada que FALHA ALTO sem o
// arquivo, nos dois modos (local e E2E_BASE_URL).
const envE2E = publicarNoProcesso(envDoE2E());

export default defineConfig({
  testDir: "./tests/e2e",
  // Mede o deslocamento relógio host↔GoTrue e publica E2E_CLOCK_OFFSET_MS
  // antes dos workers nascerem — o TOTP de todos os specs compensa sem cada
  // spec precisar lembrar. Ver `tests/e2e/global-setup.ts`.
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 30_000,
  fullyParallel: false,
  /**
   * UM worker. `fullyParallel: false` serializa apenas DENTRO de cada arquivo —
   * entre arquivos o Playwright continua abrindo vários workers, e estes specs
   * compartilham a MESMA organização, os MESMOS usuários e o MESMO banco: um
   * spec revoga acesso enquanto outro checa escopo, um cria convite enquanto
   * outro conta membros.
   *
   * Medido em 2026-07-31: rodando a suíte inteira, 10 a 15 specs falhavam com
   * `waitForURL` estourando depois do login e elementos "not found"; os MESMOS
   * specs, rodados isolados, passavam em 18s. Não era lógica nem lentidão: era
   * interferência.
   *
   * O custo é wall-clock no CI. O benefício é que um vermelho volta a significar
   * "quebrou" em vez de "deu azar na ordem" — e suíte que falha por azar ninguém
   * lê, o que na prática desliga o gate inteiro.
   */
  workers: 1,
  retries: 0,
  /**
   * `list` no log — e `github` no CI, para a falha virar anotação no PR.
   *
   * Sem `reporter` declarado, o passo do CI imprimia apenas pontos `·`, SEM
   * newline: os pontos ficavam no buffer do runner e só vazavam quando
   * qualquer spec imprimia uma linha inteira. Medido no run 36348502150
   * (2026-09-27): o flush de 22 pontos — 22 testes concluídos — apareceu
   * JUNTO com o console do `qa-agente-usa-as-maos`, 7min depois do último
   * newline, e o passo morreu no teto de 30min sem resumo nenhum: impossível
   * dizer qual teste rodava nem quanto tempo levou. Com `list`, cada teste é
   * uma linha datada na hora — o log de um passo que estoura o teto continua
   * dizendo onde ele andava.
   */
  reporter: (process.env.CI ? [["list"], ["github"]] : [["list"]]) as ReporterDescription[],
  use: {
    baseURL: BASE_URL,
    // `E2E_PROXY` existe para rodar contra uma instalação alcançada por um
    // proxy CONNECT (túnel até a VPS, DNS público suspenso): sem ele o Chromium
    // resolveria o domínio na internet e o teste inteiro morreria em
    // ERR_SSL_PROTOCOL_ERROR — verde falso em CI, vermelho falso fora dele.
    ...(process.env.E2E_PROXY ? { proxy: { server: process.env.E2E_PROXY } } : {}),
    // ⚠️ Era `on-first-retry`, e com `retries: 0` logo acima isso significa
    // **trace nunca gravado**. As duas linhas estão certas isoladamente e
    // erradas juntas: uma diz "só no retry", a outra diz "não há retry".
    //
    // O preço apareceu inteiro numa investigação real: um vermelho em
    // `marca-logo.spec.ts` afirmava "a recusa apagou o logo", e responder o que
    // de fato aconteceu com o DOM custou quatro agentes e uma cadeia de
    // eliminação — porque o único artefato do run era um `error-context.md`
    // que fotografou a página do `afterAll`, não a que falhou. Um trace teria
    // dado URL, DOM e rede daquele instante, sem hipótese nenhuma.
    //
    // `retain-on-failure` grava sempre e descarta no verde: custa disco só
    // quando já se está pagando o custo maior, que é ter um vermelho.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Com E2E_BASE_URL não há webServer: quem serve é a instalação publicada.
  ...(BASE_URL_EXTERNA === ""
    ? {
        webServer: {
          // Produção (`next build` antes!): dev-server compila por rota (40-80s) e
          // Turbopack dev quebra cookies() fora do request scope — inviável p/ e2e.
          command: `pnpm exec next start --port ${PORT}`,
          // O ambiente do servidor sob teste vem do `.env.e2e`, INJETADO aqui — e não
          // do `.env.local`, que num checkout de trabalho aponta para PRODUÇÃO.
          // Variável de ambiente real tem precedência sobre os arquivos `.env*` que o
          // Next carrega sozinho, e é isto que impede a suíte de escrever no banco
          // real (medido em 2026-08-06: sem esta injeção, ela escrevia).
          //
          // ⚠️ Isto cobre o SERVIDOR. Os scripts de seed que as specs chamam sozinhas
          // liam `.env.local` direto do disco e escapavam daqui — o conserto do outro
          // lado é `scripts/lib/env-de-teste.ts`, que faz `process.env` vencer. E é o
          // `publicarNoProcesso` acima que garante que o `process.env` do runner tenha
          // o que aquele conserto precisa: sem ele, num worktree sem `.env.local`, o
          // seed não tinha NENHUMA das duas fontes.
          env: envE2E,
          url: BASE_URL,
          // false: reusar um server que já ocupa a porta pode ser OUTRO processo
          // (ex.: bundle do Remotion na 3000) — o teste precisa do NOSSO next start.
          reuseExistingServer: false,
          // Sobre a precedência de `env`, MEDIDO (Playwright 1.5x, 2026-08-07) com um
          // webServer que imprime o que recebeu:
          //
          //   var só no process.env        → CHEGA ao servidor (mescla, não substitui)
          //   var só no `env:` do config   → chega
          //   var nos DOIS, valores dif.   → vence a do `env:` do config
          //
          // A primeira linha é o que mantém `AUTH_RATE_LIMIT_LOGIN_IP` funcionando:
          // ele é definido no passo do workflow e quem aplica o teto é o SERVIDOR.
          //
          // A terceira é a armadilha. Uma chave que exista no `.env.e2e` E no ambiente
          // do CI silenciosamente resolve para valores DIFERENTES nos dois lados —
          // servidor com um, processo de teste com outro. Foi assim que
          // `INTERNAL_SECRET` derrubou 8 specs com 401. Por isso o workflow publica o
          // `.env.e2e` inteiro no ambiente do job em vez de redigitar valores: uma
          // fonte não colide consigo mesma.
          timeout: 120_000,
        },
      }
    : {}),
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
