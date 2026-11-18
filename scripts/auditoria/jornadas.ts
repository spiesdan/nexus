/**
 * J1–J16 DO PROMPT × SPECS × RESULTADO MEDIDO.
 *
 * ─── POR QUE UM SCRIPT, E NÃO UMA TABELA DIGITADA ──────────────────────────
 *
 * `13-jornadas.md` precisa dizer, para cada uma das 16 jornadas do prompt,
 * **quantos testes existem** e **quantos passaram**. Os dois números mudam a
 * cada `test()` novo e a cada execução. Digitados à mão, envelhecem na primeira
 * spec que entra — e uma tabela de cobertura que envelhece silenciosamente é
 * pior que tabela nenhuma, porque é lida como medida.
 *
 * Aqui: o **mapeamento** jornada → specs é decisão (fica no código, revisável);
 * a **contagem** vem do disco (`tests/e2e/suites/full.txt` + regex nos specs);
 * o **resultado** vem do log do Playwright, quando um log é passado.
 *
 * ─── O QUE ELE NÃO FAZ ─────────────────────────────────────────────────────
 *
 * Não decide se uma jornada "está coberta". Contar testes não é provar jornada:
 * 12 testes de convite não provam que o WhatsApp conecta. A cobertura real é
 * julgada no `.md`, com o que cada spec declara medir — e o que fica de fora
 * também está escrito lá.
 *
 * Uso:
 *   pnpm exec tsx scripts/auditoria/jornadas.ts                     # só o disco
 *   pnpm exec tsx scripts/auditoria/jornadas.ts --log /tmp/e2e.out  # com resultado
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Specs que NÃO pertencem a uma jornada — e por que isso é legítimo.
 *
 * Estas provam um **contrato transversal**: valem para toda tela, não para um
 * fluxo. `rbac-roles` não é "a jornada de permissões"; é a régua de papel que
 * atravessa todas. Deixá-las de fora da tabela sem dizer nada faria
 * `99 − 68 = 31` parecer lacuna de mapeamento; nomeá-las é o que separa
 * "não classifiquei" de "não é classificação de jornada".
 */
export const TRANSVERSAIS: Record<string, string> = {
  "abas-canonicas-nas-telas": "contrato de abas (6 telas) — vale para todas",
  "error-pages": "404/403/500/503 + documentos legais",
  "filterbar-unica-nas-listas": "contrato de barra de filtros (compras/estoque/carteira)",
  "form-field-canonico": "contrato de formulário nos 7 forms de configuração",
  "icone-da-marca": "marca: ícone/favicon/PWA",
  "marca-logo": "marca: logo e tema",
  navegacao: "shell, menu, ⌘K, gaveta no celular",
  "olhar-telas-do-epico": "varredura visual de telas do épico",
  "qa-telas-descobertas-w4": "varredura de telas descobertas",
  "qa-selo-no-funil-usado": "selo de qualidade do funil em uso",
  "rbac-roles": "régua de papel (owner/manager/agent) que atravessa tudo",
  smoke: "fumaça do produto",
  "axe-telas-principais": "acessibilidade (axe) nas 8 telas de operação — vale para todas",
  "campanhas-tela": "contrato de subtela (Campanha/Prospecção) e persistência da escolha — F-27",
  "meu-dia-alertas": "alertas do Meu Dia (transversal ao painel)",
  "sentinel-painel": "saúde do produto — ocorrências, plano revisável e kill switch atravessam todas as jornadas",
  "inbox-tempo-real": "realtime do inbox — FORA_DO_CI (conta Google de teste)",
  "vps-fresh-onboarding": "instalação fresca — FORA_DO_CI (WAHA/Redis/Resend/Nuvemshop)",
  "mobile-offline": "shell offline — workflow próprio (apk.yml)",
};

export interface Jornada {
  id: string;
  /** Texto do prompt, sem reescrita. */
  titulo: string;
  /** Specs que a exercitam (basename sem `.spec.ts`). */
  specs: string[];
  /** Specs que rodam em OUTRO workflow, e por isso não aparecem no full. */
  outroWorkflow?: { specs: string[]; workflow: string; motivo: string };
}

