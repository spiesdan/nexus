/**
 * PROVA LOCAL DO PÚBLICO DA CAMPANHA — Videira/SC × mecânica.
 *
 * ═══ PARA QUE SERVE ═══════════════════════════════════════════════════════
 *
 * A pergunta é "a fila da campanha está funcional?" e `pnpm test:unit` não
 * responde: ele prova que a FUNÇÃO decide certo, não que ela alcança a base
 * real. São coisas diferentes. Um filtro perfeito sobre um universo errado
 * devolve zero com ar de resposta.
 *
 * Esta prova semeia a base REAL (o dump do scraper, `/tmp/prospects.psv` —
 * 21.668 empresas) e os contatos que a loja JÁ atende
 * (`/tmp/contacts-empresa.psv`) numa organização de descarte no Supabase
 * local, roda `publicoDaBase` — a MESMA função que a rota `/publico` chama, com
 * o MESMO `IndiceDeNomes` de clientes — e imprime o funil. No fim apaga tudo
 * que semeou: o banco local volta ao que estava.
 *
 * As três leituras que ela imprime, e por que cada uma importa:
 *
 *   1. **com WhatsApp** (o que a tela mostra) — o número de hoje.
 *   2. **sem o filtro de WhatsApp** — quantas entram quando a base tiver
 *      telefone. É o número de amanhã: a diferença entre os dois é o que
 *      ainda depende de alguém telefoneiar.
 *   3. **a comparação crua** — quantas a campanha alcançava ANTES da tradução
 *      de categoria. É o defeito, medido no mesmo universo, lado a lado.
 *
 * ═══ O QUE ELA NÃO PROVA ═════════════════════════════════════════════════
 *
 * Não prova que o envio sai. `disparo` tem portão próprio (simulação primeiro,
 * `whatsapp_potencial` reverificado no envio) e a prova disso é outra prova.
 * Aqui o que se prova é o público: quem entra, quem sai e por quê.
 *
 * Uso:
 *   pnpm exec tsx scripts/prova-publico-da-campanha.ts [cidade] [categorias…]
 *   pnpm exec tsx scripts/prova-publico-da-campanha.ts videira "Oficina mecânica"
 */
import { readFileSync } from "node:fs";

import {
  anunciarDestino,
  carregarEnvLocal,
  credenciaisSupabaseDeTeste,
  destinoEhLocal,
} from "./lib/env-de-teste";

// O ambiente é carregado pelo utilitário CANÔNICO do repo, e não por um
// `readFileSync(".env.local")` escrito aqui: o gate
// `tests/unit/seed-nao-le-env-local-do-disco.test.ts` existe porque um seed
// que lê esse arquivo direto semeia teste na PRODUÇÃO (foi o que aconteceu em
// 06/08/2026 — a org `e2e-test-org` está no banco real desde abril). Aqui a
// consequência seria maior: esta prova escreve 21.668 empresas.
carregarEnvLocal();

const DUMP_PROSPECTS = "/tmp/prospects.psv";
const DUMP_CONTATOS = "/tmp/contacts-empresa.psv";
const ORG = "00000000-0000-4000-a000-000000002718"; // organização de descarte

/**
 * ⛔ ESTA PROVA SÓ RODA CONTRA O SUPABASE LOCAL. Ela semeia 21.668 empresas.
 *
 * Portão DUPLO, e o segundo é o que fecha o caso: `destinoEhLocal` olha a URL
 * **e** o DSN do Postgres. Um estado misto (API local, banco de produção) é
 * alcançável e é o pior dos três, porque parece seguro — foi medido em
 * 08/08/2026 no alarme de `anunciarDestino`.
 */
const credenciais = credenciaisSupabaseDeTeste();
anunciarDestino("prova-publico-da-campanha", credenciais);
if (!destinoEhLocal(credenciais.url) || !destinoEhLocal(credenciais.dbUrl)) {
  process.stderr.write(
    "esta prova é local: ela semeia 21.668 empresas e apaga no fim.\n" +
      "O destino precisa ser 127.0.0.1/localhost nos DOIS canais (API e Postgres).\n" +
      "Rode com o Supabase local no ar e o .env.e2e no ambiente.\n",
  );
  process.exit(1);
}

const cidadePedida = (process.argv[2] ?? "videira").toLowerCase();
const categoriasPedidas =
  process.argv.length > 3
    ? process.argv.slice(3)
    : ["Oficina mecânica", "Borracharia", "Loja de autopeças", "Posto de combustível"];

