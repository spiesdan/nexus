/**
 * INVENTÁRIO COMPLETO — componentes, APIs, integrações, mobile/offline,
 * telas × estados e cobertura de testes.
 *
 * ─── POR QUE GERADO E NÃO ESCRITO ────────────────────────────────────────────
 * Um inventário à mão envelhece no primeiro commit. Este é reescrito por
 * comando e a saída diz o que MEDIU — inclusive quando a medida é fraca.
 *
 * ─── O QUE ELE NÃO FAZ ───────────────────────────────────────────────────────
 * Não julga qualidade nem "verifica em runtime". Um sinal encontrado no arquivo
 * (`isLoading`, `<Tabs`, `toast.error`) é presença de código, não prova de que o
 * estado funciona. Onde é presença, a saída diz "sinal".
 *
 * Uso: pnpm exec tsx scripts/auditoria/inventario-completo.ts
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

// A lista canônica de rotas SEM autenticação de borda. Usar a fonte em vez de
// adivinhar evita o erro que este inventário cometeu na primeira versão:
// rotular `/api/v1/health` como "secret/bearer" porque ela usa `timingSafeEqual`
// para o `?verbose=1`, quando ela é pública DE PROPÓSITO e está documentada.
import { isPublicPath } from "../../lib/auth/public-paths";
import { arquivosDaTela, ehResolver, origemDoEstado, semComentarios } from "./segmento-de-rota";

const RAIZ = process.cwd();
const SAIDA = join(RAIZ, "docs", "auditoria");
mkdirSync(SAIDA, { recursive: true });

const IGNORAR = new Set([
  "node_modules",
  ".next",
  ".git",
  "graphify-out",
  "evidence",
  "loop",
  "out",
]);

function andar(dir: string, filtro: (f: string) => boolean, achados: string[] = []): string[] {
  let itens: string[];
  try {
    itens = readdirSync(dir);
  } catch {
    return achados;
  }
  for (const item of itens) {
    if (IGNORAR.has(item)) continue;
    const completo = join(dir, item);
    let e = false;
    try {
      e = statSync(completo).isDirectory();
    } catch {
      continue;
    }
    if (e) andar(completo, filtro, achados);
    else if (filtro(item)) achados.push(completo);
  }
  return achados;
}

const rel = (caminho: string): string => relative(RAIZ, caminho).split("\\").join("/");
const ler = (caminho: string): string => {
  try {
    return readFileSync(caminho, "utf8");
  } catch {
    return "";
  }
};

const dataHora = new Date().toISOString();
const cabecalho = (titulo: string, fonte: string): string[] => [
  `# ${titulo}`,
  "",
  `> **Gerado por comando**: \`pnpm exec tsx scripts/auditoria/inventario-completo.ts\`.`,
  `> Fonte: \`${fonte}\`. Gerado em ${dataHora}. Não editar à mão.`,
  "",
];

// ─────────────────────────────────────────────────────────────────────────────
// 1.3 COMPONENTES
// ─────────────────────────────────────────────────────────────────────────────
const arquivosComponentes = andar(
  join(RAIZ, "components"),
  (f) => f.endsWith(".tsx") || f.endsWith(".ts"),
);

const grupos = new Map<string, string[]>();
for (const arquivo of arquivosComponentes) {
  const partes = rel(arquivo).split("/");
  const grupo = partes.length > 2 ? partes[1]! : "(raiz)";
  if (!grupos.has(grupo)) grupos.set(grupo, []);
  grupos.get(grupo)!.push(arquivo);
}

/** Sinais de categoria — o nome do arquivo diz o que ele é com precisão suficiente. */
function tipoDoComponente(caminho: string): string {
  const n = basename(caminho).toLowerCase();
  if (/tabela|table|grid|lista|list/.test(n)) return "tabela/lista";
  if (/form|campo|input|select|filtro|busca/.test(n)) return "form/filtro";
  if (/modal|dialog|sheet|drawer|overlay|popover/.test(n)) return "modal/overlay";
  if (/chart|grafico|sparkline|kpi|metrica/.test(n)) return "gráfico/métrica";
  if (/nav|sidebar|menu|tab|breadcrumb/.test(n)) return "navegação";
  if (/card|painel|panel|stat/.test(n)) return "card/painel";
  if (/toast|alerta|alert|aviso|banner/.test(n)) return "feedback";
  if (n.includes(".test.")) return "teste";
  return "outro";
}

const contagemPorTipo = new Map<string, number>();
for (const arquivo of arquivosComponentes) {
  const t = tipoDoComponente(arquivo);
  contagemPorTipo.set(t, (contagemPorTipo.get(t) ?? 0) + 1);
}

