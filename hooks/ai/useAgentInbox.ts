"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { AgentInboxSeverity } from "@/lib/ai/agent-inbox-copy";

export interface AgentInboxItem {
  id: string;
  kind: string;
  severity: AgentInboxSeverity;
  title: string;
  body: string | null;
  ref_kind: string | null;
  ref_id: string | null;
  status: "open" | "ack" | "resolved";
  created_at: string;
}

export interface AgentInboxData {
  items: AgentInboxItem[];
  open_count: number;
}

/** Central de avisos do runtime (F1). Polling 60s — avisos nascem no worker. */
export function useAgentInbox(
  status: "open" | "resolved" = "open",
  opcoes: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["agent-inbox", status],
    // O endpoint é do TENANT. No shell de plataforma não há organização ativa:
    // a chamada volta 403 e o navegador registra o erro no console a cada 60 s.
    enabled: opcoes.enabled ?? true,
    refetchInterval: 60_000,
    queryFn: () =>
      apiClient
        .get<{ data: AgentInboxData }>(`/api/v1/ai/inbox?status=${status}`)
        .then((r) => r.data),
  });
}

export function useUpdateInboxItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "open" | "resolved" }) =>
      apiClient.patch(`/api/v1/ai/inbox/${id}`, { status }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["agent-inbox"] }),
  });
}
