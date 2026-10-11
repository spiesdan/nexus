import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A ASSINATURA DO ATENDENTE — quem responde, à mostra para o cliente.
 *
 * ─── Por que assinar o texto e não trocar o nome do perfil ──────────────────
 *
 * O nome que o cliente vê no topo da conversa é o do NÚMERO (perfil do
 * WhatsApp) — um por conexão. "Faturamento Ana" e "Vendedor Daniel" no mesmo
 * número precisariam de dois números, dois QR codes e o cliente escolhendo
 * com quem falar antes de falar. A assinatura no texto resolve com um número
 * só: cada mensagem diz quem escreveu.
 *
 * Formato (o que o usuário pediu, literal):
 *
 *   "Bill Higiene e Limpeza - Faturamento Ana"
 *
 *   `{orgNome} - {setor} {primeiroNome}`, em linha própria no fim.
 *
 * ─── Quando assina ──────────────────────────────────────────────────────────
 *
 * Só mensagem HUMANA (`actor.type === "user"`), só texto e legenda de mídia.
 * Nunca: bot/IA/automação (têm identidade própria), template (texto aprovado
 * pela Meta — mexer quebra o contrato), contato (vCard tem formato fixo).
 *
 * ─── Quando NÃO assina ──────────────────────────────────────────────────────
 *
 * Sem setor, sem assinatura: a assinatura precisa das 3 partes, e "Bill -
 * Ana" sem setor não diz o ramal — que é a informação que o cliente usa para
 * pedir a pessoa certa da próxima vez. Sem nome, idem.
 *
 * ─── Idempotência ───────────────────────────────────────────────────────────
 *
 * Retry lê do banco o texto JÁ assinado e manda de novo: sem a trava, a
 * segunda via sairia com duas assinaturas. Texto que já termina com a
 * assinatura passa intacto.
 */

/** O mínimo para assinar. `setor` NULL = sem ramal = sem assinatura. */
export interface QuemAssina {
  orgNome: string | null;
  setor: string | null;
  nome: string | null;
}

/** Primeiro nome: "Ana Paula" vira "Ana". */
export function primeiroNome(nome: string | null | undefined): string | null {
  const base = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  return base === "" ? null : base;
}

/** Nome a partir do e-mail quando não há nome ("ana@…" vira "ana"). */
export function nomeDoEmail(email: string | null | undefined): string | null {
  const local = (email ?? "").split("@")[0]?.trim() ?? "";
  return local === "" ? null : local;
}

/**
 * Monta a assinatura, ou `null` quando não há o que assinar.
 *
 * Pura e total: os 3 faltantes possíveis devolvem null, nunca string
 * pela metade — string pela metade é o que assinaria errado.
 */
export function montarAssinatura(quem: QuemAssina): string | null {
  const org = (quem.orgNome ?? "").trim();
  const setor = (quem.setor ?? "").trim();
  const nome = primeiroNome(quem.nome);
  if (!org || !setor || !nome) return null;
  return `${org} - ${setor} ${nome}`;
}

/**
 * Anexa a assinatura ao texto. Idempotente: texto que já termina com ela
 * (retry lendo do banco) passa intacto.
 */
export function aplicarAssinatura(texto: string | null, assinatura: string | null): string | null {
  if (!texto || !assinatura) return texto;
  if (texto.replace(/\s+$/, "").endsWith(assinatura)) return texto;
  return `${texto.replace(/\s+$/, "")}\n${assinatura}`;
}

/**
 * Quem está enviando, para assinar.
 *
 * Três leituras em paralelo (setor do vínculo, nome do auth, nome da org).
 * Qualquer falha devolve `null` — e `null` é "sem assinatura", nunca erro:
 * falhar o ENVIO porque não achou o setor seria travar atendimento por
 * causa de carimbo.
 */
export async function identidadeDoAtendente(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  args: { orgId: string; userId: string },
): Promise<QuemAssina | null> {
  try {
    const [membro, usuario, org] = await Promise.all([
      supabase
        .from("user_organizations")
        .select("setor")
        .eq("organization_id", args.orgId)
        .eq("user_id", args.userId)
        .maybeSingle(),
      admin.auth.admin.getUserById(args.userId),
      admin.from("organizations").select("display_name").eq("id", args.orgId).maybeSingle(),
    ]);

    const setor = (membro.data as unknown as { setor: string | null } | null)?.setor ?? null;
    if (!setor) return null;

    const u = usuario.data?.user as
      | { user_metadata?: { full_name?: string | null }; email?: string | null }
      | null
      | undefined;
    const nome =
      primeiroNome(u?.user_metadata?.full_name) ?? nomeDoEmail(u?.email ?? null);
    if (!nome) return null;

    const orgNome =
      (org.data as unknown as { display_name: string | null } | null)?.display_name ?? null;
    if (!orgNome) return null;

    return { orgNome, setor, nome };
  } catch {
    return null;
  }
}
