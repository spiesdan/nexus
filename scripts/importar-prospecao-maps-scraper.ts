/**
 * Importa a saída do google-maps-scraper (gosom) para `business_prospects`.
 *
 *   pnpm exec tsx --env-file=.env.local scripts/importar-prospecao-maps-scraper.ts <arquivo.json> [--confirmar]
 *
 * `--confirmar` é obrigatório para gravar. Sem ele, o script só mostra o que
 * faria — nenhuma escrita acontece.
 *
 * Duas decisões que NÃO são minhas e estão comentadas porque são as que mais
 * custam se alguém mudar sem ler:
 *
 * 1. Telefone SEM DDD vira `telefone_normalizado = NULL`. O Maps devolve o fixo
 *    como "3623-0612" (8 dígitos). Preencher DDD seria chute — e chute aqui
 *    significa mandar WhatsApp para a loja errada. A regra do repo é explícita:
 *    `normalizarTelefone` devolve null, e `partirEndereco` idem — "saem NULL em
 *    vez de chute". O bruto fica em `telefone`, que é dado, não inferência.
 *
 * 2. `provider` é `maps_browser`, não `google_places`. Não houve chave da API
 *    oficial em lugar nenhum (medido: `GOOGLE_MAPS_API_KEY` ausente do env e
 *    `prospecting_settings` com 0 linhas); quem raspa o DOM do Maps pelo
 *    navegador não é a API. Marcar como `google_places` faria a ficha mentir
 *    sobre a origem — e a origem é o que sustenta `do_not_contact` e a
 *    auditoria de prospecção.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  normalizarNome,
  normalizarTelefone,
  normalizarWebsite,
  partirEndereco,
  whatsappPotencial,
} from "@/lib/prospeccao/normalizacao";

export const PROVIDER = "maps_browser";
const ORGANIZATION_SLUG = "bill-higiene-limpeza";
const MAX_LINHAS_ARQUIVO = 200_000;

interface EnderecoEstruturado {
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  borough?: string;
  country?: string;
}

export interface LinhaMaps {
  title?: string;
  category?: string;
  categories?: string[];
  address?: string;
  complete_address?: EnderecoEstruturado | string;
  phone?: string;
  web_site?: string;
  place_id?: string;
  cid?: string;
  latitude?: number;
  longitude?: number;
  review_rating?: number;
  review_count?: number;
  link?: string;
}

/**
 * O scraper entrega `state` por NOME ("Santa Catarina"). O banco quer a sigla.
 * Fonte: IBGE, tabela de estados — dado publico, nao suposicao.
 */
const SIGLA_DA_ESTADO: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE",
  "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
  "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG",
  para: "PA", paraiba: "PB", parana: "PR", Pernambuco: "PE", piaui: "PI",
  "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS",
  rondonia: "RO", roraima: "RR", "santa catarina": "SC", "sao paulo": "SP",
  Sergipe: "SE", tocantins: "TO",
};

function siglaDoEstado(valor: string | undefined): string | null {
  if (!valor) return null;
  const v = valor.trim();
  if (/^[A-Z]{2}$/.test(v)) return v;
  return SIGLA_DA_ESTADO[v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()] ?? null;
}

/**
 * `0800` e telefone nacional de empresa: voce liga de qualquer lugar, mas NAO
 * tem WhatsApp. Deixar passar para `telefone_normalizado` faria o
 * `whatsapp_potencial` responder falso-positivo. Fica so no bruto.
 */
function eAtendimento0800(telefone: string | null): boolean {
  return (telefone ?? "").replace(/\D/g, "").startsWith("0800");
}

function log(m: string): void {
  process.stderr.write(`${m}\n`);
}

function lerArgumentos(argv: string[]): { arquivo: string; confirmar: boolean } {
  const confirmar = argv.includes("--confirmar");
  const arquivo = argv.find((a) => !a.startsWith("--"));
  if (!arquivo) {
    log("uso: tsx scripts/importar-prospecao-maps-scraper.ts <arquivo.json> [--confirmar]");
    process.exit(2);
  }
  return { arquivo, confirmar };
}

async function resolverOrganizacao(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no env");
  const admin = createClient(url, chave, { auth: { persistSession: false } });
  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", ORGANIZATION_SLUG)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`organização "${ORGANIZATION_SLUG}" não encontrada`);
  return data.id as string;
}

