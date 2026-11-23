/**
 * INVENTÁRIO RASTREÁVEL — gera o catálogo de rotas/APIs do checkout atual.
 *
 * Por que existe: o inventário de produto envelhece igual a prosa de doc. A
 * contagem "156 páginas, 416 handlers, 293 migrations" que circula por aí já
 * divergiu do checkout (155/416/292 em 15/11/2026). Um catálogo gerado é a única
 * forma de manter a auditoria honesta: quem duvidar roda o comando.
 *
 * Uso:
 *   pnpm exec tsx scripts/auditoria/inventario.ts            # grava JSON + MD
 *   pnpm exec tsx scripts/auditoria/inventario.ts --check    # só resume no stdout
 *
 * O que ele classifica, e por quê:
 *
 *   - `page.tsx`  → tela. O caminho sai do diretório (grupos `(x)` somem,
 *                   `[param]` vira `:param`, `@slot` não é rota).
 *   - `route.ts`  → handler de API, com os métodos exportados.
 *   - `layout.tsx`→ casca de navegação (conta separada; não é tela).
 *   - `redirect` / `permanentRedirect` sem JSX → resolver/redirect, NÃO tela.
 *     Confundir os dois é o erro que fez a auditoria anterior listar 156 telas
 *     onde havia menos: um arquivo de 6 linhas que só redireciona não é uma
 *     experiência de usuário.
 *
 * Nada aqui julga qualidade — só mede presença. O julgamento mora no doc.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = process.cwd();
const SAIDA_DIR = join(RAIZ, "docs", "auditoria");
const SO_CHECK = process.argv.includes("--check");

type Tipo = "tela" | "resolver" | "erro" | "estado" | "api" | "layout" | "arquivo-especial";

interface Item {
  tipo: Tipo;
  rota: string;
  arquivo: string;
  grupo: string;
  metodos?: string[];
  flags: string[];
  linhas: number;
}

/** Diretório → URL. Grupos de rota não entram na URL; slots tampouco. */
function rotaDoDiretorio(dir: string): string {
  const partes = relative(join(RAIZ, "app"), dir)
    .split(sep)
    .filter((p) => p && !p.startsWith("(") && !p.startsWith("@"));
  const segmentos = partes.map((p) => p.replace(/^\[\.\.\.(.+)\]$/, ":$1*").replace(/^\[(.+)\]$/, ":$1"));
  return "/" + segmentos.join("/");
}

