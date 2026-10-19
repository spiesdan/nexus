/**
 * De onde um script de seed/sonda lê as credenciais do Supabase.
 *
 * ═══ O DEFEITO QUE ISTO CONSERTA (medido em 2026-08-06) ═══
 *
 * Os scripts liam `.env.local` **direto do disco**, ignorando `process.env`:
 *
 *     const envFile = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
 *
 * Num checkout de trabalho, `.env.local` aponta para PRODUÇÃO. Consequência: a
 * suíte E2E semeava organizações, usuários e agentes de teste no banco real — e
 * o `.env.e2e` no `webServer` do Playwright **não alcançava** esses scripts,
 * porque eles nunca olharam para o ambiente. O sintoma que denunciou: o factor
 * TOTP gravado em `.e2e-creds.json` não existia no banco local, porque tinha
 * sido criado na nuvem.
 *
 * A org `e2e-test-org` está na produção deste projeto desde 2026-04-29. Ela não
 * chegou lá por acidente de uma sessão: chegou porque **este era o comportamento
 * normal** da suíte.
 *
 * ═══ A REGRA ═══
 *
 * `process.env` VENCE o arquivo. É o que permite `set -a; . ./.env.e2e` (ou o
 * `env` do Playwright) redirecionar qualquer script sem editar nenhum deles.
 * Sem valor no ambiente, cai em `.env.local` — o comportamento de sempre, para
 * quem roda uma sonda à mão durante o desenvolvimento.
 *
 * ═══ E A QUALIFICAÇÃO DESSA REGRA (issue #197, 18/10/2026) ═══
 *
 * O fallback para o arquivo **RECUSA** um destino remoto. Ele não avisa: lança.
 *
 * "Sem valor no ambiente, cai em `.env.local`" é uma conveniência para quem
 * roda uma sonda à mão; na máquina de trabalho do dono esse arquivo aponta para
 * a VPS, e foi assim que a suíte E2E escreveu 1.483 linhas de teste em 63
 * tabelas da produção em 07/10. O aviso existia e **não impediu nada** — o que
 * impede é a exceção. Ver `recusarSeRemotoVindoDoArquivo`.
 */
import fs from "node:fs";
import path from "node:path";

export interface CredenciaisSupabase {
  url: string;
  serviceRole: string;
  /** anon key — alguns seeds fazem signIn como usuário comum (ex.: enroll TOTP). */
  anonKey: string;
  /** base do app, para links gerados pelo seed. */
  appUrl: string;
  /**
   * Conexão DIRETA ao Postgres, para os seeds que abrem `pg.Pool` (13 deles).
   *
   * Nasceu faltando: a interface não a declarava e nenhum dos dois ramos a
   * devolvia, mas os seeds já liam `credenciais.dbUrl`. O compilador não pegou
   * porque `tsconfig.json` tem `"exclude": ["scripts/**"]` — ler propriedade
   * inexistente aqui não custa nada a ele.
   *
   * E o sintoma escolhia o ambiente: local costuma cair no ramo do ARQUIVO e o
   * shell já ter a variável; no CI o workflow exporta as credenciais para o
   * ambiente, o ramo "ambiente" vence, `dbUrl` sai `undefined`, e o `pg` cai no
   * default do libpq — `ECONNREFUSED 127.0.0.1:5432`, uma porta que ninguém
   * pediu (o Supabase local publica na 54322).
   */
  dbUrl: string;
  /** de onde os valores vieram — vai ao log, para o operador não adivinhar. */
  origem: "ambiente" | "arquivo";
}

function lerArquivo(arquivo: string): Record<string, string> {
  const caminho = path.join(process.cwd(), arquivo);
  if (!fs.existsSync(caminho)) return {};
  const env: Record<string, string> = {};
  for (const linha of fs.readFileSync(caminho, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha);
    if (m) env[m[1]!] = (m[2] ?? "").replace(/^"(.*)"$/, "$1").trim();
  }
  return env;
}

/**
 * Resolve URL + service role. `process.env` primeiro; `.env.local` depois.
 *
 * Lança quando não acha — nunca devolve string vazia, que viraria uma chamada
 * ao Supabase com credencial vazia e um erro três camadas adiante.
 */
