/**
 * AUDITORIA DE CATEGORIA COM O LAYA — "o Google disse X; o que é de verdade?"
 *
 * Roda sobre os prospects recém-importados do Google Maps Scraper e grava um
 * CSV com a categoria que o motor escolheu, a confiança e o rótulo canônico
 * determinístico. NÃO sobrescreve `categoria_canonica`: o determinístico é a
 * régua que a campanha usa; a IA aqui é evidência independente para revisão.
 *
 *   LAYA_URL=http://127.0.0.1:18000 LAYA_API_KEY=... \
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   pnpm exec tsx scripts/auditar-categoria-prospeccao-laya.ts --saida auditoria.csv [--cidade Fraiburgo] [--limite 64]
 *
 * ─── POR QUE A LISTA DE OPÇÕES É CURTA ────────────────────────────────────
 *
 * A primeira versão mandava as 82 categorias em toda pergunta. O motor
 * respondeu "Construtora" para uma padaria e "Informática" para uma pizzaria,
 * com confiança baixa: 82 opções é pedir para o modelo chutar. Aqui cada
 * empresa recebe um conjunto de 6–16 candidatos: a macro do rótulo atual, os
 * sinais do nome (café, pizza, posto, oficina…) e as categorias com maior
 * sobreposição de palavras. A pergunta fica "qual destas?" — não "adivinhe
 * entre 82".
 */
import { writeFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { CATEGORIAS_COMERCIAIS } from "@/lib/prospeccao/categorias";
import { semAcento, traduzirCategoria } from "@/lib/prospeccao/categoria-pt";

// O servidor aceita 64 states, mas o modelo vive em 2 GB e o container
// reinicia quando o lote aperta. 8 é o tamanho que medimos estável com o
// scraper rodando na mesma VPS; o retry divide mais se ainda falhar.
const MAX_LOTE = 8;
const REVISAR = "revisar";

const MACROS = CATEGORIAS_COMERCIAIS.map((m) => ({
  macro: m.macro,
  rotulos: m.subcategorias.map((s) => s.rotulo).filter((r) => r !== "Veterinária"),
}));

const ROTULOS = [
  ...new Set(CATEGORIAS_COMERCIAIS.flatMap((m) => m.subcategorias.map((s) => s.rotulo)).filter(
    (r) => r !== "Veterinária",
  )),
];

const MACRO_DO_ROTULO = new Map<string, string>();
for (const m of MACROS) for (const r of m.rotulos) if (!MACRO_DO_ROTULO.has(r)) MACRO_DO_ROTULO.set(r, m.macro);

const STOP = new Set([
  "de", "da", "do", "das", "dos", "e", "para", "com", "loja", "empresa", "servico", "servicos",
  "clinica", "clinicas", "centro", "casa", "salao", "grupo", "ltda", "me", "eireli", "comercio",
]);

function tokens(s: string): string[] {
  return semAcento(s)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

function pontua(rotulo: string, alvo: string): number {
  const a = semAcento(rotulo).toLowerCase();
  const b = semAcento(alvo).toLowerCase();
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 60;
  let p = 0;
  for (const t of tokens(alvo)) if (a.includes(t) || t.includes(a)) p += 12;
  return p;
}

/**
 * Sinais que o nome carrega e que o rótulo do Google pode ter perdido. É a
 * mesma evidência que o resolvedor determinístico usa para "posto que é café",
 * mas aqui ela vira candidato — o modelo decide, não a heurística.
 */
const SINAIS: Array<[RegExp, string[]]> = [
  [/caf[eé]|cafeteria|coffee|espresso|padoca/i, ["Cafeteria", "Padaria", "Restaurante", "Lanchonete"]],
  [/pizza|pizzaria/i, ["Pizzaria", "Restaurante", "Lanchonete"]],
  [/hamburg|burger|lanche|hot\s*dog|salgad/i, ["Lanchonete", "Restaurante"]],
  [/a[cç]a[ií]|sorvet|gelato|doce|confeitaria/i, ["Sorveteria", "Padaria", "Cafeteria"]],
  [/panific|padaria/i, ["Padaria", "Cafeteria", "Sorveteria"]],
  [/alimento|natural|org[aâ]nic|hortifruti|fruta|verdura|a[cç]ougue/i, ["Hortifruti", "Supermercado", "Mercado", "Açougue", "Restaurante"]],
  [/marmit|comida\s*caseira/i, ["Marmitaria", "Restaurante"]],
  [/posto|combust|gasolina|etanol|diesel/i, ["Posto de combustível", "Posto de GNV", "Lubrificante e troca de óleo", "Lavagem de veículo (posto)"]],
  [/farm[aá]cia|drogaria/i, ["Farmácia"]],
  [/supermerc|hipermerc|mercado/i, ["Supermercado", "Mercado"]],
  [/oficina|mec[aâ]nic|auto\s*center/i, ["Oficina mecânica", "Centro automotivo", "Oficina de caminhões"]],
  [/lava\s*jato|lava[jj]ato|lavagem/i, ["Lavação", "Lavagem de veículo (posto)"]],
  [/borrachar/i, ["Borracharia"]],
  [/autope[cç]/i, ["Autopeças"]],
  [/vidra[cç]|vidro/i, ["Vidraçaria"]],
  [/marmor/i, ["Marmoraria"]],
  [/madeir|serraria/i, ["Madeireira"]],
  [/marcen/i, ["Marcenaria"]],
  [/serralh/i, ["Serralheria"]],
  [/gr[aá]fic|impress/i, ["Gráfica"]],
  [/contabil|contador/i, ["Contabilidade"]],
  [/advog|jur[ií]dic/i, ["Advocacia"]],
  [/im[oó]bil/i, ["Imobiliária"]],
  [/seguro/i, ["Seguros"]],
  [/hotel/i, ["Hotel"]],
  [/pousada/i, ["Pousada"]],
  [/motel/i, ["Motel"]],
  [/escola|col[eé]gio/i, ["Escola"]],
  [/autoescola/i, ["Autoescola"]],
  [/idioma|ingl[eê]s|espanhol/i, ["Curso de idiomas"]],
  [/academia|fitness|crossfit/i, ["Academia"]],
  [/transport|log[ií]stica/i, ["Transportadora"]],
  [/mudan[cç]/i, ["Mudanças"]],
  [/t[aá]xi/i, ["Táxi"]],
  [/pet|banho\s*e\s*tosa/i, ["Pet shop", "Banho e tosa"]],
  [/veterin/i, ["Clínica veterinária"]],
  [/sal[aã]o|beleza|cabelo/i, ["Salão de beleza"]],
  [/barbear/i, ["Barbearia"]],
  [/est[eé]tic/i, ["Estética"]],
  [/inform[aá]tic|computador|software|sistema/i, ["Informática", "Loja de informática", "Provedor de internet", "Empresa de software"]],
  [/jogo|game/i, ["Presentes", "Loja de informática"]],
  [/educa|escola|infantil|creche|col[eé]gio/i, ["Escola", "Curso de idiomas"]],
  [/alum[ií]nio|esquadria|serralh/i, ["Esquadrias", "Serralheria", "Vidraçaria"]],
  [/engenheir|engenharia/i, ["Engenharia", "Construtora"]],
  [/manic|pedic|unha|cabelo|est[eé]tic/i, ["Salão de beleza", "Estética", "Barbearia"]],
  [/pneu/i, ["Borracharia", "Autopeças", "Centro automotivo"]],
  [/m[oó]ve|planejado/i, ["Marcenaria", "Madeireira"]],
];

interface Linha {
  id: string;
  nome: string;
  categoria: string | null;
  categorias: string[] | null;
  cidade: string | null;
  estado: string | null;
  website: string | null;
  categoria_canonica: string | null;
  categoria_revisar: boolean | null;
}

interface Auditada extends Linha {
  ia_categoria: string | null;
  ia_confianca: number | null;
  ia_candidatos: string[];
}

function log(m: string): void {
  process.stderr.write(`${m}\n`);
}

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function csv(valor: unknown): string {
  const s = valor === null || valor === undefined ? "" : String(valor);
  return `"${s.replace(/"/g, '""')}"`;
}

function alvosDa(linha: Linha): string[] {
  const alvos = new Set<string>();
  if (linha.categoria_canonica) alvos.add(linha.categoria_canonica);
  if (linha.categoria) alvos.add(traduzirCategoria(linha.categoria));
  for (const c of linha.categorias ?? []) alvos.add(traduzirCategoria(c));
  return [...alvos].filter(Boolean);
}

/**
 * Devolve os candidatos da empresa, do mais provável ao menos provável. Se
 * não há nenhum sinal, devolve só `revisar` — e o chamador não gasta chamada
 * de IA para confirmar que não sabe.
 */
export function candidatosDa(linha: Linha): string[] {
  const alvos = alvosDa(linha);
  const nome = linha.nome;

  // 1. Macro do alvo principal: "Restaurante de pizza" → Alimentação.
  let macro: string | null = null;
  let melhor = 0;
  for (const alvo of alvos) {
    for (const r of ROTULOS) {
      const p = pontua(r, alvo);
      if (p > melhor) {
        melhor = p;
        macro = MACRO_DO_ROTULO.get(r) ?? null;
      }
    }
  }

  const cands = new Set<string>();
  if (macro) {
    for (const m of MACROS) if (m.macro === macro) for (const r of m.rotulos) cands.add(r);
  }

  // 2. Sinais do nome — inclusivo de propósito: "Go Coffee" tem que ver
  //    Cafeteria mesmo que o Google diga "Espresso bar".
  const texto = [nome, linha.categoria ?? "", ...(linha.categorias ?? []), ...alvos].join(" ");
  for (const [re, opcoes] of SINAIS) {
    if (re.test(texto)) for (const o of opcoes) cands.add(o);
  }

  // 3. Sobreposição de palavras com os alvos (limita o ruído).
  const porPontuacao = [...cands]
    .map((r) => ({ r, p: Math.max(...alvos.map((a) => pontua(r, a)), 0) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 14)
    .map((x) => x.r);
  for (const r of porPontuacao) cands.add(r);

  // 4. Se ainda não há nada, tenta os rótulos que compartilham token com o
  //    nome (ex.: "Panificadora" → Padaria não compartilha token; o sinal
  //    regex acima cobre os casos conhecidos).
  if (cands.size === 0) return [REVISAR];

  return [...cands].slice(0, 16);
}

function criterios(cands: string[]): Record<string, string> {
  const c: Record<string, string> = {};
  for (const r of cands) c[r] = `Negócio cuja atividade principal é ${r.toLowerCase()}.`;
  c[REVISAR] = "Não é possível decidir com segurança, ou o negócio não pertence a nenhuma das categorias listadas.";
  return c;
}

function pergunta(cands: string[]) {
  return {
    type: "choice" as const,
    instructions:
      "Confirme ou corrija a categoria do negócio. A 'categoria atual do sistema' é uma HIPÓTESE; " +
      "o rótulo do Google Maps é outra pista, e as duas podem estar erradas: uma cafeteria dentro de " +
      "um posto costuma vir como 'Gas station'; uma oficina com loja de conveniência pode vir como " +
      "'Convenience store'. Use o nome, as categorias secundárias, o endereço e o site. Se a hipótese " +
      "estiver certa, escolha a mesma categoria; se estiver errada, escolha a que descreve a atividade " +
      "principal que gera receita. Não escolha uma categoria apenas porque a palavra aparece no nome. " +
      "Se nenhuma categoria servir, ou se faltar evidência, escolha 'revisar'.",
    criteria: criterios(cands),
  };
}

async function carregar(admin: SupabaseClient, organizationId: string, cidade: string | null, limite: number | null) {
  const PAGINA = 1_000;
  const todos: Linha[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    let q = admin
      .from("business_prospects")
      .select(
        "id, nome, categoria, categorias, cidade, estado, website, categoria_canonica, categoria_revisar",
      )
      .eq("organization_id", organizationId)
      .eq("provider", "maps_browser")
      .order("id", { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (cidade) q = q.eq("cidade", cidade);
    const { data, error } = await q;
    if (error) throw error;
    todos.push(...((data ?? []) as Linha[]));
    if (!data || data.length < PAGINA) break;
    if (limite !== null && todos.length >= limite) break;
  }
  return limite === null ? todos : todos.slice(0, limite);
}

async function chamaLayaUma(
  estados: string[],
  cands: string[],
): Promise<Array<{ choice: string; confidence: number } | null>> {
  const url = `${(process.env.LAYA_URL ?? "").replace(/\/+$/, "")}/v1/systemone/batch`;
  if (!url.startsWith("http")) throw new Error("LAYA_URL ausente");
  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.LAYA_API_KEY ? { authorization: `Bearer ${process.env.LAYA_API_KEY}` } : {}),
    },
    body: JSON.stringify({ states: estados, questions: { categoria: pergunta(cands) } }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!resposta.ok) throw new Error(`Laya HTTP ${resposta.status}`);
  const corpo = (await resposta.json()) as {
    results?: Array<{ answers?: Record<string, unknown> }>;
  };
  const results = corpo.results;
  if (!Array.isArray(results) || results.length !== estados.length) {
    throw new Error(`Laya devolveu ${results?.length ?? 0} resultados para ${estados.length} states`);
  }
  return results.map((r) => {
    const a = r.answers?.["categoria"] as
      | { type?: string; choice?: unknown; confidence?: unknown }
      | undefined;
    if (!a || a.type !== "choice" || typeof a.choice !== "string") return null;
    const conf = typeof a.confidence === "number" ? a.confidence : null;
    if (conf === null) return null;
    return { choice: a.choice, confidence: conf };
  });
}

function dorme(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * O container do Laya reinicia sozinho (medido: 53 restarts). Um POST que
 * atravessa o restart vira `fetch failed`, não resposta de erro. Aqui a falha
 * espera o motor voltar e, se o lote for grande, divide antes de desistir.
 */
async function chamaLaya(
  estados: string[],
  cands: string[],
  tentativa = 1,
): Promise<Array<{ choice: string; confidence: number } | null>> {
  try {
    return await chamaLayaUma(estados, cands);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    if (estados.length > 1) {
      log(`  lote de ${estados.length} falhou (${motivo}); dividindo`);
      const meio = Math.floor(estados.length / 2);
      const a = await chamaLaya(estados.slice(0, meio), cands, 1);
      const b = await chamaLaya(estados.slice(meio), cands, 1);
      return [...a, ...b];
    }
    if (tentativa >= 5) throw e;
    log(`  1 state falhou (${motivo}); tentativa ${tentativa}/5 em 5s`);
    await dorme(5_000);
    return chamaLaya(estados, cands, tentativa + 1);
  }
}

/**
 * Famílias largas para comparar a hipótese determinística com a escolha da
 * IA. "Restaurante" e "Pizzaria" são a mesma família — não é discordância.
 * "Posto de combustível" e "Cafeteria" não são — é exatamente o erro que a
 * campanha não pode cometer.
 */
const FAMILIAS: Array<[string, RegExp]> = [
  ["postos", /posto|combust|gnv|lubrific|lavagem de ve/i],
  ["alimentacao", /restaurante|lanchonete|pizzaria|padaria|cafeteria|sorveteria|\bbar\b|marmitaria|supermercado|mercado|a[cç]ougue|hortifruti|alimento|doce/i],
  ["automotivo", /oficina|mec[aâ]nic|auto|pneu|borrachar|pe[cç]a|funilar|ve[ií]culo|ret[ií]fica|lava[cç][aã]o|lavej|concession|revenda/i],
  ["construcao", /materia(?:l|is) de constru|madeir|marcen|vidra|tinta|esquadria|construtora|engenh|marmor|pedreira|el[eé]trica|hidr[aá]ulica/i],
  ["industria", /ind[uú]stria|metal[uú]rgica|gr[aá]fica|alimentos \(ind/i],
  ["saude", /cl[ií]nica|farm[aá]cia|fisioter|laborat|[oó]tica|veterin|dentista|m[eé]dic/i],
  ["beleza", /sal[aã]o|barbear|est[eé]tic|manic|pedic/i],
  ["comercio", /loja|cal[cç]ado|papelaria|presente|roupa/i],
  ["servicos", /contabil|advoc|advog|imobili|seguro|inform[aá]tica|software|transporte|mudan[cç]|t[aá]xi/i],
  ["hotelaria", /hotel|pousada|motel/i],
  ["educacao", /educa|escola|autoescola|idioma|academia|curso/i],
  ["pet", /pet|banho e tosa/i],
];

function familiaDe(rotulo: string | null): string | null {
  if (!rotulo) return null;
  const n = semAcento(rotulo);
  for (const [familia, re] of FAMILIAS) if (re.test(n)) return familia;
  return null;
}

function concorda(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const na = semAcento(a).toLowerCase();
  const nb = semAcento(b).toLowerCase();
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const fa = familiaDe(a);
  const fb = familiaDe(b);
  if (fa && fb) return fa === fb;
  const ta = new Set(tokens(a));
  return tokens(b).some((t) => ta.has(t));
}

function gravaCsv(auditadas: Auditada[], saida: string): void {
  const cabecalho = [
    "id", "nome", "cidade", "uf", "categoria_google", "categorias_google",
    "categoria_canonica", "revisar", "ia_categoria", "ia_confianca", "candidatos", "website",
  ];
  const corpo = auditadas.map((a) =>
    [
      a.id, a.nome, a.cidade, a.estado, a.categoria, (a.categorias ?? []).join(" | "),
      a.categoria_canonica, a.categoria_revisar ? "sim" : "não", a.ia_categoria,
      a.ia_confianca?.toFixed(3), a.ia_candidatos.join(" | "), a.website,
    ]
      .map(csv)
      .join(","),
  );
  writeFileSync(saida, `${cabecalho.join(",")}\n${corpo.join("\n")}\n`, "utf8");
}

async function main(): Promise<void> {
  const saida = argumento("--saida");
  if (!saida) throw new Error("uso: --saida <arquivo.csv> [--cidade Nome] [--limite N]");
  const cidade = argumento("--cidade");
  const limiteBruto = argumento("--limite");
  const limite = limiteBruto ? Number(limiteBruto) : null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes");
  const admin = createClient(url, chave, { auth: { persistSession: false } });

  const { data: org, error: errOrg } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", "bill-higiene-limpeza")
    .maybeSingle();
  if (errOrg) throw errOrg;
  if (!org) throw new Error("organização bill-higiene-limpeza não encontrada");

  const linhas = await carregar(admin, org.id as string, cidade, limite);
  log(`auditando ${linhas.length} prospects${cidade ? ` de ${cidade}` : ""}`);
  if (linhas.length === 0) return;

  const auditadas: Auditada[] = [];
  let semCandidato = 0;

  // Agrupa por conjunto de candidatos: a API usa o MESMO critério para o lote
  // inteiro. Empresas com a mesma macro/sinais viajam juntas.
  const grupos = new Map<string, Array<{ linha: Linha; cands: string[] }>>();
  for (const linha of linhas) {
    const cands = candidatosDa(linha);
    if (cands.length === 1 && cands[0] === REVISAR) {
      semCandidato++;
      auditadas.push({ ...linha, ia_categoria: null, ia_confianca: null, ia_candidatos: cands });
      continue;
    }
    const k = cands.join("\u0001");
    const g = grupos.get(k) ?? [];
    g.push({ linha, cands });
    grupos.set(k, g);
  }

  let feitos = auditadas.length;
  for (const grupo of grupos.values()) {
    for (let inicio = 0; inicio < grupo.length; inicio += MAX_LOTE) {
      const fatia = grupo.slice(inicio, inicio + MAX_LOTE);
      const estados = fatia.map(({ linha: p }) =>
        [
          `Negócio: ${p.nome}`,
          `Categoria do Google: ${p.categoria ?? "(não informada)"}`,
          `Categorias secundárias: ${p.categorias?.length ? p.categorias.join(", ") : "(nenhuma)"}`,
          `Categoria atual do sistema (hipótese): ${p.categoria_canonica ?? "(em revisão)"}`,
          `Cidade: ${[p.cidade, p.estado].filter(Boolean).join("/") || "(não informada)"}`,
          `Website: ${p.website ?? "(não tem)"}`,
        ].join("\n"),
      );
      const respostas = await chamaLaya(estados, fatia[0].cands);
      for (let i = 0; i < fatia.length; i++) {
        const r = respostas[i];
        auditadas.push({
          ...fatia[i].linha,
          ia_categoria: r?.choice ?? null,
          ia_confianca: r?.confidence ?? null,
          ia_candidatos: fatia[i].cands,
        });
      }
      feitos += fatia.length;
      gravaCsv(auditadas, saida);
      log(`  ${feitos}/${linhas.length}`);
    }
  }
  gravaCsv(auditadas, saida);

  const semResposta = auditadas.filter((a) => !a.ia_categoria).length;
  const baixa = auditadas.filter((a) => a.ia_categoria && (a.ia_confianca ?? 0) < 0.5).length;
  const porIa = new Map<string, number>();
  for (const a of auditadas) {
    const k = a.ia_categoria ?? "(sem resposta)";
    porIa.set(k, (porIa.get(k) ?? 0) + 1);
  }
  const top = [...porIa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const discordam = auditadas.filter(
    (a) =>
      a.categoria_canonica &&
      a.categoria_revisar !== true &&
      a.ia_categoria &&
      a.ia_categoria !== REVISAR &&
      (a.ia_confianca ?? 0) >= 0.7 &&
      !concorda(a.categoria_canonica, a.ia_categoria),
  );
  const iaMandaRevisar = auditadas.filter(
    (a) =>
      a.categoria_canonica &&
      a.categoria_revisar !== true &&
      a.ia_categoria === REVISAR &&
      (a.ia_confianca ?? 0) >= 0.8,
  );
  log(`csv ............... ${saida}`);
  log(`sem candidato ..... ${semCandidato}`);
  log(`sem resposta ...... ${semResposta}`);
  log(`confiança < 0.5 ... ${baixa}`);
  log(`discordam (>=0.7) . ${discordam.length}`);
  log(`IA pede revisão ... ${iaMandaRevisar.length}`);
  log(`top IA ............ ${top.map(([k, v]) => `${k}=${v}`).join(" · ")}`);
  for (const a of discordam.slice(0, 15)) {
    log(`  ! ${a.nome}: ${a.categoria_canonica} -> ${a.ia_categoria} (${a.ia_confianca?.toFixed(2)})`);
  }

  if (!process.argv.includes("--marcar")) return;
  const paraMarcar = [...discordam, ...iaMandaRevisar];
  if (paraMarcar.length === 0) return;
  const LOTE = 50;
  let marcados = 0;
  for (let i = 0; i < paraMarcar.length; i += LOTE) {
    const fatia = paraMarcar.slice(i, i + LOTE);
    await Promise.all(
      fatia.map(async (a) => {
        const { error } = await admin
          .from("business_prospects")
          .update({ categoria_revisar: true, categoria_confianca: "baixa" })
          .eq("id", a.id)
          .eq("organization_id", org.id as string);
        if (error) throw error;
      }),
    );
    marcados += fatia.length;
    log(`  marcados ${marcados}/${paraMarcar.length}`);
  }
  log("marcados para revisão.");
}

const executadoDireto =
  process.argv[1] !== undefined && process.argv[1].endsWith("auditar-categoria-prospeccao-laya.ts");
if (executadoDireto) {
  main().catch((e: unknown) => {
    log(`erro: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
