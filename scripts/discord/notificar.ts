/**
 * CANAL DE ATUALIZAÇÕES — posta no Discord da empresa o que mudou.
 *
 * Regra do usuário (15/11/2026): toda mudança feita nesta frente vai para o
 * canal de atualizações. Não é log de debug: é o registro que o dono do produto
 * lê sem abrir o repositório.
 *
 * ─── SEGREDO ──────────────────────────────────────────────────────────────
 * A URL do webhook é credencial: quem tem o link posta no canal. Ela NUNCA
 * entra no repositório, no documento, no commit ou no log. Este script:
 *   - lê de `DISCORD_WEBHOOK_URL` (ambiente) e, se ausente, de `.env.local`
 *     (arquivo ignorado pelo git — `.gitignore` linha 19, `.env*`);
 *   - valida o formato antes de qualquer requisição;
 *   - não imprime a URL nem em erro: o texto de saída passa por `redigir()`.
 * Vazou? Rotacione o webhook no Discord (Canal → Integrações → Webhooks).
 *
 * ─── USO ──────────────────────────────────────────────────────────────────
 *   pnpm exec tsx scripts/discord/notificar.ts \
 *     --titulo "Fase 0 concluída" \
 *     --texto "typecheck e lint verdes; 1 teste instável registrado." \
 *     --nivel sucesso
 *
 * Níveis: info (padrão) · sucesso · alerta · erro · auditoria
 * Opções: --campo "nome::valor" (repetível) · --rodape "texto" · --seco
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Nivel = "info" | "sucesso" | "alerta" | "erro" | "auditoria";

const CORES: Record<Nivel, number> = {
  info: 0x4f46e5,
  sucesso: 0x15803d,
  alerta: 0xb45309,
  erro: 0xb42318,
  auditoria: 0x0f766e,
};

const EMOJI: Record<Nivel, string> = {
  info: "ℹ️",
  sucesso: "✅",
  alerta: "⚠️",
  erro: "🔴",
  auditoria: "📋",
};

/** Formato aceito pelo Discord; qualquer outra coisa é recusada antes do fetch. */
export function validarUrlWebhook(url: string): boolean {
  return /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d{17,20}\/[\w-]{60,}$/.test(
    url,
  );
}

/** Corta sem quebrar emoji no meio (por code point, não por UTF-16). */
export function truncar(texto: string, limite: number): string {
  const pontos = [...texto];
  return pontos.length <= limite ? texto : pontos.slice(0, limite - 1).join("") + "…";
}

/** Some com a URL do webhook em qualquer texto que vá para tela ou log. */
export function redigir(texto: string, url: string): string {
  return url ? texto.split(url).join("[webhook-oculto]") : texto;
}

export interface Payload {
  username: string;
  allowed_mentions: { parse: never[] };
  embeds: Array<{
    title: string;
    description: string;
    color: number;
    timestamp: string;
    fields?: Array<{ name: string; value: string; inline: boolean }>;
    footer?: { text: string };
  }>;
}

export function montarPayload(entrada: {
  titulo: string;
  texto: string;
  nivel: Nivel;
  campos?: Array<{ nome: string; valor: string }>;
  rodape?: string;
  agora?: Date;
}): Payload {
  return {
    username: "Nexus",
    // Nunca deixa o texto do commit pingar @everyone por acidente.
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: truncar(`${EMOJI[entrada.nivel]} ${entrada.titulo}`, 250),
        description: truncar(entrada.texto, 4000),
        color: CORES[entrada.nivel],
        timestamp: (entrada.agora ?? new Date()).toISOString(),
        ...(entrada.campos?.length
          ? {
              fields: entrada.campos.slice(0, 20).map((c) => ({
                name: truncar(c.nome, 250),
                value: truncar(c.valor, 1000),
                inline: false,
              })),
            }
          : {}),
        ...(entrada.rodape ? { footer: { text: truncar(entrada.rodape, 2000) } } : {}),
      },
    ],
  };
}

/** `process.env` vence; `.env.local` é conveniência local (nunca commitado). */
function lerWebhook(): { url: string; origem: "ambiente" | "arquivo" } {
  const doAmbiente = (process.env.DISCORD_WEBHOOK_URL ?? "").trim();
  if (doAmbiente) return { url: doAmbiente, origem: "ambiente" };
  const caminho = join(process.cwd(), ".env.local");
  try {
    for (const linha of readFileSync(caminho, "utf8").split("\n")) {
      const m = /^\s*DISCORD_WEBHOOK_URL\s*=\s*(.*)$/.exec(linha);
      if (m) return { url: (m[1] ?? "").replace(/^"(.*)"$/, "$1").trim(), origem: "arquivo" };
    }
  } catch {
    // arquivo ausente não é erro: a mensagem abaixo explica o que fazer
  }
  throw new Error(
    "DISCORD_WEBHOOK_URL não definida. Defina no ambiente ou em .env.local (ignorado pelo git).",
  );
}

function argumentos(argv: string[]): {
  valores: Record<string, string>;
  campos: Array<{ nome: string; valor: string }>;
  seco: boolean;
} {
  const valores: Record<string, string> = {};
  const campos: Array<{ nome: string; valor: string }> = [];
  let seco = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--seco") {
      seco = true;
      continue;
    }
    if (!a.startsWith("--")) continue;
    const chave = a.slice(2);
    const valor = argv[i + 1] ?? "";
    i++;
    if (chave === "campo") {
      const [nome, ...resto] = valor.split("::");
      campos.push({ nome: nome ?? "", valor: resto.join("::") });
      continue;
    }
    valores[chave] = valor;
  }
  return { valores, campos, seco };
}

async function main(): Promise<void> {
  const { valores, campos, seco } = argumentos(process.argv.slice(2));
  const titulo = valores.titulo?.trim();
  const texto = valores.texto?.trim();
  if (!titulo || !texto) {
    console.error(
      "uso: notificar.ts --titulo <txt> --texto <txt> [--nivel info] [--campo 'nome::valor'] [--rodape <txt>] [--seco]",
    );
    process.exit(2);
  }
  const nivel = (valores.nivel ?? "info") as Nivel;
  if (!(nivel in CORES)) {
    console.error(`nível inválido: ${nivel}. Use: ${Object.keys(CORES).join(", ")}`);
    process.exit(2);
  }

  const { url, origem } = lerWebhook();
  if (!validarUrlWebhook(url)) {
    // Não imprime a URL: pode ser um token colado no lugar errado.
    console.error(
      "DISCORD_WEBHOOK_URL não parece uma URL de webhook do Discord. Nada foi enviado.",
    );
    process.exit(2);
  }

  const payload = montarPayload({
    titulo,
    texto,
    nivel,
    campos,
    ...(valores.rodape ? { rodape: valores.rodape } : {}),
  });

  if (seco) {
    console.log(JSON.stringify({ origem, payload }, null, 2));
    return;
  }

  const resposta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    console.error(`Discord recusou: HTTP ${resposta.status} ${redigir(corpo.slice(0, 300), url)}`);
    process.exit(1);
  }
  console.log(`enviado (${origem}, ${nivel})`);
}

if (process.argv[1]?.endsWith("notificar.ts")) {
  main().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
  });
}
