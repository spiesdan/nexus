"use client";

import { useT } from "@/hooks/i18n/useT";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { NexusConfirmDialog } from "@/components/nexus-ui/forms/NexusConfirmDialog";
import { Button } from "@/components/ui/button";
import { Trash } from "@/lib/ui/icons";
import { useDeleteFollowupFlow } from "@/hooks/followup/useFollowupFlow";

type Props = {
  flowId: string;
  flowName: string;
  /** Depois de apagar o fluxo aberto no editor, volta pra lista. */
  redirectToList?: boolean;
  variant?: "outline" | "ghost";
  size?: "sm" | "default";
};

export function DeleteFollowupFlowButton({
  flowId,
  flowName,
  redirectToList = false,
  variant = "outline",
  size = "sm",
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const del = useDeleteFollowupFlow();

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className="text-destructive"
        disabled={del.isPending}
        data-testid="delete-followup-flow"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash size={14} aria-hidden className="mr-1" />
        Excluir
      </Button>
      <NexusConfirmDialog
        aberto={open}
        aoFechar={setOpen}
        title={`Excluir “${flowName}”?`}
        description={t(
          "Inscrições e versões deste fluxo são apagadas junto. Não é possível desfazer.",
        )}
        cancelLabel="Cancelar"
        confirmLabel="Excluir"
        busyLabel="Excluindo…"
        busy={del.isPending}
        onConfirm={async () => {
          await del.mutateAsync(flowId);
          if (redirectToList) router.push("/app/ai/followups");
        }}
      />
    </>
  );
}
