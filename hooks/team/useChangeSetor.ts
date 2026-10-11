"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import type { TeamMember } from "@/hooks/team/useTeamMembers";

const MEMBERS_KEY = ["team", "members"] as const;

/**
 * Troca otimista do ramal (mesmo molde do `useChangeRole`): atualiza o cache
 * no mutate, reverte no erro. `null` limpa o ramal (e desliga a assinatura).
 */
export function useChangeSetor() {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: async (args: { userId: string; setor: string | null }) =>
      apiClient.patch<{ data: { user_id: string; setor: string | null } }>(
        `/api/v1/team/${args.userId}/setor`,
        { setor: args.setor },
      ),
    onMutate: async ({ userId, setor }) => {
      await qc.cancelQueries({ queryKey: MEMBERS_KEY });
      const previous = qc.getQueryData<{ data: TeamMember[] }>(MEMBERS_KEY);
      qc.setQueryData<{ data: TeamMember[] }>(MEMBERS_KEY, (old) =>
        old
          ? {
              ...old,
              data: old.data.map((m) => (m.user_id === userId ? { ...m, setor } : m)),
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
      toast.success(t("Ramal atualizado."));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
    },
  });
}
