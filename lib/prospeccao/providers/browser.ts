/**
 * MapsBrowserProvider — descoberta pelo sidecar `gosom/google-maps-scraper`.
 *
 * O sidecar (Go, modo HTTP) recebe termo + lugar e devolve JSONL com os campos
 * do scraper: place_id, cid, name/title, category, address, phone, web_site,
 * rating, review_count, latitude/longitude, google_maps_url e horário.
 *
 * Regras que este arquivo carrega (plano v5, §1, §4 e §8):
 * - NUNCA contornar CAPTCHA, proxy de evasão, conta falsa ou bloqueio. Bloqueio
 *   do fornecedor = erro nomeado; quem pausa a busca é o motor.
 * - Saída parcial não existe: só entra resposta 2xx com TODAS as linhas JSON
 *   válidas. Linha quebrada derruba a resposta inteira (`maps_browser_json_*`),
 *   porque aceitar metade faria o checkpoint fechar um termo incompleto.
 * - Timeout de 120 s por termo e 3 tentativas com backoff; 4xx (menos 429) não
 *   repete — repetir erro de entrada só gasta cota.
 * - Texto de avaliação NÃO é lido nem guardado (LGPD/direito autoral); nota
 *   agregada e total de avaliações entram normalmente.
 *
 * O provider não fala com o Google: fala com o sidecar. Sem URL configurada ou
 * com `MAPS_BROWSER_ENABLED=false`, `search` falha com motivo nomeado — a rota
 * oferece OSM/Places e diz que a descoberta está degradada.
 */

import { partirEndereco } from "../normalizacao";
import type {
  BusinessDetails,
  BusinessDiscoveryProvider,
  BusinessSearchParams,
  BusinessSearchResult,
  NegocioDescoberto,
} from "../tipos";

export const MAPS_BROWSER_TIMEOUT_MS = 120_000;
export const MAPS_BROWSER_TENTATIVAS = 3;
export const NOMINATIM_PADRAO = "https://nominatim.openstreetmap.org/search";

export interface MapsBrowserOptions {
  baseUrl?: string | null;
  token?: string | null;
  /** `false` desliga explicitamente; ausente lê `MAPS_BROWSER_ENABLED`. */
  habilitado?: boolean;
  timeoutMs?: number;
  tentativas?: number;
  /** Injeção para teste; em produção é o `fetch` global. */
  fetchImpl?: typeof fetch;
  /** Injeção para teste do backoff (não esperar 1 s + 2 s). */
  dormir?: (ms: number) => Promise<void>;
}

type Linha = Record<string, unknown>;

function texto(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function inteiro(v: unknown): number | null {
  const n = numero(v);
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
}

function lista(v: unknown): string[] {
  const bruto = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return [...new Set(bruto.map((x) => texto(x)).filter((x): x is string => x !== null))];
}

function primeiro(o: Linha, chaves: string[]): unknown {
  for (const k of chaves) if (o[k] !== undefined && o[k] !== null) return o[k];
  return null;
}

/** O JSON do scraper traz `state` por extenso ("Santa Catarina"). */
const UF_POR_NOME: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

function uf(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  if (t.length === 2) return t.toUpperCase();
  const chave = t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return UF_POR_NOME[chave] ?? t;
}

/** `complete_address` é string no CSV e objeto no JSON; ambos viram partes. */
function enderecoCompleto(v: unknown): {
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  bairro: string | null;
  logradouro: string | null;
} {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Linha;
    return {
      cidade: texto(primeiro(o, ["city", "municipality"])),
      estado: uf(primeiro(o, ["state", "uf"])),
      cep: texto(primeiro(o, ["postal_code", "zip", "cep"])),
      bairro: texto(primeiro(o, ["borough", "neighborhood", "bairro"])),
      logradouro: texto(primeiro(o, ["street", "logradouro"])),
    };
  }
  return { cidade: null, estado: null, cep: null, bairro: null, logradouro: null };
}

/**
 * Uma linha do scraper → `NegocioDescoberto`. Pura: testável sem rede.
 * Aceita os nomes atuais do gosom (`web_site`, `review_count`, `place_id`) e os
 * aliases do export antigo do userscript (`website`, `reviewCount`, `placeId`).
 * Linha sem nome (ou sem nada identificável) devolve `null`.
 */
