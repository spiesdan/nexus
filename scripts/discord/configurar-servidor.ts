/**
 * BLUEPRINT DO SERVIDOR — deixa o Discord da empresa em padrão de operação.
 *
 * ─── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 * Webhook é mão única: escreve num canal e não enxerga o servidor. Arrumar
 * categoria, canal, cargo e permissão exige BOT com token. Este script aplica
 * um blueprint declarativo e IDEMPOTENTE: rodar duas vezes não duplica nada —
 * cria o que falta, corrige nome/tópico/posição do que existe, e não apaga o
 * que não está no blueprint (apagar canal de alguém por engano é pior do que
 * deixar um canal a mais).
 *
 * ─── O QUE ELE **NÃO** FAZ ────────────────────────────────────────────────
 * Não apaga canal, cargo nem mensagem. Não expulsa ninguém. Não mexe em
 * integrações. Remoção é decisão humana, com o `--seco` na mão.
 *
 * ─── SEGREDO ──────────────────────────────────────────────────────────────
 * `DISCORD_BOT_TOKEN` é credencial de ADMINISTRADOR: quem tem, controla o
 * servidor. Fica em `.env.local` (ignorado pelo git) ou no ambiente. O script
 * nunca imprime o token, nem em erro.
 *
 * ─── USO ──────────────────────────────────────────────────────────────────
 *   pnpm exec tsx scripts/discord/configurar-servidor.ts --seco   # mostra o plano
 *   pnpm exec tsx scripts/discord/configurar-servidor.ts          # aplica
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://discord.com/api/v10";

/** Bits de permissão que o blueprint usa (nome → valor). */
const P = {
  CRIAR_CONVITE: 1n << 0n,
  GERENCIAR_CANAIS: 1n << 4n,
  GERENCIAR_SERVIDOR: 1n << 5n,
  VER_CANAL: 1n << 10n,
  ENVIAR_MENSAGENS: 1n << 11n,
  GERENCIAR_MENSAGENS: 1n << 13n,
  INCORPORAR_LINKS: 1n << 14n,
  ANEXAR_ARQUIVOS: 1n << 15n,
  LER_HISTORICO: 1n << 16n,
  MENCIONAR_TODOS: 1n << 17n,
  USAR_EMOJIS_EXTERNOS: 1n << 18n,
  CONECTAR: 1n << 20n,
  FALAR: 1n << 21n,
  ALTERAR_APELIDO: 1n << 26n,
  GERENCIAR_WEBHOOKS: 1n << 29n,
  USAR_COMANDOS: 1n << 31n,
  CRIAR_THREADS: 1n << 34n,
  ENVIAR_EM_THREADS: 1n << 38n,
} as const;

/**
 * Piso do `@everyone`: o que TODO mundo precisa e nada além.
 *
 * Sem `MENTION_EVERYONE` (um ping em todos por acidente é custo de atenção),
 * sem `MODERATE_MEMBERS` (timeout não é ferramenta de membro comum), sem
 * `GERENCIAR_*` e sem `CRIAR_CONVITE` (convite é ato de quem administra).
 */
const PISO_EVERYONE = somaBits(
  P.VER_CANAL,
  P.ENVIAR_MENSAGENS,
  P.INCORPORAR_LINKS,
  P.ANEXAR_ARQUIVOS,
  P.LER_HISTORICO,
  P.USAR_EMOJIS_EXTERNOS,
  P.CONECTAR,
  P.FALAR,
  P.ALTERAR_APELIDO,
  P.USAR_COMANDOS,
  P.CRIAR_THREADS,
  P.ENVIAR_EM_THREADS,
);

const soma = (...bits: bigint[]): string => bits.reduce((a, b) => a | b, 0n).toString();

/** Mesma soma, mas devolvendo bigint — para compor antes de virar string. */
function somaBits(...bits: bigint[]): string {
  return bits.reduce((a, b) => a | b, 0n).toString();
}

/** Leitura comum: todo mundo vê e lê; ninguém escreve. */
const SOMENTE_LEITURA = {
  allow: soma(P.VER_CANAL, P.LER_HISTORICO),
  deny: soma(P.ENVIAR_MENSAGENS, P.CRIAR_THREADS, P.ENVIAR_EM_THREADS),
};

