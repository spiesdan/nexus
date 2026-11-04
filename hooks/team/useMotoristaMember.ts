"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import type { TeamMember } from "@/hooks/team/useTeamMembers";

const MEMBERS_KEY = ["team", "members"] as const;

/**
 * Liga/desliga o modo entregador (0292). Otimista como o papel: o toggle é de
 * um clique e ficar esperando a rede para pintar o estado lê como "não pegou".
 */
export function useMotoristaMember() {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: async (args: { userId: string; motorista: boolean }) =>
      apiClient.patch<{ data: { user_id: string; motorista: boolean } }>(
        `/api/v1/team/${args.userId}/motorista`,
        { motorista: args.motorista },
      ),
    onMutate: async ({ userId, motorista }) => {
      await qc.cancelQueries({ queryKey: MEMBERS_KEY });
      const previous = qc.getQueryData<{ data: TeamMember[] }>(MEMBERS_KEY);
      qc.setQueryData<{ data: TeamMember[] }>(MEMBERS_KEY, (old) =>
        old
          ? {
              ...old,
              data: old.data.map((m) => (m.user_id === userId ? { ...m, motorista } : m)),
            }
          : old,
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) qc.setQueryData(MEMBERS_KEY, context.previous);
      showApiError(err);
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.motorista ? t("Modo entregador ligado.") : t("Modo entregador desligado."));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
    },
  });
}
