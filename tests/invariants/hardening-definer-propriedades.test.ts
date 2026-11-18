import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * HARDENING — as propriedades que TODA `SECURITY DEFINER` de `public` precisa
 * ter, e que uma função nova não nasce tendo.
 *
 * ## O que este arquivo acrescenta aos que já existem
 *
 * `hardening-definer-varredura.test.ts` pergunta **quem executa** (anon,
 * authenticated volátil) e `definer-valida-membership.test.ts` mede, por
 * comportamento, se a função confere a organização de quem chamou — mas só nas
 * funções que já estavam na lista. Ficava de fora a pergunta que uma definer
 * NOVA não responde sozinha: **o `search_path` está fixo E fora do alcance do
 * schema temporário?**
 *
 * ## O furo do `pg_temp` (medido em 18/11/2026)
 *
 * O Postgres procura o schema TEMPORÁRIO primeiro quando `pg_temp` não está
 * listado no `search_path` — é o comportamento documentado, e vale para
 * relação e tipo. Uma definer roda com o dono (`postgres`); se o corpo referencia
 * `user_organizations` sem qualificar schema, quem chama cria
 * `pg_temp.user_organizations` e a definer lê o objeto do CHAMADOR com
 * privilégio de dono.
 *
 * Estado medido antes da 0318: **42 das 62** definers de `public` tinham
 * `search_path` fixo, mas sem `pg_temp`. Isto é o tipo de propriedade que
 * "search_path fixo" sozinha não garante — e que nenhum teste vigiava.
 *
 * ## As listas, e por que só encolhem
 *
 * Função com parâmetro de organização e EXECUTE para `authenticated` tem de
 * guardar a organização no corpo (ou delegar a quem guarda). Função que só
 * `service_role` executa não tem `auth.uid()` para comparar: ela CONFIA NO
 * CHAMADOR, e o caller é uma obrigação da lista — com o call site medido, não
 * suposto. Entrada nova nessas listas é a decisão que o gate existe para
 * impedir que passe em silêncio.
 */

interface Definer {
  readonly nome: string;
  readonly assinatura: string;
  readonly anon: boolean;
  readonly authenticated: boolean;
  readonly serviceRole: boolean;
  readonly config: string;
  readonly acl: string;
  readonly args: string;
  readonly corpo: string;
}

let CACHE: Definer[] | null = null;
function inventario(): Definer[] {
  if (CACHE) return CACHE;
  // JSON, e não TSV: `pg_get_functiondef` devolve um CORPO com tabs e quebras
  // de linha. A primeira versão deste arquivo cortava por `\t` e transformava
  // 62 funções em 3.247 linhas de lixo — o teste reprovava por instrumento, não
  // por propriedade. `json_build_object` escapa; quem lê é `JSON.parse`.
  const out = sql(`
    select coalesce(json_agg(json_build_object(
             'nome', p.proname,
             'assinatura', p.oid::regprocedure::text,
             'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
             'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
             'serviceRole', has_function_privilege('service_role', p.oid, 'EXECUTE'),
             'config', coalesce(array_to_string(p.proconfig, ','), ''),
             'acl', coalesce(p.proacl::text, ''),
             'args', pg_get_function_arguments(p.oid),
             'corpo', pg_get_functiondef(p.oid)
           ) order by p.proname)::text, '[]')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef;
  `);
  CACHE = JSON.parse(out) as Definer[];
  return CACHE;
}