/** Canal de conversa: todo mundo vê, lê, escreve, anexa e reage. */
const CONVERSA = {
  allow: soma(P.VER_CANAL, P.LER_HISTORICO, P.ENVIAR_MENSAGENS, P.INCORPORAR_LINKS, P.ANEXAR_ARQUIVOS),
  deny: soma(P.MENCIONAR_TODOS),
};

type TipoCanal = 0 | 2 | 4 | 5; // texto · voz · categoria · anúncio

interface CanalPlano {
  nome: string;
  tipo: TipoCanal;
  topico?: string;
  categoria?: string;
  /** id do canal existente que deve ser RENOMEADO em vez de recriado. */
  reaproveitarId?: string;
  somenteLeitura?: boolean;
}

interface CargoPlano {
  nome: string;
  cor: number;
  /** permissões de servidor (fora de canal). */
  permissoes: bigint;
  mencionavel: boolean;
}

/**
 * O DESENHO. Editar aqui é editar o servidor — por isso ele é curto e legível.
 * Áreas seguem o produto: quem entra precisa achar em 3 segundos onde falar.
 */
const CATEGORIAS: CanalPlano[] = [
  { nome: "📌 Início", tipo: 4 },
  { nome: "🚀 Produto", tipo: 4 },
  { nome: "🛠️ Engenharia", tipo: 4 },
  { nome: "🤝 Comercial", tipo: 4 },
  { nome: "🆘 Suporte", tipo: 4 },
  { nome: "🔊 Voz", tipo: 4 },
];

const CANAIS: CanalPlano[] = [
  // Início
  { nome: "boas-vindas", tipo: 0, categoria: "📌 Início", somenteLeitura: true, topico: "O que é este servidor e por onde começar." },
  { nome: "avisos", tipo: 5, categoria: "📌 Início", somenteLeitura: true, topico: "Comunicados da empresa. Só a liderança publica." },
  { nome: "regras", tipo: 0, categoria: "📌 Início", somenteLeitura: true, topico: "Regras de convivência e de segurança da informação." },

  // Produto
  {
    nome: "atualizacoes",
    tipo: 0,
    categoria: "🚀 Produto",
    somenteLeitura: true,
    topico: "Feed automático: toda mudança no produto entra aqui.",
    // O webhook já aponta para este canal — renomear, nunca recriar.
    reaproveitarId: process.env.DISCORD_CANAL_ATUALIZACOES_ID ?? "1571693710486409381",
  },
  { nome: "releases", tipo: 5, categoria: "🚀 Produto", somenteLeitura: true, topico: "Versões publicadas, com tag, data e o que mudou." },
  { nome: "roadmap", tipo: 0, categoria: "🚀 Produto", topico: "O que está em construção e o que vem depois." },
  { nome: "duvidas-de-produto", tipo: 0, categoria: "🚀 Produto", topico: "Como usar, o que faz, o que não faz." },

  // Engenharia
  { nome: "engenharia", tipo: 0, categoria: "🛠️ Engenharia", topico: "Trabalho técnico em andamento." },
  { nome: "incidentes", tipo: 0, categoria: "🛠️ Engenharia", topico: "Um incidente por thread: sintoma, impacto, correção, prevenção." },
  { nome: "qualidade", tipo: 0, categoria: "🛠️ Engenharia", topico: "Testes, cobertura, flaky, regressões." },

  // Comercial
  { nome: "comercial", tipo: 0, categoria: "🤝 Comercial", topico: "Pipeline, propostas e fechamento." },
  { nome: "clientes", tipo: 0, categoria: "🤝 Comercial", topico: "Contexto de conta. Nunca cole dado pessoal sensível aqui." },

  // Suporte
  { nome: "suporte", tipo: 0, categoria: "🆘 Suporte", topico: "Atendimento ao cliente. Uma thread por caso." },
  { nome: "bugs", tipo: 0, categoria: "🆘 Suporte", topico: "Defeito relatado com passos para reproduzir." },

  // Voz
  { nome: "Reunião", tipo: 2, categoria: "🔊 Voz" },
];

