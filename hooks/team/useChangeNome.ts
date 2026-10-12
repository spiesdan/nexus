"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import type { TeamMember } from "@/hooks/team/useTeamMembers";

const MEMBERS_KEY = ["team", "members"] as const;

/**
 * Troca otimista do nome (mesmo molde do `useChangeRole`): atualiza o cache
 * no mutate, reverte no erro.
 */
export function useChangeNome() {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: async (args: { userId: string; nome: string }) =>
      apiClient.patch<{ data: { user_id: string; nome: string } }>(
        `/api/v1/team/${args.userId}/nome`,
        { nome: args.nome },
      ),
    onMutate: async ({ userId, nome }) => {
      await qc.cancelQueries({ queryKey: MEMBERS_KEY });
      const previous = qc.getQueryData<{ data: TeamMember[] }>(MEMBERS_KEY);
      qc.setQueryData<{ data: TeamMember[] }>(MEMBERS_KEY, (old) =>
        old
          ? {
              ...old,
              data: old.data.map((m) => (m.user_id === userId ? { ...m, full_name: nome } : m)),
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
      toast.success(t("Nome atualizado."));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
    },
  });
}
