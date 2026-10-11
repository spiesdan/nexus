/**
 * O RAIO-X DO SITE — o que o prospect tem na internet, em dado (não chute).
 *
 * ─── Por que isto existe ────────────────────────────────────────────────────
 *
 * O score tratava site como booleano (`temWebsite` → +10): tem site = empresa
 * estabelecida. Mas "tem site" esconde três realidades opostas — site bom,
 * site abandonado e "site" que é uma página do Wix de 2019. O Raio-X separa as
 * três, porque cada uma pede uma conversa diferente (e porque um site caído
 * não é "empresa estabelecida": é empresa que talvez nem exista mais).
 *
 * ─── O que cada situação significa ──────────────────────────────────────────
 *
 *   sem_site       — o domínio não resolve, não conecta ou não responde. Na
 *                    prática: sem presença digital.
 *   site_ruim      — responde, mas sem HTTPS, ou HTTP 5xx, ou >8s para abrir.
 *                    Empresa que existe mas largou o digital.
 *   site_simples   — feito em construtor pronto (Wix, Canva…) ou sem viewport
 *                    mobile. Existe e funciona, sem ambição digital.
 *   site_ok        — HTTPS, rápido, mobile. Presença cuidada.
 *   nao_verificado — a análise não rodou (ou falhou sem concluir). NÃO é zero:
 *                    ausência de dado não é dado de ausência.
 *
 * ─── SSRF: buscar site de terceiro no servidor ──────────────────────────────
 *
 * O servidor faz request para URL que veio do banco (qualquer prospect). Sem
 * trava, um prospect com `website=http://169.254.169.254/` leria metadados da
 * nuvem. Por isso: só http/https, portas 80/443, hostname resolvido e
 * conferido contra faixas privadas ANTES de cada request — inclusive nos
 * redirects, que são seguidos à mão (máx. 3) justamente para revalidar.
 */
export type SituacaoDoSite =
  "sem_site" | "site_ruim" | "site_simples" | "site_ok" | "nao_verificado";

/** Domínio que não resolve = sem site (e não erro): não há presença para avaliar. */
export const SEM_SITE_RESOLVE = "O domínio não resolve (sem site).";

export interface AchadoDoSite {
  chave:
    | "https"
    | "mobile"
    | "whatsapp"
    | "email"
    | "telefone"
    | "rapido"
    | "descricao"
    | "construtor_simples"
    | "titulo";
  presente: boolean;
  detalhe?: string;
}

export interface RaioXDoSite {
  situacao: SituacaoDoSite;
  /** URL final após redirects (ou a tentada, se falhou antes). */
  urlFinal: string;
  tempoMs: number | null;
  statusHttp: number | null;
  achados: AchadoDoSite[];
  /** Por que `nao_verificado`, quando for o caso. */
  motivo?: string;
}

export interface DepsDoRaioX {
  buscar: (url: string) => Promise<{
    status: number;
    cabecalhos: Record<string, string>;
    corpo: () => Promise<string>;
    urlFinal?: string;
  }>;
  /** Resolve o hostname para IPv4/IPv6 literais. Injetado para teste. */
  resolver: (host: string) => Promise<string[]>;
  agoraMs: () => number;
  tempoLimiteMs?: number;
}

const MAX_REDIRECTS = 3;
const LENTO_MS = 8000;

/** Construtores prontos: site que existe sem ambição digital. */
const CONSTRUTORES_SIMPLES: { nome: string; agulhas: string[] }[] = [
  { nome: "Wix", agulhas: ["wixstatic.com", "wix.com", "wixsite.com"] },
  { nome: "Canva", agulhas: ["canva.site", "canva.com"] },
  { nome: "Zyro/Hostinger", agulhas: ["zyro.com", "hostinger"] },
  { nome: "Weebly", agulhas: ["weebly.com"] },
  { nome: "Google Sites", agulhas: ["sites.google.com"] },
  { nome: "WordPress.com", agulhas: ["wordpress.com"] },
];