export function mapearLinhaScraper(entrada: unknown): NegocioDescoberto | null {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return null;
  const o = entrada as Linha;

  const nome = texto(primeiro(o, ["name", "title", "nome"]));
  if (!nome) return null;

  const placeId = texto(primeiro(o, ["place_id", "placeId", "placeID"]));
  // CID é string numérica de 19 dígitos; converter para number perde precisão.
  const cid = texto(primeiro(o, ["cid", "CID"]));
  const categorias = lista(primeiro(o, ["categories", "category", "categoria"]));
  const fones = lista(primeiro(o, ["phones", "phone", "telefone"]));
  // Fast mode não devolve e-mail (0% medido); se vier num CSV, entra. Não é
  // dependência do adaptador — a extração de e-mail é fase própria.
  const emails = lista(primeiro(o, ["emails", "email"]));
  const nota = numero(
    primeiro(o, ["review_rating", "rating", "average_rating", "averageRating", "nota"]),
  );
  const avaliacoes = inteiro(
    primeiro(o, ["review_count", "reviews", "user_rating_count", "reviewCount", "total_avaliacoes"]),
  );
  const latitude = numero(primeiro(o, ["latitude", "lat"]));
  // O JSON do scraper também traz a grafia errada `longtitude`; aceitar.
  const longitude = numero(primeiro(o, ["longitude", "longtitude", "lng", "lon"]));

  const completo = enderecoCompleto(primeiro(o, ["complete_address", "completeAddress"]));
  const endereco = texto(primeiro(o, ["address", "full_address", "fullAddress", "endereco"]));
  const partes = endereco ? partirEndereco(endereco) : null;

  return {
    idExterno: placeId ? `maps:${placeId}` : cid ? `maps:cid:${cid}` : null,
    provider: "maps_browser",
    placeId,
    cid,
    nome,
    categoriaPrincipal: categorias[0] ?? null,
    categoriasSecundarias: categorias.slice(1),
    telefone: fones[0] ?? null,
    // JSON: `web_site`; CSV: `website`. Ler os dois na ordem certa evita
    // perder 100% dos sites quando o formato é JSON.
    website: texto(primeiro(o, ["web_site", "website", "site"])),
    email: emails[0] ?? null,
    endereco,
    logradouro: completo.logradouro ?? partes?.logradouro ?? null,
    bairro: completo.bairro ?? texto(primeiro(o, ["neighborhood", "bairro"])) ?? partes?.bairro ?? null,
    cidade: completo.cidade ?? texto(primeiro(o, ["city", "municipality", "cidade"])) ?? partes?.cidade ?? null,
    estado:
      completo.estado ??
      uf(primeiro(o, ["state", "estado", "uf"])) ??
      partes?.estado ??
      null,
    cep: completo.cep ?? texto(primeiro(o, ["postal_code", "zip", "cep"])) ?? partes?.cep ?? null,
    pais: texto(primeiro(o, ["country", "pais"])) ?? "BR",
    latitude,
    longitude,
    urlExterna:
      texto(primeiro(o, ["google_maps_url", "link", "url"])) ??
      (placeId ? `https://www.google.com/maps/search/?api=1&query_place_id=${placeId}` : null),
    nota: nota !== null && nota >= 0 && nota <= 5 ? nota : null,
    totalAvaliacoes: avaliacoes ?? 0,
    horarioFuncionamento:
      (primeiro(o, ["open_hours", "opening_hours", "hours", "working_hours", "horario"]) as Record<
        string,
        unknown
      > | null) ?? null,
  };
}

/**
 * O JSON do scraper NÃO é "um negócio por linha": cada linha é um ARRAY de
 * negócios (medido em 27/11/2026 — o README diz o contrário). Achata um nível
 * (e mais, se um dia vier array de arrays) sem aceitar nada que não seja objeto
 * com nome.
 */
function negociosDeJson(json: unknown, contexto: string): NegocioDescoberto[] {
  if (Array.isArray(json)) {
    return json.flatMap((item, i) => negociosDeJson(item, `${contexto}[${i + 1}]`));
  }
  const n = mapearLinhaScraper(json);
  if (!n) throw new Error(`maps_browser_json_invalido: ${contexto} sem nome.`);
  return [n];
}

/**
 * Corpo do sidecar → negócios. Aceita JSON array (o lote inteiro) ou JSONL
 * (uma linha = um array de negócios). Qualquer linha inválida derruba o lote
 * inteiro — aceitar só as boas seria parcial silencioso, o defeito que o plano
 * proíbe.
 */
