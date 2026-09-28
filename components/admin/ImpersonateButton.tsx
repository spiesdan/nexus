"use client";
/**
 * ImpersonateButton (S-11.07)
 *
 * Triggers `POST /api/v1/admin/tenants/[id]/impersonate`. Confirmation is
 * mandatory — the body of the dialog spells out that every subsequent action
 * will be flagged with `acting_as_platform_admin=true` in the audit log.
 *
 * On success: pushes the user to the redirect_url returned by the API
 * (default `/app/inbox`) so they immediately enter the tenant context.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusConfirmDialog } from "@/components/nexus-ui/forms/NexusConfirmDialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

interface ImpersonateButtonProps {
  organizationId: string;
  displayName: string;
  disabled?: boolean;
  disabledReason?: string;
}

export function ImpersonateButton({
  organizationId,
  displayName,
  disabled,
  disabledReason,
}: ImpersonateButtonProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/admin/tenants/${organizationId}/impersonate`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const rawMsg = (json as { error?: { message?: string } })?.error?.message;
        const errorMsg = rawMsg ? t(rawMsg) : t("Não foi possível iniciar impersonate");
        toast.error(errorMsg);
        return;
      }
      const redirectUrl =
        (json as { data?: { redirect_url?: string } })?.data?.redirect_url ??
        "/app/inbox";
      // Hard navigation so the new cookie is sent on the next request and the
      // server layout can read it to render the banner.
      window.location.assign(redirectUrl);
      // Fallback (in case assign is intercepted in tests).
      router.push(redirectUrl);
    } catch (err) {
      toast.error(t("Erro de rede ao iniciar impersonate"));
      console.error("[impersonate] start error", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        className="w-full"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-label={
          disabled
            ? (disabledReason ?? t("Impersonate indisponível"))
            : `${t("Impersonar")} ${displayName}`
        }
        title={disabled ? disabledReason : undefined}
      >
        {t("Impersonar tenant")}
      </Button>
      <NexusConfirmDialog
        aberto={open}
        aoFechar={setOpen}
        title={t("Iniciar impersonate?")}
        description={
          <>
            {t("Você está prestes a entrar como o tenant")}{" "}
            <span className="font-semibold text-foreground">{displayName}</span>.{" "}
            {t("Toda ação será registrada com a flag")}{" "}
            <code className="rounded-lg bg-muted px-1 py-0.5 text-xs">
              acting_as_platform_admin
            </code>
            . {t("A sessão expira em 1 hora. Confirma?")}
          </>
        }
        busy={busy}
        busyLabel={t("Entrando…")}
        confirmLabel={t("Confirmar e entrar")}
        onConfirm={handleConfirm}
      />
    </>
  );
}
