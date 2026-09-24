"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ExpandableChip } from "@/components/motion/expandable-control";
import { useAgentInbox } from "@/hooks/ai/useAgentInbox";
import { useT } from "@/hooks/i18n/useT";
import { ArrowRight, Bell } from "@/lib/ui/icons";

/**
 * Sino da central de avisos (Operação Visível F1) com o `expandable-control`
 * do beUI: sem avisos é só o sino; com avisos, expande em pílula mostrando a
 * contagem e a ação "ver" que leva a /app/ai/inbox.
 */
export function AlertsBell() {
  const t = useT();
  const router = useRouter();
  const { data } = useAgentInbox("open");
  const count = data?.open_count ?? 0;
  const rotulo =
    count > 0 ? `${t("Central de avisos")} — ${count} ${t("em aberto")}` : t("Central de avisos");

  if (count === 0) {
    return (
      <Link
        href="/app/ai/inbox"
        aria-label={rotulo}
        data-testid="alerts-bell"
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:h-9 lg:w-9"
      >
        <Bell size={18} aria-hidden />
      </Link>
    );
  }

  return (
    <span data-testid="alerts-bell" aria-label={rotulo} role="group">
      <ExpandableChip
        label={
          <span className="inline-flex items-center gap-1.5">
            <Bell size={16} aria-hidden />
            <span data-testid="alerts-bell-count" className="tabular-nums">
              {count > 99 ? "99+" : count} {t("em aberto")}
            </span>
          </span>
        }
        actionIcon={<ArrowRight size={14} aria-hidden />}
        actionLabel={t("Ver avisos")}
        onAction={() => router.push("/app/ai/inbox")}
      />
    </span>
  );
}
