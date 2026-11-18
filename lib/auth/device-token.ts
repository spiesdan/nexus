/**
 * A CREDENCIAL DO APARELHO — autenticação do shell offline.
 *
 * ─── Por que isto existe (opção B, decisão do dono) ─────────────────────────
 *
 * O shell do APK roda em `https://localhost` e não tem o cookie de sessão do
 * sistema. A ponte do Capacitor não atravessa para a origem remota, então a
 * ideia de "o sistema lê o SQLite do shell" não se sustenta (medido em
 * 18/11/2026). O shell passa a drenar a própria fila com um bearer emitido
 * pelo sistema, com escopo mínimo e prazo — sem depender de sessão.
 *
 * ─── Regras que este arquivo carrega ────────────────────────────────────────
 *
 *  1. Token só no header `Authorization: Bearer`. Nunca em query string (a
 *     proxy e o log de acesso gravam URL).
 *  2. Banco guarda SHA-256, nunca o token. Comparação é por igualdade do hash
 *     (o índice único faz a busca) — não há "quase igual".
 *  3. O token só vale nas rotas `/api/v1/device/*`; o chamador diz qual escopo
 *     a rota exige e a recusa é 403, não 401.
 *  4. Revogado e expirado são respostas DISTINTAS (`token_revoked`,
 *     `token_expired`): a tela do shell mostra "pareie de novo" nos dois, mas
 *     o suporte precisa saber qual dos dois aconteceu.
 *  5. O papel é lido AO VIVO de `user_organizations`. Se a pessoa foi rebaixada
 *     ou removida, o aparelho dela para de escrever na hora — guardar o papel
 *     no token faria a revogação de acesso esperar o token expirar.
 *  6. O token não lê tabela nenhuma: a rota usa service role e filtra
 *     `organization_id` pelo valor do próprio token (fonte confiável), nunca
 *     por body/query.
 */

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { isServiceRoleConfigured } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

/** Prefixo próprio: não se confunde com `dsk_` (API token) nem com sessão. */
export const PREFIXO_DO_DISPOSITIVO = "nod_";

export const ESCOPO_PEDIDOS = "offline:pedidos:write";
export const ESCOPO_CATALOGO = "offline:catalogo:read";
export const ESCOPOS_DO_DISPOSITIVO = [ESCOPO_PEDIDOS, ESCOPO_CATALOGO] as const;

/** Papéis que podem capturar pedido no aparelho (o dono do token assina). */
export const PAPEIS_QUE_CAPTURAM = new Set(["agent", "vendedor", "manager", "admin"]);

export interface DispositivoAutenticado {
  id: string;
  organizationId: string;
  userId: string;
  nome: string;
  scopes: string[];
  expiresAt: string;
  /** Papel ATUAL da pessoa na organização — não o do dia da emissão. */
  role: string;
}

export type ResultadoDaAutenticacao =
  | { ok: true; dispositivo: DispositivoAutenticado }
  | { ok: false; status: number; code: string; message: string };

export function hashDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** `Bearer <token>` → token. Qualquer outro esquema é ausência. */
export function extrairBearerDoHeader(autorizacao: string | null): string | null {
  if (!autorizacao) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(autorizacao.trim());
  return m?.[1] ?? null;
}

function ipDaRequisicao(req: NextRequest): string | null {
  const encaminhado = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (encaminhado) return encaminhado;
  return req.headers.get("x-real-ip")?.trim() || null;
}

interface LinhaDoDispositivo {
  id: string;
  organization_id: string;
  user_id: string;
  nome: string;
  scopes: unknown;
  expires_at: string;
  revoked_at: string | null;
}

function escoposDaLinha(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string");
}

/**
 * Autentica o aparelho e exige `escopo` (`null` = qualquer escopo válido).
 *
 * Devolve falha tipada em vez de lançar: a rota precisa responder `fail()` com
 * código estável, e um `throw` no meio do handler viraria 500 — que o shell
 * interpretaria como "servidor fora" e tentaria de novo com um token morto.
 */
