/**
 * REVISA A CIDADE DOS PROSPECTS A PARTIR DO ENDEREÇO.
 *
 * A base antiga foi importada com a cidade do CENTRO DA BUSCA, não a do
 * endereço: 1.203 empresas rotuladas "Nova Friburgo/RJ" são, na verdade,
 * Nova Friburgo; 579 rotuladas "Leblon Régis/PR" são Curitiba, Palmeira,
 * São José… O endereço cru está certo — quem está errado é o campo `cidade`.
 *
 * Esta passagem:
 *   1. parseia `endereco` com `partirEndereco` (a mesma função do import);
 *   2. corrige cidade/UF quando o município está na região de atuação;
 *   3. marca `bloqueado` + `status_comercial='descartado'` quando o endereço
 *      prova que a empresa é de fora — não apaga, para auditoria e rollback;
 *   4. sem endereço, só bloqueia se também não houver coordenada plausível.
 *
 *   pnpm exec tsx scripts/revisar-cidade-prospeccao.ts [--confirmar]
 *
 * Sem `--confirmar` só mede. O CSV de revisão é escrito sempre.
 */
import { writeFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { partirEndereco } from "@/lib/prospeccao/normalizacao";

const ORGANIZATION_SLUG = "bill-higiene-limpeza";
const CIDADES_ALVO = [
  "Fraiburgo",
  "Canoinhas",
  "Caçador",
  "Videira",
  "Lebon Régis",
  "Matos Costa",
  "Rio das Antas",
  "Calmon",
  "Três Barras",
];

const ALVO = new Set(CIDADES_ALVO.map((c) => chave(c)));

interface Linha {
  id: string;
  nome: string;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  latitude: number | null;
  longitude: number | null;
  provider: string;
  bloqueado: boolean;
  status_comercial: string;
}

interface Decisao {
  linha: Linha;
  cidade: string | null;
  estado: string | null;
  acao: "manter" | "corrigir" | "bloquear";
  motivo: string;
}

function log(m: string): void {
  process.stderr.write(`${m}\n`);
}

function chave(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * O `partirEndereco` do import espera "Cidade - UF"; a base antiga tem também
 * "Cidade, UF" e, nesse formato, ele devolve a UF como cidade ("SC/SC"). Aqui
 * os dois formatos são tentados ANTES, e o resultado nunca é a própria UF.
 */
function cidadeDoEndereco(endereco: string | null): { cidade: string; estado: string } | null {
  if (!endereco) return null;
  const padroes = [
    // "Rua X - Lebon Régis, SC, 89515-000": o `.*` guloso ancora no ÚLTIMO
    // separador antes da cidade, senão a rua entra no nome do município.
    /.*(?:-|,)\s*([^,]+?)\s*,\s*([A-Z]{2}),\s*\d{5}-?\d{3}\s*$/,
    /,\s*([^,]+?)\s*-\s*([A-Z]{2}),\s*\d{5}-?\d{3}\s*$/,
    /,\s*([^,]+?)\s*,\s*([A-Z]{2}),\s*\d{5}-?\d{3}\s*$/,
    /,\s*([^,]+?)\s*-\s*([A-Z]{2})\s*$/,
    /,\s*([^,]+?)\s*,\s*([A-Z]{2})\s*$/,
  ];
  for (const re of padroes) {
    const m = endereco.match(re);
    const cidade = m?.[1]?.trim();
    const estado = m?.[2]?.trim();
    if (cidade && estado && cidade.length > 2 && cidade.toUpperCase() !== estado) {
      return { cidade, estado };
    }
  }
  const partido = partirEndereco(endereco);
  if (partido.cidade && partido.estado && partido.cidade.length > 2 && partido.cidade.toUpperCase() !== partido.estado) {
    return { cidade: partido.cidade, estado: partido.estado };
  }
  return null;
}

function coordenadaPlausivel(l: Linha): boolean {
  if (typeof l.latitude !== "number" || typeof l.longitude !== "number") return false;
  // O import antigo gravou -14.409526/-51.316863 como fallback para linhas sem
  // endereço. É o valor que denuncia "não geocodificado", não uma coordenada.
  if (Math.abs(l.latitude + 14.409526) < 0.0001 && Math.abs(l.longitude + 51.316863) < 0.0001) {
    return false;
  }
  // Região de atuação (SC meio-oeste/norte) — folga generosa, só para separar
  // de Curitiba/Londrina/Nova Friburgo.
  return l.latitude > -30 && l.latitude < -25 && l.longitude > -53 && l.longitude < -48;
}

function decide(l: Linha): Decisao {
  const parsed = cidadeDoEndereco(l.endereco);
  if (parsed) {
    // "Leblon Régis" é erro de digitação da base antiga; o município é Lebon.
    const cidade = /^leblon\s+regis$/i.test(chave(parsed.cidade)) ? "Lebon Régis" : parsed.cidade;
    const estado = parsed.estado;
    const dentro = ALVO.has(chave(cidade));
    if (dentro) {
      const mudou = chave(cidade) !== chave(l.cidade) || estado !== l.estado;
      return {
        linha: l,
        cidade,
        estado,
        acao: mudou ? "corrigir" : "manter",
        motivo: mudou ? `endereço aponta ${cidade}/${estado}` : "endereço confere",
      };
    }
    return {
      linha: l,
      cidade,
      estado,
      acao: "bloquear",
      motivo: `endereço aponta fora da região: ${cidade}/${estado}`,
    };
  }

  const dentro = ALVO.has(chave(l.cidade));
  if (!dentro) {
    return {
      linha: l,
      cidade: l.cidade,
      estado: l.estado,
      acao: "bloquear",
      motivo: "sem endereço e cidade fora da região",
    };
  }
  if (!coordenadaPlausivel(l)) {
    return {
      linha: l,
      cidade: l.cidade,
      estado: l.estado,
      acao: "bloquear",
      motivo: "sem endereço e sem coordenada plausível",
    };
  }
  return { linha: l, cidade: l.cidade, estado: l.estado, acao: "manter", motivo: "sem endereço, coordenada plausível" };
}

async function carregar(admin: SupabaseClient, organizationId: string): Promise<Linha[]> {
  const PAGINA = 1_000;
  const todos: Linha[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await admin
      .from("business_prospects")
      .select("id, nome, endereco, cidade, estado, latitude, longitude, provider, bloqueado, status_comercial")
      .eq("organization_id", organizationId)
      .neq("provider", "maps_browser")
      .order("id", { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (error) throw error;
    todos.push(...((data ?? []) as Linha[]));
    if (!data || data.length < PAGINA) break;
  }
  return todos;
}

async function main(): Promise<void> {
  const confirmar = process.argv.includes("--confirmar");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chaveApi = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chaveApi) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes");
  const admin = createClient(url, chaveApi, { auth: { persistSession: false } });

  const { data: org, error: errOrg } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", ORGANIZATION_SLUG)
    .maybeSingle();
  if (errOrg) throw errOrg;
  if (!org) throw new Error(`organização ${ORGANIZATION_SLUG} não encontrada`);

  const linhas = await carregar(admin, org.id as string);
  const decisoes = linhas.map(decide);
  const porAcao = new Map<string, number>();
  for (const d of decisoes) porAcao.set(d.acao, (porAcao.get(d.acao) ?? 0) + 1);

  const porCidade = new Map<string, number>();
  for (const d of decisoes) {
    if (d.acao === "bloquear") {
      const k = `${d.cidade ?? "(sem cidade)"}/${d.estado ?? "?"}`;
      porCidade.set(k, (porCidade.get(k) ?? 0) + 1);
    }
  }
  const fora = [...porCidade.entries()].sort((a, b) => b[1] - a[1]);

  log(`linhas analisadas .. ${linhas.length}`);
  log(`manter ............. ${porAcao.get("manter") ?? 0}`);
  log(`corrigir ........... ${porAcao.get("corrigir") ?? 0}`);
  log(`bloquear ........... ${porAcao.get("bloquear") ?? 0}`);
  log(`fora da região ..... ${fora.slice(0, 20).map(([k, v]) => `${k}=${v}`).join(" · ")}`);

  const csv = [
    "id,nome,acao,motivo,cidade_antiga,uf_antiga,cidade_nova,uf_nova,endereco",
    ...decisoes
      .filter((d) => d.acao !== "manter")
      .map((d) =>
        [
          d.linha.id,
          d.linha.nome,
          d.acao,
          d.motivo,
          d.linha.cidade,
          d.linha.estado,
          d.cidade,
          d.estado,
          d.linha.endereco,
        ]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(","),
      ),
  ].join("\n");
  const arquivo = "revisao-cidade-prospeccao.csv";
  writeFileSync(arquivo, `${csv}\n`, "utf8");
  log(`csv ................ ${arquivo}`);

  if (!confirmar) {
    log("SEM GRAVAR. rode com --confirmar para aplicar.");
    return;
  }

  const mudancas = decisoes.filter((d) => d.acao !== "manter");
  const LOTE = 50;
  let gravados = 0;
  for (let i = 0; i < mudancas.length; i += LOTE) {
    const fatia = mudancas.slice(i, i + LOTE);
    // `update` por linha, não `upsert`: o PostgREST exigiria as colunas NOT
    // NULL da tabela no INSERT e este é um update parcial.
    await Promise.all(
      fatia.map(async (d) => {
        const base: Record<string, unknown> = {
          cidade: d.cidade,
          estado: d.estado,
        };
        if (d.acao === "bloquear") {
          base.bloqueado = true;
          base.status_comercial = "descartado";
          base.proximo_passo = d.motivo;
        }
        const { error } = await admin
          .from("business_prospects")
          .update(base)
          .eq("id", d.linha.id)
          .eq("organization_id", org.id as string);
        if (error) throw error;
      }),
    );
    gravados += fatia.length;
    log(`  ${gravados}/${mudancas.length}`);
  }
  log("aplicado.");
}

const executadoDireto =
  process.argv[1] !== undefined && process.argv[1].endsWith("revisar-cidade-prospeccao.ts");
if (executadoDireto) {
  main().catch((e: unknown) => {
    log(`erro: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