async function main(): Promise<void> {
const { createClient } = await import("@supabase/supabase-js");
const { normalizarTelefone, whatsappPotencial } = await import("@/lib/prospeccao/normalizacao");
const { chaveDeNome, indiceDeClientes } = await import("@/lib/prospeccao/ja-cadastrada");
const {
  LIMITE_POR_PAGINA,
  MAX_PAGINAS,
  criterioDaCampanha,
  empresaServe,
  publicoDaBase,
  resumoDaBase,
} = await import("@/lib/prospeccao/publico-da-base");

const admin = createClient(credenciais.url, credenciais.serviceRole);

/** `nome|telefone|cidade|uf|categoria` — o dump do scraper, como está. */
function lerProspects(): Array<{
  nome: string;
  telefone: string;
  cidade: string;
  uf: string;
  categoria: string;
}> {
  return readFileSync(DUMP_PROSPECTS, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      const [nome, tel, cidade, uf, cat] = l.split("|");
      return { nome: nome ?? "", telefone: tel ?? "", cidade: cidade ?? "", uf: uf ?? "", categoria: cat ?? "" };
    });
}

async function semear(): Promise<{ prospects: number; contatos: number; naCidade: number }> {
  await limpar();
  // A organização existe porque `business_prospects.organization_id` tem chave
  // estrangeira: sem ela o primeiro insert morre, e a prova não prova nada.
  const { error: erroOrg } = await admin.from("organizations").insert({
    id: ORG,
    slug: "prova-publico-campanha",
    legal_name: "Prova local do público da campanha",
    display_name: "Prova local",
  });
  if (erroOrg) throw new Error(`semente_organizacao: ${erroOrg.message}`);
  const linhas = lerProspects();
  const naCidade = linhas.filter((p) => p.cidade.toLowerCase() === cidadePedida).length;

  const lotes: Array<Array<Record<string, unknown>>> = [[]];
  for (const p of linhas) {
    const normalizado = normalizarTelefone(p.telefone);
    lotes[lotes.length - 1]!.push({
      organization_id: ORG,
      nome: p.nome,
      nome_normalizado: chaveDeNome(p.nome),
      categoria: p.categoria || null,
      categorias: [],
      telefone: p.telefone || null,
      telefone_normalizado: normalizado,
      whatsapp_potencial: whatsappPotencial(normalizado),
      cidade: p.cidade || null,
      estado: p.uf || null,
      provider: "maps_browser",
      status_comercial: "novo",
      do_not_contact: false,
    });
    if (lotes[lotes.length - 1]!.length >= 1000) lotes.push([]);
  }
  for (const lote of lotes) {
    if (lote.length === 0) continue;
    const { error } = await admin.from("business_prospects").insert(lote);
    if (error) throw new Error(`semente_prospects: ${error.message}`);
  }

  // Contatos: os que a loja JÁ atende. `indiceDeClientes` só entra em jogo
  // quando `source_metadata.mercos.ie` existe — sem ele a checagem de "é
  // cliente próprio?" é silenciosamente inútil.
  const contatos = readFileSync(DUMP_CONTATOS, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      const [nome, ie, cidade, uf] = l.split("|");
      return { nome: nome ?? "", ie: ie ?? "", cidade: cidade ?? "", uf: uf ?? "" };
    });
  for (let i = 0; i < contatos.length; i += 1000) {
    const lote = contatos.slice(i, i + 1000).map((c) => ({
      organization_id: ORG,
      name: c.nome,
      tipo_pessoa: "J",
      source_metadata: { mercos: { ie: c.ie, cidade: c.cidade, uf: c.uf } },
    }));
    const { error } = await admin.from("contacts").insert(lote);
    if (error) throw new Error(`semente_contatos: ${error.message}`);
  }
  return { prospects: linhas.length, contatos: contatos.length, naCidade };
}

/**
 * Apaga o que a prova semeou. Os erros SÃO mostrados, e a deletion é em
 * lotes — dois motivos, ambos medidos aqui:
 *
 * - erros escondidos deixavam a base local contaminada e a prova seguinte media
 *   o lixo da anterior (foi o que aconteceu na primeira execução);
 * - o Postgres local tem `statement_timeout`, e apagar 21.668 linhas num
 *   `DELETE` só estoura o limite. 1.000 por vez entra;
 * - e o filtro vai por FAIXA de `id`, nunca por `in.(1.000 uuid)`: a URI passa
 *   de 8 KB e o PostgREST recusa com "URI too long" (medido aqui).
 */