export const JORNADAS: Jornada[] = [
  {
    id: "J1",
    titulo: "login, recuperação de acesso, MFA e convite de usuário",
    specs: [
      "auth",
      "password-recovery",
      "reset-password-mfa",
      "mfa-opcional",
      "invite-lifecycle",
      "signup-journey",
    ],
  },
  {
    id: "J2",
    titulo: "onboarding do tenant, configuração de funil, equipe, WhatsApp, Nuvemshop e IA",
    specs: ["wizard-do-funcionario", "troca-de-organizacao-tem-volta"],
    outroWorkflow: {
      specs: ["vps-fresh-onboarding"],
      workflow: "fora do CI (FORA_DO_CI)",
      motivo:
        "WAHA, Redis, Resend e Nuvemshop reais — nenhum desses serviços existe no runner. É a P0 da doutrina de QA e a única jornada sem gate.",
    },
  },
  {
    id: "J3",
    titulo: "captura, qualificação e atribuição de lead",
    specs: [
      "conversa-vira-lead",
      "historico-de-captacao",
      "distribuicao-atendimento",
      "queue-assign",
      // Qualificação É o radar: risco, recompra, oportunidade e campanha são a
      // régua que separa quem merece atenção agora. Deixá-los fora da J3 e
      // chamá-los de "transversais" esconderia a única superfície de
      // qualificação que existe no produto.
      "risk-radar",
      "recompra-radar",
      "prospeccao-radar",
      "prospeccao-mapa",
      "campanha-controle-entrega",
    ],
  },
  {
    id: "J4",
    titulo: "mover lead entre etapas, agendar próximo passo e registrar resultado",
    specs: [
      "pipelines-gestao",
      "gatilho-de-etapa",
      "agenda-marcar-pela-tela",
      "agenda-remarcar-e-cancelar",
      "agenda-ver-na-agenda",
      "kanban-owner-filter",
      "meu-dia",
      // A agenda inteira é "agendar o próximo passo": marcar, remarcar,
      // cancelar, achar o caminho até os horários, as três visões, o Google.
      "agenda-caminho-ate-os-horarios",
      "agenda-escopo-da-organizacao",
      "agenda-grade-interativa",
      "agenda-kit-visual",
      "agenda-painel-cabe-na-tela",
      "agenda-tela-do-produto",
      "agenda-tipos-de-agendamento",
      "agenda-conectar-google",
      "agenda-google-volta-do-consentimento",
      "agenda-google-volta-nao-desloga",
    ],
  },
  {
    id: "J5",
    titulo: "buscar ou criar contato, revisar Customer 360 e histórico",
    specs: ["contato-salva-email", "confirmar-dado-do-contato"],
  },
  {
    id: "J6",
    titulo: "receber, atribuir, responder, encaminhar e encerrar conversa no inbox",
    specs: [
      "inbox-scope",
      "inbox-quem-manda",
      "inbox-abas-espelham-o-comando",
      "inbox-responder-citando",
      "queue-assign",
    ],
  },
  {
    id: "J7",
    titulo: "transferir conversa entre IA e pessoa, com contexto, controle e auditoria",
    specs: ["escalacao-ciclo", "inbox-quem-manda"],
  },
  {
    id: "J8",
    titulo:
      "criar/publicar/pausar/rollback de agente, editar conhecimento, testar e avaliar resposta",
    specs: [
      "agente-novo-e-uso",
      "capacidades-do-agente",
      "acervo-de-conhecimento",
      "jornada-ia",
      "agente-marca-consulta",
      "agente-papeis-operador",
      "agente-organiza-operacao",
      "escopo-de-funil-do-agente",
      "credenciais-de-ia",
      "prova-painel-provedores",
      "automacao-diz-a-verdade",
      "qa-agente-usa-as-maos",
    ],
  },
  {
    id: "J9",
    titulo:
      "configurar follow-up e controlar enrollment, pausa, retomada, cancelamento, snooze e falha",
    specs: [
      "followup-builder",
      "followup-queue",
      "followup-ramos",
      "followup-linguagem",
      "followup-tempo-adaptativo",
      "followup-dossie",
      "followup-journey",
      "gatilho-de-etapa",
      "gatilho-de-caso",
    ],
  },
  {
    id: "J10",
    titulo: "criar e processar pedido, aplicar políticas, verificar estoque, cobrança e comissão",
    specs: [
      "jornada-venda",
      "pedido-idempotencia",
      "imprimir-pedidos-mesma-aba",
      "estoque-entrada-saida-e-saldo",
    ],
  },
  {
    id: "J11",
    titulo: "compras, entrada de estoque, expedição, rota, motorista e fechamento",
    specs: [
      "compras-do-rascunho-ao-estoque",
      "estoque-entrada-saida-e-saldo",
      "entrada-do-endereco",
      "jornada-expedicao",
    ],
  },
  {
    id: "J12",
    titulo: "financeiro, títulos, recebimentos e indicadores",
    specs: ["jornada-financeiro", "kpi-e-charts-canonicos", "inteligencia-carrega"],
  },
  {
    id: "J13",
    titulo: "operações fiscais e tratamento de falhas de sincronização",
    specs: ["jornada-fiscal", "notas-fiscais-modulo"],
    outroWorkflow: {
      specs: ["tests/fiscal/**"],
      workflow: "workflow próprio (playwright.fiscal.config.ts)",
      motivo:
        "`playwright.fiscal.config.ts` aponta para `./tests/fiscal` — suíte separada, que NÃO roda nesta execução nem no job `e2e`.",
    },
  },
  {
    id: "J14",
    titulo: "importar/exportar dados, LGPD, solicitações e trilha de auditoria",
    specs: ["auditoria-aceite-11-itens", "responsividade-nas-rotas"],
  },
  {
    id: "J15",
    titulo: "atualizar, configurar integração, revisar erro e recuperar o serviço",
    specs: [
      "system-update",
      "webhooks",
      "central-de-avisos-capacidades",
      "degradacao-silenciosa",
      "retorno-anti-morte",
      "relogio-http-cron-externo",
      "vps-webhook-outbound-ssrf",
      "notificacoes-diz-o-que-falta",
    ],
  },
  {
    id: "J16",
    titulo: "captura de pedido offline, fila, sincronização, conflito e rejeição",
    specs: [],
    outroWorkflow: {
      specs: ["mobile-offline"],
      workflow: "job `apk-debug` do `apk.yml` (playwright.mobile.config.ts)",
      motivo:
        "O shell Capacitor roda em vite dev próprio — `/index.html` não existe no `next start` —, e o job só dispara em `workflow_dispatch` ou PR que toque `mobile/`, `lib/offline/`, `capacitor.config.ts` ou o próprio workflow.",
    },
  },
];

