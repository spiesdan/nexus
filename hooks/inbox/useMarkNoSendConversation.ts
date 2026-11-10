"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";

interface MarkNoSendArgs {
  conversation_id: string;
}

interface MarkNoSendResponse {
  data: { no_send: boolean; contact: unknown };
}

/**
 * Marca o contato da conversa como SEM ENVIO — o gesto humano do opt-out.
 *
 * Quando o cliente pede para não receber mais nada, a parada dura já existe
 * (`contacts.is_blocked`, via `before_send`); esta action entrega a DECISÃO
 * humana registrada na conversa ao mesmo mecanismo. O motor recusa o próximo
 * envio; o header recomputa o comando (`contato_descadastrado`) e o badge de
 * motivo acompanha — não existe caminho paralelo de estado.
 *
 * Invalida as CONTAGENS junto: o estado do contato derruba o "Devolver ao
 * automático" (bloqueio anula trava devolvível) e o selo de motivo muda.
 */
export function useMarkNoSendConversation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: MarkNoSendArgs) =>
      apiClient.post<MarkNoSendResponse>(
        `/api/v1/conversations/${args.conversation_id}/no-send`,
        {},
      ),
    onError: (err) => showApiError(err),
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", args.conversation_id] });
      qc.invalidateQueries({ queryKey: ["conversation-counts"] });
    },
  });
}