async function limpar(): Promise<void> {
  for (const tabela of ["business_prospects", "contacts", "organizations"] as const) {
    const coluna = tabela === "organizations" ? "id" : "organization_id";
    let depoisDe: string | null = null;
    for (;;) {
      let consulta = admin.from(tabela).select("id").eq(coluna, ORG).order("id").limit(1000);
      if (depoisDe) consulta = consulta.gt("id", depoisDe);
      const { data, error } = await consulta;
      if (error) throw new Error(`limpeza_${tabela}: ${error.message}`);
      if (!data || data.length === 0) break;
      const primeiro = data[0]!.id as string;
      const ultimo = data[data.length - 1]!.id as string;
      const { error: erroApagar } = await admin
        .from(tabela)
        .delete()
        .eq(coluna, ORG)
        .gte("id", primeiro)
        .lte("id", ultimo);
      if (erroApagar) throw new Error(`limpeza_${tabela}: ${erroApagar.message}`);
      depoisDe = ultimo;
      if (data.length < 1000) break;
    }
  }
}

/** A fila como a tela mostra: número, e o que saiu da fila com o motivo. */
async function medir(rotulo: string, somenteWhatsapp: boolean) {
  const clientes = await indiceDeClientes(admin, ORG);
  const inicio = Date.now();
  const r = await publicoDaBase(admin, {
    organizationId: ORG,
    cidades: [{ cidade: cidadePedida, estado: "SC" }],
    categorias: categoriasPedidas,
    somenteWhatsapp,
    limite: 5000,
    clientes,
  });
  const ms = Date.now() - inicio;
  return { rotulo, ms, ...r };
}

/** Todas as linhas da organização, paginadas de verdade (o PostgREST corta em 1.000). */
async function lerBase(): Promise<
  Array<{ id: string; nome: string; cidade: string | null; estado: string | null; categoria: string | null; telefone: string | null; whatsapp_potencial: boolean }>
> {
  const COLS = "id, nome, cidade, estado, categoria, telefone, whatsapp_potencial";
  const todas: Array<{ id: string; nome: string; cidade: string | null; estado: string | null; categoria: string | null; telefone: string | null; whatsapp_potencial: boolean }> = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin
      .from("business_prospects")
      .select(COLS)
      .eq("organization_id", ORG)
      .range(de, de + 999);
    if (error) throw new Error(`leitura_base: ${error.message}`);
    todas.push(...((data ?? []) as typeof todas));
    if ((data ?? []).length < 1000) break;
  }
  return todas;
}

const semente = await semear();
process.stdout.write(
  `base semeada: ${semente.prospects} empresas (${semente.naCidade} em ${cidadePedida}) · ` +
    `${semente.contatos} contatos de cliente\n` +
    `campanha: ${categoriasPedidas.join(" × ")}\n\n`,
);

const base = await lerBase();
const daCidade = base.filter(
  (l) => (l.cidade ?? "").toLowerCase() === cidadePedida,
);
const contagem = new Map<string, number>();
for (const l of daCidade) {
  const c = (l.categoria ?? "(sem categoria)").trim();
  contagem.set(c, (contagem.get(c) ?? 0) + 1);
}
process.stdout.write("categorias gravadas em Videira (top 12):\n");
for (const [cat, n] of [...contagem].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  process.stdout.write(`  ${String(n).padStart(5)}  ${cat}\n`);
}
process.stdout.write(
  `\nem Videira: ${daCidade.length} linhas · ` +
    `${daCidade.filter((l) => l.telefone).length} com telefone · ` +
    `${daCidade.filter((l) => l.whatsapp_potencial).length} com WhatsApp potencial\n\n`,
);

const comWa = await medir("com filtro de WhatsApp (a tela de hoje)", true);
const semWa = await medir("SEM filtro de WhatsApp (o número de amanhã)", false);

