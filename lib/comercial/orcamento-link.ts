/**
 * O LINK PÚBLICO DO ORÇAMENTO — assinado, sem estado no banco.
 *
 * O cliente recebe no WhatsApp um endereço e abre no celular. Ele não tem
 * sessão nesta instalação, então a única prova de que aquele link vale é a
 * ASSINATURA: HMAC-SHA256 do id do pedido + da organização + da validade. Nada
 * de "confia no id que veio na URL" — sem a assinatura, qualquer pessoa
 * andaria pela sequência de números de pedido alheios.
 *
 * ═══ Por que não uma coluna `public_token` ═════════════════════════════════
 *
 * Um token sorteado no banco exige migration (coluna + baseline + MANIFEST) e
 * um lugar para girá-lo. A assinatura não precisa de nada disso e tem a mesma
 * garantia contra adivinhação: sem o segredo, não se forja. O custo é não haver
 * revogação individual — e por isso o link tem PRAZO, e a aprovação só vale
 * enquanto o pedido não saiu do estágio de orçamento.
 *
 * O segredo é `INTERNAL_SECRET` (obrigatório em produção — o boot cai sem ele),
 * com o prefixo `orcamento:` na derivação: um token de convite de equipe nunca
 * pode valer como link de orçamento, nem o contrário.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const VERSAO = "v1";

/** Quanto tempo o link vale. Orçamento que envelhece é preço que ninguém honra. */
export const VALIDADE_DO_LINK_DIAS = 30;

export interface CargaDoLink {
  /** `commercial_orders.id` */
  orderId: string;
  /** `organization_id` — o escopo é provado pela assinatura, não pelo path. */
  orgId: string;
  /** Expiração, epoch em SEGUNDOS. */
  expiraEm: number;
}

interface CargaAssinada {
  o: string;
  g: string;
  e: number;
}

function segredo(): string {
  return process.env.INTERNAL_SECRET?.trim() || "dev-fallback";
}

function assinar(payload: string): string {
  return createHmac("sha256", `orcamento:${segredo()}`).update(payload).digest("base64url");
}

export function assinarOrcamento(p: {
  orderId: string;
  orgId: string;
  /** Injeção para o teste. */
  agoraMs?: number;
  validadeDias?: number;
}): string {
  const agora = p.agoraMs ?? Date.now();
  const dias = p.validadeDias ?? VALIDADE_DO_LINK_DIAS;
  const carga: CargaAssinada = {
    o: p.orderId,
    g: p.orgId,
    e: Math.floor(agora / 1000) + dias * 86_400,
  };
  const payload = Buffer.from(JSON.stringify(carga), "utf8").toString("base64url");
  return `${VERSAO}.${payload}.${assinar(payload)}`;
}

/**
 * `null` = link inválido, adulterado ou vencido. Nunca lança: a página pública
 * mostra "link inválido" em vez de 500.
 */
export function verificarOrcamento(token: string, agoraMs = Date.now()): CargaDoLink | null {
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [versao, payload, assinatura] = partes;
  if (versao !== VERSAO || !payload || !assinatura) return null;

  const esperada = assinar(payload);
  const recebida = Buffer.from(assinatura, "utf8");
  const calculada = Buffer.from(esperada, "utf8");
  // `timingSafeEqual` exige o mesmo tamanho; comparar o tamanho antes não vaza
  // nada (o tamanho da assinatura é público).
  if (recebida.length !== calculada.length || !timingSafeEqual(recebida, calculada)) {
    return null;
  }

  let carga: CargaAssinada;
  try {
    carga = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CargaAssinada;
  } catch {
    return null;
  }
  if (!carga || typeof carga.o !== "string" || typeof carga.g !== "string") return null;
  if (typeof carga.e !== "number" || !Number.isFinite(carga.e)) return null;
  if (carga.e * 1000 <= agoraMs) return null;

  return { orderId: carga.o, orgId: carga.g, expiraEm: carga.e };
}