export function lerRespostaDoScraper(corpo: string): NegocioDescoberto[] {
  const t = corpo.trim();
  if (t === "") return [];
  if (t.startsWith("[")) {
    // Um array JSON bonito pode ter newlines; o JSONL do scraper tem VÁRIAS
    // linhas, cada uma um array. Tenta o lote inteiro e, se não for um único
    // JSON, cai no parser linha a linha (que nomeia a linha com problema).
    let json: unknown;
    let inteiro = false;
    try {
      json = JSON.parse(t);
      inteiro = true;
    } catch {
      if (!t.includes("\n")) {
        throw new Error("maps_browser_json_invalido: resposta não é JSON válido.");
      }
    }
    if (inteiro) return negociosDeJson(json, "lote");
  }

  const negocios: NegocioDescoberto[] = [];
  const linhas = t.split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]!.trim();
    if (linha === "") continue;
    let json: unknown;
    try {
      json = JSON.parse(linha);
    } catch {
      throw new Error(`maps_browser_json_invalido: linha ${i + 1} não é JSON.`);
    }
    negocios.push(...negociosDeJson(json, `linha ${i + 1}`));
  }
  return negocios;
}

async function dormirPadrao(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class MapsBrowserProvider implements BusinessDiscoveryProvider {
  readonly nome = "maps_browser";
  private baseUrl: string | null;
  private token: string | null;
  private habilitado: boolean;
  private timeoutMs: number;
  private tentativas: number;
  private fetchImpl: typeof fetch;
  private dormir: (ms: number) => Promise<void>;

  constructor(opts: boolean | MapsBrowserOptions = {}) {
    const o: MapsBrowserOptions = typeof opts === "boolean" ? { habilitado: opts } : opts;
    this.baseUrl = (o.baseUrl ?? process.env.MAPS_BROWSER_URL ?? "").trim().replace(/\/+$/, "") || null;
    this.token = (o.token ?? process.env.MAPS_BROWSER_TOKEN ?? "").trim() || null;
    this.habilitado = o.habilitado ?? process.env.MAPS_BROWSER_ENABLED === "true";
    this.timeoutMs = o.timeoutMs ?? MAPS_BROWSER_TIMEOUT_MS;
    this.tentativas = Math.max(1, o.tentativas ?? MAPS_BROWSER_TENTATIVAS);
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.dormir = o.dormir ?? dormirPadrao;
  }

  private exigir(): void {
    if (!this.habilitado) {
      throw new Error(
        "maps_browser_desligado: MAPS_BROWSER_ENABLED=false. Use osm_overpass (grátis) ou google_places.",
      );
    }
    if (!this.baseUrl) {
      throw new Error(
        "maps_browser_sem_url: configure MAPS_BROWSER_URL com o endereço do sidecar (ex.: http://maps-browser:8080).",
      );
    }
  }

  private async pedirJson(
    caminho: string,
    init: { method: string; corpo?: unknown },
  ): Promise<Record<string, unknown>> {
    this.exigir();
    const url = `${this.baseUrl}${caminho}`;
    let ultimoErro: unknown = null;

    for (let tentativa = 1; tentativa <= this.tentativas; tentativa++) {
      const controle = new AbortController();
      const limite = setTimeout(() => controle.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          method: init.method,
          headers: {
            ...(init.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
            ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          },
          ...(init.corpo !== undefined ? { body: JSON.stringify(init.corpo) } : {}),
          signal: controle.signal,
        });
        // 429/5xx esperam e repetem; 4xx de entrada não melhora repetindo.
        if ((res.status === 429 || res.status >= 500) && tentativa < this.tentativas) {
          await this.dormir(500 * 2 ** (tentativa - 1) + Math.random() * 250);
          continue;
        }
        if (!res.ok) {
          const textoErro = await res.text().catch(() => "");
          throw new Error(`maps_browser_${res.status}: ${textoErro.slice(0, 300)}`);
        }
        const json = (await res.json()) as unknown;
        if (!json || typeof json !== "object" || Array.isArray(json)) {
          throw new Error("maps_browser_json_invalido: resposta do job não é objeto.");
        }
        return json as Record<string, unknown>;
      } catch (erro) {
        ultimoErro = erro;
        if (
          erro instanceof Error &&
          /^(maps_browser_\d{3}:|maps_browser_json_invalido)/.test(erro.message)
        ) {
          throw erro;
        }
        if (tentativa < this.tentativas) {
          await this.dormir(500 * 2 ** (tentativa - 1) + Math.random() * 250);
          continue;
        }
      } finally {
        clearTimeout(limite);
      }
    }
    const motivo = ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro);
    throw new Error(`maps_browser_indisponivel: ${motivo}`);
  }

  /**
   * O job do sidecar é assíncrono: cria (POST /api/v1/jobs), confere o modo no
   * detalhe e faz polling até completed. `fast_mode` NÃO é recomendação: o
   * upstream aceita `FastMode` e ignora em silêncio; sem o campo certo o job
   * sobe Chromium, que não existe na imagem distroless. Se o detalhe não
   * confirmar `true`, aborta ANTES de deixar rodar.
   */
  async search(params: BusinessSearchParams): Promise<BusinessSearchResult> {
    const criado = await this.pedirJson("/api/v1/jobs", {
      method: "POST",
      corpo: {
        // Campos do ScrapeRequest do gosom (v1.21.0): `fast_mode` snake_case.
        name: `${params.categoria}${params.cidade ? ` — ${params.cidade}` : ""}`,
        keyword: params.categoria,
        lang: "pt",
        max_depth: 2,
        email: false,
        geo_coordinates: `${params.latitude},${params.longitude}`,
        zoom: 15,
        radius: params.raioMetros / 1000,
        fast_mode: true,
        extra_reviews: false,
        timeout: Math.ceil(this.timeoutMs / 1000),
      },
    });
    const jobId = typeof criado.job_id === "string" ? criado.job_id : null;
    if (!jobId) throw new Error("maps_browser_json_invalido: criação de job sem job_id.");

    let detalhe = await this.pedirJson(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
    });
    const fastMode = detalhe.fast_mode ?? (detalhe.request as Record<string, unknown> | undefined)?.fast_mode;
    if (fastMode !== true) {
      throw new Error(
        "sidecar_em_modo_navegador: o job não confirmou fast_mode=true; abortado antes de rodar (a imagem distroless não tem Chromium).",
      );
    }

    const limite = Date.now() + this.timeoutMs;
    while (detalhe.status === "pending" || detalhe.status === "running") {
      if (Date.now() > limite) {
        throw new Error("maps_browser_timeout: job não concluiu dentro do limite do termo.");
      }
      await this.dormir(1000);
      detalhe = await this.pedirJson(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
        method: "GET",
      });
      const aindaFast = detalhe.fast_mode ?? (detalhe.request as Record<string, unknown> | undefined)?.fast_mode;
      if (aindaFast !== true) {
        throw new Error("sidecar_em_modo_navegador: o job perdeu fast_mode=true durante a execução.");
      }
    }

    if (detalhe.status === "failed") {
      throw new Error(`maps_browser_job_falhou: ${String(detalhe.error ?? "sem motivo")}`);
    }
    if (detalhe.status !== "completed") {
      throw new Error(`maps_browser_job_status: ${String(detalhe.status ?? "desconhecido")}`);
    }
    if (!Array.isArray(detalhe.results)) {
      throw new Error("maps_browser_json_invalido: job concluído sem lista de resultados.");
    }

    const negocios = detalhe.results.flatMap((linha, i) => {
      const n = mapearLinhaScraper(linha);
      if (!n) throw new Error(`maps_browser_json_invalido: resultado ${i + 1} sem nome.`);
      return [n];
    });

    return {
      negocios: negocios.slice(0, params.limite),
      proximaPaginaToken: null,
      requisicoes: 1,
      detalhes: 0,
    };
  }

  /**
   * O payload de busca do sidecar já traz os 13 campos (nota, total, horário).
   * Detalhe por place_id exigiria uma segunda passada no Google e não é
   * necessário para o contrato atual — devolver `null` é honesto, não chute.
   */
  async getDetails(_idExterno: string): Promise<BusinessDetails | null> {
    return null;
  }

  async geocodificar(consulta: string): Promise<{ latitude: number; longitude: number } | null> {
    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), 15_000);
    try {
      const res = await this.fetchImpl(
        `${NOMINATIM_PADRAO}?q=${encodeURIComponent(consulta)}&format=json&limit=1&countrycodes=br`,
        {
          headers: {
            Referer: "https://nexus.local/prospeccao",
            "User-Agent": "Nexus-Prospeccao/1.0",
          },
          signal: controle.signal,
        },
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { lat?: string; lon?: string }[];
      const p = json?.[0];
      const lat = p?.lat != null ? Number(p.lat) : NaN;
      const lng = p?.lon != null ? Number(p.lon) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { latitude: lat, longitude: lng };
    } catch {
      return null;
    } finally {
      clearTimeout(limite);
    }
  }
}