// A comparação crua: o que a tela fazia antes da tradução de categoria, nas
// MESMAS linhas que a fila tem. Aqui ela dá 0 — a base é toda em inglês e a
// campanha toda em português, então nenhuma string bate. Era esse o defeito.
const cru = semWa.linhas.filter((l) => {
  const alvo = categoriasPedidas.map((c) =>
    c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(),
  );
  const daEmpresa = (l.categoria ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return alvo.includes(daEmpresa);
}).length;

for (const r of [comWa, semWa]) {
  process.stdout.write(`── ${r.rotulo}\n`);
  process.stdout.write(`   ${resumoDaBase(r)}\n   (varredura em ${r.ms} ms)\n\n`);
}
process.stdout.write(
  `── a comparação CRUA (sem traduzir a categoria) alcançaria ${cru} de ${semWa.linhas.length}\n\n`,
);

// ─── O TETO DE PÁGINAS ─────────────────────────────────────────────────────
// `publicoDaBase` lê no máximo MAX_PAGINAS × 1.000 linhas, e a consulta tem
// `order by id` — a janela é um PREFIXO ESTÁVEL da base. A pergunta que
// responde: a base inteira cabe na janela, ou a fila é um prefixo do universo?
const JANELA = MAX_PAGINAS * LIMITE_POR_PAGINA;
const dentroDaJanela = daCidade.filter((l) => base.slice(0, JANELA).some((d) => d.id === l.id)).length;
const criterio = criterioDaCampanha({
  cidades: [{ cidade: cidadePedida, estado: "SC" }],
  categorias: categoriasPedidas,
});
const servindoNaBaseInteira = base.filter((l) => empresaServe(l, criterio));
const servindoDentroDaJanela = servindoNaBaseInteira.filter((l) =>
  base.slice(0, JANELA).some((d) => d.id === l.id),
).length;
process.stdout.write(
  `── o teto de páginas (${MAX_PAGINAS} × 1.000 = ${JANELA} linhas lidas)\n` +
    `   empresas de Videira dentro da janela lida: ${dentroDaJanela} de ${daCidade.length}\n` +
    `   que servem à campanha dentro da janela:   ${servindoDentroDaJanela} de ${servindoNaBaseInteira.length} (base inteira)\n` +
    (semWa.completa
      ? "   varredura completa: a base cabe no teto\n\n"
      : `   ⚠️ VARREDURA INCOMPLETA — ${semWa.varridas} linhas lidas de ${base.length}. ` +
        `A fila de hoje é um PREFIXO do universo, não o universo.\n\n`),
);

// ─── O NÚMERO DE AMANHÃ ────────────────────────────────────────────────────
// O funil inteiro, sobre a base inteira: quem serve, quem é duplicata e — o que
// decide se dá para disparar — quantos têm telefone que é WhatsApp. Tudo
// contando sobre a FILA (as 84 sem duplicata), porque é ela que o Disparo
// recebe: um número sobre o universo inteiro responderia uma pergunta que
// ninguém fez.
const porId = new Map(base.map((l) => [l.id, l]));
const naFila = semWa.linhas.map((l) => porId.get(l.id)).filter((l) => l !== undefined);
const semTelefone = naFila.filter((l) => !l.telefone).length;
const comWaPotencial = naFila.filter((l) => l.whatsapp_potencial).length;
process.stdout.write("── o funil inteiro, sobre a base inteira (é o número de amanhã)\n");
process.stdout.write(
  `   ${servindoNaBaseInteira.length} empresas servem à campanha em ${cidadePedida}\n` +
    `   − ${servindoNaBaseInteira.length - semWa.linhas.length} duplicatas (mesmo nome, mesma cidade)\n` +
    `   = ${semWa.linhas.length} na fila\n` +
    `   − ${semTelefone} sem telefone\n` +
    `   = ${naFila.length - semTelefone} com telefone · ${comWaPotencial} com WhatsApp potencial (é o que o Disparo envia)\n\n`,
);
process.stdout.write(
  `   ⚠️ das ${naFila.length - semTelefone - comWaPotencial} que têm telefone mas NÃO têm WhatsApp potencial, ` +
    `a grande parte é FIXO (a regra libera só celular com 9): telefone fixo aqui é número que a mensagem não alcança.\n\n`,
);

process.stdout.write("primeiras 10 da fila (o que o Disparo receberia):\n");
for (const l of semWa.linhas.slice(0, 10)) {
  const wa = semWa.linhas.length > 0 ? (l.telefone ?? "").replace(/\D/g, "") : "";
  process.stdout.write(
    `  ${(l.nome ?? "").padEnd(42).slice(0, 42)} ${(l.categoria ?? "").padEnd(36).slice(0, 36)} ${wa}\n`,
  );
}
process.stdout.write(
  `\namostra do que SAIU da fila por já ser cliente:\n`,
);
for (const c of semWa.ja_clientes.slice(0, 5)) {
  process.stdout.write(`  ${c.nome} — igual a "${c.igual_a}" (${c.similaridade.toFixed(2)})\n`);
}
process.stdout.write(
  `\npara revisar (0.80–0.90): ${semWa.para_revisar.length}` +
    (semWa.para_revisar[0] ? ` — ex.: "${semWa.para_revisar[0].nome}" ≈ "${semWa.para_revisar[0].igual_a}"` : "") +
    "\n",
);

await limpar();
process.stdout.write("\n(organização de descarte apagada — o banco local voltou ao que estava)\n");
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});