const CARGOS: CargoPlano[] = [
  { nome: "Liderança", cor: 0x4f46e5, permissoes: P.VER_CANAL | P.LER_HISTORICO | P.ENVIAR_MENSAGENS | P.GERENCIAR_MENSAGENS, mencionavel: true },
  { nome: "Engenharia", cor: 0x0f766e, permissoes: P.VER_CANAL | P.LER_HISTORICO | P.ENVIAR_MENSAGENS | P.ANEXAR_ARQUIVOS, mencionavel: true },
  { nome: "Comercial", cor: 0xb45309, permissoes: P.VER_CANAL | P.LER_HISTORICO | P.ENVIAR_MENSAGENS, mencionavel: true },
  { nome: "Suporte", cor: 0x0369a1, permissoes: P.VER_CANAL | P.LER_HISTORICO | P.ENVIAR_MENSAGENS, mencionavel: true },
  { nome: "Convidado", cor: 0x5e6b82, permissoes: P.VER_CANAL | P.LER_HISTORICO, mencionavel: false },
];

interface CanalApi {
  id: string;
  name: string;
  type: number;
  parent_id: string | null;
  topic?: string | null;
  position: number;
  permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }>;
}

interface CargoApi {
  id: string;
  name: string;
  color: number;
  permissions: string;
  mentionable: boolean;
}

function lerEnv(nome: string): string {
  const doAmbiente = (process.env[nome] ?? "").trim();
  if (doAmbiente) return doAmbiente;
  try {
    for (const linha of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
      const m = new RegExp(`^\\s*${nome}\\s*=\\s*(.*)$`).exec(linha);
      if (m) return (m[1] ?? "").replace(/^"(.*)"$/, "$1").trim();
    }
  } catch {
    // arquivo ausente: a mensagem de erro abaixo explica
  }
  return "";
}

async function api<T>(token: string, metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const resposta = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  // O Discord limita criação de canal; 429 não é falha, é "espere".
  if (resposta.status === 429) {
    const espera = (await resposta.json().catch(() => ({ retry_after: 1 }))) as { retry_after?: number };
    await new Promise((r) => setTimeout(r, Math.ceil((espera.retry_after ?? 1) * 1000) + 250));
    return api<T>(token, metodo, caminho, corpo);
  }
  if (!resposta.ok) {
    const texto = await resposta.text().catch(() => "");
    if (resposta.status === 403) {
      throw new Error(
        `Sem permissão em ${metodo} ${caminho}. O bot precisa de Gerenciar Canais e Gerenciar Cargos, ` +
          `e o cargo dele precisa estar ACIMA dos cargos que ele altera.`,
      );
    }
    throw new Error(`Discord HTTP ${resposta.status} em ${metodo} ${caminho}: ${texto.slice(0, 240)}`);
  }
  return (await resposta.json()) as T;
}

