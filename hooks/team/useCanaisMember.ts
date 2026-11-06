"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import type { TeamMember } from "@/hooks/team/useTeamMembers";

const MEMBERS_KEY = ["team", "members"] as const;

/**
 * Números que o membro enxerga no inbox (0296).
 *
 * `canais_permitidos` é `null` para "todos" e `[]` para "nenhum" — o hook não
 * colapsa os dois. Otimista porque fechar o diálogo e só então ver a lista
 * mudar lê como "não pegou"; a RLS é quem garante o efeito de verdade, e o
 * `invalidateQueries` do fim reconcilia qualquer divergência.
 */
export function useCanaisMember() {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: async (args: { userId: string; canais_permitidos: string[] | null }) =>
      apiClient.patch<{ data: { user_id: string; canais_permitidos: string[] | null } }>(
        `/api/v1/team/${args.userId}/canais`,
        { canais_permitidos: args.canais_permitidos },
      ),
    onMutate: async ({ userId, canais_permitidos }) => {
      await qc.cancelQueries({ queryKey: MEMBERS_KEY });
      const previous = qc.getQueryData<{ data: TeamMember[] }>(MEMBERS_KEY);
      qc.setQueryData<{ data: TeamMember[] }>(MEMBERS_KEY, (old) =>
        old
          ? {
              ...old,
              data: old.data.map((m) =>
                m.user_id === userId ? { ...m, canais_permitidos } : m,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) qc.setQueryData(MEMBERS_KEY, context.previous);
      showApiError(err);
    },
    onSuccess: () => {
      toast.success(t("Números do membro atualizados."));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      // O próprio usuário logado pode ter acabado de mudar o escopo dele: o
      // seletor do inbox lê `/channel-sessions`, que devolve `visivel_no_inbox`.
      qc.invalidateQueries({ queryKey: ["channel-sessions"] });
    },
  });
}
