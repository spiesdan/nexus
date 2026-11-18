import { INVITE_TTL_MS } from "@/lib/auth/invite-ttl";

export type EstadoDoConvite = "aceito" | "pendente" | "expirado";

/**
 * O convite tem três estados na tela, e o terceiro não é cosmético.
 *
 * O token HMAC vale `INVITE_TTL_SECONDS` (24h). Antes a tabela só perguntava
 * `accepted_at`: um convite de três dias atrás aparecia como "Pendente" e quem
 * administrava esperava um aceite que nunca viria. "Expirado" usa a MESMA
 * janela do servidor, sem inventar um segundo prazo.
 */
export function estadoDoConvite(
  membro: { accepted_at: string | null; invited_at: string | null },
  agoraMs = Date.now(),
): EstadoDoConvite {
  if (membro.accepted_at) return "aceito";
  if (!membro.invited_at) return "pendente";
  const convidadoEm = Date.parse(membro.invited_at);
  if (!Number.isFinite(convidadoEm)) return "pendente";
  return agoraMs - convidadoEm > INVITE_TTL_MS ? "expirado" : "pendente";
}