export function transformar(l: LinhaMaps) {
  const nome = (l.title ?? "").trim();
  if (!nome) return null;

  // O scraper traz DUAS formas de endereco. A estruturada e boa; a string e o
  // fallback, e passa por `partirEndereco` do repo. Preferimos a estruturada —
  // parsear texto e a fonte dos outros erros que ja corrigimos aqui.
  const estruturado: EnderecoEstruturado | null =
    l.complete_address && typeof l.complete_address === "object" ? l.complete_address : null;
  const endereco = (typeof l.complete_address === "string" ? l.complete_address : (l.address ?? "")).trim() || null;
  const partido = partirEndereco(endereco);

  const telefoneBruto = (l.phone ?? "").trim() || null;
  const telefoneNormalizado = eAtendimento0800(telefoneBruto) ? null : normalizarTelefone(telefoneBruto);

  return {
    nome,
    nome_normalizado: normalizarNome(nome),
    categoria: (l.category ?? "").trim() || null,
    categorias: Array.isArray(l.categories) ? l.categories.slice(0, 10) : [],
    telefone: telefoneBruto,
    // regra do repo: sem DDD nao ha numero canonico. Ver cabecalho.
    telefone_normalizado: telefoneNormalizado,
    whatsapp_potencial: whatsappPotencial(telefoneNormalizado),
    website: normalizarWebsite(l.web_site ?? ""),
    email: null,
    endereco,
    logradouro: (estruturado?.street ?? "").trim() || partido.logradouro,
    numero_end: partido.numero,
    bairro: (estruturado?.borough ?? "").trim() || partido.bairro,
    cidade: (estruturado?.city ?? "").trim() || partido.cidade,
    estado: siglaDoEstado(estruturado?.state) ?? partido.estado,
    cep: (estruturado?.postal_code ?? "").trim() || partido.cep,
    pais: (estruturado?.country ?? "BR").trim() || "BR",
    latitude: typeof l.latitude === "number" ? l.latitude : null,
    longitude: typeof l.longitude === "number" ? l.longitude : null,
    provider: PROVIDER,
    external_id: (l.place_id ?? l.cid ?? "").trim() || null,
    external_url: (l.link ?? "").trim() || null,
    nota: typeof l.review_rating === "number" ? l.review_rating : null,
    total_avaliacoes: typeof l.review_count === "number" ? l.review_count : 0,
    status_comercial: "novo",
    source: "maps_browser:gosom/google-maps-scraper",
  };
}

async function main(): Promise<void> {
  const { arquivo, confirmar } = lerArgumentos(process.argv.slice(2));
  log(`lendo ${basename(arquivo)}`);
  const cru = readFileSync(arquivo, "utf8");
  const linhas = cru
    .split("\n")
    .filter(Boolean)
    .slice(0, MAX_LINHAS_ARQUIVO)
    .map((l) => JSON.parse(l) as LinhaMaps);

  // Dedup por place_id: o mesmo lugar volta em categorias vizinhas.
  const porPlace = new Map<string, LinhaMaps>();
  let semPlaceId = 0;
  for (const l of linhas) {
    const k = (l.place_id ?? l.cid ?? "").trim();
    if (!k) {
      semPlaceId++;
      continue;
    }
    if (!porPlace.has(k)) porPlace.set(k, l);
  }

  const registros = [...porPlace.values()]
    .map(transformar)
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const comFone = registros.filter((r) => r.telefone).length;
  const comNormalizado = registros.filter((r) => r.telefone_normalizado).length;
  const comWhatsApp = registros.filter((r) => r.whatsapp_potencial).length;
  const comSite = registros.filter((r) => r.website).length;
  const comCidade = registros.filter((r) => r.cidade).length;

  log(`linhas lidas ....... ${linhas.length}`);
  log(`sem place_id ....... ${semPlaceId} (descartadas: sem chave de dedup)`);
  log(`unicas ............ ${registros.length}`);
  log(`com telefone bruto  ${comFone}`);
  log(`com tel. normaliz.  ${comNormalizado}  <- so quem ja veio com DDD`);
  log(`whatsapp potencial  ${comWhatsApp}`);
  log(`com site ........... ${comSite}`);
  log(`com cidade ........ ${comCidade}`);

  if (!confirmar) {
    log("");
    log("SEM GRAVAR. rode de novo com --confirmar para escrever em business_prospects.");
    return;
  }

  const organizationId = await resolverOrganizacao();
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // `organization_id` explicito e sempre presente: o service role ignora RLS.
  //
  // Nao usamos `upsert` porque o indice unico de dedup é PARCIAL
  // (`business_prospects_provider_id_key ... WHERE external_id IS NOT NULL`) e o
  // PostgREST nao faz on_conflict em indice parcial. Filtrar os ja existentes e
  // inserir é o caminho que nao depende dessa sutileza.
  const { data: jaExistentes, error: errLeitura } = await admin
    .from("business_prospects")
    .select("external_id")
    .eq("organization_id", organizationId)
    .eq("provider", PROVIDER)
    .not("external_id", "is", null);
  if (errLeitura) throw errLeitura;
  const existentes = new Set((jaExistentes ?? []).map((r) => r.external_id as string));
  const novos = registros.filter((r) => r.external_id && !existentes.has(r.external_id));
  log(`ja existentes ..... ${existentes.size}`);
  log(`a inserir ......... ${novos.length}`);

  const LOTE = 500;
  let gravados = 0;
  for (let i = 0; i < novos.length; i += LOTE) {
    const fatia = novos.slice(i, i + LOTE).map((r) => ({ ...r, organization_id: organizationId }));
    const { error } = await admin.from("business_prospects").insert(fatia);
    if (error) throw error;
    gravados += fatia.length;
    log(`  ${gravados}/${novos.length}`);
  }
  log(`gravados em business_prospects (organization_id=${organizationId})`);
}

// Guarda de importação: `gerar-sql-prospeccao.ts` importa `transformar`
// daqui, e sem isto o `main()` rodava Junto na importação (medido: o dry-run
// executou ao gerar o SQL). Direto no CLI comporta-se igual a antes.
const executadoDireto =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("importar-prospecao-maps-scraper.ts") ||
    process.argv[1].endsWith("importar-prospecao-maps-scraper.js"));
if (executadoDireto) {
  main().catch((e: unknown) => {
    log(`erro: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}