export function credenciaisSupabaseDeTeste(): CredenciaisSupabase {
  const arquivo = lerArquivo(".env.local");
  const doAmbiente = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
  if (doAmbiente.url !== "" && doAmbiente.serviceRole !== "") {
    // Cai no arquivo antes de desistir: quem exporta URL + service role no
    // ambiente (o CI faz isso) não necessariamente exporta a conexão direta,
    // e ela costuma estar no `.env.local` do lado. Só o ambiente venceria a
    // regra desta função; nada aqui a contradiz — `process.env` continua
    // tendo precedência quando existe.
    //
    // ⚠️ É ESTE O RAMO QUE ESCREVEU EM PRODUÇÃO (issue #197). Com a API vinda
    // do ambiente e a conexão direta só do arquivo, os dois canais apontam para
    // bancos DIFERENTES — e o alarme dizia `escrevendo em LOCAL` enquanto 15
    // arquivos abriam `pg.Pool` contra o banco real. Por isso a guarda: o que o
    // arquivo fornece em silêncio não pode apontar para fora.
    const dbUrlDoAmbiente = process.env.SUPABASE_DB_URL ?? "";
    if (dbUrlDoAmbiente === "") {
      recusarSeRemotoVindoDoArquivo(
        "credenciaisSupabaseDeTeste:SUPABASE_DB_URL",
        arquivo.SUPABASE_DB_URL ?? "",
      );
    }
    return {
      ...doAmbiente,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      dbUrl: dbUrlDoAmbiente !== "" ? dbUrlDoAmbiente : (arquivo.SUPABASE_DB_URL ?? ""),
      origem: "ambiente",
    };
  }

  const url = arquivo.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRole = arquivo.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (url === "" || serviceRole === "") {
    throw new Error(
      "Sem credenciais do Supabase: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY " +
        "no ambiente (ex.: `set -a; . ./.env.e2e; set +a`) ou no .env.local.",
    );
  }
  // Ramo do ARQUIVO: aqui o ambiente não decidiu NADA. É o caso do
  // `pnpm tsx tests/sonda-x.ts` na máquina de trabalho, que é onde o defeito da
  // #197 morava — a suíte parecia local e escrevia na nuvem.
  recusarSeRemotoVindoDoArquivo("credenciaisSupabaseDeTeste:NEXT_PUBLIC_SUPABASE_URL", url);
  recusarSeRemotoVindoDoArquivo(
    "credenciaisSupabaseDeTeste:SUPABASE_DB_URL",
    arquivo.SUPABASE_DB_URL ?? "",
  );
  return {
    url,
    serviceRole,
    anonKey: arquivo.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    appUrl: arquivo.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    dbUrl: arquivo.SUPABASE_DB_URL ?? "",
    origem: "arquivo",
  };
}

/** O host de um destino, sem a senha — `dbUrl` carrega credencial e não vai a log. */
function hostDe(alvo: string): string {
  if (alvo === "") return "(vazio)";
  try {
    const u = new URL(alvo);
    return u.port === "" ? u.hostname : `${u.hostname}:${u.port}`;
  } catch {
    return "(ilegível)";
  }
}

/**
 * Um destino é local quando o host é loopback. Serve para os DOIS canais: a URL
 * HTTP do Supabase e o DSN do Postgres (`new URL` entende `postgresql://`).
 *
 * Destino VAZIO conta como local: sem DSN o `pg` cai no default do libpq
 * (`127.0.0.1:5432`) e falha alto com `ECONNREFUSED`, que é ruído — não é escrita
 * em produção, e é o que este alarme existe para achar.
 */
export function destinoEhLocal(alvo: string): boolean {
  if (alvo === "") return true;
  const host = hostDe(alvo).split(":")[0] ?? "";
  return host === "localhost" || host === "::1" || host === "[::1]" || host.startsWith("127.");
}

/** As duas chaves que decidem CONTRA QUAL BANCO o script escreve. */
const CHAVES_DE_DESTINO = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_DB_URL"] as const;

/**
 * O operador autorizou escrever num banco remoto, de propósito?
 *
 * Existe porque a recusa abaixo precisa de uma saída: alguém que quer MEDIR a
 * instalação instalada (o caminho do `e2e-pos-deploy.yml`, ou uma sonda à mão
 * contra a VPS) não pode ficar sem porta. O que não pode existir é a porta
 * ABERTA — autorizar tem de ser um ato, não um esquecimento.
 */
export function permiteBancoRemoto(): boolean {
  const v = (process.env.TESTE_PERMITE_BANCO_REMOTO ?? "").trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false" && v !== "nao" && v !== "não";
}

