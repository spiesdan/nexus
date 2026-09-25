"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { Sun } from "@/lib/ui/icons";
import type { SalesBrainItem } from "@/hooks/nexus/useSalesBrain";
import type { QueueRow } from "@/app/api/v1/ai/followups/queue/route";

interface Tarefa {
  id: string;
  titulo: string;
  tipo: string;
  status: string;
  contact_id: string | null;
  contato_nome: string | null;
  agendada_para: string | null;
}

function Bloco({
  titulo,
  href,
  hrefLabel,
  loading,
  vazio,
  children,
}: {
  titulo: string;
  href: string;
  hrefLabel: string;
  loading: boolean;
  vazio: boolean;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={titulo} className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text">{titulo}</h2>
        <Button variant="ghost" size="sm" asChild>
          <Link href={href}>{hrefLabel}</Link>
        </Button>
      </div>
      {loading ? (
        <>
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </>
      ) : vazio ? (
        <p className="rounded-lg border border-border bg-surface p-4 text-center text-sm text-muted-foreground">
          {children}
        </p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </section>
  );
}

/**
 * Meu Dia (§21) — "o que preciso fazer agora?".
 *
 * Três blocos independentes (tarefas pendentes, follow-ups ativos,
 * recomendações do Brain), cada um com fonte real própria e falha
 * isolada. Mobile-first: pilha única, toque grande.
 */
export function MeuDiaClient({ nome, saudacao }: { nome: string | null; saudacao: string }) {
  const t = useT();
  const qc = useQueryClient();

  const tarefas = useQuery({
    queryKey: ["meu-dia", "tarefas"],
    queryFn: () =>
      apiClient.get<{ data: Tarefa[] }>(`/api/v1/tarefas?status=pendente`).then((r) => (Array.isArray(r.data) ? r.data : [])),
  });
  const followups = useQuery({
    queryKey: ["meu-dia", "followups"],
    queryFn: () =>
      apiClient
        .get<{ data: QueueRow[] }>(`/api/v1/ai/followups/queue?status=active&limit=10`)
        .then((r) => (Array.isArray(r.data) ? r.data : [])),
  });
  const brain = useQuery({
    queryKey: ["meu-dia", "brain"],
    queryFn: () =>
      apiClient.get<{ data: SalesBrainItem[] }>(`/api/v1/sales-brain?limit=6`).then((r) => (Array.isArray(r.data) ? r.data : [])),
  });

  const concluir = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/api/v1/tarefas/${id}`, { status: "concluida" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["meu-dia", "tarefas"] }),
    onError: (e) => showApiError(e),
  });

  const listaTarefas = (tarefas.data ?? []).slice(0, 8);
  const listaFollow = (followups.data ?? []).slice(0, 6);
  const listaBrain = (brain.data ?? []).slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          {saudacao}
          {nome ? `, ${nome}` : ""}.
        </h1>
        <p className="text-sm text-muted-foreground">{t("O que precisa de você agora.")}</p>
      </header>

      <Bloco
        titulo={t("Tarefas pendentes")}
        href="/app/tarefas"
        hrefLabel={t("Ver todas")}
        loading={tarefas.isLoading}
        vazio={!tarefas.isError && listaTarefas.length === 0}
      >
        {tarefas.isError ? (
          t("Não consegui ler as tarefas.")
        ) : (
          <>
            {listaTarefas.map((tar) => (
              <li key={tar.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{tar.titulo}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {tar.contato_nome ?? t("Sem cliente")}
                    {tar.agendada_para ? ` · ${tar.agendada_para.slice(0, 10)}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={concluir.isPending}
                  onClick={() => concluir.mutate(tar.id)}
                >
                  {t("Concluir")}
                </Button>
              </li>
            ))}
          </>
        )}
      </Bloco>

      <Bloco
        titulo={t("Follow-ups ativos")}
        href="/app/ai/followups"
        hrefLabel={t("Ver fila")}
        loading={followups.isLoading}
        vazio={!followups.isError && listaFollow.length === 0}
      >
        {followups.isError ? (
          t("Não consegui ler os follow-ups.")
        ) : (
          <>
            {listaFollow.map((f) => (
              <li key={`${f.source}-${f.id}`} className="rounded-lg border border-border bg-surface p-3">
                <p className="truncate text-sm font-medium text-text">{f.flow_name ?? t("Fluxo")}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {f.contact.name} · {f.node_or_reason}
                </p>
              </li>
            ))}
          </>
        )}
      </Bloco>

      <Bloco
        titulo={t("Recomendações")}
        href="/app/inteligencia"
        hrefLabel={t("Ver inteligência")}
        loading={brain.isLoading}
        vazio={!brain.isError && listaBrain.length === 0}
      >
        {brain.isError ? (
          t("Não consegui ler as recomendações.")
        ) : (
          <>
            {listaBrain.map((r) => (
              <li key={r.contact_id} className="rounded-lg border border-border bg-surface p-3">
                <p className="text-sm text-text">{r.recomendacao}</p>
                <Link
                  href={`/app/contacts/${r.contact_id}`}
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t("Ver cliente")}
                </Link>
              </li>
            ))}
          </>
        )}
      </Bloco>

      {(tarefas.data?.length ?? 0) === 0 &&
      (followups.data?.length ?? 0) === 0 &&
      (brain.data?.length ?? 0) === 0 &&
      !tarefas.isLoading &&
      !followups.isLoading &&
      !brain.isLoading ? (
        <Card className="p-2">
          <NexusEmptyState
            icon={Sun}
            headline={t("Dia limpo")}
            subcopy={t("Nada pendente, nenhum follow-up e nenhuma recompra à vista.")}
          />
        </Card>
      ) : null}
    </div>
  );
}