function ipv4Privado(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p as [number, number, number, number];
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  return false;
}

function ipv6Privado(ip: string): boolean {
  const base = ip.toLowerCase();
  if (base === "::1") return true;
  if (base.startsWith("fc") || base.startsWith("fd")) return true;
  if (base.startsWith("fe80")) return true;
  if (base === "::" || base === "::ffff:0:0") return true;
  return false;
}

function nomeLocal(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".lan")
  );
}

/** O host pode ser buscado? Nega rede interna, porta estranha e esquema. */
export async function motivoDeBloqueio(
  urlBruta: string,
  resolver: DepsDoRaioX["resolver"],
): Promise<string | null> {
  let u: URL;
  try {
    // Sem esquema não é URL que o servidor deva buscar: `evil.com.evil.org`
    // passa, mas `javascript:` também passaria sem esta exigência.
    u = new URL(urlBruta.includes("://") ? urlBruta : `https://${urlBruta}`);
  } catch {
    return "URL inválida.";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "Só http/https.";
  if (u.port !== "" && u.port !== "80" && u.port !== "443") return "Porta fora de 80/443.";
  if (!u.hostname || nomeLocal(u.hostname)) return "Host interno.";
  // Literal IP: confere direto, sem resolver. Resolver um literal é inútil —
  // e um resolver lento aqui seria espera em validação de segurança.
  const literal = u.hostname.replace(/^\[|\]$/g, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(literal)) {
    return ipv4Privado(literal) ? "IP interno." : null;
  }
  if (literal.includes(":")) {
    return ipv6Privado(literal) ? "IP interno." : null;
  }
  let ips: string[];
  try {
    ips = await resolver(u.hostname);
  } catch {
    return SEM_SITE_RESOLVE;
  }
  if (ips.length === 0) return SEM_SITE_RESOLVE;
  for (const ip of ips) {
    const limpo = ip.replace(/^\[|\]$/g, "");
    if (limpo.includes(":")) {
      if (ipv6Privado(limpo)) return "IP interno.";
    } else if (ipv4Privado(limpo)) {
      return "IP interno.";
    }
  }
  return null;
}

/**
 * Analisa o site. Nunca joga exceção de rede para fora: falha de DNS, timeout
 * e conexão recusada viram `sem_site` — que é o que elas significam para o
 * vendedor ("não há presença para avaliar").
 */
export async function analisarSite(urlBruta: string, deps: DepsDoRaioX): Promise<RaioXDoSite> {
  const bloqueio = await motivoDeBloqueio(urlBruta, deps.resolver);
  if (bloqueio === SEM_SITE_RESOLVE) {
    return {
      situacao: "sem_site",
      urlFinal: urlBruta,
      tempoMs: null,
      statusHttp: null,
      achados: [],
    };
  }
  if (bloqueio) {
    return {
      situacao: "nao_verificado",
      urlFinal: urlBruta,
      tempoMs: null,
      statusHttp: null,
      achados: [],
      motivo: bloqueio,
    };
  }

  let atual = urlBruta.includes("://") ? urlBruta : `https://${urlBruta}`;
  const inicio = deps.agoraMs();
  let resposta: Awaited<ReturnType<DepsDoRaioX["buscar"]>> | null = null;

  try {
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const bloqueioRedirect = await motivoDeBloqueio(atual, deps.resolver);
      if (bloqueioRedirect) {
        return {
          situacao: "nao_verificado",
          urlFinal: atual,
          tempoMs: deps.agoraMs() - inicio,
          statusHttp: resposta?.status ?? null,
          achados: [],
          motivo: bloqueioRedirect,
        };
      }
      resposta = await deps.buscar(atual);
      if (resposta.status >= 300 && resposta.status < 400) {
        const destino = resposta.cabecalhos["location"] ?? resposta.cabecalhos["Location"] ?? "";
        if (!destino || i === MAX_REDIRECTS) break;
        try {
          atual = new URL(destino, atual).toString();
        } catch {
          break;
        }
        continue;
      }
      atual = resposta.urlFinal ?? atual;
      break;
    }
  } catch {
    return {
      situacao: "sem_site",
      urlFinal: atual,
      tempoMs: deps.agoraMs() - inicio,
      statusHttp: null,
      achados: [],
    };
  }

  if (!resposta) {
    return {
      situacao: "sem_site",
      urlFinal: atual,
      tempoMs: deps.agoraMs() - inicio,
      statusHttp: null,
      achados: [],
    };
  }

  const tempoMs = deps.agoraMs() - inicio;
  const finalHttps = atual.startsWith("https://");

  if (resposta.status >= 500) {
    return {
      situacao: "site_ruim",
      urlFinal: atual,
      tempoMs,
      statusHttp: resposta.status,
      achados: [],
    };
  }
  if (resposta.status >= 400) {
    // 404/403: o domínio existe, a página não. Não é "sem site" — e é por isso
    // que o domínio que resolve mas não serve página é `site_ruim`, não
    // `sem_site`: há alguém pagando esse domínio.
    return {
      situacao: "site_ruim",
      urlFinal: atual,
      tempoMs,
      statusHttp: resposta.status,
      achados: [],
    };
  }

  const html = await resposta.corpo();
  const achados = extrairAchados(html);
  const construtor = detectarConstrutor(html);

  const ruim = !finalHttps || tempoMs > LENTO_MS;
  if (ruim) {
    return {
      situacao: "site_ruim",
      urlFinal: atual,
      tempoMs,
      statusHttp: resposta.status,
      achados,
    };
  }
  if (construtor || !achados.some((a) => a.chave === "mobile" && a.presente)) {
    if (construtor) {
      achados.push({ chave: "construtor_simples", presente: true, detalhe: construtor });
    }
    return {
      situacao: "site_simples",
      urlFinal: atual,
      tempoMs,
      statusHttp: resposta.status,
      achados,
    };
  }
  return { situacao: "site_ok", urlFinal: atual, tempoMs, statusHttp: resposta.status, achados };
}

