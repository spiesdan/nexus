"use client";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/hooks/i18n/useT";
import type { IncidentSeverity, IncidentStatus } from "@/hooks/useAdminIncidents";

/**
 * Severidade e status de incidente — os MESMOS quatro mapas que viviam
 * duplicados em `IncidentsTable` e `incidents/[id]/_client.tsx` (inventário
 * §3: cópias de `STATUS_VARIANTS` → variantes de `ui/badge`). Uma fonte só;
 * as variantes continuam as semânticas do primitivo.
 */
export const INCIDENT_SEVERITY_VARIANTS: Record<IncidentSeverity, "error" | "warning" | "info"> = {
  critical: "error",
  warning: "warning",
  info: "info",
};

export const INCIDENT_SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  critical: "Crítico",
  warning: "Atenção",
  info: "Info",
};

export const INCIDENT_STATUS_VARIANTS: Record<IncidentStatus, "neutral" | "info" | "success"> = {
  open: "neutral",
  acknowledged: "info",
  resolved: "success",
};

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Aberto",
  acknowledged: "Reconhecido",
  resolved: "Resolvido",
};

export function IncidentSeverityBadge({ severity }: { severity: IncidentSeverity }) {
  const t = useT();
  return (
    <Badge variant={INCIDENT_SEVERITY_VARIANTS[severity]}>
      {t(INCIDENT_SEVERITY_LABELS[severity])}
    </Badge>
  );
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  const t = useT();
  return (
    <Badge variant={INCIDENT_STATUS_VARIANTS[status]}>
      {t(INCIDENT_STATUS_LABELS[status])}
    </Badge>
  );
}