const linhasComponentes: string[] = [...cabecalho("Inventário de componentes", "components/**")];
linhasComponentes.push(`**${arquivosComponentes.length} arquivos** em \`components/\`.`);
linhasComponentes.push("");
linhasComponentes.push("## Por diretório");
linhasComponentes.push("");
linhasComponentes.push("| Diretório | Arquivos |");
linhasComponentes.push("|---|---|");
for (const [grupo, lista] of [...grupos.entries()].sort((a, b) => b[1].length - a[1].length)) {
  linhasComponentes.push(`| \`components/${grupo}\` | ${lista.length} |`);
}
linhasComponentes.push("");
linhasComponentes.push(
  "## Por tipo (heurística de nome — o nome é o contrato mais honesto que existe)",
);
linhasComponentes.push("");
linhasComponentes.push("| Tipo | Arquivos |");
linhasComponentes.push("|---|---|");
for (const [tipo, n] of [...contagemPorTipo.entries()].sort((a, b) => b[1] - a[1])) {
  linhasComponentes.push(`| ${tipo} | ${n} |`);
}
linhasComponentes.push("");
linhasComponentes.push("## Design system (shadcn/ui)");
linhasComponentes.push("");
const ui = arquivosComponentes.filter((f) => rel(f).startsWith("components/ui/"));
linhasComponentes.push(`\`components/ui\` tem **${ui.length}** primitivas.`);
linhasComponentes.push("");
linhasComponentes.push("<details><summary>Lista</summary>");
linhasComponentes.push("");
for (const f of ui.sort()) linhasComponentes.push(`- \`${rel(f)}\``);
linhasComponentes.push("");
linhasComponentes.push("</details>");
linhasComponentes.push("");
writeFileSync(join(SAIDA, "05-componentes.md"), linhasComponentes.join("\n") + "\n");

// ─────────────────────────────────────────────────────────────────────────────
// 1.4 APIs
// ─────────────────────────────────────────────────────────────────────────────
const rotasApi = andar(join(RAIZ, "app"), (f) => f === "route.ts" || f === "route.tsx");
const rotasForaDeApi = rotasApi.filter((f) => !rel(f).startsWith("app/api/"));

interface ApiMedida {
  rota: string;
  metodos: string[];
  guarda: string;
  validacao: string;
  efeitos: string[];
  idempotencia: boolean;
  limite: boolean;
}

/**
 * Uma rota que delega (`return changeMemberRole(req, ctx)`) não mostra a guarda
 * no próprio arquivo — ela está no módulo importado. Medir só o arquivo do
 * handler acusou 15 rotas "sem guarda" que na verdade usam `requireRole("admin")`
 * dentro de `_shared.ts`. Falso positivo em auditoria de segurança custa caro:
 * queima tempo de quem vai conferir e ensina a ignorar a lista.
 *
 * Resolve UM nível de import local (`./x`, `../x`, `@/x`) e devolve o texto do
 * arquivo + o dos módulos irmãos que ele importa.
 */
function resolverImportacao(arquivo: string, especificador: string): string | null {
  let base: string;
  if (especificador.startsWith("@/")) base = join(RAIZ, especificador.slice(2));
  else if (especificador.startsWith(".")) base = join(dirname(arquivo), especificador);
  else return null; // pacote npm: não é guarda nossa
  for (const sufixo of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (existsSync(base + sufixo)) return base + sufixo;
  }
  return null;
}

function textoComDependencias(arquivo: string): string {
  const proprio = ler(arquivo);
  const importados = [...proprio.matchAll(/from\s+"([^"]+)"/g)]
    .map((m) => resolverImportacao(arquivo, m[1]!))
    .filter((c): c is string => c !== null);
  const extras = importados.filter((c) => rel(c).startsWith("app/") || rel(c).startsWith("lib/"));
  return [proprio, ...extras.map(ler)].join("\n");
}