async function main(): Promise<void> {
  const seco = process.argv.includes("--seco");
  const token = lerEnv("DISCORD_BOT_TOKEN");
  const guild = lerEnv("DISCORD_GUILD_ID");

  if (!guild) {
    console.error("DISCORD_GUILD_ID ausente (servidor 1571693710016643193).");
    process.exit(2);
  }

  if (!token) {
    console.log("SEM TOKEN — plano que seria aplicado (nada foi lido do servidor):");
    for (const c of CATEGORIAS) console.log(`  categoria  ${c.nome}`);
    for (const c of CANAIS) console.log(`  ${c.tipo === 2 ? "voz      " : c.tipo === 5 ? "anúncio  " : "texto    "}  ${c.categoria} / #${c.nome}${c.reaproveitarId ? ` (renomeia ${c.reaproveitarId})` : ""}`);
    for (const r of CARGOS) console.log(`  cargo      @${r.nome}`);
    console.log("\nPara aplicar: defina DISCORD_BOT_TOKEN em .env.local (bot com Gerenciar Canais + Gerenciar Cargos).");
    process.exit(0);
  }

  const canais = await api<CanalApi[]>(token, "GET", `/guilds/${guild}/channels`);
  const cargos = await api<CargoApi[]>(token, "GET", `/guilds/${guild}/roles`);
  const servidor = await api<{ name: string; features: string[] }>(token, "GET", `/guilds/${guild}`);

  // Canal de ANÚNCIO (tipo 5) só existe em servidor COMUNIDADE. Servidor comum
  // devolve 400 `BASE_TYPE_CHOICES` no meio da aplicação — e aí metade do
  // blueprint já foi aplicada, que é o pior estado possível. Decidir antes é
  // mais barato que descobrir no meio.
  const aceitaAnuncio = (servidor.features ?? []).includes("NEWS");
  const tipoReal = (tipo: number): number => (tipo === 5 && !aceitaAnuncio ? 0 : tipo);

  const porNome = new Map(canais.map((c) => [c.name, c]));
  const idPorNome = new Map<string, string>();

  /** Registra E imprime na hora: se travar no meio, o que já foi feito está na tela. */
  const plano: string[] = [];
  const registrar = (linha: string): void => {
    plano.push(linha);
    console.log(linha);
  };

  console.log(`servidor: ${servidor.name}${aceitaAnuncio ? "" : " (sem Comunidade: anúncio vira texto)"}\n`);

  // 0) Piso do @everyone — antes de tudo, porque é o que vale para quem não
  //    tem cargo. Servidor aberto com `MENTION_EVERYONE` é servidor que grita.
  const todos = cargos.find((c) => c.id === guild);
  if (todos) {
    if (todos.permissions === PISO_EVERYONE) {
      registrar("= @everyone (piso já correto)");
    } else {
      registrar("+ @everyone (piso: sem mention-everyone, sem timeout, sem gerenciar)");
      if (!seco) await api(token, "PATCH", `/guilds/${guild}/roles/${guild}`, { permissions: PISO_EVERYONE });
    }
  }

  // 1) Categorias
  for (const [indice, cat] of CATEGORIAS.entries()) {
    const existente = porNome.get(cat.nome);
    if (existente) {
      idPorNome.set(cat.nome, existente.id);
      registrar(`= categoria ${cat.nome}`);
      continue;
    }
    registrar(`+ categoria ${cat.nome}`);
    if (seco) continue;
    const criada = await api<CanalApi>(token, "POST", `/guilds/${guild}/channels`, {
      name: cat.nome,
      type: 4,
      position: indice,
    });
    idPorNome.set(cat.nome, criada.id);
  }

  // 2) Canais
  for (const [indice, canal] of CANAIS.entries()) {
    const existente =
      (canal.reaproveitarId ? canais.find((c) => c.id === canal.reaproveitarId) : undefined) ??
      porNome.get(canal.nome);
    const pai = canal.categoria ? idPorNome.get(canal.categoria) : undefined;
    const permissoes = canal.somenteLeitura ? SOMENTE_LEITURA : CONVERSA;
    const overwrites = [{ id: guild, type: 0, ...permissoes }];
    const tipo = tipoReal(canal.tipo);
    const deTexto = tipo === 0; // anúncio rebaixado também é texto

    if (existente) {
      const mudouNome = existente.name !== canal.nome;
      const mudouTopico = (existente.topic ?? "") !== (canal.topico ?? "");
      const mudouPai = pai !== undefined && existente.parent_id !== pai;
      registrar(`= #${canal.nome}${mudouNome ? ` (renomeia de ${existente.name})` : ""}${mudouTopico ? " (tópico)" : ""}${mudouPai ? " (categoria)" : ""}`);
      if (!seco && (mudouNome || mudouTopico || mudouPai)) {
        await api(token, "PATCH", `/channels/${existente.id}`, {
          name: canal.nome,
          topic: canal.topico ?? null,
          ...(pai ? { parent_id: pai } : {}),
          ...(deTexto ? { permission_overwrites: overwrites } : {}),
        });
      }
      idPorNome.set(canal.nome, existente.id);
      continue;
    }

    registrar(`+ #${canal.nome} (${canal.categoria ?? "sem categoria"})`);
    if (seco) continue;
    const criado = await api<CanalApi>(token, "POST", `/guilds/${guild}/channels`, {
      name: canal.nome,
      type: tipo,
      ...(canal.topico ? { topic: canal.topico } : {}),
      ...(pai ? { parent_id: pai } : {}),
      position: indice,
      ...(deTexto ? { permission_overwrites: overwrites } : {}),
    });
    idPorNome.set(canal.nome, criado.id);
  }

  // 3) Cargos
  for (const cargo of CARGOS) {
    const existente = cargos.find((c) => c.name === cargo.nome);
    const permissoes = cargo.permissoes.toString();
    if (existente) {
      const igual = existente.color === cargo.cor && existente.permissions === permissoes;
      registrar(`= @${cargo.nome}${igual ? "" : " (correção)"}`);
      if (!seco && !igual) {
        await api(token, "PATCH", `/guilds/${guild}/roles/${existente.id}`, {
          color: cargo.cor,
          permissions: permissoes,
          mentionable: cargo.mentionable,
        });
      }
      continue;
    }
    registrar(`+ @${cargo.nome}`);
    if (seco) continue;
    await api(token, "POST", `/guilds/${guild}/roles`, {
      name: cargo.nome,
      color: cargo.cor,
      permissions: permissoes,
      mentionable: cargo.mentionable,
      hoist: true,
    });
  }

  // 4) Quem publica onde — o overwrite de canal do @everyone diz "ninguém envia";
  //    sem um allow POR CARGO, "só a liderança publica" vira "ninguém publica".
  const cargosFinais = await api<CargoApi[]>(token, "GET", `/guilds/${guild}/roles`);
  const idCargo = (nome: string): string | undefined => cargosFinais.find((c) => c.name === nome)?.id;
  const lideranca = idCargo("Liderança");
  const canaisFinais = await api<CanalApi[]>(token, "GET", `/guilds/${guild}/channels`);
  const podePublicar = soma(P.ENVIAR_MENSAGENS, P.INCORPORAR_LINKS, P.ANEXAR_ARQUIVOS, P.CRIAR_THREADS, P.ENVIAR_EM_THREADS);

  for (const canal of CANAIS) {
    if (!canal.somenteLeitura || !lideranca) continue;
    const alvo = canaisFinais.find((c) => c.name === canal.nome);
    if (!alvo) continue;

    const desejado = [
      { id: guild, type: 0, allow: SOMENTE_LEITURA.allow, deny: SOMENTE_LEITURA.deny },
      { id: lideranca, type: 0, allow: podePublicar, deny: "0" },
    ];
    const atual = (alvo.permission_overwrites ?? []).map((o) => ({
      id: o.id,
      type: o.type,
      allow: BigInt(o.allow).toString(),
      deny: BigInt(o.deny).toString(),
    }));
    const igual =
      atual.length === desejado.length &&
      desejado.every((d) => atual.some((a) => a.id === d.id && a.allow === d.allow && a.deny === d.deny));

    if (igual) {
      registrar(`= #${canal.nome} (publica: @Liderança)`);
      continue;
    }
    registrar(`+ #${canal.nome} (publica: @Liderança)`);
    if (!seco) await api(token, "PATCH", `/channels/${alvo.id}`, { permission_overwrites: desejado });
  }

  // 5) O que sobrou — visível, NÃO apagado
  const meusCanais = new Set(CANAIS.map((c) => c.nome));
  const minhasCategorias = new Set(CATEGORIAS.map((c) => c.nome));
  const sobras = canais.filter(
    (c) => !meusCanais.has(c.name) && !minhasCategorias.has(c.name) && !c.name.startsWith("TESTE"),
  );
  if (sobras.length > 0) {
    console.log("\nfora do blueprint (não apagados — remoção é decisão humana):");
    for (const s of sobras) {
      const rotulo = s.type === 4 ? "categoria" : s.type === 2 ? "voz      " : "texto    ";
      console.log(`  ${rotulo} #${s.name}`);
    }
  }

  console.log(
    seco
      ? "\n(seco: nada foi alterado)"
      : `\nok: ${plano.filter((l) => l.startsWith("+")).length} criados, ${plano.filter((l) => l.startsWith("=")).length} conferidos`,
  );
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : String(erro));
  process.exit(1);
});