/**
 * A PORTA QUE FALTAVA — o fallback para o `.env.local` RECUSA um destino remoto.
 *
 * ═══ O defeito que isto fecha (issue #197, medido em 07/10/2026) ═══
 *
 * A suíte E2E escreveu **1.483 linhas de teste em 63 tabelas** da base de
 * produção: 13 organizações (`e2e-test-org`, `minha-empresa-<hash>`…), 11
 * usuários, 5 `channel_sessions` e 761 linhas de `api_audit_log`. O dono abriu a
 * tela de sessões para saber se dava para disparar campanha e encontrou cinco
 * sessões de WhatsApp que não eram de ninguém.
 *
 * O conserto de 06/08 tirou o `.env.local` do disco dos 108 arquivos que o liam
 * direto, e criou um gate para isso — mas `carregarEnvLocal()` **continuava**
 * caindo no arquivo quando o ambiente não definia a variável, e isso era
 * deliberado:
 *
 *   "Sem valor no ambiente, cai em `.env.local` — o comportamento de sempre,
 *    para quem roda uma sonda à mão durante o desenvolvimento."
 *
 * Na máquina de trabalho do dono esse arquivo aponta para a VPS. O alarme que
 * existia para avisar disso (`anunciarDestino`) imprimia `DESTINO MISTO` em
 * `console.warn` — informação, não recusa, por decisão registrada no próprio
 * arquivo. **O aviso que ninguém transformou em erro não impediu a escrita.**
 *
 * ═══ POR QUE A REGRA É "O QUE VEIO DO ARQUIVO", E NÃO "REMOTO = NÃO" ═══
 *
 * Recusar todo destino remoto mataria caminhos legítimos: o `e2e-pos-deploy.yml`
 * roda a suíte contra a instalação publicada, e o `.env.e2e` aponta para lá de
 * propósito. A diferença entre os dois casos não é o destino — é **quem
 * escolheu**:
 *
 *   valor no AMBIENTE  → alguém exportou isto de propósito (`set -a; . ./.env.e2e`,
 *                        o `env` do workflow). Confio.
 *   valor do ARQUIVO   → ninguém decidiu nada; a máquina do dev decidiu. Não confio.
 *
 * É a mesma regra que o resto do arquivo já segue (`process.env` vence), agora
 * aplicada ao que acontece quando `process.env` NÃO tem a resposta.
 *
 * Cobre os dois canais porque o estado perigoso é justamente o misto: com a API
 * no ambiente (local) e o Postgres caindo no arquivo (produção), o alarme dizia
 * `escrevendo em LOCAL` enquanto 15 arquivos abriam `pg.Pool` contra o banco real.
 */
function recusarSeRemotoVindoDoArquivo(canal: string, valor: string): void {
  if (destinoEhLocal(valor)) return;

  if (permiteBancoRemoto()) {
    console.warn(
      `[${canal}] ⚠️  destino REMOTO liberado por TESTE_PERMITE_BANCO_REMOTO: ` +
        `${hostDe(valor)}. A escrita é sua.`,
    );
    return;
  }

  throw new Error(
    `[${canal}] O .env.local aponta para um destino REMOTO (${hostDe(valor)}) e o ambiente não ` +
      `definiu esta credencial.\n` +
      `\n` +
      `É exatamente o modo de falha que escreveu 1.483 linhas de teste na base de PRODUÇÃO em ` +
      `07/10/2026 (issue #197): a suíte parece rodar local e escreve na nuvem.\n` +
      `\n` +
      `Para rodar local: \`set -a; . ./.env.e2e; set +a\` — ou \`pnpm test:e2e\`, que publica o ` +
      `.env.e2e no processo e faz o ambiente vencer o arquivo.\n` +
      `Se o destino remoto é DELIBERADO (medir a instalação instalada), exporte ` +
      `TESTE_PERMITE_BANCO_REMOTO=1 e assuma a escrita.`,
  );
}

/**
 * Diz em voz alta contra QUAL banco o script vai escrever.
 *
 * Existe porque o modo de falha caro aqui é silencioso: um seed que escreve na
 * produção acha exatamente os mesmos dados de teste de sempre e termina com
 * "✅ Seed completo". Uma linha impressa é o que transforma isso em algo que
 * alguém pode notar antes de apertar enter na próxima vez.
 *
 * ═══ POR QUE ELE OLHA OS DOIS CANAIS (defeito medido em 2026-08-08) ═══
 *
 * A versão anterior decidia o rótulo **só por `c.url`**. Mas os dois canais são
 * resolvidos por regras diferentes: `url` e `serviceRole` exigem o ambiente
 * inteiro (linha 79), enquanto `dbUrl` cai no `.env.local` quando o ambiente não
 * a define (linha 89) — um fallback deliberado e testado.
 *
 * O estado MISTO é alcançável, e é o pior dos três porque parece seguro: com
 * `.env.e2e` no ambiente e um `.env.local` de trabalho no disco, a API vai para o
 * Supabase local e o **Postgres vai para a produção** — e são 15 arquivos que
 * abrem `pg.Pool` com esse `dbUrl`. O alarme imprimia `escrevendo em LOCAL` e o
 * script escrevia no banco real: exatamente a classe de defeito que esta função
 * foi criada para tornar visível, no canal que ela não cobria.
 *
 * Continua sendo INFORMAÇÃO, e agora o gate vive em outro lugar: quem RECUSA é
 * `recusarSeRemotoVindoDoArquivo`, na resolução das credenciais. Aqui não dá para
 * recusar porque este ponto roda depois — `anunciarDestino(script, c)` recebe as
 * credenciais já resolvidas, e uma exceção nova nos 34 call sites seria impacto
 * maior que o defeito. Os dois papéis se completam: a resolução recusa o que veio
 * do arquivo, e esta linha diz em voz alta contra qual banco o script VAI
 * escrever — inclusive nos casos legítimos, que agora são os únicos que chegam.
 */