function extrairAchados(html: string): AchadoDoSite[] {
  const menor = html.toLowerCase();
  const tem = (re: RegExp): boolean => re.test(menor);

  const titulo = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1]?.trim() ?? "";

  return [
    { chave: "titulo", presente: titulo.length > 0, detalhe: titulo || undefined },
    {
      chave: "descricao",
      presente: tem(/<meta[^>]+name=["']description["']/),
    },
    { chave: "mobile", presente: tem(/<meta[^>]+name=["']viewport["']/) },
    {
      chave: "whatsapp",
      presente: tem(/wa\.me\//) || tem(/api\.whatsapp\.com/) || tem(/whatsapp/),
    },
    { chave: "email", presente: tem(/mailto:/) },
    { chave: "telefone", presente: tem(/tel:/) },
    { chave: "rapido", presente: true },
  ];
}

function detectarConstrutor(html: string): string | null {
  const menor = html.toLowerCase();
  for (const c of CONSTRUTORES_SIMPLES) {
    if (c.agulhas.some((a) => menor.includes(a))) return c.nome;
  }
  return null;
}

/** Peso da situação no score (soma 100 preservada: substitui `website: 10`). */
export function pesoDoSite(
  situacao: SituacaoDoSite | null | undefined,
  temWebsite: boolean,
): number {
  if (situacao === "site_ok") return 10;
  if (situacao === "site_simples") return 6;
  if (situacao === "site_ruim") return 2;
  if (situacao === "sem_site") return 0;
  // `nao_verificado` ou ausente: o comportamento antigo (booleano). A análise
  // que ainda não rodou não pode tirar ponto de ninguém.
  return temWebsite ? 5 : 0;
}