function flagsDe(fonte: string): string[] {
  const flags: string[] = [];
  const tem = (re: RegExp) => re.test(fonte);
  if (tem(/\bpermanentRedirect\s*\(/)) flags.push("redirect-301");
  else if (tem(/(?<!permanent)\bredirect\s*\(/)) flags.push("redirect");
  if (tem(/\bnotFound\s*\(/)) flags.push("notFound");
  if (tem(/requirePlatformAdmin\s*\(/)) flags.push("platform-admin");
  if (tem(/requireRole\s*\(/)) flags.push("requireRole");
  if (tem(/createAdminClient\s*\(/)) flags.push("service-role");
  if (tem(/["']use client["']/)) flags.push("client");
  if (tem(/force-dynamic/)) flags.push("force-dynamic");
  if (tem(/\bexport\s+const\s+revalidate\s*=/)) flags.push("isr");
  if (tem(/generateMetadata\s*\(/)) flags.push("metadata");
  if (tem(/Suspense/)) flags.push("suspense");
  // JSX no retorno = tem tela de verdade. Componente sem JSX que só chama
  // redirect/notFound é resolver.
  //
  // `return\s*\(?\s*<` cobre as três formas usadas no repo: `return (<div>`,
  // `return <Cliente ... />` (a mais comum em page.tsx, e a que a primeira
  // versão deste script NÃO reconhecia — daí 125 telas em vez de 155) e
  // `return cond ? <A/> : <B/>`.
  if (/\breturn\s*\(?\s*</.test(fonte) || /\.jsx\s*\(/.test(fonte)) flags.push("jsx");
  return flags;
}

function metodosDe(fonte: string): string[] {
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].filter((m) =>
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`).test(fonte),
  );
}

const GRUPOS: [RegExp, string][] = [
  [/^\/admin/, "administração"],
  [/^\/api/, "api"],
  [/^\/onboarding/, "onboarding"],
  [/^\/(login|signup|legal|team|o\/|403|500|503|account-suspended|design|vitrine-agenda)/, "público e legal"],
  [/^\/app\/fiscal/, "fiscal"],
  [/^\/app\/ai/, "ia"],
  [/^\/app\/(expedicao|frota)/, "expedição"],
  [/^\/app\/(pedidos|products|estoque|compras)/, "vendas e catálogo"],
  [/^\/app\/(financeiro|titulos|comissoes|faturamento)/, "financeiro"],
  [/^\/app\/(contacts|leads|kanban|pipelines|carteira)/, "crm"],
  [/^\/app\/(inbox|campanhas)/, "atendimento"],
  [/^\/app\/(radar|prospeccao|recuperacao|venda-automatica)/, "receita"],
  [/^\/app\/(indicadores|metrics|relatorios|inteligencia|laboratorio)/, "insights"],
  [
    /^\/app\/(settings|team|audit|lgpd|connections|webhooks|templates|integrations)/,
    "configuração",
  ],
];

function grupoDe(rota: string): string {
  for (const [re, grupo] of GRUPOS) if (re.test(rota)) return grupo;
  return rota.startsWith("/app") ? "app (outros)" : "público e legal";
}

function varrer(dir: string, itens: Item[]): void {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada === ".next") continue;
    const caminho = join(dir, entrada);
    const st = statSync(caminho);
    if (st.isDirectory()) {
      varrer(caminho, itens);
      continue;
    }
    const ESPECIAIS = /^(manifest|sitemap|robots|icon|apple-icon|opengraph-image|twitter-image)\.(ts|tsx|png|svg|jpg)$/;
    const ESTADOS = /^(error|global-error|not-found|loading|template|default)\.tsx$/;
    if (!/^(page|layout|route)\.tsx?$/.test(entrada) && !ESPECIAIS.test(entrada) && !ESTADOS.test(entrada))
      continue;
    const fonte = /\.(png|svg|jpg)$/.test(entrada) ? "" : readFileSync(caminho, "utf8");
    const rota = rotaDoDiretorio(dir);
    const flags = flagsDe(fonte);
    const tipo: Tipo = /^(page|layout|route)\.tsx?$/.test(entrada)
      ? entrada.startsWith("layout")
        ? "layout"
        : entrada.startsWith("route")
          ? "api"
          : flags.includes("jsx")
            ? "tela"
            : flags.includes("redirect") || flags.includes("redirect-301")
              ? "resolver"
              : "tela"
      : ESTADOS.test(entrada)
        ? entrada.startsWith("loading") || entrada.startsWith("template") || entrada.startsWith("default")
          ? "estado"
          : "erro"
        : "arquivo-especial";
    itens.push({
      tipo,
      rota,
      arquivo: relative(RAIZ, caminho),
      grupo: grupoDe(rota),
      ...(tipo === "api" ? { metodos: metodosDe(fonte) } : {}),
      flags: flags.filter((f) => f !== "jsx"),
      linhas: fonte.split("\n").length,
    });
  }
}

function contarMigracoes() {
  const dir = join(RAIZ, "supabase", "migrations");
  const arquivos = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const comNumero = arquivos.map((f) => {
    const m = /^(\d{14})_(\d{4})_(.+)\.sql$/.exec(f);
    return { arquivo: f, ts: m?.[1] ?? "", numero: m?.[2] ?? "????", nome: m?.[3] ?? f };
  });
  const numerosDuplicados = new Map<string, string[]>();
  for (const m of comNumero) {
    const atual = numerosDuplicados.get(m.numero) ?? [];
    atual.push(m.arquivo);
    numerosDuplicados.set(m.numero, atual);
  }
  const duplicadas = [...numerosDuplicados.entries()].filter(([, v]) => v.length > 1);
  return {
    total: arquivos.length,
    primeira: comNumero[0]?.arquivo ?? null,
    ultima: comNumero[comNumero.length - 1]?.arquivo ?? null,
    semPadrao: comNumero.filter((m) => !m.ts).map((m) => m.arquivo),
    duplicadas: duplicadas.map(([numero, arquivos]) => ({ numero, arquivos })),
  };
}

function contarTestes() {
  const grupos: Record<string, string[]> = {};
  const visitar = (dir: string) => {
    for (const entrada of readdirSync(dir)) {
      const caminho = join(dir, entrada);
      const st = statSync(caminho);
      if (st.isDirectory()) {
        if (entrada === "node_modules" || entrada === ".next") continue;
        visitar(caminho);
        continue;
      }
      if (!/\.(test|spec)\.(ts|tsx|sh)$/.test(entrada)) continue;
      const partes = relative(RAIZ, caminho).split(sep);
      const chave = partes[0] === "tests" ? `tests/${partes[1] ?? ""}` : partes[0] ?? "?";
      (grupos[chave] ??= []).push(relative(RAIZ, caminho));
    }
  };
  for (const raiz of ["tests", "lib", "app", "components", "workers", "scripts"]) {
    try {
      visitar(join(RAIZ, raiz));
    } catch {
      // diretório ausente não é erro de inventário
    }
  }
  return Object.fromEntries(
    Object.entries(grupos)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([k, v]) => [k, v.length]),
  );
}

function contarComponentes() {
  const dir = join(RAIZ, "components");
  const grupos: Record<string, number> = {};
  const visitar = (d: string) => {
    for (const entrada of readdirSync(d)) {
      const caminho = join(d, entrada);
      const st = statSync(caminho);
      if (st.isDirectory()) {
        visitar(caminho);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entrada)) continue;
      const chave = relative(dir, caminho).split(sep)[0] ?? "?";
      grupos[chave] = (grupos[chave] ?? 0) + 1;
    }
  };
  try {
    visitar(dir);
  } catch {
    // diretório ausente não é erro de inventário
  }
  return Object.fromEntries(Object.entries(grupos).sort((a, b) => b[1] - a[1]));
}

/** Prefixo de 4 segmentos: `/api/v1/ai` agrupa os 68 handlers de IA. */
function agruparApis(lista: Item[]): Record<string, number> {
  const contagem: Record<string, number> = {};
  for (const a of lista) {
    const chave = a.rota.split("/").slice(0, 4).join("/");
    contagem[chave] = (contagem[chave] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(contagem).sort((a, b) => b[1] - a[1]));
}

const itens: Item[] = [];
varrer(join(RAIZ, "app"), itens);
itens.sort((a, b) => a.rota.localeCompare(b.rota) || a.arquivo.localeCompare(b.arquivo));

const telas = itens.filter((i) => i.tipo === "tela");
const resolvers = itens.filter((i) => i.tipo === "resolver");
const apis = itens.filter((i) => i.tipo === "api");
const layouts = itens.filter((i) => i.tipo === "layout");
const estados = itens.filter((i) => i.tipo === "estado");
const erros = itens.filter((i) => i.tipo === "erro");
const especiais = itens.filter((i) => i.tipo === "arquivo-especial");

const resumo = {
  gerado_em: new Date().toISOString(),
  commit: process.env.GIT_COMMIT ?? null,
  telas: telas.length,
  resolvers: resolvers.length,
  apis: apis.length,
  layouts: layouts.length,
  erros: erros.length,
  estados: estados.length,
  arquivos_especiais: especiais.length,
  migrations: contarMigracoes(),
  testes: contarTestes(),
  componentes: contarComponentes(),
  apis_por_prefixo: agruparApis(apis),
  telas_por_grupo: Object.fromEntries(
    [...new Set(telas.map((t) => t.grupo))].sort().map((g) => [g, telas.filter((t) => t.grupo === g).length]),
  ),
};

/**
 * Recontagem auditável: o baseline é uma LISTA DE CAMINHOS Versionada, não um
 * número digitado à mão. O doc 06-apis dizia 419 handlers em 17/11; aqui se
 * compara arquivo por arquivo com o checkout daquele dia, para que "419 → 440"
 * seja explicado por rotas nomeadas, não por palpite de área.
 */
const BASELINE_APIS = join(RAIZ, "scripts", "auditoria", "inventario-baseline-1711.txt");
const RAZOES_DO_DELTA: ReadonlyArray<{ prefixo: string; area: string; razao: string }> = [
  {
    prefixo: "app/api/v1/sentinel/occurrences/[id]/correcao/conversa",
    area: "Sentinel — conversa",
    razao: "Nível 2 para claim parado: simular/aplicar/reverter com CAS e motivo (0328).",
  },
  {
    prefixo: "app/api/v1/sentinel/occurrences/[id]/correcao",
    area: "Sentinel — job",
    razao: "Nível 2 para job travado: simular/aplicar/reverter com CAS (0325).",
  },
  {
    prefixo: "app/api/v1/sentinel/",
    area: "Sentinel — detecção",
    razao: "Rodada, ocorrências e config: Nível 1 do sistema vivo (0321–0329).",
  },
  {
    prefixo: "app/api/v1/cron/sentinel",
    area: "Sentinel — cron",
    razao: "Gatilho agendado da rodada; organização suspensa é ignorada na origem (0329).",
  },
  {
    prefixo: "app/api/internal/observabilidade/",
    area: "Observabilidade",
    razao: "Sonda sem cookie para o instrumento de métricas.",
  },
  {
    prefixo: "app/api/v1/admin/observabilidade",
    area: "Observabilidade — painel",
    razao: "Painel de SLOs lido por platform_admin, alimentado pela série 0330–0332.",
  },
  {
    prefixo: "app/api/v1/offline-devices/",
    area: "Offline — credencial",
    razao: "Aparelho do APK: token hasheado `nod_...`, escopo e revogação (0322).",
  },
  {
    prefixo: "app/api/v1/device/",
    area: "Offline — shell",
    razao: "Catálogo, identidade e pedidos do APK sem cookie de sessão.",
  },
  {
    prefixo: "app/api/v1/laya/",
    area: "Laya",
    razao: "Health check do agente Laya.",
  },
  {
    prefixo: "app/api/v1/contacts/",
    area: "Contatos",
    razao: "Crédito do cliente e busca de cidades — apoio à venda.",
  },
];

if (SO_CHECK) {
  console.log(JSON.stringify(resumo, null, 2));
} else {
  mkdirSync(SAIDA_DIR, { recursive: true });
  writeFileSync(join(SAIDA_DIR, "inventario.json"), JSON.stringify({ resumo, itens }, null, 2) + "\n");

  const linhas: string[] = [];
  linhas.push("# Inventário gerado — rotas do checkout");
  linhas.push("");
  linhas.push("> **Gerado por comando, não escrito à mão.** `pnpm exec tsx scripts/auditoria/inventario.ts`");
  linhas.push("> reescreve este arquivo e `inventario.json`. Se um número aqui divergir do código, o");
  linhas.push("> comando está certo e o texto envelheceu — rode de novo.");
  linhas.push("");
  linhas.push(`Gerado em ${resumo.gerado_em}.`);
  linhas.push("");
  linhas.push("| Medida | Valor |");
  linhas.push("|---|---|");
  linhas.push(`| Telas (\`page.tsx\` com JSX) | **${telas.length}** |`);
  linhas.push(`| Resolvers/redirects (sem JSX) | ${resolvers.length} |`);
  linhas.push(`| Handlers de API (\`app/api/**/route.ts\`) | **${apis.length}** |`);
  linhas.push(`| Layouts | ${layouts.length} |`);
  linhas.push(`| Páginas de erro (\`error.tsx\`) | ${erros.length} |`);
  linhas.push(`| Estados de rota (\`loading\`/\`not-found\`/\`template\`/\`default\`) | ${estados.length} |`);
  linhas.push(`| Arquivos especiais (manifest/sitemap/robots/ícones) | ${especiais.length} |`);
  linhas.push(`| Migrations SQL | ${resumo.migrations.total} |`);
  linhas.push("");
  linhas.push("## Telas por grupo");
  linhas.push("");
  linhas.push("| Grupo | Telas |");
  linhas.push("|---|---|");
  for (const [grupo, n] of Object.entries(resumo.telas_por_grupo)) linhas.push(`| ${grupo} | ${n} |`);
  linhas.push("");
  linhas.push("## APIs por prefixo");
  linhas.push("");
  linhas.push("Prefixo de quatro segmentos; agrupa o que o router separa em dezenas de arquivos.");
  linhas.push("");
  linhas.push("| Prefixo | Handlers |");
  linhas.push("|---|---|");
  for (const [pref, n] of Object.entries(resumo.apis_por_prefixo)) linhas.push(`| \`${pref}\` | ${n} |`);
  linhas.push("");
  linhas.push("## Componentes por diretório");
  linhas.push("");
  linhas.push("| Diretório em `components/` | Arquivos `.ts`/`.tsx` |");
  linhas.push("|---|---|");
  for (const [grupo, n] of Object.entries(resumo.componentes)) linhas.push(`| \`${grupo}\` | ${n} |`);
  linhas.push("");

  const secao = (titulo: string, lista: Item[], comMetodos = false) => {
    linhas.push(`## ${titulo} (${lista.length})`);
    linhas.push("");
    linhas.push(
      comMetodos ? "| Rota | Métodos | Flags | Linhas | Arquivo |" : "| Rota | Flags | Linhas | Arquivo |",
    );
    linhas.push(comMetodos ? "|---|---|---|---|---|" : "|---|---|---|---|");
    for (const i of lista) {
      const f = i.flags.join(", ") || "—";
      linhas.push(
        comMetodos
          ? `| \`${i.rota}\` | ${i.metodos?.join("/") || "—"} | ${f} | ${i.linhas} | \`${i.arquivo}\` |`
          : `| \`${i.rota}\` | ${f} | ${i.linhas} | \`${i.arquivo}\` |`,
      );
    }
    linhas.push("");
  };

  const baseline = new Set(
    readFileSync(BASELINE_APIS, "utf8").split("\n").map((s) => s.trim()).filter(Boolean),
  );
  const apisNaApi = apis.filter((i) => i.arquivo.startsWith(`app/api${sep}`));
  const novas = apisNaApi.filter((i) => !baseline.has(i.arquivo));
  const sumidas = [...baseline].filter((caminho) => !apisNaApi.some((i) => i.arquivo === caminho));

  secao("Telas", telas);
  secao("Resolvers e redirects", resolvers);
  secao("APIs", apis, true);

  linhas.push(`## Delta de handlers desde o baseline de 17/11 (${baseline.size} → ${apisNaApi.length})`);
  linhas.push("");
  linhas.push(
    "Baseline = lista versionada de caminhos (`scripts/auditoria/inventario-baseline-1711.txt`), " +
      "não um número decorado. O total do gerador acima inclui dois `route.ts` fora de " +
      "`app/api` (`/auth/confirm`, `/icone-512`); esta seção compara só `app/api/**`.",
  );
  linhas.push("");
  linhas.push("| Área | Novas | Por que entraram | Rotas |");
  linhas.push("|---|---:|---|---|");
  const grupos = new Map<string, { razao: string; rotas: string[] }>();
  for (const rota of novas) {
    const motivo = RAZOES_DO_DELTA.find((r) => rota.arquivo.startsWith(r.prefixo));
    const area = motivo?.area ?? "Outros";
    const grupo = grupos.get(area) ?? { razao: motivo?.razao ?? "Sem razão declarada.", rotas: [] };
    grupo.rotas.push(`\`${rota.rota}\``);
    grupos.set(area, grupo);
  }
  for (const [area, grupo] of grupos) {
    linhas.push(`| ${area} | ${grupo.rotas.length} | ${grupo.razao} | ${grupo.rotas.join("<br>")} |`);
  }
  linhas.push("");
  linhas.push(
    sumidas.length === 0
      ? "Nenhuma rota removida no período — o delta é só acréscimo."
      : `Removidas: ${sumidas.map((c) => `\`${c}\``).join(", ")}.`,
  );
  linhas.push("");
  secao("Layouts", layouts);
  secao("Estados de rota", estados);
  secao("Páginas de erro", erros);
  secao("Arquivos especiais", especiais);

  writeFileSync(join(SAIDA_DIR, "inventario-rotas.md"), linhas.join("\n") + "\n");
  console.log(
    `ok: ${telas.length} telas, ${resolvers.length} resolvers, ${apis.length} APIs, ${layouts.length} layouts, ${resumo.migrations.total} migrations`,
  );
}