export function anunciarDestino(script: string, c: CredenciaisSupabase): void {
  const apiLocal = destinoEhLocal(c.url);
  const bancoLocal = destinoEhLocal(c.dbUrl);

  // Formato preservado no caso são-todos-locais: é o que o operador já conhece e
  // o que a prova dos 16 seeds registrou no handoff.
  if (apiLocal && bancoLocal) {
    console.info(`[${script}] escrevendo em LOCAL: ${c.url} (origem: ${c.origem})`);
    return;
  }
  if (!apiLocal && !bancoLocal) {
    console.warn(`[${script}] escrevendo em ⚠️  REMOTO: ${c.url} (origem: ${c.origem})`);
    return;
  }
  console.warn(
    `[${script}] ⚠️  DESTINO MISTO — a API vai para ${apiLocal ? "LOCAL" : "REMOTO"} ` +
      `(${c.url}) e o Postgres para ${bancoLocal ? "LOCAL" : "REMOTO"} (${hostDe(c.dbUrl)}). ` +
      `Quem abre pg.Pool escreve no SEGUNDO. (origem: ${c.origem})`,
  );
}

/**
 * O ambiente efetivo para um script de teste/sonda: `process.env` por cima do
 * `.env.local`.
 *
 * ═══ POR QUE ESTA FUNÇÃO EXISTE (e não só `credenciaisSupabaseDeTeste`) ═══
 *
 * As ~96 sondas e provas do repo não leem só as credenciais do Supabase: cada
 * uma pega o que precisa (`WAHA_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_DB_URL`…)
 * de um `Record<string,string>` que elas montavam à mão lendo o arquivo. Trocar
 * isso por um acessor tipado exigiria reescrever 96 arquivos com oito formatos
 * diferentes — risco desproporcional ao problema.
 *
 * Esta função devolve **o mesmo shape** que aquele loader inline devolvia, com
 * duas diferenças que são o conserto inteiro:
 *
 *   1. **`process.env` VENCE o arquivo.** É o que permite `set -a; . ./.env.e2e`
 *      redirecionar qualquer sonda sem editá-la.
 *   2. **A ausência do arquivo não é erro.** No worktree dedicado de e2e não
 *      existe `.env.local`, e é essa ausência que impede a escrita acidental em
 *      produção. O loader antigo estourava com `ENOENT` ali.
 *
 * Também popula `process.env` com o que veio do arquivo (sem sobrescrever), para
 * os módulos que leem de lá — `lib/env.ts`, por exemplo.
 */
export function carregarEnvLocal(): Record<string, string> {
  const doArquivo = lerArquivo(".env.local");

  // ═══ A GUARDA ENTRA ANTES DE POPULAR `process.env` (issue #197) ═══
  //
  // A ordem importa: esta função ESCREVE no `process.env`, e é por isso que ela
  // é o caminho do defeito. Uma spec que só quer o `INTERNAL_SECRET` chama isto,
  // o `.env.local` completa o resto do ambiente, e a partir daí TODO filho
  // (`execFileSync`, `pg.Pool`) enxerga o `SUPABASE_DB_URL` da produção — sem
  // que nenhum deles tenha pedido por credencial de banco.
  //
  // Aqui só o canal que o ARQUIVO fornece é checado. Chave já no ambiente foi
  // decisão de quem rodou, e continua valendo.
  for (const chave of CHAVES_DE_DESTINO) {
    const doAmbiente = process.env[chave] ?? "";
    const doDisco = doArquivo[chave] ?? "";
    if (doAmbiente === "" && doDisco !== "") {
      recusarSeRemotoVindoDoArquivo(`carregarEnvLocal:${chave}`, doDisco);
    }
  }

  for (const [k, v] of Object.entries(doArquivo)) {
    if (process.env[k] === undefined || process.env[k] === "") process.env[k] = v;
  }
  // `process.env` por cima: o que o shell definiu manda, o arquivo completa.
  const efetivo: Record<string, string> = { ...doArquivo };
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string" && v !== "") efetivo[k] = v;
  }
  return efetivo;
}
