"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { NexusAiApproval } from "@/components/nexus-ui/ai/NexusAiApproval";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { Brain } from "@/lib/ui/icons";

interface LinhaAuditoria {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  action: string;
  resource_id: string | null;
  request_id: string | null;
  metadata: Record<string, unknown>;
}

function texto(meta: Record<string, unknown>, chave: string): string {
  const v = meta[chave];
  return typeof v === "string" ? v : "—";
}

/**
 * Decision Log operacional: propostas pendentes com Aprovar/Recusar
 * (§38) + histórico do que já foi decidido. Fonte: auditoria
 * (`action=ai.action`), sem tabela paralela.
 */
export function DecisoesList() {
  const t = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["ai-decisoes"],
    queryFn: () =>
      apiClient
        .get<{ data: LinhaAuditoria[] }>(`/api/v1/audit?action=ai.action&limit=100`)
        .then((r) => (Array.isArray(r.data) ? r.data : [])),
  });

  const decidir = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "approved" | "rejected" }) => {
      setOcupado(id);
      try {
        return await apiClient.post<{ data: { decision: string } }>(
          `/api/v1/ai/decisions/${id}/decide`,
          { decision },
        );
      } finally {
        setOcupado(null);
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-decisoes"] }),
    onError: (e) => showApiError(e),
  });

  if (q.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const linhas = q.data ?? [];
  const decididas = new Set(
    linhas.filter((l) => l.action !== "ai.action.proposed").map((l) => String((l.metadata as Record<string, unknown>).ref_audit_id ?? "")),
  );
  const pendentes = linhas.filter((l) => l.action === "ai.action.proposed" && !decididas.has(l.id));
  const historico = linhas.filter((l) => l.action !== "ai.action.proposed");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "history")}>
        <TabsList>
          <TabsTrigger value="pending">
            {t("Aguardando decisão")}
            {` (${pendentes.length})`}
          </TabsTrigger>
          <TabsTrigger value="history">{t("Já decididas")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "pending" ? (
        pendentes.length === 0 ? (
          <NexusEmptyState
            icon={Brain}
            headline={t("Nada esperando decisão")}
            subcopy={t("Quando o Orchestrator propuser uma ação, ela aparece aqui.")}
          />
        ) : (
          <ul className="space-y-3">
            {pendentes.map((l) => (
              <li key={l.id}>
                <NexusAiApproval
                  title={texto(l.metadata, "acao")}
                  description={`${t("Motivo")}: ${texto(l.metadata, "intencao")} · ${t("Ferramenta")}: ${texto(l.metadata, "ferramenta")} · ${t("Nível")}: ${String(l.metadata.nivel ?? "—")}`}
                  context={
                    <>
                      {t("Dados")}: {Array.isArray(l.metadata.dados_utilizados) ? (l.metadata.dados_utilizados as string[]).join(", ") : "—"}
                      {" · "}
                      {t("Política")}: {texto(l.metadata, "politica_aplicada")}
                      {l.resource_id ? (
                        <>
                          {" · "}
                          <Link href={`/app/contacts/${l.resource_id}`} className="underline underline-offset-4">
                            {t("Ver cliente")}
                          </Link>
                        </>
                      ) : null}
                    </>
                  }
                  approveLabel={t("Aprovar")}
                  dismissLabel={t("Recusar")}
                  enabled={ocupado === null}
                  busy={ocupado === l.id}
                  onApprove={() => decidir.mutate({ id: l.id, decision: "approved" })}
                  onDismiss={() => decidir.mutate({ id: l.id, decision: "rejected" })}
                />
              </li>
            ))}
          </ul>
        )
      ) : historico.length === 0 ? (
        <NexusEmptyState
          icon={Brain}
          headline={t("Nenhuma decisão ainda")}
          subcopy={t("Aprovações e recusas ficam registradas aqui.")}
        />
      ) : (
        <ul className="space-y-2">
          {historico.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
              <span className="truncate text-muted-foreground">{texto(l.metadata, "acao") || texto(l.metadata, "ref_audit_id")}</span>
              <Badge variant={l.action === "ai.action.approved" ? "success" : "neutral"}>
                {l.action === "ai.action.approved" ? t("Aprovada") : l.action === "ai.action.rejected" ? t("Recusada") : t("Executada")}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
