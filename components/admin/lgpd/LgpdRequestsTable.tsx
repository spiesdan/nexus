"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";

import type { Locale } from "date-fns";
import Link from "next/link";
import { formatDistanceToNow, differenceInHours } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Scales } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { TenantBadge } from "@/components/admin/inbox/TenantBadge";
import type {
  AdminLgpdRequest,
  AdminLgpdRiskLevel,
  AdminLgpdStatus,
  AdminLgpdRequestType,
} from "@/hooks/useAdminLGPDRequests";
import { useT } from "@/hooks/i18n/useT";
import {
  AdminDataTable,
  AdminDataTableSkeleton,
  type ColunaAdmin,
} from "@/components/admin/AdminDataTable";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortId(id: string): string {
  return id.slice(0, 8);
}

function relativeDate(iso: string, locale: Locale): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: locale });
  } catch {
    return iso;
  }
}

function countdownLabel(
  dueAt: string | null,
  status: AdminLgpdStatus,
  t: (texto: string) => string = (texto) => texto,
): string {
  const terminal = new Set<AdminLgpdStatus>(["completed", "failed"]);
  if (terminal.has(status) || !dueAt) return "—";
  const now = new Date();
  const due = new Date(dueAt);
  const hours = differenceInHours(due, now);
  if (hours < 0) return `${Math.abs(hours)}h ${t("em atraso")}`;
  if (hours < 24) return `${hours}h ${t("restantes")}`;
  const days = Math.floor(hours / 24);
  return `${days}d ${t("restantes")}`;
}

const TYPE_LABELS: Record<AdminLgpdRequestType, string> = {
  redact: "Anonimização cliente",
  data_request: "Solicitação de dados",
  store_redact: "Anonimização tenant",
};

const STATUS_LABELS: Record<AdminLgpdStatus, string> = {
  received: "Recebido",
  processing: "Processando",
  completed: "Concluído",
  failed: "Falhou",
  pending_review: "Revisão",
};

const STATUS_VARIANT: Record<
  AdminLgpdStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  received: "secondary",
  processing: "default",
  completed: "outline",
  failed: "destructive",
  pending_review: "secondary",
};

const RISK_VARIANT: Record<
  AdminLgpdRiskLevel,
  "default" | "secondary" | "destructive" | "outline"
> = {
  expired: "destructive",
  at_risk: "destructive",
  warning: "secondary",
  ok: "outline",
};

const RISK_LABELS: Record<AdminLgpdRiskLevel, string> = {
  expired: "Vencido",
  at_risk: "Crítico",
  warning: "Alerta",
  ok: "OK",
};

// ---------------------------------------------------------------------------
// Colunas
// ---------------------------------------------------------------------------

function colunasAdmin(
  t: (texto: string) => string,
  locale: Locale | undefined,
): ColunaAdmin<AdminLgpdRequest>[] {
  return [
    {
      id: "id",
      cabecalho: "ID",
      classeCabecalho: "w-[90px]",
      classeCelula: "font-mono text-xs text-muted-foreground",
      celula: (row) => `#${shortId(row.id)}`,
    },
    {
      id: "tipo",
      cabecalho: t("Tipo"),
      celula: (row) => (
        <Badge variant="outline" className="text-xs font-normal">
          {t(TYPE_LABELS[row.request_type] ?? row.request_type)}
        </Badge>
      ),
    },
    {
      id: "tenant",
      cabecalho: "Tenant",
      classeCabecalho: "w-[160px]",
      celula: (row) =>
        row.tenant_name && row.tenant_slug ? (
          <TenantBadge name={row.tenant_name} slug={row.tenant_slug} size="sm" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "recebido",
      cabecalho: t("Recebido em"),
      classeCabecalho: "w-[130px]",
      classeCelula: "text-xs text-muted-foreground whitespace-nowrap",
      celula: (row) =>
        locale ? relativeDate(row.received_at, locale) : row.received_at,
    },
    {
      id: "vence",
      cabecalho: t("Vence em"),
      classeCabecalho: "w-[130px]",
      classeCelula: "text-xs whitespace-nowrap",
      celula: (row) => countdownLabel(row.due_at, row.status, t),
    },
    {
      id: "risco",
      cabecalho: t("Risco"),
      classeCabecalho: "w-[80px]",
      celula: (row) => (
        <Badge variant={RISK_VARIANT[row.risk_level]} className="text-[10px]">
          {t(RISK_LABELS[row.risk_level])}
        </Badge>
      ),
    },
    {
      id: "status",
      cabecalho: t("Status"),
      classeCabecalho: "w-[100px]",
      celula: (row) => (
        <Badge variant={STATUS_VARIANT[row.status]} className="text-[10px]">
          {t(STATUS_LABELS[row.status] ?? row.status)}
        </Badge>
      ),
    },
    {
      id: "acoes",
      cabecalho: "",
      classeCabecalho: "w-[60px]",
      celula: (row) => (
        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <Link href={`/admin/lgpd/requests/${row.id}`}>{t("Ver")}</Link>
        </Button>
      ),
    },
  ];
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function LgpdRequestsTableSkeleton() {
  const t = useT();
  return <AdminDataTableSkeleton colunas={colunasAdmin(t, undefined)} linhas={8} />;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

interface LgpdRequestsTableProps {
  data: AdminLgpdRequest[];
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}

export function LgpdRequestsTable({
  data,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: LgpdRequestsTableProps) {
  const localeDaData = useLocaleDeData();
  const t = useT();

  return (
    <AdminDataTable
      colunas={colunasAdmin(t, localeDaData)}
      linhas={data}
      chave={(row) => row.id}
      vazio={{
        icon: Scales,
        headline: "Nenhuma solicitação encontrada",
        subcopy: "Ajuste os filtros para ver solicitações.",
      }}
      paginacao={{
        temProxima: !!hasNextPage,
        buscando: !!isFetchingNextPage,
        carregarMais: () => onLoadMore?.(),
      }}
    />
  );
}
