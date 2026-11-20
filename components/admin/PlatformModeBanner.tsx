"use client";
import Link from "next/link";
import { Buildings } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";

/**
 * Sticky top banner that signals the user is operating in cross-tenant
 * Platform mode. Persistent visual cue to prevent accidental destructive
 * actions when the operator forgets which surface they're in.
 */
export function PlatformModeBanner() {
  const t = useT();
  return (
    <div
      role="region"
      aria-label={t("Modo Plataforma")}
      className="sticky top-0 z-40 flex h-10 w-full items-center justify-between border-b border-amber-300 bg-amber-100 px-4 text-amber-900"
    >
      <div className="flex items-center gap-2 text-sm">
        <Buildings size={18} weight="fill" aria-hidden />
        <span className="font-semibold tracking-tight">{t("MODO PLATAFORMA")}</span>
        {/* Sem `/80`: no Tailwind 4 o alpha PINTA e media 4,24:1 sobre o
            `amber-100` (piso AA 4,5). Sem alpha o mesmo texto passa. */}
        <span className="hidden text-amber-800 sm:inline">{t("— operação cross-tenant")}</span>
      </div>
      <Link
        href="/app"
          className="inline-flex min-h-11 items-center rounded-full px-2 text-xs font-medium underline-offset-2 hover:underline"
      >
        {t("Sair pra app pessoal")}
      </Link>
    </div>
  );
}
