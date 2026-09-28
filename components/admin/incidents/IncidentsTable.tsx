"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";

import type { Locale } from "date-fns";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Warning } from "@/lib/ui/icons";
import type { AdminIncidentRow, IncidentSeverity, IncidentStatus } from "@/hooks/useAdminIncidents";
import { useT } from "@/hooks/i18n/useT";
import {
  AdminDataTable,
  AdminDataTableSkeleton,
  type ColunaAdmin,
} from "@/components/admin/AdminDataTable";
import { IncidentSeverityBadge, IncidentStatusBadge } from "@/components/admin/incidents/badges";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeDate(iso: string, locale: Locale): string {
  // date-fns lança RangeError em data inválida, e isso derrubava a página
  // inteira no error boundary — o usuário via só um digest no lugar da tabela.
  // Uma célula com "—" é melhor do que perder a tela por um timestamp ausente.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return formatDistanceToNow(d, { addSuffix: true, locale: locale });
}

// ---------------------------------------------------------------------------
// Colunas
// ---------------------------------------------------------------------------

function colunasAdmin(
  t: (texto: string) => string,
  locale: Locale | undefined,
): ColunaAdmin<AdminIncidentRow>[] {
  return [
    {
      id: "quando",
      cabecalho: t("Quando"),
      classeCabecalho: "w-[140px]",
      classeCelula: "text-xs text-muted-foreground whitespace-nowrap",
      celula: (row) => (locale ? relativeDate(row.created_at, locale) : row.created_at),
    },
    {
      id: "tipo",
      cabecalho: t("Tipo"),
      classeCelula: "font-mono text-xs",
      celula: (row) => row.type,
    },
    {
      id: "tenant",
      cabecalho: "Tenant",
      classeCabecalho: "w-[160px]",
      celula: (row) =>
        row.tenant_name ? (
          <span className="text-sm font-medium">{row.tenant_name}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "severidade",
      cabecalho: t("Severidade"),
      classeCabecalho: "w-[110px]",
      celula: (row) => <IncidentSeverityBadge severity={row.severity as IncidentSeverity} />,
    },
    {
      id: "status",
      cabecalho: t("Status"),
      classeCabecalho: "w-[120px]",
      celula: (row) => <IncidentStatusBadge status={row.status as IncidentStatus} />,
    },
    {
      id: "acoes",
      cabecalho: "",
      classeCabecalho: "w-[60px]",
      celula: (row) => (
        <Link
          href={`/admin/incidents/${row.id}`}
          className="text-xs font-medium text-accent hover:underline"
        >
          {t("Ver")}
        </Link>
      ),
    },
  ];
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function IncidentsTableSkeleton() {
  const t = useT();
  return <AdminDataTableSkeleton colunas={colunasAdmin(t, undefined)} linhas={5} />;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

interface IncidentsTableProps {
  data: AdminIncidentRow[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export function IncidentsTable({
  data,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: IncidentsTableProps) {
  const localeDaData = useLocaleDeData();
  const t = useT();

  return (
    <AdminDataTable
      colunas={colunasAdmin(t, localeDaData)}
      linhas={data}
      chave={(row) => row.id}
      vazio={{
        icon: Warning,
        headline: "Nenhum incidente encontrado",
        subcopy: "Ajuste os filtros para ver outros incidentes.",
      }}
      paginacao={{
        temProxima: hasNextPage,
        buscando: isFetchingNextPage,
        carregarMais: onLoadMore,
      }}
    />
  );
}
