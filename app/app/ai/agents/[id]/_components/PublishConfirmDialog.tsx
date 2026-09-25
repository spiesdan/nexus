"use client";
import * as React from "react";

import { NexusConfirmDialog } from "@/components/nexus-ui/forms/NexusConfirmDialog";
import { useT } from "@/hooks/i18n/useT";

import type { AgentVersionRow } from "@/hooks/ai/useAgentVersions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: AgentVersionRow;
  published: AgentVersionRow | null;
  onConfirm: () => void;
  isPending: boolean;
}

function diffArr(prev: string[], next: string[]) {
  const added = next.filter((x) => !prev.includes(x));
  const removed = prev.filter((x) => !next.includes(x));
  return { added, removed };
}

export function PublishConfirmDialog({
  open,
  onOpenChange,
  draft,
  published,
  onConfirm,
  isPending,
}: Props) {
  const t = useT();
  const toolsDiff = diffArr(published?.tool_ids ?? [], draft.tool_ids);
  const promptDeltaChars =
    draft.system_prompt.length - (published?.system_prompt.length ?? 0);
  const modelChanged = !published || draft.model !== published.model;
  const providerChanged = !published || draft.provider !== published.provider;

  return (
    <NexusConfirmDialog
      aberto={open}
      aoFechar={onOpenChange}
      title={
        <>
          {t("Publicar v")}
          {draft.version_number}?
        </>
      }
      description={
        <>
          {t("Esta versão se tornará a ativa no atendimento. A versão atual (")}
          {published ? `v${published.version_number}` : t("nenhuma")}
          {t(") será marcada como superseded.")}
        </>
      }
      confirmLabel={`${t("Publicar v")}${draft.version_number}`}
      busyLabel={t("Publicando…")}
      busy={isPending}
      onConfirm={onConfirm}
    >
      <div className="space-y-2 rounded-2xl border border-border/60 p-3 text-xs">
        {providerChanged ? (
          <p>
            <strong>{t("Provider:")}</strong>{" "}
            {published ? `${published.provider} → ${draft.provider}` : draft.provider}
          </p>
        ) : null}
        {modelChanged ? (
          <p>
            <strong>{t("Modelo:")}</strong>{" "}
            {published ? `${published.model} → ${draft.model}` : draft.model}
          </p>
        ) : null}
        {toolsDiff.added.length > 0 ? (
          <p>
            <strong>{t("Tools adicionadas:")}</strong> {toolsDiff.added.join(", ")}
          </p>
        ) : null}
        {toolsDiff.removed.length > 0 ? (
          <p>
            <strong>{t("Tools removidas:")}</strong> {toolsDiff.removed.join(", ")}
          </p>
        ) : null}
        <p>
          <strong>{t("Prompt:")}</strong>{" "}
          {promptDeltaChars > 0
            ? `+${promptDeltaChars} ${t("chars")}`
            : promptDeltaChars < 0
              ? `${promptDeltaChars} ${t("chars")}`
              : t("sem alteração")}
        </p>
      </div>
    </NexusConfirmDialog>
  );
}