const medirApi = (arquivo: string): ApiMedida => {
  const texto = ler(arquivo);
  const amplo = textoComDependencias(arquivo);
  const rota =
    "/" +
    rel(arquivo)
      .replace(/^app\//, "")
      .replace(/\/route\.tsx?$/, "");

  const metodos = [
    ...texto.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/g),
  ]
    .map((m) => m[1]!)
    .filter((v, i, a) => a.indexOf(v) === i);

  const papeis = [...amplo.matchAll(/requireRole\(\s*(?:\[([^\]]*)\]|"([^"]+)"|'([^']+)')/g)]
    .map((m) => (m[1] ?? m[2] ?? m[3] ?? "").replace(/["'\s]/g, ""))
    .filter(Boolean);
  let guarda = "—";
  if (papeis.length > 0) guarda = `requireRole(${[...new Set(papeis)].join("|")})`;
  else if (/requirePlatformAdmin/.test(amplo)) guarda = "platform-admin";
  else if (/requireAuth\(|loadAuthUser\(|getUser\(|resolveActiveOrg\(/.test(amplo))
    guarda = "sessão";
  else if (
    /x-internal-secret|INTERNAL_CRON_SECRET|internalSecret|Bearer|apiToken|api_token|verifyHmac|timingSafeEqual|CRON_SECRET/i.test(
      amplo,
    )
  )
    guarda = "secret/bearer";
  if (/createAdminClient|SUPABASE_SERVICE_ROLE/.test(amplo)) {
    guarda += guarda === "—" ? "service-role" : "+service-role";
  }

  /**
   * Rota pública de BORDA não é rota sem guarda: é rota cuja auth mora dentro
   * dela (HMAC de webhook, Bearer de cron, token na rota). Chamar isso de "—"
   * faria a lista de buracos encher de falso positivo; chamar de "protegida"
   * esconderia as que realmente não checam nada. Então o rótulo é o fato.
   */
  if (isPublicPath(rota)) {
    guarda =
      guarda === "—" || guarda === "service-role"
        ? `pública (auth na rota)`
        : `pública (auth na rota) · ${guarda}`;
  }
  if (
    /\/\[(token|id)\]/i.test(rota) &&
    /decryptWebhookSecret|token/.test(amplo) &&
    /webhooks/.test(rota)
  ) {
    guarda = "token na rota (HMAC/segredo decifrado)";
  }

  const schemas = [
    ...new Set(
      [...texto.matchAll(/([A-Z][A-Za-z0-9]*Schema)\.(?:parse|safeParse|parseAsync)/g)].map(
        (m) => m[1]!,
      ),
    ),
  ];
  const validacao =
    schemas.length > 0
      ? schemas.join(", ")
      : /\.parse\(|safeParse/.test(texto)
        ? "zod inline"
        : "—";

  const efeitos: string[] = [];
  if (/\baudit\(|auditLog|logAudit/.test(texto)) efeitos.push("auditoria");
  if (/\blogEvent|event_log/.test(texto)) efeitos.push("event_log");
  if (/\benqueue|queue|outbox/.test(texto)) efeitos.push("fila");
  if (/fetch\(\s*["'`]https?:/.test(texto)) efeitos.push("HTTP externo");
  if (/\bsendEmail|resend|Resend/.test(texto)) efeitos.push("e-mail");
  if (/\bsupabase\.storage|storage\.from/.test(texto)) efeitos.push("storage");

  return {
    rota,
    metodos: metodos.length > 0 ? metodos : ["(sem export nomeado)"],
    guarda,
    validacao,
    efeitos: efeitos.length > 0 ? efeitos : ["—"],
    idempotencia: /Idempotency-Key|idempotencyKey|idempotency_key/i.test(texto),
    limite: /checkRateLimit|authRateLimited|rateLimit/i.test(texto),
  };
};

const apis = rotasApi.map(medirApi).sort((a, b) => a.rota.localeCompare(b.rota));
const semGuarda = apis.filter((a) => a.guarda === "—");
const porPrefixo = new Map<string, number>();
for (const a of apis) {
  const chave = a.rota.split("/").slice(0, 4).join("/") || a.rota;
  porPrefixo.set(chave, (porPrefixo.get(chave) ?? 0) + 1);
}

const linhasApi: string[] = [...cabecalho("Inventário de APIs", "app/**/route.ts")];
linhasApi.push(
  `**${apis.length} handlers**. Medido no arquivo: métodos exportados, guarda, validação, efeitos declarados.`,
);
linhasApi.push("");
linhasApi.push(
  `São **${apis.length - rotasForaDeApi.length}** em \`app/api/**\` mais **${rotasForaDeApi.length}** fora ` +
    `(${rotasForaDeApi
      .map(
        (f) =>
          `\`${rel(f)
            .replace(/^app\//, "/")
            .replace(/\/route\.ts$/, "")}\``,
      )
      .join(", ")}). ` +
    `Dizer só um dos dois números faz o total parecer divergente — são medidas de coisas diferentes.`,
);
linhasApi.push("");
linhasApi.push("| Medida | Valor |");
linhasApi.push("|---|---|");
linhasApi.push(`| Handlers | ${apis.length} |`);
linhasApi.push(`| Sem nenhuma guarda identificável | ${semGuarda.length} |`);
linhasApi.push(`| Com \`Idempotency-Key\` | ${apis.filter((a) => a.idempotencia).length} |`);
linhasApi.push(`| Com rate limit | ${apis.filter((a) => a.limite).length} |`);
linhasApi.push(
  `| Com \`service role\` | ${apis.filter((a) => a.guarda.includes("service-role")).length} |`,
);
linhasApi.push("");
linhasApi.push("## Por prefixo");
linhasApi.push("");
linhasApi.push("| Prefixo | Handlers |");
linhasApi.push("|---|---|");
for (const [p, n] of [...porPrefixo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  linhasApi.push(`| \`${p}\` | ${n} |`);
}
linhasApi.push("");
linhasApi.push(`## Handlers SEM guarda identificável (${semGuarda.length})`);
linhasApi.push("");
linhasApi.push(
  'Guarda "—" significa que nenhum marcador conhecido apareceu. Pode ser rota pública',
);
linhasApi.push(
  "legítima (webhook com HMAC, healthcheck) ou **buraco**. Cada linha precisa de olho humano.",
);
linhasApi.push("");
linhasApi.push("| Rota | Métodos |");
linhasApi.push("|---|---|");
for (const a of semGuarda) linhasApi.push(`| \`${a.rota}\` | ${a.metodos.join(", ")} |`);
linhasApi.push("");
linhasApi.push(`## Todos os handlers (${apis.length})`);
linhasApi.push("");
linhasApi.push("| Rota | Métodos | Guarda | Validação | Efeitos | Idem. | Limite |");
linhasApi.push("|---|---|---|---|---|---|---|");
for (const a of apis) {
  linhasApi.push(
    `| \`${a.rota}\` | ${a.metodos.join(", ")} | ${a.guarda} | ${a.validacao} | ${a.efeitos.join(", ")} | ${a.idempotencia ? "sim" : "—"} | ${a.limite ? "sim" : "—"} |`,
  );
}
linhasApi.push("");
writeFileSync(join(SAIDA, "06-apis.md"), linhasApi.join("\n") + "\n");
writeFileSync(
  join(SAIDA, "06-apis.json"),
  JSON.stringify(
    { gerado_em: dataHora, total: apis.length, sem_guarda: semGuarda.length, apis },
    null,
    2,
  ) + "\n",
);

// ─────────────────────────────────────────────────────────────────────────────
// 1.6 INTEGRAÇÕES E INFRA
// ─────────────────────────────────────────────────────────────────────────────
const envExample = ler(join(RAIZ, ".env.example"));
const chavesEnv = [...envExample.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]!).sort();

const gruposDeIntegracao: Array<{ nome: string; testes: RegExp; onde: string[] }> = [
  { nome: "WAHA (WhatsApp)", testes: /WAHA_|waha/i, onde: [] },
  { nome: "Meta / WhatsApp Cloud", testes: /META_|graph\.facebook|whatsapp.*cloud/i, onde: [] },
  { nome: "Nuvemshop / Tiendanube", testes: /NUVEMSHOP|tiendanube/i, onde: [] },
  { nome: "Google (Agenda/OAuth)", testes: /GOOGLE_|googleapis|google\.com/i, onde: [] },
  {
    nome: "IA (gateway e provedores)",
    testes: /ANTHROPIC|OPENAI|OPENROUTER|GOOGLE_GENERATIVE|AI_GATEWAY/i,
    onde: [],
  },
  { nome: "Redis / Upstash (fila e rate limit)", testes: /UPSTASH|REDIS/i, onde: [] },
  { nome: "E-mail (Resend)", testes: /RESEND/i, onde: [] },
  { nome: "Sentry", testes: /SENTRY/i, onde: [] },
  { nome: "Mercos", testes: /MERCOS|mercos/i, onde: [] },
  {
    nome: "Mapa (MapLibre / Nominatim / OSM)",
    testes: /MAPLIBRE|nominatim|openstreetmap/i,
    onde: [],
  },
];

const arquivosDeCodigo = [
  ...andar(join(RAIZ, "lib"), (f) => f.endsWith(".ts") || f.endsWith(".tsx")),
  ...andar(join(RAIZ, "app"), (f) => f.endsWith(".ts") || f.endsWith(".tsx")),
  ...andar(join(RAIZ, "workers"), (f) => f.endsWith(".ts")),
  ...andar(join(RAIZ, "components"), (f) => f.endsWith(".ts") || f.endsWith(".tsx")),
];

const textoDe = new Map<string, string>();
for (const arquivo of arquivosDeCodigo) textoDe.set(arquivo, ler(arquivo));

for (const grupo of gruposDeIntegracao) {
  for (const [arquivo, texto] of textoDe) {
    if (grupo.testes.test(texto) && grupo.testes.test(basename(arquivo))) grupo.onde.push(arquivo);
    else if (grupo.testes.test(texto) && !/\.test\./.test(arquivo)) grupo.onde.push(arquivo);
  }
}

const workers = readdirSync(join(RAIZ, "workers")).filter(
  (f) => f.endsWith(".ts") && !f.includes(".test."),
);
const crons = rotasApi
  .map(
    (f) =>
      "/" +
      rel(f)
        .replace(/^app\//, "")
        .replace(/\/route\.tsx?$/, ""),
  )
  .filter((r) => r.includes("/cron/"));

const compose = ler(join(RAIZ, "docker-compose.prod.yml"));
const servicosCompose = [...compose.matchAll(/^ {2}([a-z][a-z0-9_-]+):\s*$/gm)].map((m) => m[1]!);

const linhasIntegracoes: string[] = [
  ...cabecalho(
    "Integrações e infraestrutura",
    "lib/, app/, workers/, .env.example, docker-compose.prod.yml",
  ),
];
linhasIntegracoes.push("## Integrações — quem é chamado de fora");
linhasIntegracoes.push("");
linhasIntegracoes.push("| Integração | Arquivos que a citam |");
linhasIntegracoes.push("|---|---|");
for (const grupo of gruposDeIntegracao) {
  const unicos = [...new Set(grupo.onde)].filter((f) => !/\.test\./.test(f));
  linhasIntegracoes.push(`| ${grupo.nome} | ${unicos.length} |`);
}
linhasIntegracoes.push("");
linhasIntegracoes.push("## Workers (`workers/`)");
linhasIntegracoes.push("");
linhasIntegracoes.push(`**${workers.length}** arquivos.`);
linhasIntegracoes.push("");
for (const w of workers.sort()) linhasIntegracoes.push(`- \`workers/${w}\``);
linhasIntegracoes.push("");
linhasIntegracoes.push(`## Rotas de cron (\`app/api/**/cron/**\`) — ${crons.length}`);
linhasIntegracoes.push("");
for (const c of crons.sort()) linhasIntegracoes.push(`- \`${c}\``);
linhasIntegracoes.push("");
linhasIntegracoes.push("## Serviços do `docker-compose.prod.yml`");
linhasIntegracoes.push("");
if (servicosCompose.length === 0)
  linhasIntegracoes.push("Nenhum serviço reconhecido (arquivo ausente ou formato mudou).");
for (const s of servicosCompose) linhasIntegracoes.push(`- \`${s}\``);
linhasIntegracoes.push("");
linhasIntegracoes.push(
  `## Variáveis de ambiente declaradas em \`.env.example\` — ${chavesEnv.length}`,
);
linhasIntegracoes.push("");
for (const k of chavesEnv) linhasIntegracoes.push(`- \`${k}\``);
linhasIntegracoes.push("");
writeFileSync(join(SAIDA, "07-integracoes.md"), linhasIntegracoes.join("\n") + "\n");

// ─────────────────────────────────────────────────────────────────────────────
// 1.7 MOBILE E OFFLINE
// ─────────────────────────────────────────────────────────────────────────────
const temCapacitor = existsSync(join(RAIZ, "capacitor.config.ts"));
const capacitor = ler(join(RAIZ, "capacitor.config.ts"));
const mobileDir = existsSync(join(RAIZ, "mobile")) ? readdirSync(join(RAIZ, "mobile")) : [];
const sw = ler(join(RAIZ, "public", "sw.js"));
const notifySw = ler(join(RAIZ, "public", "notify-sw.js"));
const outbox = ler(join(RAIZ, "lib", "entregas", "outbox.ts"));
const sqliteUso = andar(join(RAIZ, "lib"), (f) => f.endsWith(".ts")).filter((f) =>
  /capacitor-community\/sqlite|CapacitorSQLite/.test(ler(f)),
);

const linhasMobile: string[] = [
  ...cabecalho(
    "Mobile e offline",
    "capacitor.config.ts, mobile/, public/sw.js, lib/entregas/outbox.ts",
  ),
];
linhasMobile.push("| Peça | Estado medido |");
linhasMobile.push("|---|---|");
linhasMobile.push(`| Capacitor configurado | ${temCapacitor ? "sim" : "não"} |`);
linhasMobile.push(`| \`webDir\` | ${/"webDir":\s*"([^"]+)"/.exec(capacitor)?.[1] ?? "—"} |`);
linhasMobile.push(
  `| \`appName\` declarado no shell | ${/"appName":\s*"([^"]+)"/.exec(capacitor)?.[1] ?? "—"} |`,
);
linhasMobile.push(`| \`appId\` | ${/"appId":\s*"([^"]+)"/.exec(capacitor)?.[1] ?? "—"} |`);
linhasMobile.push(
  `| \`mobile/\` empacotado | ${mobileDir.length > 0 ? mobileDir.join(", ") : "ausente"} |`,
);
linhasMobile.push(
  `| Service worker (\`public/sw.js\`) | ${sw.length > 0 ? `${sw.split("\n").length} linhas` : "ausente"} |`,
);
linhasMobile.push(
  `| Service worker de notificação | ${notifySw.length > 0 ? "presente" : "ausente"} |`,
);
linhasMobile.push(
  `| Fila offline (\`lib/entregas/outbox.ts\`) | ${outbox.length > 0 ? "presente" : "ausente"} |`,
);
linhasMobile.push(`| SQLite nativo usado em | ${sqliteUso.length} arquivo(s) |`);
linhasMobile.push("");
linhasMobile.push("## O que o service worker declara fazer");
linhasMobile.push("");
const comentarioSw = sw
  .split("\n")
  .filter((l) => l.trim().startsWith("*") || l.trim().startsWith("/*"))
  .slice(0, 30)
  .join("\n");
linhasMobile.push("```");
linhasMobile.push(comentarioSw || "(sem comentário de cabeçalho)");
linhasMobile.push("```");
linhasMobile.push("");
linhasMobile.push("## Achado de marca no shell nativo");
linhasMobile.push("");
linhasMobile.push(
  `O \`appName\` acima é o nome que aparece **debaixo do ícone no aparelho**. Se ele carrega marca de cliente/revendedor, ` +
    `isso alcança o usuário final — e o gate \`tests/unit/branding.test.ts\` não vê, porque varre \`app|components|lib|workers|hooks\` ` +
    `e só o nome legado do produto.`,
);
linhasMobile.push("");
writeFileSync(join(SAIDA, "08-mobile-offline.md"), linhasMobile.join("\n") + "\n");

// ─────────────────────────────────────────────────────────────────────────────
// 1.2 / 1.11 TELAS × ESTADOS
// ─────────────────────────────────────────────────────────────────────────────
const telas = andar(join(RAIZ, "app"), (f) => f === "page.tsx");

const SINAIS: Array<{ nome: string; re: RegExp }> = [
  { nome: "carregando", re: /isLoading|loading\.tsx|Suspense|animate-pulse|Skeleton/ },
  { nome: "vazio", re: /vazi[oa]|Vazi[oa]|nenhum |Nenhum |empty|EmptyState/ },
  { nome: "erro", re: /erro|Erro|error|Error|catch\s*\(/ },
  { nome: "permissão", re: /requireRole|permiss|403|forbidden|Forbidden/ },
  { nome: "confirmação", re: /AlertDialog|confirmar|Confirmar|window\.confirm/ },
  { nome: "formulário", re: /<form|useForm|action=\{|<Input|<Textarea|<Select/ },
  { nome: "abas", re: /<Tabs|TabsList|TabsTrigger/ },
  { nome: "modal/drawer", re: /<Dialog|Sheet|Drawer|Modal/ },
  { nome: "filtros", re: /searchParams|filtro|Filtro|Filter/ },
  { nome: "tabela", re: /<Table|<table|DataTable/ },
  { nome: "gráfico", re: /recharts|Sparkline|ChartContainer|(Bar|Line|Pie|Area)Chart|<Chart/ },
  { nome: "tempo real", re: /postgres_changes|\.channel\(|realtime/ },
];

const pastaDaTela = (arquivo: string): string => rel(arquivo).replace(/\/page\.tsx$/, "");

interface TelaMedida {
  pasta: string;
  rotulo: string;
  resolver: boolean;
  arquivos: number;
  truncado: boolean;
  marcas: string[];
  loading: "próprio" | "herdado" | "—";
  error: "próprio" | "herdado" | "—";
}

// O texto vem do SEGMENTO (page + `_client` + `_components`), não do page.tsx.
// Ver scripts/auditoria/segmento-de-rota.ts para o erro que isso corrigiu.
const medidas: TelaMedida[] = telas.map((arquivo) => {
  const pasta = pastaDaTela(arquivo);
  const { arquivos, truncado } = arquivosDaTela(RAIZ, pasta);
  // Comentário não é comportamento — ver `semComentarios` e o número que isso corrigiu.
  const texto = semComentarios(arquivos.map(ler).join("\n"));
  const pagina = ler(arquivo);
  return {
    pasta,
    rotulo: `/${pasta.replace(/^app\//, "")}`.replace(/^\/+/, "/"),
    resolver: ehResolver(pagina),
    arquivos: arquivos.length,
    truncado,
    marcas: SINAIS.map((s) => (s.re.test(texto) ? "✓" : "—")),
    loading: origemDoEstado(RAIZ, pasta, "loading.tsx"),
    error: origemDoEstado(RAIZ, pasta, "error.tsx"),
  };
});

const totalResolvers = medidas.filter((m) => m.resolver).length;
const telasComSinal = medidas.filter(
  (m) => !m.resolver && m.marcas.some((marca) => marca === "✓"),
).length;
const semSinal = medidas.filter((m) => !m.resolver && m.marcas.every((marca) => marca === "—"));

const linhasTelas: string[] = [
  ...cabecalho("Telas × estados — sinais medidos", "app/**/page.tsx + segmento de rota"),
];
linhasTelas.push(
  `**${telas.length} telas.** Uma marca ✓ significa **sinal no código**, não comportamento verificado.`,
);
linhasTelas.push("A verificação de cada estado acontece na Fase 2, com evidência de execução.");
linhasTelas.push("");

// A nota de método é a parte mais importante desta página: sem ela, uma coluna
// vazia parece "o produto não tem estado" em vez de "o detector não olhou".
linhasTelas.push(
  "> **De onde vem o sinal.** O texto analisado é o **segmento de rota inteiro** — a " +
    "`page.tsx` e os arquivos locais dela (`_client.tsx`, `_components/`, `_pills.tsx`…) —, " +
    "sem entrar em subpastas que tenham `page.tsx` próprio, porque essas são **outras telas**. " +
    "A primeira versão lia só a `page.tsx` e produziu uma matriz com todas as células em " +
    "`—`; `/app/pedidos`, por exemplo, tem filtros e tabela no `_client.tsx` e aparecia vazia. " +
    "Regra e caso de regressão em `scripts/auditoria/segmento-de-rota.ts` e " +
    "`tests/unit/matriz-telas-le-segmento.test.ts`.",
);
linhasTelas.push("");
linhasTelas.push(
  `> **O que este número NÃO é.** Ele conta arquivos \`page.tsx\`, ou seja, cobre ROTAS — e das ` +
    `${telas.length}, ${totalResolvers} são resolvers (redirecionam sem JSX) e aparecem marcados. ` +
    "Não é auditoria de subtelas, estados nem jornadas: a matriz abaixo diz onde cada estado " +
    "**aparece no código**, e uma aba, um drawer, um modal ou um fluxo de escrita não viram linha " +
    "nenhuma. Quem lê a matriz como prova de comportamento está lendo uma prova que o artefato não dá.",
);
linhasTelas.push("");
linhasTelas.push(
  `> **\`loading\`/\`error\` distinguem origem.** \`próprio\` = arquivo nesta pasta de rota; ` +
    "`herdado` = arquivo de um segmento acima (inclusive o `app/error.tsx` global); `—` = não " +
    "existe. A versão anterior marcava ✓ em toda tela por causa do fallback global e chamava de " +
    '"tratamento de erro desta tela" o que é um arquivo único do app. Por existir `app/error.tsx`, ' +
    "a coluna `error` **nunca** fica `—`: toda rota tem fallback. O que muda é ser próprio ou herdado.",
);
linhasTelas.push("");
linhasTelas.push(
  `Inclui \`/design\`, o showcase interno do design system — é tela, tem \`page.tsx\` e JSX, e por isso entra na conta. ` +
    `Excluir por parecer "interna" foi como inventários anteriores perderam rotas.`,
);
linhasTelas.push("");
linhasTelas.push(
  semSinal.length === 0
    ? `**Resumo:** ${telasComSinal} das ${telas.length - totalResolvers} telas com JSX têm ao menos um ` +
        "sinal; nenhuma ficou sem sinal depois de medir o segmento e seguir os imports locais."
    : `**Resumo:** ${telasComSinal} das ${telas.length - totalResolvers} telas com JSX têm ao menos um ` +
        `sinal; ${semSinal.length} não têm nenhum, todas com as colunas em \`—\`: ` +
        semSinal.map((m) => `\`${m.rotulo}\``).join(", ") +
        ".",
);
linhasTelas.push("");
linhasTelas.push(
  `| Tela | arquivos | ${SINAIS.map((s) => s.nome).join(" | ")} | loading | error |`,
);
linhasTelas.push(`|---|---|${SINAIS.map(() => "---").join("|")}|---|---|`);
for (const m of medidas) {
  const rotulo = m.resolver ? `\`${m.rotulo}\` *(resolver)*` : `\`${m.rotulo}\``;
  const marcas = m.resolver ? SINAIS.map(() => "n/a") : m.marcas;
  linhasTelas.push(
    `| ${rotulo} | ${m.arquivos}${m.truncado ? " (teto)" : ""} | ${marcas.join(" | ")} | ${m.loading} | ${m.error} |`,
  );
}
linhasTelas.push("");
writeFileSync(join(SAIDA, "09-telas-estados.md"), linhasTelas.join("\n") + "\n");

// ─────────────────────────────────────────────────────────────────────────────
// 1.8 COBERTURA DE TESTES POR ROTA
// ─────────────────────────────────────────────────────────────────────────────
const arquivosDeTeste = [
  ...andar(join(RAIZ, "tests"), (f) => /\.test\.(ts|tsx)$/.test(f)),
  ...andar(join(RAIZ, "app"), (f) => /\.test\.(ts|tsx)$/.test(f)),
  ...andar(join(RAIZ, "lib"), (f) => /\.test\.(ts|tsx)$/.test(f)),
  ...andar(join(RAIZ, "components"), (f) => /\.test\.(ts|tsx)$/.test(f)),
  ...andar(join(RAIZ, "hooks"), (f) => /\.test\.(ts|tsx)$/.test(f)),
  ...andar(join(RAIZ, "workers"), (f) => /\.test\.(ts|tsx)$/.test(f)),
];
const textoDosTestes = arquivosDeTeste.map((f) => `${rel(f)}\n${ler(f)}`).join("\n");

const cobertura = telas.map((arquivo) => {
  const rota =
    "/" +
    rel(arquivo)
      .replace(/^app\//, "")
      .replace(/\/page\.tsx$/, "");
  const pasta = rel(arquivo).replace(/\/page\.tsx$/, "");
  const testeNaPasta = arquivosDeTeste.filter((t) => rel(t).startsWith(pasta + "/"));
  const citada =
    textoDosTestes.includes(`"${rota}`) ||
    textoDosTestes.includes(`'${rota}`) ||
    textoDosTestes.includes("`" + rota);
  return { rota, testeNaPasta: testeNaPasta.map(rel), citada };
});

const semCobertura = cobertura.filter((c) => c.testeNaPasta.length === 0 && !c.citada);

const linhasCobertura: string[] = [
  ...cabecalho("Cobertura de testes por rota", "tests/, app/, lib/, components/, hooks/, workers/"),
];
linhasCobertura.push("| Medida | Valor |");
linhasCobertura.push("|---|---|");
linhasCobertura.push(`| Arquivos de teste encontrados | ${arquivosDeTeste.length} |`);
linhasCobertura.push(`| Telas | ${telas.length} |`);
linhasCobertura.push(
  `| Telas com teste próprio na pasta | ${cobertura.filter((c) => c.testeNaPasta.length > 0).length} |`,
);
linhasCobertura.push(
  `| Telas citadas em algum teste | ${cobertura.filter((c) => c.citada).length} |`,
);
linhasCobertura.push(`| Telas **sem nenhum sinal de teste** | ${semCobertura.length} |`);
linhasCobertura.push("");
linhasCobertura.push("## Método — e o limite dele");
linhasCobertura.push("");
linhasCobertura.push(
  '"Citada" = a rota aparece como string em algum teste. Isso **não** prova que a tela é',
);
linhasCobertura.push(
  "exercitada; prova que alguém a mencionou (às vezes só num comentário). É o teto do que",
);
linhasCobertura.push("dá para medir sem executar. A Fase 2 confirma por execução.");
linhasCobertura.push("");
linhasCobertura.push(`## Telas sem nenhum sinal de teste (${semCobertura.length})`);
linhasCobertura.push("");
for (const c of semCobertura) linhasCobertura.push(`- \`${c.rota}\``);
linhasCobertura.push("");
linhasCobertura.push("## Todas as telas");
linhasCobertura.push("");
linhasCobertura.push("| Tela | Teste na pasta | Citada em teste |");
linhasCobertura.push("|---|---|---|");
for (const c of cobertura) {
  linhasCobertura.push(
    `| \`${c.rota}\` | ${c.testeNaPasta.length > 0 ? c.testeNaPasta.length : "—"} | ${c.citada ? "✓" : "—"} |`,
  );
}
linhasCobertura.push("");
writeFileSync(join(SAIDA, "10-cobertura-testes.md"), linhasCobertura.join("\n") + "\n");

// ─────────────────────────────────────────────────────────────────────────────
// RESUMO NO TERMINAL — o que a auditoria precisa ver primeiro
// ─────────────────────────────────────────────────────────────────────────────
const migrations = readdirSync(join(RAIZ, "supabase", "migrations")).filter((f) =>
  f.endsWith(".sql"),
).length;
console.log(
  [
    `componentes: ${arquivosComponentes.length} (ui: ${ui.length})`,
    `APIs: ${apis.length} · sem guarda identificável: ${semGuarda.length} · idempotência: ${apis.filter((a) => a.idempotencia).length}`,
    `integrações medidas: ${gruposDeIntegracao.length} · workers: ${workers.length} · crons: ${crons.length}`,
    `mobile: capacitor=${temCapacitor} sw=${sw.length > 0} outbox=${outbox.length > 0}`,
    `telas: ${telas.length} · sem sinal de teste: ${semCobertura.length}`,
    `migrations: ${migrations}`,
  ].join("\n"),
);