export interface ContagemSpec {
  spec: string;
  declarados: number;
  skip: number;
  ok: number;
  falha: number;
  pulado: number;
  /**
   * Falhas que o próprio spec DECLARA esperar (`test.fail(...)`).
   *
   * `degradacao-silenciosa` usa essa catraca: ele reprova de propósito enquanto
   * a superfície não avisa que a entrega do tempo real morreu. Contar isso como
   * "falha da suíte" inverteria o significado — o vermelho ali é o gate
   * funcionando.
   */
  esperado: number;
  /** Está no full.txt? */
  noFull: boolean;
  /** Existe no disco? */
  noDisco: boolean;
}

/** Conta `test(...)` no arquivo, incluindo `test.skip`/`test.fixme`. */
export function contarNoSpec(
  raiz: string,
  spec: string,
): { declarados: number; skip: number } | null {
  const caminho = join(raiz, "tests", "e2e", `${spec}.spec.ts`);
  if (!existsSync(caminho)) return null;
  const src = readFileSync(caminho, "utf8");
  return {
    declarados: [...src.matchAll(/^\s*test(?:\.(?:skip|fixme|only|slow))?\s*\(\s*["'`]/gm)].length,
    skip: [...src.matchAll(/^\s*test\.(skip|fixme)\s*\(/gm)].length,
  };
}

/** Lê o log do Playwright e devolve ok/falha/pulado por spec. */
export function lerLog(log: string): Map<string, { ok: number; falha: number; pulado: number }> {
  const porSpec = new Map<string, { ok: number; falha: number; pulado: number }>();
  const re = /^\s*(✓|✘|✗|-)\s+\d+\s+\[chromium\]\s+›\s+tests\/e2e\/([^:]+)\.spec\.ts:\d+:\d+/;
  for (const linha of log.split("\n")) {
    const m = re.exec(linha);
    if (!m) continue;
    const [, marca, spec] = m;
    const e = porSpec.get(spec!) ?? { ok: 0, falha: 0, pulado: 0 };
    if (marca === "✓") e.ok++;
    else if (marca === "-") e.pulado++;
    else e.falha++;
    porSpec.set(spec!, e);
  }
  return porSpec;
}

/** Quantos testes o arquivo declara como "espero que falhem". */
export function esperadosNoSpec(raiz: string, spec: string): number {
  const caminho = join(raiz, "tests", "e2e", `${spec}.spec.ts`);
  if (!existsSync(caminho)) return 0;
  return [...readFileSync(caminho, "utf8").matchAll(/\btest\.fail\s*\(/g)].length;
}

export function contarTudo(
  raiz: string,
  spec: string,
  log?: Map<string, { ok: number; falha: number; pulado: number }>,
): ContagemSpec {
  const disco = contarNoSpec(raiz, spec);
  const full = readFileSync(join(raiz, "tests/e2e/suites/full.txt"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const l = log?.get(spec);
  const esperado = Math.min(l?.falha ?? 0, esperadosNoSpec(raiz, spec));
  return {
    spec,
    declarados: disco?.declarados ?? 0,
    skip: disco?.skip ?? 0,
    ok: l?.ok ?? 0,
    falha: (l?.falha ?? 0) - esperado,
    pulado: l?.pulado ?? 0,
    esperado,
    noFull: full.includes(`${spec}.spec.ts`),
    noDisco: disco !== null,
  };
}

/** Uma linha de tabela por jornada — a mesma que o `.md` publica. */
export function tabela(raiz: string, logTexto?: string): string[] {
  const log = logTexto ? lerLog(logTexto) : undefined;
  const linhas: string[] = [
    "| # | Jornada (texto do prompt) | Specs | `test()` no arquivo | ✓ | ✘ | esperado | pulado |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const j of JORNADAS) {
    // `queue-assign` e `gatilho-de-etapa` estão em duas jornadas de propósito:
    // o mesmo teste prova a atribuição (J3/J6) e o gatilho da etapa (J4/J9).
    const contagens = j.specs.map((s) => contarTudo(raiz, s, log));
    const specs = new Set(contagens.map((c) => c.spec)).size;
    const declarados = contagens.reduce((a, c) => a + c.declarados, 0);
    const ok = contagens.reduce((a, c) => a + c.ok, 0);
    const falha = contagens.reduce((a, c) => a + c.falha, 0);
    const esperado = contagens.reduce((a, c) => a + c.esperado, 0);
    const pulado = contagens.reduce((a, c) => a + c.pulado, 0);
    const cel = (n: number) => (log ? String(n) : "—");
    linhas.push(
      `| ${j.id} | ${j.titulo} | ${specs || "0"} | ${declarados} | ${cel(ok)} | ${cel(falha)} | ${cel(esperado)} | ${cel(pulado)} |`,
    );
  }
  return linhas;
}

if (process.argv[1]?.endsWith("jornadas.ts")) {
  const iLog = process.argv.indexOf("--log");
  const logTexto = iLog > 0 ? readFileSync(process.argv[iLog + 1]!, "utf8") : undefined;
  const raiz = process.cwd();

  process.stdout.write(tabela(raiz, logTexto).join("\n") + "\n\n");

  // Specs no disco que não estão em NENHUMA jornada — a lacuna que a tabela
  // não mostra e que ninguém percebe lendo linha por linha.
  const todas = readdirSync(join(raiz, "tests/e2e"))
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => f.replace(".spec.ts", ""));
  // `tests/fiscal/**` do outroWorkflow não é nome de spec no disco: filtrar
  // pelo que existe evita "mapeadas 100 de 99", que faria o número não fechar.
  const mapeadas = new Set(
    [
      ...JORNADAS.flatMap((j) => j.specs),
      ...JORNADAS.flatMap((j) => j.outroWorkflow?.specs ?? []),
      ...Object.keys(TRANSVERSAIS),
    ].filter((s) => todas.includes(s)),
  );
  const orfas = todas.filter((s) => !mapeadas.has(s)).sort();
  process.stdout.write(
    `Specs no disco: ${todas.length} · mapeadas em alguma jornada: ${mapeadas.size}\n`,
  );
  process.stdout.write(
    `Sem jornada e sem classificação (${orfas.length}): ${orfas.join(", ") || "nenhuma"}\n`,
  );
}
