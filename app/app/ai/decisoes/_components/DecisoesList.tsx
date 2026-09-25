"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { NexusAiApproval } from "@/components/nexus-ui/ai/NexusAiApproval";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { Brain } from "@/lib/ui/icons";
import { useFollowupFlows } from "@/hooks/followup/useFollowupFlows";

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

  const executar = useMutation({
    mutationFn: async (id: string) => {
      setOcupado(id);
      try {
        return await apiClient.post<{ data: { executed: boolean } }>(
          `/api/v1/ai/decisions/${id}/executar`,
          {},
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
  const executadas = new Set(
    linhas.filter((l) => l.action === "ai.action.executed").map((l) => String((l.metadata as Record<string, unknown>).ref_audit_id ?? "")),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PoliticaCard />
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
              <span className="flex shrink-0 items-center gap-2">
                {l.action === "ai.action.approved" && !executadas.has(l.id) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ocupado !== null}
                    onClick={() => executar.mutate(l.id)}
                  >
                    {ocupado === l.id ? t("Executando…") : t("Executar")}
                  </Button>
                ) : null}
                <Badge
                  variant={
                    l.action === "ai.action.approved"
                      ? executadas.has(l.id)
                        ? "info"
                        : "success"
                      : "neutral"
                  }
                >
                  {l.action === "ai.action.approved"
                    ? executadas.has(l.id)
                      ? t("Executada")
                      : t("Aprovada")
                    : l.action === "ai.action.rejected"
                      ? t("Recusada")
                      : t("Execução")}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Política de execução (§35): teto de nível, follow-up executável e fluxo
 * padrão. Sem ela configurada, aprovar nunca executa (o endpoint recusa).
 */
function PoliticaCard() {
  const t = useT();
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);

  const politica = useQuery({
    queryKey: ["ai-politica"],
    queryFn: () =>
      apiClient
        .get<{ data: { nivel_maximo: number; executar_followup: boolean; default_flow_pointer_id: string | null } }>(
          `/api/v1/ai/policies`,
        )
        .then((r) => r.data),
  });
  const fluxos = useFollowupFlows();

  const [nivel, setNivel] = useState<string | null>(null);
  const [executar, setExecutar] = useState<boolean | null>(null);
  const [fluxo, setFluxo] = useState<string | null | undefined>(undefined);

  const atual = politica.data;
  const nivelEfetivo = nivel ?? String(atual?.nivel_maximo ?? 1);
  const executarEfetivo = executar ?? atual?.executar_followup ?? false;
  const fluxoEfetivo = fluxo === undefined ? (atual?.default_flow_pointer_id ?? "") : (fluxo ?? "");
  const mudou =
    atual != null &&
    (nivelEfetivo !== String(atual.nivel_maximo) ||
      executarEfetivo !== atual.executar_followup ||
      fluxoEfetivo !== (atual.default_flow_pointer_id ?? ""));

  async function salvar() {
    setSalvando(true);
    try {
      await apiClient.patch(`/api/v1/ai/policies`, {
        nivel_maximo: Number(nivelEfetivo),
        executar_followup: executarEfetivo,
        default_flow_pointer_id: fluxoEfetivo === "" ? null : fluxoEfetivo,
      });
      setNivel(null);
      setExecutar(null);
      setFluxo(undefined);
      await qc.invalidateQueries({ queryKey: ["ai-politica"] });
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  if (politica.isLoading) return <Skeleton className="h-24 w-full" />;
  if (politica.isError || !atual) return null;

  const fluxosAtivos = (fluxos.data ?? []).filter((f) => f.status === "active");

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-text">{t("Política de execução")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("Teto de autonomia e o fluxo que a execução usa. Sem fluxo, aprovar não executa.")}
        </p>
      </div>
      <div>
        <Label htmlFor="politica-nivel">{t("Nível máximo")}</Label>
        <select
          id="politica-nivel"
          className="h-9 rounded-lg border bg-background px-3"
          value={nivelEfetivo}
          onChange={(e) => setNivel(e.target.value)}
        >
          {[0, 1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-current"
          checked={executarEfetivo}
          onChange={(e) => setExecutar(e.target.checked)}
        />
        {t("Executar follow-up")}
      </label>
      <div>
        <Label htmlFor="politica-fluxo">{t("Fluxo padrão")}</Label>
        <select
          id="politica-fluxo"
          className="h-9 rounded-lg border bg-background px-3"
          value={fluxoEfetivo}
          onChange={(e) => setFluxo(e.target.value)}
        >
          <option value="">{t("Nenhum")}</option>
          {fluxosAtivos.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      <Button size="sm" disabled={!mudou || salvando} onClick={() => void salvar()}>
        {salvando ? t("Salvando…") : t("Salvar")}
      </Button>
    </Card>
  );
}
