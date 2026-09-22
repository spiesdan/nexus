"use client";
import Link from "next/link";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Bell, X } from "@/lib/ui/icons";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useConversationCounts } from "@/hooks/inbox/useConversationCounts";

/**
 * Faixa de aviso no rodapé do sidebar (padrão protocol-card): fila do inbox
 * com contagem viva. Só aparece havendo o que dizer; dispensável na sessão.
 * Mora no rodapé (fora do `nav`) para não mexer na dobra medida pelo e2e.
 */
export function SidebarNotice({ collapsed }: { collapsed: boolean }) {
  const t = useT();
  const { activeOrg } = useAuth();
  const [dispensado, setDispensado] = useState(false);
  const { data } = useConversationCounts(activeOrg?.orgId ?? null);

  if (collapsed || dispensado) return null;
  const fila = data?.fila ?? data?.unassigned ?? 0;
  if (fila <= 0) return null;

  return (
    <div className="hover-raise mb-1 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      <Bell size={14} aria-hidden className="shrink-0 text-accent" />
      <Link
        href="/app/inbox?filter=unassigned"
        className="min-w-0 flex-1 truncate text-xs font-medium underline-offset-4 hover:underline"
      >
        {fila} {t("na fila")}
      </Link>
      <button
        type="button"
        onClick={() => setDispensado(true)}
        aria-label={t("Dispensar aviso")}
        className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X size={12} aria-hidden />
      </button>
    </div>
  );
}