const RECEBE_ORG = /(^|[\s,(])(p_org|p_org_id|p_organization_id|organization_id)\s+(uuid|text)/;
const GUARDA_NO_CORPO =
  /auth\.uid\(\)|fn_user_org_ids|fn_role_at_least|fn_is_platform_admin|fn_can_|membership|fn_user_role_in_org/;

/**
 * Delegação: a função não guarda, mas chama uma que guarda. Só entra com a
 * função-alvo nomeada — "confia" não é delegação.
 */
const GUARDA_DELEGADA: Readonly<Record<string, string>> = {
  fn_log_event:
    "delega a public.emit_event, que valida membership desde a 0149 " +
    "(definer-valida-membership.test.ts cobre o caminho).",
};

/**
 * `service_role` não tem `auth.uid()`: a comparação de organização é impossível
 * dentro da função. O que protege é o CHAMADOR — e cada entrada aqui nomeia o
 * call site medido. Função nova com parâmetro de organização e grant só a
 * service_role reprova até entrar aqui com a razão escrita.
 */
const CONFIA_NO_CHAMADOR: Readonly<Record<string, string>> = {
  fn_aplicar_quadro_do_onboarding:
    "app/actions/onboarding/montarQuadro.ts — admin.rpc com a org da sessão do onboarding",
  fn_definir_logo_da_organizacao:
    "app/api/v1/marca/logo/route.ts — admin.rpc com authz.org.orgId (requireRole)",
  fn_definir_marca_da_organizacao:
    "app/actions/settings/updateMarcaDaOrganizacao.ts — server action, org resolvida do usuário",
  fn_devolver_numero_nfe: "lib/fiscal/numeracao.ts — org do invoice em processamento",
  fn_reservar_numero_nfe: "lib/fiscal/numeracao.ts — org do invoice em processamento",
  fn_lgpd_cascade_redact_contact:
    "lib/lgpd/redact-cascade.ts — org do pedido LGPD persistido, nunca do corpo",
  fn_publish_ai_agent_version:
    "lib/ai/agents/publish.ts (admin) chamado por app/api/v1/ai/agents/[id]/publish/route.ts",
  fn_publish_followup_flow_version:
    "lib/followup/publish.ts (admin) chamado pela rota de publish do fluxo",
  fn_sentinel_aplicar_mudanca:
    "app/api/v1/sentinel/occurrences/[id]/route.ts — admin.rpc com a org da ocorrência",
  fn_sentinel_encerrar_ausentes: "lib/sentinel/execucao.ts — org da execução do Sentinel",
  fn_sentinel_expurgar: "lib/sentinel/execucao.ts — org da execução do Sentinel",
  fn_sentinel_registrar_ocorrencia: "lib/sentinel/execucao.ts — org da execução do Sentinel",
  fn_sentinel_corrigir_job:
    "app/api/v1/sentinel/occurrences/[id]/correcao/route.ts — admin.rpc com a org da ocorrência aprovada",
  fn_sentinel_reverter_job:
    "app/api/v1/sentinel/occurrences/[id]/correcao/reverter/route.ts — admin.rpc com a org da ocorrência corrigida",
  fn_upsert_wa_contact: "lib/waha/ingest.ts — org resolvida da sessão do canal",
  fn_upsert_wa_conversation: "lib/waha/ingest.ts — org resolvida da sessão do canal",
  fn_aplicar_status_mercos:
    "sem call site em TS: o fluxo Mercos chama por SQL (serviço do worker) e os " +
    "invariantes pedido-concluido/revisao-mercos exercitam a regra",
  fn_importar_pedido_mercos:
    "sem call site em TS: importação do Mercos por SQL no serviço do worker",
  fn_mercos_fundir_duplicados:
    "sem call site em TS: fusão de duplicados do Mercos por SQL; invariante " +
    "mercos-cadastro-1_para_1 exercita",
  fn_sincronizar_pedido_mercos:
    "sem call site em TS: sincronização do Mercos por SQL; invariantes " +
    "revisao-mercos e mercos-pago-e-entregue exercitam",
};

function recebeParametroDeOrg(f: Definer): boolean {
  return RECEBE_ORG.test(f.args);
}

describe("hardening: propriedades de toda SECURITY DEFINER de public", () => {
  it("o inventário não vem vazio (guarda de vacuidade)", () => {
    // 62 medidos em 18/11/2026. Piso de ordem de grandeza: um catálogo que
    // deixasse de casar reprova aqui em vez de passar medindo zero.
    expect(inventario().length).toBeGreaterThanOrEqual(55);
  });

  it("toda definer fixa search_path E inclui pg_temp", () => {
    const ruins = inventario()
      .filter((f) => !f.config.includes("search_path=") || !f.config.includes("pg_temp"))
      .map((f) => `${f.assinatura} (${f.config || "sem search_path"})`);
    expect(
      ruins,
      "SECURITY DEFINER sem `pg_temp` explícito no search_path: o Postgres procura " +
        "o schema TEMPORÁRIO primeiro, então quem chama pode plantar pg_temp.<tabela> " +
        "e a definer opera no objeto do chamador com privilégio de dono. " +
        "`alter function ... set search_path = public, pg_temp` (0318).",
    ).toEqual([]);
  });

  it("nenhuma definer tem EXECUTE concedido a PUBLIC", () => {
    // O grant a PUBLIC (`=X/`) não aparece em `has_function_privilege('anon')`
    // como origem separada — mas é ele que a anon key herda. Procurar no ACL
    // cru é o único jeito de distinguir "grant direto a anon" de "grant a
    // PUBLIC, herdado por todos".
    const comPublic = inventario()
      .filter((f) => /(^|[{,])=X\//.test(f.acl))
      .map((f) => f.assinatura);
    expect(
      comPublic,
      "grant de EXECUTE a PUBLIC numa SECURITY DEFINER: toda role (inclusive anon) " +
        "herda. `revoke execute on function ... from public` — e lembre que o " +
        "ALTER DEFAULT PRIVILEGES do Supabase é a OUTRA origem.",
    ).toEqual([]);
  });

  it("nenhuma definer é executável por anon", () => {
    const expostas = inventario().filter((f) => f.anon).map((f) => f.assinatura);
    expect(expostas, "definer alcançável pela anon key (que vai para o browser)").toEqual([]);
  });

  it("definer com parâmetro de organização e EXECUTE para authenticated guarda a org", () => {
    const semGuarda = inventario()
      .filter((f) => f.authenticated && recebeParametroDeOrg(f))
      .filter((f) => !GUARDA_NO_CORPO.test(f.corpo))
      .filter((f) => !(f.nome in GUARDA_DELEGADA))
      .map((f) => f.assinatura);
    expect(
      semGuarda,
      "recebe a organização por argumento, é executável por usuário logado e não " +
        "compara com auth.uid()/fn_user_org_ids/fn_role_at_least. Ou guarda no corpo, " +
        "ou delega a quem guarda (GUARDA_DELEGADA, citando a função-alvo).",
    ).toEqual([]);
  });

  it("definer com parâmetro de organização e só service_role está na lista de confiança", () => {
    const semDeclaracao = inventario()
      .filter((f) => f.serviceRole && !f.authenticated && recebeParametroDeOrg(f))
      .filter((f) => !GUARDA_NO_CORPO.test(f.corpo))
      .filter((f) => !(f.nome in CONFIA_NO_CHAMADOR))
      .map((f) => f.assinatura);
    expect(
      semDeclaracao,
      "só service_role executa e recebe a organização por argumento: a função não " +
        "pode validar (não há auth.uid()). Declare em CONFIA_NO_CHAMADOR com o call " +
        "site medido — é a decisão de confiar no chamador que precisa estar escrita.",
    ).toEqual([]);
  });

  it("as listas de exceção só encolhem: entrada ainda existe e ainda é exceção", () => {
    const porNome = new Map(inventario().map((f) => [f.nome, f]));

    for (const [nome, razao] of Object.entries(CONFIA_NO_CHAMADOR)) {
      const f = porNome.get(nome);
      expect(f, `CONFIA_NO_CHAMADOR cita função inexistente: ${nome}`).toBeDefined();
      expect(
        f?.authenticated,
        `${nome} ganhou EXECUTE para authenticated — já não é "confia no chamador"; ` +
          `prove a guarda e remova a entrada`,
      ).toBe(false);
      expect(razao.length, `${nome}: razão precisa nomear o call site`).toBeGreaterThan(40);
    }

    for (const [nome, razao] of Object.entries(GUARDA_DELEGADA)) {
      const f = porNome.get(nome);
      expect(f, `GUARDA_DELEGADA cita função inexistente: ${nome}`).toBeDefined();
      expect(
        f?.authenticated,
        `${nome} não é mais executável por authenticated — remova a delegação`,
      ).toBe(true);
      expect(razao.length).toBeGreaterThan(40);
    }
  });
});

/**
 * O CAMINHO DO WORKER. Ele chama `.rpc()` com o client de **service role**
 * (`admin`), enquanto as rotas e Server Actions chamam com o client de sessão.
 * As duas metades precisam de grants diferentes, e um grant removido "por
 * limpeza" quebra a ingestão sem quebrar nenhum teste de rota — o sintoma é o
 * worker morto às 3h. Aqui cada chamada literal do código é resolvida contra o
 * catálogo e conferida com o papel do client que a faz.
 */
function chamadasRpc(): Array<{ arquivo: string; funcao: string; papel: "service_role" | "authenticated" }> {
  const raiz = path.resolve(__dirname, "../..");
  const pastas = ["workers", "lib", "app"].map((p) => path.join(raiz, p));
  const achadas: Array<{ arquivo: string; funcao: string; papel: "service_role" | "authenticated" }> = [];

  const percorre = (dir: string) => {
    for (const entrada of readdirSync(dir)) {
      const caminho = path.join(dir, entrada);
      if (statSync(caminho).isDirectory()) {
        if (entrada === "node_modules" || entrada === "__tests__") continue;
        percorre(caminho);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entrada) || /\.test\.(ts|tsx)$/.test(entrada)) continue;
      const corpo = readFileSync(caminho, "utf8");
      // Linha que COMEÇA como comentário não é chamada: o `kpis` cita uma RPC
      // que já não existe num comentário que explica por que ela saiu. O
      // scanner ignora a linha inteira quando ela abre com `*`, `//` ou `/*`.
      const semComentario = corpo
        .split("\n")
        .map((l) => (/^\s*(\*|\/\/|\/\*)/.test(l) ? "" : l))
        .join("\n");
      const re = /(\b[\w.]+)\.rpc\(\s*["'`]([a-z][a-z0-9_]*)["'`]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(semComentario))) {
        const receptor = m[1] ?? "";
        achadas.push({
          arquivo: path.relative(raiz, caminho).split(path.sep).join("/"),
          funcao: m[2] ?? "",
          papel: /admin/i.test(receptor) ? "service_role" : "authenticated",
        });
      }
    }
  };
  for (const p of pastas) percorre(p);
  return achadas;
}

describe("worker e RPC: o grant de cada função chamada existe para o client que chama", () => {
  const chamadas = chamadasRpc();

  it("o scanner acha chamadas (guarda de vacuidade)", () => {
    expect(chamadas.length).toBeGreaterThanOrEqual(15);
    expect(new Set(chamadas.map((c) => c.funcao)).size).toBeGreaterThanOrEqual(10);
  });

  it("toda função chamada por .rpc() existe em public e tem EXECUTE para o papel do client", () => {
    // UMA consulta para todas as chamadas. A primeira versão fazia um `psql`
    // por chamada e estourava o `testTimeout` de 30 s — instrumento lento vira
    // vermelho que não fala do produto, e este teste roda em toda PR.
    const pares = [...new Set(chamadas.map((c) => `${c.funcao}|${c.papel}`))]
      .map((par) => {
        const [funcao, papel] = par.split("|");
        return `('${funcao}', '${papel}')`;
      })
      .join(", ");
    const resposta = sql(`
      with pedidos(funcao, papel) as (values ${pares}),
      res as (
        select pedidos.funcao, pedidos.papel, count(p.oid) as achados,
               coalesce(bool_or(has_function_privilege(pedidos.papel, p.oid, 'EXECUTE')), false) as tem
          from pedidos
          left join pg_proc p
            on p.proname = pedidos.funcao
           and p.pronamespace = 'public'::regnamespace
         group by 1, 2
      )
      select funcao || '\t' || papel || '\t' || achados::text || '\t' || tem::text from res;
    `);
    const estado = new Map(
      resposta
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((linha) => {
          const [funcao, papel, achados, tem] = linha.split("\t");
          return [`${funcao}|${papel}`, { achados: Number(achados ?? "0"), tem: tem === "true" }];
        }),
    );
    const problemas: string[] = [];
    for (const c of chamadas) {
      const e = estado.get(`${c.funcao}|${c.papel}`);
      if (!e || e.achados === 0) {
        problemas.push(`${c.arquivo}: ${c.funcao} não existe em public`);
      } else if (!e.tem) {
        problemas.push(`${c.arquivo}: ${c.funcao} sem EXECUTE para ${c.papel}`);
      }
    }
    expect(
      problemas,
      "chamada .rpc() sem função (typo/removida) ou sem grant para o papel do client: " +
        "o worker morre em produção, o teste de rota continua verde porque usa o outro client.",
    ).toEqual([]);
  });
});
