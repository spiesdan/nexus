"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { CaretLeft } from "@/lib/ui/icons";
import { useAdminIncident } from "@/hooks/useAdminIncident";
import { ResolveIncidentDialog } from "@/components/admin/incidents/ResolveIncidentDialog";
import {
  IncidentSeverityBadge,
  IncidentStatusBadge,
} from "@/components/admin/incidents/badges";
import type { IncidentSeverity, IncidentStatus } from "@/hooks/useAdminIncidents";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { useT } from "@/hooks/i18n/useT";

// ---------------------------------------------------------------------------
// Client component
// ---------------------------------------------------------------------------

interface IncidentDetailClientProps {
  id: string;
}

export function IncidentDetailClient({ id }: IncidentDetailClientProps) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const { data, isLoading, error } = useAdminIncident(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
        <p className="text-sm font-medium">{t("Incidente não encontrado")}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/incidents">
            <CaretLeft size={14} aria-hidden />
            {t("Voltar")}
          </Link>
        </Button>
      </div>
    );
  }

  const incident = data.data;
  const severity = incident.severity as IncidentSeverity;
  const status = incident.status as IncidentStatus;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Link
          href="/admin/incidents"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <CaretLeft size={14} aria-hidden />
          {t("Incidentes")}
        </Link>
      </div>

      <NexusPageHeader
        title={incident.type}
        actions={
          status !== "resolved" ? (
            <ResolveIncidentDialog incidentId={id} />
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <IncidentSeverityBadge severity={severity} />
        <IncidentStatusBadge status={status} />
        {incident.tenant && (
          <Badge variant="neutral" className="font-mono text-xs">
            {incident.tenant.slug}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("Criado")}{" "}
        {formatDistanceToNow(new Date(incident.created_at), {
          addSuffix: true,
          locale: localeDaData,
        })}
        {" · "}
        {format(new Date(incident.created_at), "dd/MM/yyyy HH:mm", {
          locale: localeDaData,
        })}
      </p>

      <Separator />

      {/* 2-col layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Payload JSON viewer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Payload</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-lg bg-muted p-4 text-xs leading-relaxed max-h-80">
              {JSON.stringify(incident.payload, null, 2)}
            </pre>
          </CardContent>
        </Card>

        {/* Audit timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Audit Trail</CardTitle>
          </CardHeader>
          <CardContent>
            {incident.audit_trail.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("Nenhuma entrada de auditoria encontrada.")}
              </p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-auto pr-1">
                {incident.audit_trail.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2 text-xs"
                  >
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60 mt-1.5" />
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-muted-foreground">
                        {entry.action}
                      </span>
                      <span className="ml-2 text-muted-foreground">
                        {format(new Date(entry.created_at), "dd/MM HH:mm:ss", {
                          locale: localeDaData,
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resolution note (if resolved) */}
      {status === "resolved" && incident.resolution_note && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t("Resolução")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {incident.resolution_note}
            </p>
            {incident.resolved_at && (
              <p className="text-xs text-muted-foreground">
                {t("Resolvido em")}{" "}
                {format(new Date(incident.resolved_at), "dd/MM/yyyy HH:mm", {
                  locale: localeDaData,
                })}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
