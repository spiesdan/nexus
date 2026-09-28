"use client";
import { useState } from "react";
import { z } from "zod";
import { NexusConfirmDialog } from "@/components/nexus-ui/forms/NexusConfirmDialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useReactivateTenant } from "@/hooks/useReactivateTenant";
import { useSuspendTenant } from "@/hooks/useSuspendTenant";
import { useT } from "@/hooks/i18n/useT";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const motivoSchema = z.string().min(10, "Mínimo 10 caracteres").max(500, "Máximo 500 caracteres");

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type AcaoTenant = "suspender" | "reativar";

interface TenantReasonDialogProps {
  acao: AcaoTenant;
  open: boolean;
  onClose: () => void;
  organizationId: string;
}

// ---------------------------------------------------------------------------
// Textos por ação (a fusão não decide copy: cada ação fala a sua)
// ---------------------------------------------------------------------------

function textosDe(acao: AcaoTenant) {
  return acao === "suspender"
    ? {
        titulo: "Suspender tenant",
        descricao:
          "A suspensão bloqueará o acesso dos usuários deste tenant à plataforma. Esta ação pode ser revertida.",
        rotulo: "Motivo da suspensão",
        placeholder: "Descreva o motivo da suspensão (mínimo 10 caracteres)...",
        pendente: "Suspendendo...",
        confirmar: "Confirmar suspensão",
      }
    : {
        titulo: "Reativar tenant",
        descricao:
          "A reativação restabelece o acesso dos usuários deste tenant à plataforma. Informe o motivo da reativação para o registro de auditoria.",
        rotulo: "Motivo da reativação",
        placeholder: "Descreva o motivo da reativação (mínimo 10 caracteres)...",
        pendente: "Reativando...",
        confirmar: "Confirmar reativação",
      };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Suspender e reativar são o MESMO diálogo com cópias diferentes (era
 * `SuspendDialog` × `ReactivateDialog`, 123 linhas idênticas). A fusão é
 * este componente: um `NexusConfirmDialog` controlado, com o `Textarea` do
 * motivo no slot `children` e o botão travado (`confirmDisabled`) até os
 * 10 caracteres — a mesma régua que os dois antigos travavam.
 *
 * O erro do `mutateAsync` é do chamador: o `onError` do hook faz o toast e o
 * `NexusConfirmDialog` mantém a dialog ABERTA (mesmo contrato do resto das
 * confirmações).
 */
export function TenantReasonDialog({
  acao,
  open,
  onClose,
  organizationId,
}: TenantReasonDialogProps) {
  const t = useT();
  const [motivo, setMotivo] = useState("");
  const suspender = useSuspendTenant();
  const reativar = useReactivateTenant();
  const mutacao = acao === "suspender" ? suspender : reativar;
  const textos = textosDe(acao);
  const valido = motivoSchema.safeParse(motivo).success;

  function limpar() {
    setMotivo("");
  }

  async function confirmar() {
    const parsed = motivoSchema.safeParse(motivo);
    if (!parsed.success) return;
    await mutacao.mutateAsync({ id: organizationId, reason: parsed.data });
    limpar();
  }

  return (
    <NexusConfirmDialog
      aberto={open}
      aoFechar={(aberto) => {
        if (!aberto) {
          limpar();
          onClose();
        }
      }}
      title={t(textos.titulo)}
      description={t(textos.descricao)}
      confirmLabel={t(textos.confirmar)}
      busyLabel={t(textos.pendente)}
      danger={acao === "suspender"}
      busy={mutacao.isPending}
      confirmDisabled={!valido}
      onConfirm={confirmar}
    >
      <div className="space-y-2 py-2">
        <Label htmlFor={`${acao}-reason`}>
          {t(textos.rotulo)}{" "}
          <span className="text-muted-foreground text-xs font-normal">
            ({motivo.length}/500)
          </span>
        </Label>
        <Textarea
          id={`${acao}-reason`}
          placeholder={t(textos.placeholder)}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={4}
          maxLength={500}
        />
      </div>
    </NexusConfirmDialog>
  );
}
