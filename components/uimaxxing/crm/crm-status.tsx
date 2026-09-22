"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Status do CRM no idioma do `badge` UImaxxing (§19 WhatsApp, §23 execução IA).
 *
 * Mapeia estados operacionais → variante do badge. O `Badge` UImaxxing foi
 * instalado pelo registry (`pill-button`/`badge`); aqui só vive o MAPA de
 * estados do produto, não estilo novo.
 */
const WHATSAPP_VARIANT = {
  online: "positive",
  offline: "neutral",
  connecting: "outline",
  error: "negative",
} as const;

const GENERIC_VARIANT = {
  active: "positive",
  idle: "neutral",
  running: "positive",
  queued: "outline",
  waiting: "outline",
  completed: "positive",
  failed: "negative",
  cancelled: "neutral",
  pending: "outline",
  paid: "positive",
  overdue: "negative",
  draft: "neutral",
} as const;

export function CrmStatusBadge({
  status,
  children,
  className,
}: {
  status: keyof typeof WHATSAPP_VARIANT | keyof typeof GENERIC_VARIANT;
  children: React.ReactNode;
  className?: string;
}) {
  const variant =
    (WHATSAPP_VARIANT as Record<string, "positive" | "neutral" | "outline" | "negative">)[
      status
    ] ??
    (GENERIC_VARIANT as Record<string, "positive" | "neutral" | "outline" | "negative">)[
      status
    ] ??
    "neutral";
  return (
    <Badge variant={variant} className={className}>
      {children}
    </Badge>
  );
}

/** Ponto de presença (online/offline/erro) — par do badge para listas densas. */
export function CrmPresenceDot({
  tone,
  className,
}: {
  tone: "positive" | "negative" | "neutral";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        tone === "positive" && "bg-positive",
        tone === "negative" && "bg-negative",
        tone === "neutral" && "bg-muted-foreground",
        className,
      )}
    />
  );
}