export async function autenticarDispositivo(
  req: NextRequest,
  escopo: string | null,
): Promise<ResultadoDaAutenticacao> {
  if (!isServiceRoleConfigured()) {
    // Sem service role não há como validar o bearer (e sem ele a rota não
    // filtraria organização). Fail-closed, com código próprio de configuração.
    return {
      ok: false,
      status: 500,
      code: "internal_error",
      message: "Instalação sem service role — credencial de dispositivo indisponível.",
    };
  }

  const token = extrairBearerDoHeader(req.headers.get("authorization"));
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "unauthenticated",
      message: "Credencial do aparelho ausente.",
    };
  }
  if (!token.startsWith(PREFIXO_DO_DISPOSITIVO) || token.length < 32) {
    // Formato errado não vai ao banco: barato e evita hash de lixo.
    return {
      ok: false,
      status: 401,
      code: "unauthenticated",
      message: "Credencial do aparelho inválida.",
    };
  }

  const hash = hashDoToken(token);
  const ip = ipDaRequisicao(req);

  // Limite ANTES do banco, por hash+IP: força bruta de token para aqui. 120/min
  // cobre uma fila longa drenando em série (1 POST por item) sem transformar o
  // limite em defeito de produto.
  const limite = await checkRateLimit(
    `device:uso:${hash.slice(0, 16)}:${ip ?? "sem-ip"}`,
    120,
    60,
  );
  if (!limite.allowed) {
    return {
      ok: false,
      status: 429,
      code: "rate_limited",
      message: "Muitas requisições deste aparelho. Tente de novo em instantes.",
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("offline_devices")
    .select("id, organization_id, user_id, nome, scopes, expires_at, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (error) {
    logger.error("[device-auth] falha ao conferir credencial", { error: error.message });
    return { ok: false, status: 500, code: "internal_error", message: "Erro ao conferir credencial." };
  }
  if (!data) {
    // Genérico de propósito: não confirma existência de hash.
    return {
      ok: false,
      status: 401,
      code: "unauthenticated",
      message: "Credencial do aparelho inválida.",
    };
  }

  const linha = data as unknown as LinhaDoDispositivo;

  if (linha.revoked_at) {
    return {
      ok: false,
      status: 401,
      code: "token_revoked",
      message: "Este aparelho foi desconectado. Gere uma nova credencial no sistema.",
    };
  }
  if (Date.parse(linha.expires_at) <= Date.now()) {
    return {
      ok: false,
      status: 401,
      code: "token_expired",
      message: "A credencial deste aparelho expirou. Gere uma nova no sistema.",
    };
  }

  const escopos = escoposDaLinha(linha.scopes);
  if (escopo !== null && !escopos.includes(escopo)) {
    return {
      ok: false,
      status: 403,
      code: "forbidden_scope",
      message: "Esta credencial não tem o escopo necessário.",
    };
  }

  // Papel AO VIVO: rebaixar/remover a pessoa tira o poder do aparelho agora.
  const { data: vinculo, error: erroVinculo } = await admin
    .from("user_organizations")
    .select("role")
    .eq("organization_id", linha.organization_id)
    .eq("user_id", linha.user_id)
    .is("revoked_at", null)
    .maybeSingle();
  if (erroVinculo) {
    logger.error("[device-auth] falha ao ler vínculo do usuário", { error: erroVinculo.message });
    return { ok: false, status: 500, code: "internal_error", message: "Erro ao conferir vínculo." };
  }
  if (!vinculo) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "A pessoa deste aparelho não pertence mais à organização.",
    };
  }

  // `last_seen` é observabilidade, não autorização: falha aqui não derruba o
  // pedido (o vendedor está na rua; o dono vê o aparelho na lista mesmo assim).
  const { error: erroToque } = await admin
    .from("offline_devices")
    .update({ last_seen_at: new Date().toISOString(), last_seen_ip: ip })
    .eq("id", linha.id)
    .eq("organization_id", linha.organization_id);
  if (erroToque) {
    logger.warn("[device-auth] last_seen não atualizado", { error: erroToque.message });
  }

  return {
    ok: true,
    dispositivo: {
      id: linha.id,
      organizationId: linha.organization_id,
      userId: linha.user_id,
      nome: linha.nome,
      scopes: escopos,
      expiresAt: linha.expires_at,
      role: (vinculo as { role: string }).role,
    },
  };
}
