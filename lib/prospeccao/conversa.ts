import { apiClient } from "@/lib/api/client";
import type { Prospect } from "@/lib/schemas/prospeccao";

/**
 * FASE 9 (§17) + FASE 11 (§30): abrir o Inbox EXISTENTE com o contexto do
 * prospect — nunca um sistema de mensagens novo. Extraído de
 * `app/app/prospeccao/_empresas.tsx` porque o Radar (FASE 11) faz a MESMA
 * chamada na ação "Iniciar conversa" e a payload tem que ser idêntica nas
 * duas telas (D7: as mesmas 3 ações).
 *
 * O que volta é o `conversation_id`; quem chama é que navega para
 * `/app/inbox?id=…`. Erros propagam para o chamador tratar com
 * `showApiError` — aqui não há toast (a regra é uma só, não duas).
 */
export function payloadDaConversaDoProspect(p: Prospect): Record<string, unknown> {
  return {
    phone_number: p.telefone,
    name: p.nome,
    source: "prospeccao",
    source_metadata: { prospect_id: p.id, categoria: p.categoria, cidade: p.cidade },
    tags: [p.categoria, p.cidade].filter(Boolean) as string[],
    conversation_tags: ["prospeccao"],
  };
}

export async function abrirConversaDoProspect(p: Prospect, usuarioId: string): Promise<string | null> {
  if (!p.telefone) return null;
  const corpo = await apiClient.post<{ data: { conversation_id?: string } | null }>(
    "/api/v1/conversations/open-with-contact",
    payloadDaConversaDoProspect(p),
  );
  const conversa = corpo?.data?.conversation_id;
  if (!conversa) return null;
  // Se o dono da prospecção sou eu, a conversa já nasce assumida — claim
  // best-effort (falhou, a conversa continua aberta e o vendedor assume
  // pela tela, molde D16).
  if (p.owner_user_id && p.owner_user_id === usuarioId) {
    try {
      await apiClient.post(`/api/v1/conversations/${conversa}/claim`, {});
    } catch {
      // assumir é cortesia.
    }
  }
  return conversa;
}
