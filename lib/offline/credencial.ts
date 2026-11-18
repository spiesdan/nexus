/**
 * A CREDENCIAL DO APARELHO NO BOLSO — e o código de pareamento.
 *
 * ─── O que fica no aparelho ────────────────────────────────────────────────
 *
 * URL da instalação + token (`nod_...`) + o que a tela precisa mostrar sem
 * rede (nome do aparelho, organização, prazo e o último estado conhecido).
 * Tudo em `meta`, o mesmo banco da fila e do catálogo.
 *
 * ─── Por que o token fica em claro no SQLite ───────────────────────────────
 *
 * Porque não há Keystore/Keychain no caminho atual: `db.ts` abre o banco com
 * `no-encryption` e não existe plugin de armazenamento seguro instalado. O
 * token é um bearer de escopo mínimo, com prazo, revogável pelo dono, e o
 * backup do Android está desligado (F-MOB-8). Isso é o melhor que o artefato
 * atual permite — e está registrado como limite, não como decisão de que
 * "não precisa". Trocar por Keystore é fatia própria (plugin nativo).
 *
 * ─── O código de pareamento ────────────────────────────────────────────────
 *
 * `NEXUS1.<base64url({"u":url,"t":token})>`. Um campo só para colar no celular,
 * porque pedir URL e token em duas caixas é o tipo de tela em que o vendedor
 * cola o token no campo da URL. A URL vem de quem gerou o código (o navegador
 * do admin, `window.location.origin`) — é o que torna o APK genérico: ele não
 * nasce sabendo de qual instalação é.
 */

import type { Db } from "./outbox";

export type EstadoDoPareamento = "pareado" | "expirado" | "revogado" | "sem_rede";

export interface CredencialDoDispositivo {
  url: string;
  token: string;
  nome: string;
  organizacao: string | null;
  usuario: string | null;
  expiraEm: string;
  estado: EstadoDoPareamento;
}

const CHAVES = {
  url: "dispositivo_url",
  token: "dispositivo_token",
  nome: "dispositivo_nome",
  organizacao: "dispositivo_organizacao",
  usuario: "dispositivo_usuario",
  expiraEm: "dispositivo_expira_em",
  estado: "dispositivo_estado",
} as const;

async function lerMeta(db: Db, chave: string): Promise<string | null> {
  const r = await db.query(`SELECT valor FROM meta WHERE chave = ?`, [chave]);
  const v = r.values?.[0]?.valor;
  return typeof v === "string" && v.length > 0 ? v : null;
}

async function gravarMeta(db: Db, chave: string, valor: string): Promise<void> {
  await db.execute(
    `INSERT INTO meta (chave, valor) VALUES (?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
    [chave, valor],
  );
}

export async function lerCredencial(db: Db): Promise<CredencialDoDispositivo | null> {
  const [url, token, nome, organizacao, usuario, expiraEm, estado] = await Promise.all([
    lerMeta(db, CHAVES.url),
    lerMeta(db, CHAVES.token),
    lerMeta(db, CHAVES.nome),
    lerMeta(db, CHAVES.organizacao),
    lerMeta(db, CHAVES.usuario),
    lerMeta(db, CHAVES.expiraEm),
    lerMeta(db, CHAVES.estado),
  ]);
  if (!url || !token) return null;
  return {
    url: url.replace(/\/+$/, ""),
    token,
    nome: nome ?? "aparelho",
    organizacao,
    usuario,
    expiraEm: expiraEm ?? "",
    estado: (estado as EstadoDoPareamento | null) ?? "pareado",
  };
}

export async function gravarCredencial(
  db: Db,
  c: Omit<CredencialDoDispositivo, "url"> & { url: string },
): Promise<void> {
  await gravarMeta(db, CHAVES.url, c.url.replace(/\/+$/, ""));
  await gravarMeta(db, CHAVES.token, c.token);
  await gravarMeta(db, CHAVES.nome, c.nome);
  await gravarMeta(db, CHAVES.organizacao, c.organizacao ?? "");
  await gravarMeta(db, CHAVES.usuario, c.usuario ?? "");
  await gravarMeta(db, CHAVES.expiraEm, c.expiraEm);
  await gravarMeta(db, CHAVES.estado, c.estado);
}

export async function marcarEstadoDoPareamento(
  db: Db,
  estado: EstadoDoPareamento,
): Promise<void> {
  await gravarMeta(db, CHAVES.estado, estado);
}

/** Apaga a credencial. A FILA e o CATÁLOGO ficam — desconectar não é perder. */
export async function limparCredencial(db: Db): Promise<void> {
  for (const chave of Object.values(CHAVES)) {
    await db.execute(`DELETE FROM meta WHERE chave = ?`, [chave]);
  }
}

// ─── Código de pareamento ───────────────────────────────────────────────────

const PREFIXO_DO_CODIGO = "NEXUS1.";

function base64urlDe(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textoDeBase64url(b64: string): string {
  const normal = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normal.length % 4 === 0 ? "" : "=".repeat(4 - (normal.length % 4));
  const bin = atob(normal + padding);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function montarCodigoDePareamento(url: string, token: string): string {
  return `${PREFIXO_DO_CODIGO}${base64urlDe(JSON.stringify({ u: url, t: token }))}`;
}

/**
 * Lê o que o vendedor colou.
 *
 * Aceita o código completo (`NEXUS1....`) ou só o token `nod_...` — nesse caso
 * a URL precisa já estar no aparelho (`urlAtual`). Devolve `null` quando não
 * dá para aproveitar nada; quem chama explica o formato em vez de falhar mudo.
 */
export function lerCodigoDePareamento(
  bruto: string,
  urlAtual?: string | null,
): { url: string; token: string } | null {
  const texto = bruto.trim();
  if (!texto) return null;

  if (texto.startsWith(PREFIXO_DO_CODIGO)) {
    try {
      const dados = JSON.parse(textoDeBase64url(texto.slice(PREFIXO_DO_CODIGO.length))) as {
        u?: unknown;
        t?: unknown;
      };
      if (typeof dados.u !== "string" || typeof dados.t !== "string") return null;
      const url = dados.u.trim().replace(/\/+$/, "");
      if (!/^https?:\/\//i.test(url)) return null;
      return { url, token: dados.t.trim() };
    } catch {
      return null;
    }
  }

  if (texto.startsWith("nod_") && urlAtual) {
    return { url: urlAtual.replace(/\/+$/, ""), token: texto };
  }
  return null;
}
