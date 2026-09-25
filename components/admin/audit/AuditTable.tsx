"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";

import type { Locale } from "date-fns";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { ClipboardText } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import type { AdminAuditRow } from "@/hooks/useAdminAuditLog";
import { useT } from "@/hooks/i18n/useT";
import {
  AdminDataTable,
  AdminDataTableSkeleton,
  type ColunaAdmin,
} from "@/components/admin/AdminDataTable";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const first = local[0] ?? "";
  const masked = `${first}${"*".repeat(Math.min(local.length - 1, 4))}`;
  return `${masked}@${domain}`;
}

function relativeDate(iso: string, locale: Locale): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: locale });
  } catch {
    return iso;
  }
}

function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  if (id.length <= 8) return id;
  return `${id.slice(0, 8)}…`;
}

// ---------------------------------------------------------------------------
// Colunas
// ---------------------------------------------------------------------------

function colunasAdmin(
  t: (texto: string) => string,
  locale: Locale | undefined,
): ColunaAdmin<AdminAuditRow>[] {
  return [
    {
      id: "quando",
      cabecalho: t("Quando"),
      classeCabecalho: "w-[130px]",
      classeCelula: "text-xs text-muted-foreground whitespace-nowrap",
      celula: (row) => (locale ? relativeDate(row.created_at, locale) : row.created_at),
    },
    {
      id: "action",
      cabecalho: "Action",
      classeCelula: "font-mono text-xs",
      celula: (row) => row.action,
    },
    {
      id: "tenant",
      cabecalho: "Tenant",
      classeCabecalho: "w-[130px]",
      celula: (row) =>
        row.organizations ? (
          <Badge variant="neutral" className="font-mono text-[10px]">
            {row.organizations.slug}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "actor",
      cabecalho: "Actor",
      classeCabecalho: "w-[160px]",
      classeCelula: "font-mono text-xs",
      celula: (row) => maskEmail(row.actor_user_id ?? undefined),
    },
    {
      id: "recurso",
      cabecalho: t("Recurso"),
      classeCabecalho: "w-[180px]",
      classeCelula: "text-xs text-muted-foreground",
      celula: (row) =>
        row.resource_type ? (
          <span>
            {row.resource_type}&nbsp;
            <span className="font-mono">{shortId(row.resource_id)}</span>
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "acoes",
      cabecalho: "",
      classeCabecalho: "w-[60px]",
      celula: (row) => (
        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <Link href={`/admin/audit/${row.id}`}>{t("Ver")}</Link>
        </Button>
      ),
    },
  ];
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function AuditTableSkeleton() {
  const t = useT();
  return <AdminDataTableSkeleton colunas={colunasAdmin(t, undefined)} linhas={8} />;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

interface AuditTableProps {
  data: AdminAuditRow[];
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}

export function AuditTable({
  data,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: AuditTableProps) {
  const localeDaData = useLocaleDeData();
  const t = useT();

  return (
    <AdminDataTable
      colunas={colunasAdmin(t, localeDaData)}
      linhas={data}
      chave={(row) => row.id}
      vazio={{
        icon: ClipboardText,
        headline: "Nenhum evento encontrado",
        subcopy: "Ajuste os filtros para ver entradas do audit log.",
      }}
      paginacao={{
        temProxima: !!hasNextPage,
        buscando: !!isFetchingNextPage,
        carregarMais: () => onLoadMore?.(),
      }}
    />
  );
}
